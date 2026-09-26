# Review — auto-mode-hardening

**State: HOOK r7 APPLIED + VERIFIED — UNCOMMITTED on top of `4d71463`; STOPPED BEFORE COMMIT. HARDENING = READY** (Owner to confirm;
it was held at HOLD while the stdin / group / case gaps were being closed).
G1–G4 pass, targeted QA **1493/1493**, `qa:offline` PASS (**50 suites**, 1 advisory unchanged), fresh Codex read-only pass 5:
**no findings**. The R2/R2b state is committed as `4d71463`; R3g + r5 + r6 + r7 (hook, suite, this file) are the uncommitted delta.

## Preflight record
- Slot `pt-wt-worker-a` was clean but **detached at `5ad0a5f`** (one behind `branch-dev`), not at the expected `91e5c03`.
  `91e5c03` (= `branch-dev` = `origin/branch-dev`) is a direct descendant whose only addition is the brief-only commit. Task
  branch `task/auto-mode-hardening` was cut at `91e5c03`. Reported to the Owner earlier.
- Pre-edit `qa:offline`: PASS, 49 spawned suites, 1 advisory (smart quote, `index.html:10363`).
- Phase 2 preflight: branch @ `91e5c03`, origin/branch-dev `91e5c03`, origin/main `fbec2c1`, nothing staged, Node v24.14.0.

## Owner-local / excluded from commit scope
- `.claude/settings.backup.json` — **Owner ruling 2026-09-26:** intentional Owner-created backup of the pre-hardening
  `settings.json`. Owner-local leftover: **must stay out of every commit**; the Worker did not modify or delete it.
- `settings.local.json` cleanup (canonical, Worker A, Worker B): **confirmed complete by the Owner.**

## Facts re-confirmed (brief §1) — claude 2.1.283
- Exit 2 blocks with stderr; any other non-zero exit is non-blocking (fail-open); `hookSpecificOutput` shape; stdin carries
  `tool_name`, `tool_input.command` (Bash **and** PowerShell), top-level `cwd`; matcher is a regex.
- `$CLAUDE_PROJECT_DIR` expansion in the hook `command` on Windows was undocumented; **G4 proves it works**. No §1 fact was
  contradicted → no M6.

## Files changed
- Implementation (2): `.claude/hooks/pretooluse-guard.js` (committed in `4d71463`, modified since), `qa/auto_mode_hardening_offline.js` (same)
- Owner-applied (tracked): `.claude/settings.json` (+72/−6 vs `91e5c03`; **unchanged by every fix below**)
- Evidence: `work/auto-mode-hardening/review.md` (this file); brief.md already committed in `91e5c03`
- Excluded (Owner-local, untracked, NOT to be committed): `.claude/settings.backup.json`

## Hook fixes after §5 (Worker-prepared scratchpad candidates, Owner-copied, hashes verified on disk by the Worker)
| Fix | Ruling / trigger | Effect | Hook SHA256 |
|---|---|---|---|
| **R2** | Codex initial #1: `& 'C:/…/git.exe' status` allowed through PowerShell | any resolved git program via the PowerShell tool is denied (`git via the PowerShell tool - denied (R2)`); ignored for Bash | `2e2c8b14…13bdb` (committed `4d71463` = R2b below) |
| **R2b** | Codex final #1: alias gap (`New-Alias g git.exe; g push` → allow) | in Worker slots the whole PowerShell tool is denied immediately; main/non-slot keeps R2 behaviour | `880eaafc…fc2e2` (**committed in `4d71463`**) |
| **R3g** | Owner 2026-09-27: the canonical `permissions.ask` gate for push is unreliable | every resolved non-destructive `git push` → `cls:'push'` → **deny in every session** (`git push - denied in every Claude Code session; push manually from a normal terminal`; slot messages keep the R1 suffix); commit ask; merge/rebase slot deny / main ask; read-only allow | `01e6a656…f0e8` |
| **r5** | Codex pass 4 #1: `bash <<EOF … git push … EOF` → allow (heredoc bodies are scanned as data) | a shell/interpreter (`bash sh zsh dash ash ksh csh tcsh fish busybox pwsh powershell cmd python* py node nodejs deno bun perl ruby php lua source .`) fed by a heredoc, `<<<`, `<` redirect (not `< /dev/null`), `<(…)` or a pipe is **denied** unless code is inline (`-c/-m/-e/-p/-r/-Command/ /c`); data-only heredocs/pipes/redirects unchanged | `c09a4ac7…55f4` |
| **r6** | Owner: do not defer the pipe-into-group residual | the fed state propagates through `( )`, `{ }`, `$( )` and backticks, compound commands (`if/while/until/for/select/case … fi/done/esac`, incl. `done < f`), and pass-through wrappers (`sudo -u x`, `setsid`, `stdbuf`, `nice`, `timeout`, `exec`, `command`) | `df977316…cd50` |
| **r7** | Worker finding while building r6: `case x in x) git push;; esac` → allow (first word is `case` / `PAT)`) | `case WORD in PATTERN)` header and arm-pattern prefixes are stripped so the command is classified like the plain command (`a\|b`, `(a)`, quoted incl. `"a)b"`, later arms, nested case, inside groups/`$( )`); a `)` ending an arm pattern no longer closes an enclosing group | `bbe063eb8e7e0dfebce6cef79a0b3f9101ba9c7a77223fd80c12e8f2e4ff6e78` (**current**) |
- `settings.json` needed **no change** for any fix. `Bash(git push)` / `Bash(git push *)` remain in `permissions.ask` as dead weight —
  **the hook, not `permissions.ask`, is the push boundary**.
- Each candidate was proven in the scratchpad against its predecessor before the Owner's copy step: full differential corpora
  byte-identical except the intended rows (r7 vs r6: 221 commands × 5 cwds × 2 tools identical; 145 changed `case`-prefixed rows,
  all allow → deny/ask; no benign row changed); the r7 direct + CLI probe of quoted `"a)b"` case patterns (20 rows) and 22 PowerShell
  `switch` rows found 0 allows.

## QA (final, r7)
- Targeted `node qa/auto_mode_hardening_offline.js`: **PASS, 1493 assertions** (653 → 769 R2 → 844 R2b → 963 R3g → 1127 r5 → 1335 r6 → 1493 r7).
  - AH-11 (R3g): push denied in every cwd incl. missing cwd; commit ask; read-only allow; merge/rebase unchanged.
  - AH-12 (r5): 38 stdin-code deny rows, data-only allow rows, commit-message heredocs stay ask, `/dev/null` and inline-code exemptions.
  - AH-13 (r6): 35 group/compound/wrapper deny rows, ~55 benign/leak-check allow rows, commit text, PowerShell, CLI.
  - AH-14 (r7): 26 case-prefixed push forms, 12 commands × 5 case forms asserted equal to the plain command (slot and main),
    21 benign case rows, multi-line case unchanged, commit text with case syntax stays ask, fed-state into case, fail-closed, CLI.
  - Production-source mutants (each proven to hold on production and fail on the mutant): R2/R2b markers and filters, push
    class, stdin check, pipe marker, `-e` counted as inline, `/dev/null` exemption, stdin redirect, `sh` list entry, inline exemption,
    `( )` / `{ }` / `$( )` inheritance, group redirect, compound tracking, compound redirect, pass-through wrappers, everything-fed,
    case header / arm / kind / group-paren / `esac` exemption / `(pat)` / quoted patterns / nested headers.
  - Anchors re-pointed where later patches renamed lines; two equivalent mutants (class rename; reason fallback) were replaced/dropped.
- Full `npm run qa:offline`: **PASS, 50 spawned suites, 14 phases, 1 advisory warning** (pre-existing, unchanged).
- Codex cannot run the suite (`fs.mkdtempSync` → EPERM in its read-only sandbox); sandbox limit, not a defect. Worker runs are fresh.

## Activation gate (brief §6a) — final re-run after r7 (2026-09-27)
| Step | Result |
|---|---|
| G1 | `where node` → `C:\Program Files\nodejs\node.exe`; `node --version` → v24.14.0 |
| G2 | (`scratchpad\g2.js`, hook spawned via `process.execPath`) allow (`git status --short --branch`, slot) → exit 0, empty stdout · ask (`git commit -m x`, main) → exit 0 + `permissionDecision:"ask"` JSON · deny (`git push --force`) → exit 2 + reason on stderr |
| G3 | deny exit code = **2**; also canonical `git push --dry-run`, `bash <<EOF`, `printf x \| (bash)`, `case x in a\|b) git push;; esac`, `case x in "a)b") git push;; esac`, PowerShell `git status` (main) and slot PowerShell `Get-ChildItem` → exit 2; benign `case` and main PowerShell `Get-ChildItem` → exit 0 empty; malformed stdin → exit 2 |
| G4 | **PASS (live, Worker slot).** Bash `git push --dry-run` → `PreToolUse:Bash hook error … BLOCKED - git push - denied in every Claude Code session; push manually from a normal terminal - denied in Worker-slot sessions (R1)`; `case x in a\|b) git push --dry-run;; esac` → same block; PowerShell `Get-ChildItem` → `BLOCKED - PowerShell tool - denied in Worker-slot sessions (R2)`. A compound `echo '{…}' \| node hook.js …` in this session was itself blocked by the r5 rule — live confirmation. Nothing executed. |
| G5 | Not triggered. |

Not run in this session (Owner post-LAND checks): a canonical-checkout Claude Code session — `git push --dry-run` must be
**BLOCKED** there (not prompt); `npm run qa:offline` runs without a prompt in a fresh Worker session.

## Codex (independent, read-only, `codex exec --sandbox read-only`, codex-cli 0.157.0) — five passes
| Pass | Finding | Disposition |
|---|---|---|
| Initial #1–#3 | R2 path-form bypass; missing QA negative; stale review.md | **FIXED** (R2, PS_GIT + mutants, refresh) |
| Final #1–#2 | PowerShell aliases; stale review.md | **FIXED** (R2b — Owner rejected DEFER; refresh) |
| Final-2 #1 | runCli missing-`cwd` falls back to `CLAUDE_PROJECT_DIR` (slot-only rules then apply as non-slot) | **DEFER — Owner-accepted 2026-09-27** (pre-existing Phase-1 design; Claude Code always sends `cwd`; not exploitable through the hook contract) |
| Pass 4 #1 | heredoc/stdin fed to a shell or interpreter runs unscanned code (`bash <<EOF … git push`) → allow | **FIXED** (r5; Owner ordered "do not defer") |
| Pass 4 follow-ups (Worker) | pipe into `( )` / `{ }` / compound / wrapper residual; `case … in PAT) cmd` prefix | **FIXED** (r6, r7; Owner ordered r6 and r7) |
| **Pass 5 (final, delta over `4d71463`, covers R3g + r5 + r6 + r7)** | **No findings.** Codex's probes of stdin-fed shells, read-only commands and heredoc commit messages gave the expected decisions; `git diff --check` clean. Its sandbox blocked the suite's mutant phase (EPERM). | — |

## Known deferred / accepted gaps in the guard (not in brief §4)
- **runCli missing-`cwd` fallback to `CLAUDE_PROJECT_DIR`** — DEFER, Owner-accepted 2026-09-27.
- **Dynamic construction** (`eval "$c"`, `'gi'+'t'`, `x | { read c; eval "$c"; }`, variable/function/alias indirection inside Bash) —
  documented deferred limitation (Owner: do not broaden). PowerShell indirection is closed for Worker slots by R2b.
- `git push` via non-git tools (`gh`, `git send-pack`, HTTP APIs) is outside the hook's git classifier.
- `git pull`, `git branch -f main …`, `git checkout -- <protected file>`, `rm`/`Remove-Item`/`dd of=` of a protected file are allowed.
- Main/non-slot PowerShell keeps the static limits (any git program is denied; other indirection is governed by ask/deny rules
  and Owner approval); the blanket deny is Worker-slot only by ruling. PowerShell `switch` is covered through R2 (22 variants
  probed, 0 allow).
- **Accepted false-positive cost of r5/r6:** a script interpreter that reads data on stdin (`python3 script.py < data.json`,
  `… | node script.js`, loops running such scripts under a pipe/redirect) is denied. `< /dev/null` and inline-code forms
  (`-c/-e/-m/-p/-r/-Command`) are exempt. Direct-hook testing must use `spawnSync(..., {input})` rather than `echo … | node hook.js`.
- The static AH-8 check requires `settings.json` to equal baseline + §5 **exactly**; any later settings edit must update the suite literals.
- AGENTS.md tier table is stale for `.claude/hooks/**` and `package*.json` (brief §7 follow-up).
- Consequence of R2b: Worker-slot sessions can no longer use the PowerShell tool at all (Git and QA run via Bash).

## Owner decisions / actions still open
1. Confirm HARDENING = READY and authorise the second commit (hook r7 + suite + this file; stage explicit paths only).
2. Optional hygiene: drop the now-dead `Bash(git push*)` entries from `permissions.ask` (not required; separate settings change).
3. Post-LAND live checks (above). Keep `.claude/settings.backup.json` out of every commit.

## Lessons
- A hook that defers read-only git to settings prefix rules is only as strong as those rules; deny the whole class in the hook.
- Static analysis of a shell language has an open tail. Prefer removing the tool for the risky audience (R2b) or denying the
  whole channel (code-from-stdin, r5/r6) over chasing individual forms; document what stays dynamic.
- A scanner that treats heredoc bodies as data must deny interpreters that read them; the fed state must follow the shell's
  real stdin inheritance (pipes into groups/compounds, redirects on the closer, wrappers).
- Hunt the neighbouring gap while patching: `case … in PAT) cmd` (first word is not the command) surfaced only because the r6
  differential and a scratch probe looked at compound commands; add a table of wrapped-equals-plain assertions for any new
  syntactic wrapper.
- A Worker cannot fix a hook defect after §5 lands (DENY tier): prepare and prove a scratchpad candidate (differential corpus, CLI
  checks, suite-copy pointed at the candidate, mutants) so the Owner's fix is one hash-checked copy.
- A class-rename mutant can be equivalent when the decision table has a default; mutate the emitting statement, and put the
  probe in a context a broader rule cannot mask.
- Quote-heavy shell one-liners and `echo … | node hook.js` get fail-closed by the hook itself; author test files with the file
  tools and spawn the hook with `spawnSync`.

## Final check
Branch `task/auto-mode-hardening` @ `4d71463`; the hook (r7), suite and this file are UNCOMMITTED and unstaged;
`.claude/settings.backup.json` stays untracked and excluded. No push, LAND, deploy or `main` change made.
