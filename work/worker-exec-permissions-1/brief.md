# Brief: worker-exec-permissions-1 — narrow guard grant (R15) for task-scoped Worker edits, fail-closed Manual mode lock, `onFailure:"block"`, and the exact `wmic` allow rule (PROTECTED)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. It is self-contained. DRAFT, 2026-10-22, for MAIN's review: not approved, not committed, not staged; nothing in it authorizes a gate. **It follows approval-envelope-1:** its base is `branch-dev` after approval-envelope-1 has landed (TS-3). MAIN fills the `<at T>` placeholders (§PH) before staging; the Owner answers §OD before the R11 line. The Worker starts only after the R11 brief-only commit exists, so the Worker steps begin at step 0 and contain no brief-request.

This task is excluded from the execution envelope (it changes hooks, settings, permissions and governance): task-start, every commit, the PROTECTED line, LAND and PUSH each need the Owner's explicit go-ahead or record.

**What the Owner sees:** one package review with the §OD rulings, the R11 line, one PROTECTED line whose report binds the exact new guard, `settings.json` and `AGENTS.md` bytes, then the LAND and PUSH lines (one decision, two records; the PUSH is the public Netlify DEV deploy) — and afterwards, as a separate Owner-approved step, one attended live check (§LC).

| | |
|---|---|
| Problem | In Manual (`default`) every Worker Edit/Write prompts, although the brief and its `land-scope` were already approved at R11 (measured: 16 of 18 file-tool prompts in the scan-action-gate-1 session were in-scope or evidence). Separately, nothing technical stops a Manual brief from being run in Auto / `acceptEdits` (observed in the scan-action-gate-1 incident). The hook fails open on timeout or crash (sandbox E4) |
| Objective | (1) The guard grants (R15 grant) Edit/Write/MultiEdit without a prompt **only** for paths an opt-in `auto-edit-scope` block of the committed brief lists (⊆ `land-scope`), the active task's `plan.md`, `codex.md`, `qa.log`, and the task's scratch directory — only in Manual, only in the task's own Worker slot, and only after every §2.3 check passes; anything uncertain is "no opinion" (a normal prompt). (2) The guard denies (R15 mode lock) every Bash, PowerShell and file-tool call in a Worker-slot session whose mode is not Manual unless the task's committed brief is a `Mode: Auto` brief; uncertainty denies. (3) `settings.json` sets `"onFailure":"block"` on the guard entry and adds exactly one allow rule (`wmic`). (4) `AGENTS.md` documents it (W1–W5). Nothing else changes |
| Owner rulings applied (2026-10-22, restated; verbatim in MAIN's ledger) | (R-a) Design direction approved: a narrow guard GRANT — automatic approval only for explicitly listed task-scoped files within the approved land scope (an opt-in brief block ⊆ `land-scope`), plus narrowly defined task evidence (`plan.md`, `qa.log`, `codex.md` of the active task) and scratch paths; M5-sensitive implementation files stay prompting (left out of the block). (R-b) Fail-closed MODE LOCK for Manual briefs: a Worker session in Auto, Accept Edits, dontAsk, plan-with-edits or another incompatible mode is denied before further task execution; requires `"onFailure":"block"` on the guard hook entry (E4 observed fail-open without it). (R-c) Normalize Windows paths (separators, drive-letter case, case-insensitive comparison, `\tmp` forms) and verify real-path containment (symlinks/junctions, `..`, 8.3 names, UNC, trailing dots/spaces). (R-d) Both `CLAUDE_PROJECT_DIR` and the hook cwd must resolve, after normalization, to the same authorized Worker slot before any grant; the mode lock fires if either is a slot. (R-e) Never grant protected, ASK-tier or DENY-tier paths, nor any path with a segment starting with `.`. (R-f) Missing, ambiguous or inconsistent session/task information = INELIGIBLE (no grant → normal prompt); for the mode lock, ambiguity about whether a Manual brief applies is resolved fail-closed (§2.4). (R-g) E6 (cd drift) is UNVERIFIED, not PASS; negative tests cover cwd drift and path ambiguity. (R-h) Bundle the exact `wmic` rule; the exact-form Bootstrap rules are Owner decisions, default OFF (§OD). (R-i) R11, LAND, PUSH, PROTECTED and STOP requirements are preserved; no other permission widening |
| Design source | `Pulse-Planning/agent-handoff-1/`: `worker-permissions-proposal.md` (sha256 `cbf7a3b2269588d32872ac79cd12f9b956f0cba810fce841112dcd94a709d877`), `guard-grant-verification.md` (`a2087661e292f9aa8665ad5ed9a488441914df5db960545151c1e5e139fce647`), `sandbox-probe-results.md` (`fe86785eeb2ffaccb87a840363f3c6f1a6d88f362c4cd5e98b96d9b902cd37ac`), `allowlist-proposal.md` (`d7e1530c63e9be470fb087189e2485975a55fbe9c51aef37f3d98996164b5228`), `bootstrap-permissions-review.md` (`6e242361d5fdaf7341571fdc4660aa1d63fc09c68df542fb4ac893fb140aed9b`). This brief restates every normative rule; the Worker needs none of them |
| Backlog | **none** (no `BACKLOG.md` entry for the guard grant or mode lock). No `BACKLOG.md` edit |
| Baseline (§TS) | `branch-dev` tip T at task-start, **after approval-envelope-1 landed**. Blobs at T: guard `8c08d8cb6a47e1453bd25a2457611883a402d3de`, `settings.json` `7222327014fcc99807ae1902ba29b09562349d57`, `AGENTS.md` `5869986cd76d363dd27e5514fbff5bb28b2cb76f`, `qa/auto_mode_hardening_offline.js` `359c7d84dba50c9245b579dc75cccd5c6625e442`, `qa/pt_land_offline.js` `631920f60d11d5c2e6623c313b1676d8bd7b6943`. Line numbers below are from the 2026-10-22 read of `b68d494` and are guidance only; the quoted text is the anchor |
| Branch / slot / mode | `task/worker-exec-permissions-1` · first free slot · **Manual**, attended. DENY-tier and ASK-tier protected files in scope; they enter only through step 13a |
| qa:offline | suite count **unchanged** (no new suite file; the new rows extend `qa/auto_mode_hardening_offline.js`). Two digest pins go stale and are re-pinned (§3.5) |
| Parallel with | any task that edits none of the §1 files. One heavy run at a time. Another slot keeps running its own checked-out guard until its next task-start or resync |
| Scoring boundary | none touched: no `index.html`, `services/**`, `netlify/**`, scoring, persistence or Actionable Take |
| Gate verification | This task *is* a gate change. Client/server feature gates: N/A. The enforced gates it adds are R15 grant (no-opinion default) and R15 mode lock (deny), specified in §2.3–§2.4 |
| Skills | `pt-offline-suite` (Required: the task edits a digest-pinned suite and the hook it pins). `json-safe-edit` for the `settings.json` candidate |

## §OD Owner decisions (answer every row before the R11 line; the default applies if the Owner rules "defaults")

| # | Decision | Default (fail-closed or no widening) | Alternative |
|---|---|---|---|
| D-1 | Mode lock when `permission_mode` is absent from the hook input in a lock-applicable slot | **DENY** (E2: present on 35/35 PreToolUse calls) | no lock (prompt path) |
| D-2 | `plan` mode under the lock. The hook only sees `"plan"`; it cannot tell plan from "plan-with-edits" | **DENY** (incompatible) | exempt `plan` (a hook allow is inert in plan) |
| D-3 | Scratch grant scope (R-a "scratch paths") | **GRANT** for `<realpath(os.tmpdir())>/pt-<id>/**` only, **excluding** `pt-<id>/protected/**` (the step-13a candidates keep prompting). Running scripts there still prompts (T6). UNVERIFIED whether the harness's "outside allowed working directories" check prompts anyway (§LC) | no scratch grant |
| D-4 | Record/brief/parser logic | **Copied into the guard** (no `require` of `qa/guard_integrity_check.js` or the land tool, which are slot-editable or a code-load surface), plus parity rows | `require` the canonical copies |
| D-5 | Bootstrap exact slot-status rules `Bash(git -C C:/Users/Owner/Documents/Project/pt-wt-worker-a status --short --branch --untracked-files=all)` and the same with `pt-wt-worker-b` | **OFF** (not added) | ON: both appended to allow; AH-8/AH-10/AH-23 gain them as known-safe exact rules |
| D-6 | Bootstrap exact `Bash(node .claude/hooks/pt-land.js task-start task/*)` | **OFF**. If ON, AH-26 ("no task-start entry") must change: a further QA edit | ON |
| D-7 | `permissions.disableAutoMode:"disable"` (harness-level complement to the lock; affects MAIN/Bootstrap/Planner too) | **OFF** (not added) | ON |
| D-8 | Re-pin the two stale digests (AH, PL) in this task | **YES** (§3.5; otherwise every later `qa:offline` runs both suites heavy) | leave stale (re-pin optional per E1) |
| D-9 | Lock for a `Mode: Auto` brief | **unchanged** (lock off for a valid Auto brief) | restrict Auto briefs to `default`/`auto`/`acceptEdits` |

Owner ruling 2026-10-22: D-1…D-9 approved as the defaults above.

If D-5 or D-6 is ON, MAIN amends §2.1, §3 and §5 before R11 (new brief text, new sha).

## §PH Placeholders MAIN fills at R11 (T = the `branch-dev` tip the brief is staged on)

| # | Value | How |
|---|---|---|
| P-1..P-5 | git blobs at T of the five baseline files | `git rev-parse <T>:<path>` |
| P-6..P-10 | sha256 of the five design files | `sha256sum` |

If any TS check fails at T, the brief is stale: STOP and re-draft. Do not patch it.

## §TS Task-start checks (read-only, at T; all must hold, else STOP and return to MAIN)

| # | Check | Expected |
|---|---|---|
| TS-1 | `git rev-parse HEAD:<path>` for the five baseline files | P-1..P-5 |
| TS-2 | Grep-tool counts in the guard: `function fileToolDecision(input, deps) {` · `const r = decideFn({ tool_name: tool, tool_input: toolInput, cwd }, opts && opts.deps);` · `const SEVERITY = { allow: 1, ask: 2, deny: 3 };` · `The hook never grants anything` | 1 each |
| TS-3 | `AGENTS.md` contains `### Execution envelope (one Owner act per task)` (approval-envelope-1 landed) and no `R15` | 1 / 0 |
| TS-4 | Grep-tool counts in `AGENTS.md` of each W1–W5 "current" anchor (§2.6) | 1 each |
| TS-5 | `settings.json` contains `"onFailure"` / `wmic` | 0 / 0 |
| TS-6 | `work/worker-exec-permissions-1/` holds only this brief; this brief contains no whole line equal to an auto-edit-scope or worker-mode marker (§2.2) | yes / 0 |

## §1 Files (exactly)

- `.claude/hooks/pretooluse-guard.js` — **protected-scope** (DENY tier). §2.3–§2.5
- `.claude/settings.json` — **protected-scope** (DENY tier). §2.1
- `AGENTS.md` — **protected-scope** (ASK tier). §2.6 W1–W5
- `qa/auto_mode_hardening_offline.js` — ordinary. §3
- `qa/pt_land_offline.js` — ordinary, **only** the `LAND_CONTRACT_PIN` statement (§3.5) and the one land-scope parser parity row (§3.3 (b))
- `work/worker-exec-permissions-1/review.md`

**QA suites that read in-scope files as text:** `qa/auto_mode_hardening_offline.js` (guard and `settings.json` as E1 digest parts; AH-8 reads `settings.json`; AH mutants read the guard source); `qa/pt_land_offline.js` (guard as an E1 digest part; PL-34 loads the real guard for the canonical R11 path, which this task does not change). No suite reads `AGENTS.md` (only fixtures). Re-check at step 0 (Grep `pretooluse-guard|settings\.json|AGENTS` in `qa/`, excluding `qa/fixtures/`) and record it in `plan.md`.

**Forbidden:** `.claude/hooks/pt-land.js`, `qa/guard_integrity_check.js`, `.claude/settings.local.json` (any checkout), `.claude/rules/**`, `CLAUDE.md`, `qa/run-offline.js`, every other `qa/**` file, `BACKLOG.md`, `index.html`, `services/**`, `netlify/**`, `package*.json`, `work/**` other than this task's `review.md`, Git configuration, any Pulse-Planning file (the brief template update is MAIN practice after LAND).

## §2 Normative specification

### §2.1 `settings.json` (exactly two hunks; JSON otherwise byte-identical to the base blob, same indentation and EOL)

1. The guard hook object gains one key after `"timeout": 10`, so it reads exactly:

~~~~json
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.js\"",
            "timeout": 10,
            "onFailure": "block"
          }
~~~~

2. `permissions.allow` gains exactly one entry, appended after `"Edit(//tmp/pt-*/**)"` (which gets a trailing comma):

~~~~json
      "Bash(wmic process where \"name='node.exe'\" get ProcessId,CommandLine)"
~~~~

No other key, rule, matcher, `defaultMode` or `disableBypassPermissionsMode` change. `Edit(//tmp/pt-*/**)` stays (dead on Windows per E5; removal is out of scope). Consequence the Owner accepts with this brief: with `onFailure:"block"`, a guard that cannot start, crashes or exceeds 10 s blocks every matched tool call in every session that uses this file (MAIN, Bootstrap, Planner, Workers); recovery is §6 R-3.

### §2.2 Brief markers (read by the guard from the brief blob at the task-record base)

- **auto-edit-scope block.** Begin marker string `<!-- auto-edit-scope:begin -->`, end marker string `<!-- auto-edit-scope:end -->`. Valid only if: each marker string occurs **exactly once** in the brief text (substring count) **and** each occurs as an entire line (exact, after removing one trailing `\r`), begin before end; the body has 1–64 entries. Entry = a body line with trailing `\r` and surrounding spaces removed, a leading `- ` or `* ` bullet removed, backticks removed (the land tool's parse rules); empty lines skipped. An entry is valid only if it matches `^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$` (relative, forward slashes, no glob, no `..`, no segment starting with `.`), is not a §2.3 X-path, and is an exact string member of the brief's land-scope paths (parsed with the land tool's rules: exactly one begin and one end marker by substring count, same entry stripping). **Any invalid entry, duplicate entry, missing or unparseable land-scope block, or a marker violation voids the whole block** (no grant for any path).
- **worker-mode line.** The brief is a `Mode: Auto` brief for R15 only if it contains **exactly one** entire line (after removing one trailing `\r`) equal to `<!-- worker-mode: auto -->` and **no other** entire line containing `worker-mode`. Every other case — absent, duplicated, `manual`, different case or spacing, an inline mention only — is **Manual**.
- This brief contains each auto-edit-scope marker string only inline (W1 text), never as a whole line, and no whole worker-mode line: it is a Manual brief with no grant block (TS-6).

### §2.3 R15 grant (file tools; result `grant` or "no opinion")

Notation: PD = `CLAUDE_PROJECT_DIR` (via an injectable `projectDir()` dep, default `process.env`); HC = the raw hook-input `cwd` (§2.5); N(x) = x with `\` → `/`, runs of `/` collapsed, trailing `/` removed, a leading drive letter upper-cased; SR(x) = the slot root of N(x) (`<prefix>/pt-wt-worker-a|b`, first such segment, matched case-insensitively), else null; "equal" for roots = equal after N and case-folding; T = `tool_input.file_path`; RT = the resolved real path of T (existing path: `realpathSync.native`; missing: realpath of the nearest existing ancestor plus the missing components verbatim — today's `resolveFileToolTargetFs`); REL = the path below a root, forward slashes.

Evaluated in order; the first matching row decides. Every row before G12 that matches gives **no opinion** (exit 0, empty stdout). Reads happen only for rows that need them.

| # | Condition | Result |
|---|---|---|
| G0 | Today's R10-6: path missing/unresolvable, or `.git` in T or RT | **deny**, byte-identical to today |
| G1 | Mode lock fires (§2.4) | **deny** (R15 mode lock) |
| G2 | tool ∉ {Edit, Write, MultiEdit} (NotebookEdit included) | no opinion |
| G3 | `permission_mode` is not the exact string `"default"` (absent, null, non-string, other value or case) | no opinion |
| G4 | PD or HC missing/empty/non-string; SR(PD) or SR(HC) null; SR(PD) ≠ SR(HC); N(PD) or N(HC) not drive-absolute (`X:/…`) | no opinion |
| G5 | Slot identity fails: `realpath(SR(PD))` ≠ SR(PD); `SR(PD)/.git` is not a file whose `gitdir:` is `<C>/.git/worktrees/<name>` with C's `.git` a directory; `<C>/.git/worktrees/<name>/gitdir` does not point back to `SR(PD)/.git`; `dirname(SR(PD))` ≠ `dirname(C)` | no opinion |
| G6 | HEAD of SR(PD) is not `ref: refs/heads/task/<id>`, or `<id>` ∉ `^[a-z0-9][a-z0-9._-]*$` | no opinion |
| G7 | Record `<C>/.git/pt-task/<encodeURIComponent(id)>.json` missing or invalid by the integrity check's `loadTaskRecord` rules (schema, task = `task/<id>`, oids, `briefPath` = `work/<id>/brief.md`, history, `base` = `history[last].to`, sha256 = the latest ok `task-start`/`adopt`/`resync` audit `recordSha256` in `<C>/.git/pt-land-log`); or `record.base` is not an ancestor of (or equal to) HEAD (`git merge-base --is-ancestor`) | no opinion |
| G8 | The brief blob `git cat-file blob <record.base>:<record.briefPath>` fails, or its sha256 ≠ `record.briefSha256` | no opinion |
| G9 | auto-edit-scope block void or absent (§2.2), for a target that is not evidence or scratch | no opinion |
| G10 | Path ambiguity (T or RT): not drive-absolute after N; a `\\?\`, `\\.\` or UNC prefix; drive-less (`\tmp\…`, `/tmp/…`, E5); drive-relative (`C:x`); a `:` other than the drive colon (ADS); a `.` or `..` segment; a segment ending in `.` or space; a segment matching `~\d` (8.3 form); a control character; REL(T) ≠ REL(RT) byte-for-byte (catches junctions, symlinks, case variants and 8.3 expansion inside the root); RT not under the root (case-insensitive prefix plus `/` boundary); an existing RT with `nlink` ≠ 1 (hard link) | no opinion |
| G11 | Exclusion X on lowercased REL of T **and** RT: any segment starting with `.`; the guard's `PROTECTED_RES` and `STAGED_DENY` lists; `.claude/**`; `agents.md`; `claude.md`; `checkpoint.md`; `netlify.toml`; `package.json`; `package-lock.json`; `qa/run-offline.js`; `qa/guard_integrity_check.js`; `work/*/brief.md`; any entry of the brief's protected-scope block; Claude Code protected non-dot names (`bunfig.toml`, `pyrightconfig.json`, `lefthook*.yml`, `*-wrapper.properties`); `node_modules/**` | no opinion |
| G12 | Root = SR(PD) and REL(T) ∈ the block, or REL(T) ∈ {`work/<id>/plan.md`, `work/<id>/codex.md`, `work/<id>/qa.log`}; **or** (D-3) root = `realpath(os.tmpdir())/pt-<id>` (must be a real directory, not a link), REL(T) has ≥ 1 segment, and its first segment **lowercased** ≠ `protected` (the filesystem is case-insensitive: `PROTECTED/…` is the 13a directory) | **grant**: reason `R15 grant <id> <REL>` (scratch: `R15 grant <id> tmp:<REL>`) |
| G13 | otherwise | no opinion |
| GE | Any exception, git failure, or the R15 budget (6 000 ms total, each spawn capped by `spawnBudgetMs`) exceeded in G2–G12 | no opinion (never deny, never grant) |

Git spawns (G7, G8) strip `GIT_*` from the child env, set `GIT_OPTIONAL_LOCKS=0`, run with cwd C and `windowsHide`. No spawn and no file read happen for Bash/PowerShell calls or when G2/G3 already decided.

### §2.4 R15 mode lock (Bash, PowerShell, Edit, Write, MultiEdit, NotebookEdit; result `deny` or pass)

| # | Condition | Result |
|---|---|---|
| M0 | `permission_mode === "default"` (exact) | pass, **no reads** |
| M1 | Lock-applicable sessions: candidates = { SR(PD), SR(HC) } minus nulls. If both PD and HC are missing/empty → **ambiguous**. If a PD/HC string matches `pt-wt-worker-[ab]` case-insensitively but SR or N cannot be formed (UNC, `\\?\`, drive-less) → **ambiguous** | ambiguous → **deny**; no candidate and not ambiguous (canonical / MAIN / Bootstrap / Planner) → pass |
| M2 | For **each** candidate slot S: S's HEAD is a detached 40-hex oid → S is task-free | S passes |
| M3 | Otherwise, S counts as **Auto** only if all hold: HEAD `ref: refs/heads/task/<id>` with a valid id (G6), G5 slot identity, a valid record (G7 without the ancestry spawn), the brief blob read and its sha256 = `record.briefSha256` (G8), and the brief is a `Mode: Auto` brief (§2.2). Anything else — no or invalid record, a non-task branch, an unreadable HEAD, a sha mismatch, a missing or ambiguous worker-mode line — counts as **Manual** | — |
| M4 | Any candidate S is Manual (with `permission_mode` ≠ `"default"`, including `acceptEdits`, `auto`, `dontAsk`, `plan` (D-2), `bypassPermissions`, any unknown or non-string value, and absent/null (D-1)) | **deny**: exit 2, stderr `pretooluse-guard: BLOCKED - R15 mode lock: brief <id or ?> is Manual, session mode is <value or absent> - STOP-6` |
| ME | Any exception or budget overrun while evaluating M1–M3 | **deny** (same text, `<id>` = `?`) |

The lock runs before every other decision except G0 for file tools (a `.git` write keeps its R10-6 reason). Subagent calls are covered the same way (they carry the parent's mode, E3).

### §2.5 Guard plumbing (normative behaviour; the code shape is the Worker's)

1. `runCli` passes to `decideFn` the existing `{ tool_name, tool_input, cwd }` plus two own keys, always present: `permission_mode` (the input value if it is a string, else `null`) and `hook_cwd` (the input `cwd` if a non-empty string, else `null`). The existing `cwd` fallback to `CLAUDE_PROJECT_DIR` is unchanged.
2. `decide()` evaluates §2.3 G1–G12 and §2.4 **only when the input object has the own property `permission_mode`** (only `runCli` builds it). A direct `decide()` call without that key behaves exactly as today (keeps the existing suites hermetic; it is not reachable from the harness).
3. A new internal decision value `grant`, returned only by the file-tool path. `runCli` maps it to exit 0 and stdout exactly `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"<reason>"}}` + `\n`, empty stderr. No `updatedInput`, no `additionalContext`. `runCli` blocks (exit 2, "guard returned an invalid decision") a `grant` for any tool other than Edit/Write/MultiEdit. `allow` keeps meaning "no opinion" (exit 0, empty stdout). `SEVERITY` and the Bash reduction never see `grant`.
4. All new reads are injectable deps with real defaults in `DEFAULT_DEPS` (projectDir, slot identity, HEAD, record + audit, blob read, ancestry, realpath/lstat/nlink, tmpdir). No new file, no `require` beyond Node built-ins (D-4: record validation and both block parsers are copied into the guard).
5. `module.exports` additionally exports the R15 parsers and the record loader so AH can run parity rows.
6. The header comment (`The hook never grants anything`) is replaced by a statement that the only grant is R15, emitted as `permissionDecision:"allow"`, and that `deny`/`ask` rules still win.
7. Everything else in the guard (R1–R14, R10-x, r9, R11, R12, R13, budgets, exit codes) is unchanged.

### §2.6 `AGENTS.md` edits (normative; exactly these, nothing else; fence lines excluded; LF)

**W1 — Task brief convention: insert after the paragraph that begins `**Protected-scope block (governance briefs).**`** (one blank line, then):

~~~~markdown
**Auto-edit-scope block (optional, Worker briefs).** A brief may list, one repository path per line, the files whose Edit, Write and MultiEdit calls the hook grants without a permission prompt in the task's own Worker slot (R15 grant), between the whole-line markers `<!-- auto-edit-scope:begin -->` … `<!-- auto-edit-scope:end -->`. Every entry must also be in `land-scope`. A duplicate marker, a glob, a `..` or dot-segment, or an ASK-tier, DENY-tier or protected path voids the whole block. M5 surfaces are left out, so they keep prompting. No block means no grant. The R11 line that approves the brief also approves the block.
~~~~

**W2 — Worker mode policy: replace the line** `Every brief sets `Mode: Manual` or `Mode: Auto`.` **with:**

~~~~markdown
Every brief sets `Mode: Manual` or `Mode: Auto`. A `Mode: Auto` brief also carries exactly one whole line `<!-- worker-mode: auto -->`; without it the hook treats the brief as Manual.

**Mode lock (R15, HOOK-DENY).** When the session's project directory or its current directory is a Worker slot, the hook denies every Bash, PowerShell, Edit, Write, MultiEdit and NotebookEdit call whose permission mode is not Manual (`default`) — Auto, `acceptEdits`, `dontAsk`, `plan`, `bypassPermissions`, an unknown or a missing mode — unless the slot is detached or its task's committed brief, read at the task-record base, is a `Mode: Auto` brief. A missing or invalid record or brief, or any doubt about which brief applies, counts as Manual. The denial is STOP-6. The guard hook entry fails closed (`onFailure: "block"`).
~~~~

**W3 — replace the paragraph line that begins `**Auto-approved commands (settings allowlist).**`.** Current text = that whole line as in the base blob. Replacement (one line):

~~~~markdown
**Auto-approved commands (settings allowlist).** Read-only inspection (`grep`, `cat`, `head`, `tail`, `wc`, `ls`, `diff`, `cmp`, `sha256sum`, and `git status|log|diff|show|rev-parse|ls-files`), offline QA (`npm run qa:offline`, `npm run test:*`, `node qa/*_offline.js`, `node qa/*_test.js`, `node qa/guard_integrity_check.js …`, `node qa/tools/index-pins.js --check|--update|--diff …`), Codex read-only review (`codex exec --sandbox read-only …`), the exact heavy-run process check `wmic process where "name='node.exe'" get ProcessId,CommandLine` (no other `wmic` form), `mkdir -p /tmp/pt-<task-id>…`, and the `pt-land.js` request and cleanup verbs run without a prompt. In a Worker slot in Manual, the hook also grants (R15) Edit, Write and MultiEdit without a prompt for the task's `auto-edit-scope` paths, its `work/<id>/plan.md`, `codex.md` and `qa.log`, and files under `/tmp/pt-<id>/` outside `protected/`; every other edit prompts, and `deny` and `ask` rules still apply. Everything else prompts in Manual. **Always prompt, in every mode including Auto** (`ask` rules): `pt-land.js land` and `push`, `netlify env:get|list`, `curl`, `wget`, `Invoke-WebRequest`, `Invoke-RestMethod`. Bypass-permissions mode is disabled. A Worker session never accepts an "always allow" for a non-read-only command. The hook and the `deny` rules block; `ask` rules force an Owner prompt in every mode; written rules and the Auto-mode safety classifier are not boundaries. `sed` is deliberately not auto-approved; use the Read tool for line ranges.
~~~~

**W4 — Protection tiers table, HOOK-DENY row: replace** the cell text ending `Netlify writes and protected-file writes from Worker slots |` **with** the same text ending `Netlify writes and protected-file writes from Worker slots; the Manual mode lock (R15) |`. (The row otherwise byte-identical.)

**W5 — STOP-6: replace the line** `     or the land tool's `land`, `push` or `protected-commit`;` **with:**

~~~~markdown
     the land tool's `land`, `push` or `protected-commit`; or an R15 mode-lock denial;
~~~~

§2.6a checklist (candidate, then committed file): W-anchors at base = 1 each (TS-4); on the candidate `**Auto-edit-scope block (optional, Worker briefs).**` = 1, `**Mode lock (R15, HOOK-DENY).**` = 1, `the Manual mode lock (R15)` = 1, `or an R15 mode-lock denial;` = 1, `wmic process where` = 2 (W3 and the unchanged "Test commands" line); 0 CR bytes; a diff against the base shows exactly 5 hunks.

## §3 QA (all in `qa/auto_mode_hardening_offline.js` unless stated; hermetic injected deps; SLOT_A is a real path, so no new row reads the real slot)

**§3.1 Declared re-baseline (not a behaviour change):** `payload()` and the two inline file-tool CLI payloads (the AH-17g `denyFt`/`okFt` spawns) gain `permission_mode:"default"`, so real-CLI rows with a real slot cwd never enter the lock. `okFt` keeps "exit 0, empty stdout" because no brief may list `qa/ah17_probe.js` (record in `plan.md`). Direct `decide()` rows are unchanged (§2.5-2).

**§3.2 AH-8 / AH-10 / AH-23 (settings):** `appliedSettings()` and `settingsProblems()` require `onFailure === "block"` on the wired guard entry; `WEP_ALLOW_ADDED = [<the §2.1 wmic rule>]` folds into `EXPECT_ALLOW`, and the GU-2 count-anchor row follows. Planted negatives: entry without `onFailure`; `"continue"`; the key on a different entry; `Bash(wmic *)`; `Bash(wmic process *)`; the wmic rule in `ask`. AH-10 instantiates the exact wmic rule verbatim in SLOT_A and MAIN → guard allow. AH-23 adds forbidden substrings `'Bash(wmic'` and `'Bash(git -C'`, with the exact wmic rule in `AH23_KNOWN_SAFE_ALLOW`; planted `Bash(wmic process call create x)` is detected.

**§3.3 AH-27 (grant), AH-28 (mode lock), AH-29 (plumbing), AH-30 (heavy real fixture).** Every row of the negative-test list N1–N100 (§3.6) is one or more named checks. Each violable invariant has a `mutantCatches` planted negative on the guard source: G3 mode check removed; G4 PD/HC equality removed; G5 back-pointer check removed; G7 audit-sha check removed; G8 brief-sha check removed; land-scope subset check removed; G10 REL equality removed; G10 nlink check removed; G11 dot-segment exclusion removed; scratch `protected` exclusion removed; scratch `protected` comparison made case-sensitive; M1 ambiguous→deny flipped; M3 "unknown → Manual" flipped; ME deny flipped to pass; `runCli` dropping `permission_mode`; `runCli` mapping `grant` for Bash. Parity rows: (a) in AH, the guard's record loader vs `loadTaskRecord` of `qa/guard_integrity_check.js` (already an AH E1 part) on ≥ 8 shared fixtures (valid, edited, no audit, wrong task, base ≠ history, bad schema, bad briefPath, missing); (b) in `qa/pt_land_offline.js` (new PL row; the land tool and the guard are already both E1 parts there, so AH's `E1_PART_NAMES` is **not** changed), the guard's land-scope parser vs the land tool's exported `parseLandScope` on ≥ 8 shared fixtures (one block; two blocks; none; empty; bullets/backticks; CRLF; end before begin; prose mention plus block). The PL row loads the guard from `process.env.AH_HOOK_PATH || REAL_HOOK_PATH` (`AH_HOOK_PATH` is already an E1 override variable of that suite, so the override forces a replay).

**§3.4 AH-30 heavy rows** (registered through `heavy()`, real git in a `<os.tmpdir()>` fixture: a canonical repo plus a worktree named `pt-wt-worker-a` beside it, a record and audit line written by the fixture, never by the land tool): real CLI spawn with `CLAUDE_PROJECT_DIR` = fixture slot — in-scope Write → grant JSON; absent `permission_mode` + Manual brief → exit 2 R15; `acceptEdits` + Auto brief → no lock; real `git cat-file`/`merge-base` reads; a junction inside the fixture slot → no opinion (skipped, as AH-17, without privilege). Fixture removed afterwards.

**§3.5 Pins:** `AH_CONTRACT_PIN` and `LAND_CONTRACT_PIN` (`qa/pt_land_offline.js`) both list the guard as an E1 digest part, and E1 reads the files at the repository root, so the new pins can only be computed after `protected-commit` (step 6) from forced replays (`PT_QA_FORCE_HEAVY=1`) of each suite, one heavy run at a time. Only the pin statements change.

**§3.6 Negative-test list → rows** ("NO" = no opinion, exit 0, empty stdout; "DENY" = exit 2; "GRANT" = exit 0 + allow JSON). N1–N63 are `guard-grant-verification.md` §5 #1–#63 restated; N64–N100 are new.

| N | Case | Expect | Row |
|---|---|---|---|
| 1 | PD = cwd = slot A, T inside slot B's scope | NO | AH-27 |
| 2 | cwd drift: PD = A, cwd = B (after `cd`), T in B's block | NO | AH-27 |
| 3 | PD = A, cwd = canonical, T = canonical `index.html` | NO | AH-27 |
| 4 | PD = canonical, cwd = A; lock evaluates A | NO grant; lock per M3 | AH-27/28 |
| 5 | PD missing / empty | NO | AH-27 |
| 6 | fake `pt-wt-worker-a` dir with its own `.git`, `pt-task`, audit log; and with a `.git` file pointing at the real admin dir | NO (G5) | AH-27 |
| 7 | slot on task/foo, T only in task/bar's brief | NO | AH-27 |
| 8 | record for task/foo while HEAD = task/bar | NO | AH-27 |
| 9 | T in neither block nor evidence | NO | AH-27 |
| 10 | T in land-scope but not the block (M5 `index.html`) | NO | AH-27 |
| 11 | a block entry ∉ land-scope → every entry | NO | AH-27 |
| 12 | duplicate begin marker | NO | AH-27 |
| 13 | block added only in the working-tree brief | NO | AH-27 |
| 14 | in-scope path in another case (`QA/x.js`) | NO | AH-27 |
| 15 | `work/other/qa.log` | NO | AH-27 |
| 16–21 | record missing; record edited (sha ≠ audit); no ok audit line; `briefSha256` ≠ blob; `base` not a commit; record loader throws | NO | AH-27 |
| 22–24 | HEAD detached; `branch-dev` / `main`; `refs/heads/task-foo` | NO | AH-27 |
| 25–29 | Manual brief, mode `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions` / unknown, each for Bash, PowerShell, Edit, Write, MultiEdit, NotebookEdit | DENY | AH-28 |
| 30 | Manual brief, `plan` | DENY (D-2) | AH-28 |
| 31 | Manual brief, mode absent (CLI) / null | DENY (D-1) | AH-28/30 |
| 32 | Auto brief, `acceptEdits` | lock off; grant NO (G3) | AH-28 |
| 33 | in-scope Edit in `acceptEdits`/`auto` with an Auto brief | NO, never GRANT | AH-27 |
| 34 | lock: cwd `cd`'d to canonical, PD = slot | DENY | AH-28 |
| 35 | subagent payload (`agent_id`) with a non-default mode | DENY as 25–31 | AH-28 |
| 36–41 | `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/x.js`, `.claude/rules/x.md`; `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `netlify.toml`, `package.json`, `package-lock.json`, `qa/run-offline.js`; `work/<id>/brief.md`, `work/other/brief.md`, `CHECKPOINT.md`, `.env`, `.env.local`; `.husky/pre-commit`, `.vscode/settings.json`, `.devcontainer/x`, `.npmrc`, `.mcp.json`, `.gitmodules`, `.envrc`; a protected-scope path — each listed in block and land-scope | NO (whole block void) | AH-27 |
| 37 | `.git/config`, `.git/hooks/pre-commit` | DENY (G0, R10-6 text) | AH-27 |
| 42 | settings `ask` still prompts even if granted (`AGENTS.md`) | LIVE | §LC |
| 43 | case variant of a protected path (`.CLAUDE/settings.json`, `Agents.md`) | NO | AH-27 |
| 44 | `qa/../.claude/settings.json`, `qa\..\AGENTS.md` | NO | AH-27 |
| 45 | junction/symlink inside the slot to slot B | NO (REL ≠) | AH-27/30 |
| 46 | 8.3 names (`PT-WT-~1\qa\x.js`, `PROGRA~1`) | NO | AH-27 |
| 47 | mixed separators of the same in-scope path | GRANT | AH-27 |
| 48 | UNC `\\localhost\c$\…`, `\\?\C:\…` | NO | AH-27 |
| 49 | trailing dot / space | NO | AH-27 |
| 50 | ADS `qa/x.js:evil` | NO | AH-27 |
| 51 | drive-relative `C:qa\x.js` | NO | AH-27 |
| 52 | Write of a new in-scope file (parent exists); under a missing in-scope dir | GRANT / GRANT only if REL equal | AH-27 |
| 53 | NotebookEdit on an in-scope path | NO | AH-27 |
| 54–55 | MultiEdit, Edit, Write overwrite in scope | GRANT | AH-27 |
| 56–57 | injected loader/git exception; slow git past budget | NO | AH-27 |
| 58–59 | grant exits 0 and parses; no `updatedInput`/`additionalContext` | exact bytes | AH-29 |
| 60 | every existing no-opinion row still exit 0, empty stdout | unchanged | existing AH-9/16/17 |
| 61 | parser and record parity | identical | AH-27 |
| 62 | after a DENY, the same call again | DENY | AH-28 |
| 63 | review.md rewording in scope | residual, process-only | §6 R-6 |
| 64 | cwd = subdirectory of the same slot | GRANT (positive control) | AH-27 |
| 65 | PD forward slashes, cwd backslashes, different case, lower-case drive | GRANT (positive control) | AH-27 |
| 66 | decoys `pt-wt-worker-a-old`, `pt-wt-worker-c` | NO; lock pass | AH-27/28 |
| 67 | PD given as an 8.3 short form of the slot | NO (G5 realpath) | AH-27 |
| 68 | PD in UNC form naming a slot | NO; lock DENY (ambiguous) in non-default | AH-27/28 |
| 69 | drive-less `\tmp\pt-<id>\x` (E5) | NO | AH-27 |
| 70 | POSIX `/tmp/pt-<id>/x` | NO | AH-27 |
| 71 | scratch `<tmp>/pt-<id>/x.js` / `…/protected/manifest.json` / `…/PROTECTED/manifest.json` and `…/Protected/cand.js` with the `protected` dir absent and present / `pt-<other>/x` / `pt-<id>-evil/x` / `pt-<id>` a junction | GRANT / NO / NO / NO / NO / NO | AH-27 |
| 72 | existing in-scope target with `nlink` 2 | NO | AH-27 |
| 73 | block entry with a glob, leading `./`, backslash, `..`; empty block; 65 entries | NO (void) | AH-27 |
| 74 | block valid, land-scope block absent | NO | AH-27 |
| 75 | two land-scope blocks | NO | AH-27 |
| 76 | record base not an ancestor of HEAD; record archived after cleanup | NO | AH-27 |
| 77 | blob read at base fails | NO | AH-27 |
| 78 | task id with upper case or `/` | NO | AH-27 |
| 79 | `permission_mode` `"Default"` | grant NO; lock DENY | AH-27/28 |
| 80 | `permission_mode` a number / object | grant NO; lock DENY | AH-27/28 |
| 81 | lock: slot HEAD detached, mode `auto` | pass (positive control) | AH-28 |
| 82 | lock: slot on `branch-dev`; HEAD unreadable; task branch with no record | DENY | AH-28 |
| 83 | worker-mode line twice; `auto` + `manual` lines; `AUTO`; inline mention only | Manual → DENY | AH-28 |
| 84 | worker-mode auto line only in the working-tree brief | DENY | AH-28 |
| 85 | PD = slot A (Manual), cwd = slot B (Auto) | DENY | AH-28 |
| 86 | PD = cwd = canonical, mode `auto` | pass (MAIN unaffected) | AH-28 |
| 87 | PD and cwd both missing, mode `auto` / `default` | DENY / pass | AH-28 |
| 88 | lock evaluator throws; lock budget overrun | DENY | AH-28 |
| 89 | mode `default`: lock makes zero reads (spy) | 0 reads | AH-28 |
| 90 | `runCli` passes `permission_mode` and `hook_cwd` as own keys (null when absent) | mutant caught | AH-29 |
| 91 | injected `decideFn` returns `grant` for Bash | exit 2 | AH-29 |
| 92 | direct `decide()` without the key | today's result | AH-29 |
| 93 | grant path makes zero reads for Bash or mode ≠ default (spy) | 0 reads | AH-27 |
| 94 | grant-path exception vs lock-path exception | NO vs DENY | AH-27/28 |
| 95 | `onFailure` missing / `continue` / elsewhere | AH-8 rejects | AH-8 |
| 96 | `Bash(wmic *)`, `Bash(wmic process *)`, wmic in ask | AH-8/AH-23 reject | AH-8/23 |
| 97 | STOP-bypass: edit the working-tree brief to add a scope entry or the auto line; edit the record; append to the audit log via Write (`.git` → DENY); `cd` to canonical | NO / DENY / DENY / DENY | AH-27/28 |
| 98 | hook failure (timeout, crash, can't start) with `onFailure:"block"` | blocked | LIVE (E4 observed); §LC |
| 99 | evidence path of this task under a missing `work/<id>/` dir | GRANT only if REL equal | AH-27 |
| 100 | E6 cd drift in a real session | UNVERIFIED | §LC-6 |

## §3a Step-0 and step-10 QA

- Step 0: full `npm run qa:offline` (or documented reuse), count recorded.
- Targeted, during implementation: `AH_HOOK_PATH=<cand guard> AH_SETTINGS_PATH=<cand settings> node qa/auto_mode_hardening_offline.js` and `AH_HOOK_PATH=<cand guard> node qa/pt_land_offline.js` (override variables force a full replay against the candidates; one heavy run at a time).
- Step 10 on the protected commit: full `qa:offline`, same count; AH and PL print stale-pin lines and PASS.
- Step 10c on the final tip (after the pins): full `qa:offline`, same count, AH and PL print `SKIP (contract pinned: …)`. This run is the LAND QA; its count is LAND-EVIDENCE N.

## §4 Steps

| Step | Who | Action |
|---|---|---|
| 0 | Worker | §TS; integrity `--print-record`; process check (one `qa.log` line); step-0 `qa:offline`. `plan.md`: the four CLAUDE.md items — Pattern Auditing (R12 block in `decide()` reading `CLAUDE_PROJECT_DIR`; `resolveFileToolTargetFs`/`fileToolDecision`; `runCli` ask-JSON mapping; `loadTaskRecord` in the integrity check; `parseLandScope` in the land tool), State & Boundary Isolation (no `localStorage`, DOM, scoring or scan path), Gate Verification (R15 grant: own key `permission_mode` + exact `"default"` + §2.3; R15 lock: §2.4; server env toggles N/A), Definition of Done = §5 — plus the requirement→test map and the §1 suite re-check |
| 1 | Worker | Tests first: AH rows of §3 against the base guard (they fail). Build candidates `cand-guard.js`, `cand-settings.json`, `cand-agents.md` under `C:/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/` from the base blobs (LF; CR count = base) plus §2; `manifest.json` = `{"files":[{"target":".claude/hooks/pretooluse-guard.js","source":"cand-guard.js"},{"target":".claude/settings.json","source":"cand-settings.json"},{"target":"AGENTS.md","source":"cand-agents.md"}]}`. Method is the Worker's; never an Edit/Write on the three targets in the slot |
| 2 | Worker | Implement until the targeted override run is green; §2.6a checklist; `settings` candidate parses and AH-8 passes on it |
| 3 | Worker | Self-review; Codex on the real diff (task-branch diff + the three candidates vs their base blobs); FIX/DEFER/REJECT |
| 4 | Worker | **First r9 commit:** `git add qa/auto_mode_hardening_offline.js qa/pt_land_offline.js` (explicit paths; `pt_land_offline.js` carries only the parity row at this point); `git diff --cached --name-only` must list exactly those two paths (else STOP-1, no commit); plain `git commit -m` in a separate call |
| 5 | Worker → Owner | **13a:** `protected-request` → report + line printed exactly → STOP → Owner PROTECTED `!` line → `protected-commit`. Verify the three committed blobs' sha256 = the candidates' |
| 6 | Worker | **Step 10** on the protected commit: process check → full `qa:offline` (count = step 0) → land-test `node qa/auto_mode_hardening_offline.js`. Then forced replays, one at a time, each after a process check: `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js`, `PT_QA_FORCE_HEAVY=1 node qa/pt_land_offline.js`; set the two pin statements to the printed digests |
| 7 | Worker | Step 10c: process check → full `qa:offline` on the working tree with the pins (count = step 0; AH and PL SKIP lines) |
| 8 | Worker | `review.md` (requirement→test results, N1–N100 result per row, Codex ledger, `## Backlog reconciliation`: none, `## Lessons`, one column-1 `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0` with N from step 7) → final Codex check on the task diff incl. `review.md` |
| 9 | Worker | **Second r9 commit, authorized by this brief:** `git add qa/auto_mode_hardening_offline.js qa/pt_land_offline.js work/worker-exec-permissions-1/review.md`; `git diff --cached --name-only` must list exactly those three (else STOP-1, no commit); plain commit in a separate call. The tree must equal the step-7 tree plus `review.md` (`git diff --stat` before staging shows only those paths). Integrity check from the card; its result is LAND evidence only |
| 10 | Worker / Bootstrap / Owner | `land-request` → STOP → LAND line → `land` → `push-request` → PUSH line → `push` → `cleanup`, under AGENTS.md as amended by approval-envelope-1 (E6: one decision, two records) |
| §LC | Owner + MAIN | Separate, Owner-approved, after LAND (§LC). Not part of this task's DoD |

**STOP for:** any change outside §1; a §2 deviation; a candidate or committed sha mismatch; TS failure; a 13a refusal; a hook denial that is STOP-6 under the current rules (a form denial is reissued once in compliant form and logged); any R15 denial of this Worker after step 5 (this brief is Manual; the session must stay in Manual); two heavy runs at once.

**Note for this task's own session:** after `protected-commit` the slot runs the new guard on every call. In Manual the lock does not fire (M0) and this brief has no grant block, so behaviour is unchanged; a guard crash would block every call (`onFailure`) → STOP-6.

## §5 Definition of Done

1. The committed guard, `settings.json` and `AGENTS.md` equal the PROTECTED-approved candidates; `settings.json` differs from the base only by §2.1's two hunks; `AGENTS.md` only by W1–W5 (§2.6a).
2. `git diff --stat <base>..<tip>` lists exactly the six §1 files.
3. Step-7 `qa:offline` PASS with the step-0 count; the land-test PASS; every N row PASS or marked LIVE/UNVERIFIED as in §3.6; every planted negative caught; parity rows identical.
4. Observable contract: a grant = exit 0 + the exact §2.5-3 JSON; a lock = exit 2 + the §2.4 stderr prefix `pretooluse-guard: BLOCKED - R15 mode lock:`; every other existing decision byte-identical.
5. `review.md` complete with exactly one `LAND-EVIDENCE` line.

## §6 Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Over-grant from a parser or path bug | Fail-closed rows G2–G11; whole-block void; N1–N100 with mutants; `deny`/`ask` rules still win (perm-raw :617); CC protected paths still prompt on a hook allow (E1); LAND L7/L8 refuse any out-of-scope path |
| R-2 | Mode-lock false positives (legacy `Mode: Auto` briefs without the line; VS Code starting in Auto) | Fail-closed by design: the Owner switches to Manual (always permitted); MAIN adds the line to the template for future Auto briefs |
| R-3 | `onFailure:"block"` blocks all sessions on a guard crash or > 10 s | The guard already exits 2 on its own errors; R15 budget 6 s; recovery: the Owner edits `.claude/settings.json` in a normal terminal (remove `onFailure`), then a governed fix |
| R-4 | Other approvers outside the guard (future plugin hooks, mods on a personal plan, E0) | Unchanged residual; Owner presence (ATTENDED-ONLY) |
| R-5 | T6 indirect writes (Bash/Node scripts) | Unchanged: Bash still prompts in Manual; the lock denies Bash in other modes |
| R-6 | Granted `review.md` rewording | Codex final check, LAND evidence line, Owner LAND review |
| R-7 | Scratch grant ineffective (harness working-dir check) | Fails safe (prompt); §LC records it |
| R-8 | E6 cd drift UNVERIFIED | G4 requires SR(PD) = SR(HC); M1 uses either; N2–N4, N34, N85 |
| R-9 | Another slot runs the old guard until its next task-start/resync | §LC runs after that point |
| R-10 | Hook "allow" on CC-protected paths | Observed refused (E1); G11 never grants them anyway |

## §LC Post-LAND live check (separate Owner-approved step; Owner present; one Manual Worker session in a slot that has been task-started on the landed guard, on a task whose approved brief carries an auto-edit-scope block; MAIN records each result in the ledger)

LC-1 Edit of a listed in-scope file: no prompt. LC-2 Write `work/<id>/plan.md`: no prompt. LC-3 Edit of a land-scope file not in the block: prompt (Owner answers per the task). LC-4 Edit `AGENTS.md` (not listed): prompt, Owner answers No. LC-5 Write `.git/x`: denied (R10-6). LC-6 one Bash `git status --short --branch`, then Shift+Tab to `acceptEdits` and the same command: DENY `R15 mode lock` (STOP-6 by design; Owner switches back to Manual and rules "continue"); also records whether the hook `cwd` follows a `cd` (E6). LC-7 the exact `wmic` line: no prompt. LC-8 a Write under `/tmp/pt-<id>/`: record prompt or no prompt. A failed expectation is reported to the Owner; a grant that over-reaches → immediate revert by the Owner in a normal terminal.

## §CMD Command card (one command per Bash call, exactly as written; read files with Read / Grep)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git diff --cached --name-only
git rev-parse HEAD:.claude/hooks/pretooluse-guard.js
git rev-parse HEAD:.claude/settings.json
git rev-parse HEAD:AGENTS.md
git rev-parse HEAD:qa/auto_mode_hardening_offline.js
git rev-parse HEAD:qa/pt_land_offline.js
node qa/guard_integrity_check.js --task task/worker-exec-permissions-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
wmic process where "name='node.exe'" get ProcessId,CommandLine
npm run qa:offline
node qa/auto_mode_hardening_offline.js
node qa/pt_land_offline.js
AH_HOOK_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-guard.js AH_SETTINGS_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-settings.json node qa/auto_mode_hardening_offline.js
AH_HOOK_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-guard.js node qa/pt_land_offline.js
PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js
PT_QA_FORCE_HEAVY=1 node qa/pt_land_offline.js
sha256sum /c/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-guard.js /c/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-settings.json /c/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/cand-agents.md
node .claude/hooks/pt-land.js protected-request task/worker-exec-permissions-1
node .claude/hooks/pt-land.js protected-commit task/worker-exec-permissions-1
git add qa/auto_mode_hardening_offline.js qa/pt_land_offline.js
git add qa/auto_mode_hardening_offline.js qa/pt_land_offline.js work/worker-exec-permissions-1/review.md
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/worker-exec-permissions-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/worker-exec-permissions-1
node .claude/hooks/pt-land.js land task/worker-exec-permissions-1
node .claude/hooks/pt-land.js push-request
node .claude/hooks/pt-land.js push
node .claude/hooks/pt-land.js cleanup task/worker-exec-permissions-1
codex exec --sandbox read-only <prompt naming a scratch prompt file>
<!-- cmd:end -->

## §PEP Execution preflight (A auto-approved · B permission prompt · C governance gate · D hook-denied, must not appear)

| Step | A | B | C | D |
|---|---|---|---|---|
| 0 | git read-only card lines; `--print-record`; `npm run qa:offline`; Read / Grep / Glob | the `wmic` line (until this task lands); writing `plan.md` / `qa.log` (Write, in the slot) | Owner go-ahead (per step; no envelope) | PowerShell in the slot; `node -e`/`-p` |
| 1–3 | `node qa/auto_mode_hardening_offline.js`; `sha256sum` (card form); `mkdir -p /tmp/pt-worker-exec-permissions-1…`; `codex exec --sandbox read-only …` (may still prompt) | Write of candidates and `manifest.json` under `C:/Users/Owner/AppData/Local/Temp/pt-worker-exec-permissions-1/protected/`; edits of `qa/auto_mode_hardening_offline.js` and the `qa/pt_land_offline.js` parity row; the two env-prefixed override runs; any scratch script run | none | an Edit/Write on the guard, `settings.json` or `AGENTS.md` in the slot; a Bash command naming a protected target as a write; `pt-land` text inside a `codex exec` command |
| 4 (r9) | `git diff --cached --name-only`; `git log -1 …` | `git add …`; `git commit -m` | Owner go-ahead (per step; no envelope) | `git add … && git commit …` in one call (form denial → two calls) |
| 5 (13a) | `protected-request` | `protected-commit` | **Owner PROTECTED `!` line** | staging a protected path by hand |
| 6–7 | `npm run qa:offline`; `node qa/auto_mode_hardening_offline.js`; `node qa/pt_land_offline.js` | `wmic`; both `PT_QA_FORCE_HEAVY=1` replays; editing the two pin statements | none | a second concurrent heavy run |
| §L (8–9) | `git diff --cached --name-only`; integrity line; `land-request` | `review.md` Write; `git add` (three paths); `git commit -m`; final `codex exec` | Owner go-ahead (per step; no envelope) | as step 4 |
| closure (10) | `push-request`; `cleanup task/worker-exec-permissions-1` | `land`, `push` (`ask` rules) | **Owner LAND `!` line; Owner PUSH `!` line** (public Netlify DEV deploy) | `git push`, `merge`, `rebase`, `pull`; any Netlify command; `curl` / WebFetch |

Slice-to-slice continuation (0 → 1 → 2 → 3 → 4, and 6 → 7 → 8 → 9) needs no Owner input when the gates PASS. Scratch: `/tmp/pt-worker-exec-permissions-1/` and the 13a directory `<os.tmpdir()>/pt-worker-exec-permissions-1/protected/`.

## §UER Execution readiness

**ATTENDED-ONLY.** Mode: **Manual** (DENY-tier and ASK-tier protected files; M5 security surface).

**§L:** no partial land.

<!-- land-scope:begin -->
.claude/hooks/pretooluse-guard.js
.claude/settings.json
AGENTS.md
qa/auto_mode_hardening_offline.js
qa/pt_land_offline.js
work/worker-exec-permissions-1/review.md
<!-- land-scope:end -->
<!-- protected-scope:begin -->
.claude/hooks/pretooluse-guard.js
.claude/settings.json
AGENTS.md
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/auto_mode_hardening_offline.js
<!-- land-tests:end -->
