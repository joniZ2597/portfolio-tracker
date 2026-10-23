# Brief: worker-permission-profile-1 — Worker command rules, task-scoped scratch directory, task-scoped staging grant (R16), read-only Chrome allow rules (PROTECTED)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. It is self-contained. DRAFT, 2026-10-23, revision 2 (after the Owner rulings on proposal v1 and on §OD D-1..D-7): not approved, not committed, not staged; nothing in it authorizes a gate. §PH filled by MAIN at T = `ecd9988f0c79a03f736b3c7740ea009ccf8d6b08` (2026-10-23); §TS-1..TS-4 verified at T. §OD is answered (rulings recorded under §OD). The Worker starts only after the R11 brief-only commit exists, so the Worker steps begin at step 0 and contain no brief-request.

This task is excluded from the execution envelope because it changes hooks, settings, permissions and governance. Task-start, every commit, the PROTECTED line, LAND and PUSH each need the Owner's explicit go-ahead or record.

**What the Owner sees:**
1. One package review with the §OD rulings, then the R11 line.
2. One PROTECTED line, whose report binds the exact new guard, `pt-land.js`, `settings.json` and `AGENTS.md` bytes.
3. The LAND and PUSH lines (the PUSH is the public Netlify DEV deploy).
4. Afterwards, as a separate Owner-approved step, one attended live check (§LC).

| | |
|---|---|
| Problem | A clean task (portfolio-live-budget-fix-1) cost 21 Owner interruptions: 10 routine prompts, 7 governance approvals, 2 retained boundary prompts and 2 rulings. 9 of the 10 routine prompts came from the Worker. Root causes, measured from transcripts (proposal v1 §1):<br>- shell forms whose subcommands match no allow rule (`echo`, `printf`, `cut`, `sed`, `for`, `node -e`) and redirects that write files;<br>- Codex output redirected to a file, or run in the background and lost;<br>- the first scratch Write prompts because `<os.tmpdir()>/pt-<id>` does not exist yet (R15 requires a real directory);<br>- `git add` is not allow-listed;<br>- Chrome MCP tools have no allow rules. |
| Objective | (A) `AGENTS.md` gains the Worker command rules. (B-1) `task-start` and `adopt` create the task's own scratch directory, so the **unchanged** R15 scratch grant applies from the first write; no new permission rule. (B-2) The guard grants (R16) exactly one staging form, `git add [--] <paths>`, only in the task's own Manual Worker slot, only for existing regular files in the brief's `land-scope` and outside `protected-scope` and the R15 exclusions. Anything else is "no opinion", which means a normal prompt. `settings.json` adds two deny rules against force-staging. (B-4) `settings.json` allows four read-only Chrome MCP tools. Nothing else changes. |
| Owner rulings applied (2026-10-23, verbatim in MAIN's ledger) | - **A** APPROVED.<br>- **B-1** APPROVED IN PRINCIPLE, restricted to the dedicated task scratch directory.<br>- **B-2** REVISE: no unrestricted `git add *`; a staging rule limited to approved task files.<br>- **B-4** APPROVED IN PRINCIPLE for genuinely read-only Chrome operations; navigation, clicks, form input, arbitrary page scripts and other state-changing operations are excluded until individually reviewed.<br>- **B-5** NOT APPROVED: the `WebFetch` ask stays.<br>- LAND/PUSH, Netlify API, `curl` and `netlify dev` approval boundaries stay unchanged.<br>- Preconditions: the settings documentation read and verified (§DOC); exact rules and effective scope (§2, §EFF); routine prompts separated from mandatory governance approvals (§PROJ); existing deny rules, R11/V8 controls and task-scope enforcement confirmed intact (§INV). |
| Design source | `Pulse-Planning/worker-permission-profile-1/proposal.md` (sha256 `c5d7af368a64990f05fe78c8dfd74a3d305b860d9991db984cf03ba700226483`). This brief restates every normative rule; the Worker needs no other document. |
| Backlog | **none**. No `BACKLOG.md` edit. |
| Baseline (§TS) | `branch-dev` tip T at task-start. T = `ecd9988f0c79a03f736b3c7740ea009ccf8d6b08`. Blobs at T (P-1..P-6, verified by MAIN at R11 preparation):<br>- guard `cda5dad8501ec71669258bb3dfc92d2a4d81af04`<br>- `pt-land.js` `2bf6aeaf296b20cafe438dcca2cedd463637cf78`<br>- `settings.json` `9151540897a02e15c2adecb32b262b3f386817ac`<br>- `AGENTS.md` `9f9ec5e77529882f4b524bf001b9f313d89df94c`<br>- `qa/auto_mode_hardening_offline.js` `dc84db95402546b4b861375e616d232b9f5ae992`<br>- `qa/pt_land_offline.js` `2c696c692bca1f2e103d30293d24bde4ff918cea` |
| Branch / slot / mode | `task/worker-permission-profile-1` · first free slot · **Manual**, attended. DENY-tier and ASK-tier protected files are in scope; they enter only through step 13a. |
| qa:offline | Suite count **unchanged**: the new rows extend the existing AH and PL suites. Two digest pins go stale and are re-pinned (§3.4). |
| Parallel with | Any task that edits none of the §1 files. One heavy run at a time. Another slot keeps its checked-out guard and `settings.json` until its next task-start or resync. |
| Scoring boundary | Nothing touched: no `index.html`, `services/**`, `netlify/**`, scoring, persistence or Actionable Take. |
| Gate verification | This task *is* a gate change. Client/server feature gates: N/A. The enforced gate it adds is the R16 staging grant (no-opinion default), §2.3. |
| Skills | `pt-offline-suite` (required: the task edits two digest-pinned suites and the hook files they pin). `json-safe-edit` for the `settings.json` candidate. |

## §DOC Documentation verified (Documentation-First; MAIN, 2026-10-23)

Sources: `code.claude.com/docs/en/permissions.md`, `/hooks.md` and `/settings.md` (all three read). Findings this brief relies on:

| # | Finding | Consequence here |
|---|---|---|
| DOC-1 | Rule order is deny → ask → allow; "a matching ask rule prompts even when a more specific allow rule also matches." Lists merge across scopes, and an allow rule in a local file "doesn't outrank an `ask` rule from a project or managed file". | The `WebFetch` ask keeps overriding every domain allow (B-5 not approved; unchanged). New allow rules can't weaken any existing ask. |
| DOC-2 | A hook `allow` doesn't bypass `deny` or `ask` rules; a hook exit-2 block applies even when an allow rule matches. | R16's grant can never stage a path that a deny/ask rule covers. The new deny pair wins over R16. |
| DOC-3 | Each subcommand of `&&`, `;`, `\|` and so on must match an allow rule; deny/ask apply inside loops and subshells. Redirect targets are checked against Edit rules (`2>&1`, `/dev/null` aren't). An allow rule doesn't match past an unknown env assignment. | Basis of the Worker command rules (§2.4). |
| DOC-4 | MCP rule syntax is `mcp__<server>__<tool>`; server-wide `mcp__<server>` and `mcp__<server>__*` exist. Rules can't constrain tool parameters. | B-4 lists four exact tool names; no server-wide rule (planted negative in AH-23). A tool with any state-changing parameter is excluded. |
| DOC-5 | The shared `.claude/settings.json` is read from the session's primary working directory. On Windows the local file stays beside it. Project `allow` rules need workspace trust; `deny` and `ask` apply at once. Files are reloaded on change. | A Worker slot uses the `settings.json` committed on its task branch, so new rules reach a slot at its next task-start or resync on the landed `branch-dev`. MAIN's canonical checkout picks them up at LAND. |
| DOC-6 | On Windows, paths in rules are normalized to `//c/...`; `Write(...)` rules never match. | The existing `Edit(//tmp/pt-*/**)` and `Bash(mkdir -p /tmp/pt-*)` stay unchanged. They are inert on Windows; removal is out of scope. That is why B-1 uses the R15 hook and not a rule. |

## §OD Owner decisions (answer every row before the R11 line; "defaults" applies the default column)

| # | Decision | Default | Alternative |
|---|---|---|---|
| D-1 | B-1 mechanism | **`task-start` and `adopt` create `<realpath(os.tmpdir())>/pt-<id>`** (§2.2). R15 is unchanged, so its real-directory and junction checks stay as they are. Verified 2026-10-23: MAIN's `os.tmpdir()` and its realpath are `C:\Users\Owner\AppData\Local\Temp`, the same root the Worker's R15 scratch grant used. **Note:** this makes the land tool (`pt-land.js`) a fourth protected target, which goes beyond the in-principle B-1 approval for a saving of about 1 prompt per task. | (a) R15 grants a write whose scratch root is missing. Weaker: the root is created by the write itself, after the hook's check. (b) No code: MAIN creates the folder by hand before each Worker hand-off. Procedural, so it can be forgotten. |
| D-2 | B-2 R16 staging grant | **ON** (§2.3). Saves 1–2 prompts per task. It adds the guard's first Bash grant path, a deliberate reversal of the WEP planted negative "`runCli` mapping `grant` for Bash", now narrowed to the R16 reason. | OFF: `git add` keeps prompting; the deny pair still lands. |
| D-3 | Force-staging deny pair `Bash(git add -f*)`, `Bash(git add --force*)` | **ON** | OFF |
| D-4 | `read_network_requests` in B-4 | ON: read-only, but request URLs and headers of pages in the MCP tab group reach the session transcript. | **OFF (Owner ruling): excluded.** 4 tools; it keeps prompting. |
| D-5 | This brief's own auto-edit-scope: the two QA suites and `review.md` | **ON**. Test files and evidence; every protected candidate under `pt-<id>/protected/` still prompts (R15 exclusion). | OFF: every edit prompts. |
| D-6 | Re-pin the two stale digests (AH, PL) in this task | **YES** | leave stale |
| D-7 | Codex evidence capture (AGENTS.md requires the response "verbatim in `codex.md`") | **`codex exec -o <scratch>/codex-r<N>.md`**, then one prompted byte-exact append call per round (W1). That is 1 prompt per round, down from about 2 today. `codex.md` then holds the review message the CLI writes (its last message), not the full console log. | (a) Full console log: a shell redirect into scratch, so 2 prompts per round, as today. (b) The Worker copies with Edit/Write: no prompt, but a model re-type of long text (a known corruption risk). |

If the Owner picks any non-default option, MAIN amends W1/W2, §2, §3, §INV, §EFF and §PROJ before R11. The amended brief has a new sha and is re-presented.

**Owner rulings 2026-10-23 (verbatim in MAIN's ledger):**
- **D-1** approved (default).
- **D-2** approved (default), limited strictly to the task-owned Worker slot and the approved staging scope (§2.3 S4–S8).
- **D-3** approved (default).
- **D-4** CHANGE: `read_network_requests` is excluded from the automatic Chrome allow rules and keeps its explicit prompt. Applied in §2.1, §2.4, §3.1, §EFF, §6 and §LC.
- **D-5** approved (default), limited to the task-owned QA files and `review.md`. The protected candidate files stay gated.
- **D-6** approved (default).
- **D-7** approved (default), preserving byte-exact Codex review evidence.

All existing security, permission and governance boundaries are maintained: R11, R12, R15, V8, the commit/land/push gates and fail-closed hooks (§INV).

## §PH Placeholders MAIN fills at R11 (T = the `branch-dev` tip the brief is staged on)

| # | Value | How |
|---|---|---|
| P-1..P-6 | git blobs at T of the six baseline files | `git ls-tree <T> <paths>` |
| P-9 | sha256 of `proposal.md` | `sha256sum` |

If any TS check fails at T, the brief is stale: STOP and re-draft. Do not patch it.

## §TS Task-start checks (read-only, at T; all must hold, else STOP and return to MAIN)

| # | Check | Expected |
|---|---|---|
| TS-1 | `git rev-parse HEAD:<path>` for the six baseline files | P-1..P-6 |
| TS-2 | Grep-tool counts in the guard: `if (scratch) return { decision: 'grant', reason: 'R15 grant ' + id + ' tmp:' + rel };` · `tmpDir: () => os.tmpdir(),` · `R16` | 1 · 1 · 0 |
| TS-3 | Grep-tool counts in `AGENTS.md`: `**Auto-approved commands (settings allowlist).**` · `**Worker command rules.**` · `R16` | 1 · 0 · 0 |
| TS-4 | `settings.json` contains `claude-in-chrome` / `git add` | 0 / 0 |
| TS-5 | `work/worker-permission-profile-1/` holds only this brief | yes |

## §1 Files (exactly)

- `.claude/hooks/pretooluse-guard.js`: **protected-scope** (DENY tier). §2.3
- `.claude/hooks/pt-land.js`: **protected-scope** (DENY tier). §2.2
- `.claude/settings.json`: **protected-scope** (DENY tier). §2.1
- `AGENTS.md`: **protected-scope** (ASK tier). §2.4
- `qa/auto_mode_hardening_offline.js`: ordinary. §3.1–§3.2
- `qa/pt_land_offline.js`: ordinary. §3.3
- `work/worker-permission-profile-1/review.md`

**Forbidden:**
- `qa/guard_integrity_check.js`, `.claude/settings.local.json` (any checkout), `.claude/rules/**`, `CLAUDE.md`, `qa/run-offline.js`;
- every other `qa/**` file, `BACKLOG.md`, `index.html`, `services/**`, `netlify/**`, `package*.json`;
- `work/**` other than this task's `review.md`;
- Git configuration, any user-scope settings file, any Pulse-Planning file.

## §2 Normative specification

### §2.1 `settings.json` (exactly two hunks; otherwise byte-identical to the base blob, same indentation and EOL)

1. `permissions.deny` gains exactly these two entries, appended after `"PowerShell(iex *)"` (which gets a trailing comma):

~~~~json
      "Bash(git add -f*)",
      "Bash(git add --force*)"
~~~~

2. `permissions.allow` gains exactly these four entries, appended after the `wmic` rule (which gets a trailing comma):

~~~~json
      "mcp__claude-in-chrome__read_page",
      "mcp__claude-in-chrome__get_page_text",
      "mcp__claude-in-chrome__find",
      "mcp__claude-in-chrome__read_console_messages"
~~~~

Nothing else changes:
- no other rule, `ask` entry, matcher, hook entry, `onFailure`, `defaultMode` or `disableBypassPermissionsMode`;
- no `git add` allow rule;
- no server-wide Chrome rule.

**Still prompting** (no rule):
- `tabs_context_mcp`: it lists tabs, but its `createIfEmpty` parameter opens a new window and tab group, and an MCP rule can't constrain parameters. Excluded until individually reviewed.
- `read_network_requests`: read-only, but request URLs and headers would reach the session transcript. Excluded by Owner ruling D-4 (2026-10-23).
- `tabs_create_mcp`, `tabs_close_mcp`, `navigate`, `computer` (click, type and screenshot share one tool), `javascript_tool`, `form_input`, `browser_batch`, `file_upload`, `upload_image`, `gif_creator`, `resize_window`, `shortcuts_execute`, `switch_browser`, `select_browser`, `list_connected_browsers`, `shortcuts_list`.

### §2.2 `pt-land.js`: the scratch directory at task-start and adopt (D-1)

After a successful `task-start` or `adopt` (after the record and audit are written, before printing), the tool ensures `S = path.join(fs.realpathSync.native(os.tmpdir()), 'pt-' + <id>)`, where `<id>` is the task id without the `task/` prefix:

- **S absent:** `fs.mkdirSync(S)` (not recursive; the parent exists). The printed report gains the line `scratch: created <S>`.
- **S an existing real directory** (`lstat` is a directory, not a symbolic link, and `realpathSync.native(S)` equals S case-insensitively): no change, line `scratch: present <S>`.
- **Anything else** (a file, a link or junction, or a mkdir/lstat/realpath error): no change. The report shows `scratch: NOT READY <S> (<code>); scratch writes will prompt`. The verb's result and exit code are unchanged: a scratch problem never fails task-start or adopt, and R15 stays fail-safe (no grant, so a prompt).

No other verb, record field, audit field or exit code changes. The tool never deletes or empties S.

### §2.3 Guard: the R16 task-scoped staging grant (Bash; result `grant` or "no opinion"; D-2)

Notation, checks G3–G8 and G10–G11, PD, HC, SR, N, REL, RT and the R15 budget are exactly those of R15 (AGENTS.md / guard), reused unchanged. R16 is evaluated only when every existing Bash rule of the guard (R1–R14, R10-x, r9, R11, R12, R13, the mode lock) returned **no opinion** for the command. A deny or ask from any of them stands, unchanged.

| # | Condition | Result |
|---|---|---|
| S1 | `tool_name` ≠ `Bash` | not R16 |
| S2 | The raw `command` doesn't match exactly `^git add (?:-- )?P(?: P){0,63}$`, where `P = [A-Za-z0-9_][A-Za-z0-9._-]*(?:/[A-Za-z0-9_][A-Za-z0-9._-]*)*`. No path or segment can start with `-` or `.`, so no option other than the one optional `--` can match. The pattern also means single spaces, no leading or trailing space, no quotes, no `$`, backtick, `\`, glob, `:`, `..` or dot-segment, and no env prefix, redirect, operator or newline. S6 and the §2.1 deny pair are backstops. | no opinion |
| S3 | A path appears twice | no opinion |
| S4 | R15 G3 (`permission_mode` exactly `"default"`), G4 (PD/HC slot equality), G5 (slot identity), G6 (HEAD `task/<id>`), G7 (record + ancestry), G8 (brief sha) are each applied as in R15. Any failure gives no opinion. | no opinion |
| S5 | `N(HC)` ≠ `SR(PD)` (cwd is not exactly the slot root; the paths are relative to cwd) | no opinion |
| S6 | The brief's land-scope block is missing or unparseable (land tool rules), or any path ∉ land-scope | no opinion |
| S7 | Any path ∈ the brief's protected-scope block, or matches the R15 G11 exclusion list | no opinion |
| S8 | For each path, under root SR(PD): R15 G10 path checks fail, or the path is not an existing regular file with `nlink` 1 (a deletion or directory doesn't qualify) | no opinion |
| S9 | otherwise | **grant**: reason `R16 stage grant <id> <n> paths` |
| SE | Any exception, git failure or budget overrun in S2–S8 | no opinion (never deny, never grant) |

Plumbing:
- `runCli` maps `grant` to the existing R15 allow JSON. It now accepts `grant` for `Bash` **only** when the reason starts with `R16 stage grant `. Any other Bash, PowerShell or MCP `grant` still blocks (exit 2, "guard returned an invalid decision").
- The header comment's grant statement names R15 and R16.
- New reads are injectable deps.
- `module.exports` adds the R16 entry point for AH.
- Everything else in the guard is byte-identical in behaviour.

### §2.4 `AGENTS.md` edits (exactly these; LF)

**W1: insert after the paragraph that begins `**Auto-approved commands (settings allowlist).**`** (one blank line, then):

~~~~markdown
**Worker command rules.** A Worker Bash call uses only commands from its brief's command card and the auto-approved list above; chaining those with `&&`, `;` or `|` is fine, and a `cd` goes only into its own slot. Apart from the Codex ledger call below, it never uses `echo`, `printf`, `cut`, `sed`, `awk`, `for` or `while` loops, `seq` or `sleep`, `node -e` or `-p`, heredocs, command substitution, or a `>` / `>>` redirect that writes a file (`2>&1` and `< /dev/null` are fine). The exit status is read from the tool result, never from `echo $?`. Lines are added to `plan.md`, `qa.log`, `codex.md` and `review.md` with the Edit and Write tools. Codex runs as `codex exec --sandbox read-only -o <os.tmpdir()>/pt-<id>/codex-r<N>.md "<prompt>" < /dev/null`: in the foreground, never in the background, with no shell redirect, so that the Codex CLI itself writes the review to that file. Its verbatim copy into `codex.md` is the one permitted shell write, a single call per round, `{ printf '<round heading>'; cat <that file>; } >> work/<id>/codex.md`. That call prompts by design, so the copy is byte-exact and never re-typed. Scratch files are created with the Write tool under `<os.tmpdir()>/pt-<id>/`, which `task-start` creates. Files outside the slot are read with Read or Grep, never with the shell. Staging is one call `git add -- <land-scope paths>`; the commit is a separate call. A command that prompts anyway is a prompt, not a STOP.
~~~~

**W2: in the `**Auto-approved commands (settings allowlist).**` paragraph, make exactly these replacements:**
- (a) Replace `and the `pt-land.js` request and cleanup verbs run without a prompt.` with `the `pt-land.js` request and cleanup verbs, and the read-only Claude in Chrome tools `read_page`, `get_page_text`, `find` and `read_console_messages` run without a prompt (every other Chrome tool prompts).`
- (b) Replace `and files under `/tmp/pt-<id>/` outside `protected/`; every other edit prompts,` with `and files under `/tmp/pt-<id>/` outside `protected/` (`task-start` creates that directory); it also grants (R16) one plain `git add [--] <paths>` call whose every path is an existing file in the brief's `land-scope`, outside its `protected-scope`; every other edit and staging prompts, `git add -f` / `--force` is denied,`

§2.4a checklist (candidate, then committed file):
- `**Worker command rules.**` = 1;
- `(R16)` = 1;
- `read_console_messages` = 1, `read_network_requests` = 0;
- 0 CR bytes;
- a diff against the base shows exactly 2 hunks (one insert, one paragraph line).

## §EFF Exact rules and effective scope

| Change | File / mechanism | Sessions it reaches | Takes effect | What it can touch | What it can never do |
|---|---|---|---|---|---|
| `allow mcp__claude-in-chrome__read_page`, `__get_page_text`, `__find`, `__read_console_messages` (D-4: `read_network_requests` excluded) | project `.claude/settings.json` (shared scope; merged with user/local lists, DOC-1) | **Every** session started in a checkout carrying it: MAIN, Bootstrap and Planner in the canonical checkout, and Workers in slots | Canonical: at LAND (file reload). Slot: at its next task-start or resync on the landed `branch-dev` (DOC-5). Needs workspace trust, which the repo already has. | Reads the DOM text, accessibility tree and console log of tabs in the MCP tab group | Read network requests, navigate, click, type, run page scripts, fill forms, open, close or switch tabs (all still prompt). It can't override any `ask` or `deny` rule. |
| `deny Bash(git add -f*)`, `deny Bash(git add --force*)` (D-3) | project `.claude/settings.json` | Every session, as above | Immediately at load; deny needs no trust | Blocks force-staging, so ignored files such as `CHECKPOINT.md` can't be force-staged | n/a (tightening only) |
| R16 staging grant (D-2) | guard (`pretooluse-guard.js`), hook allow (DOC-2) | **Only** a Worker session in Manual whose project dir and cwd are both exactly the root of the slot checked out on `task/<id>`, with a valid record and brief | In a slot once its checkout carries the landed guard (next task-start/resync) | `git add [--] <paths>` for existing regular files that are all in that task's committed `land-scope` and outside its `protected-scope` and the R15 exclusions | Stage anything else, a deletion, a directory, a protected path, or with any option or shell syntax. Commit (r9 unchanged) or override a deny/ask rule. Act in MAIN, Bootstrap or the canonical checkout. |
| Task scratch directory (D-1) | land tool `task-start` / `adopt` | Wherever those verbs run (MAIN or Bootstrap) | At each task-start/adopt after LAND | Creates one empty directory `C:\Users\Owner\AppData\Local\Temp\pt-<id>` if absent | Delete or modify anything; fail the verb; widen R15. The scratch grant stays: the task's own slot, Manual only, outside `protected/`. |
| Worker command rules (A) | `AGENTS.md` text | Workers (behavioural) | At LAND | None (no permission) | Grant anything: a deviation only produces a prompt |
| Unchanged | `WebFetch`, `curl`, `netlify api*`, `netlify env:*`, `pt-land land`/`push` ask rules; `netlify dev` (no rule); all deny rules; R11/R12/r9/R15/13a | All sessions | — | — | — |

## §3 QA

**§3.1 AH settings constants (declared re-baseline):**
- `WPP_DENY_ADDED` (the two §2.1 deny rules) folds into `EXPECT_DENY_R11`.
- `WPP_ALLOW_ADDED` (the four Chrome rules) folds into `EXPECT_ALLOW`; the AH-8 count-anchor rows follow.
- AH-23 gains these forbidden allow substrings: `'Bash(git add'`, `'__tabs_context_mcp'`, `'__read_network_requests'`, `'mcp__claude-in-chrome__navigate'`, `'__computer'`, `'__javascript_tool'`, `'__form_input'`, `'__browser_batch'`, `'__file_upload'`, `'__upload_image'`, `'__tabs_create_mcp'`, `'__tabs_close_mcp'`, `'__shortcuts_execute'`, `'__resize_window'`, `'__switch_browser'`, `'__select_browser'`, `'__gif_creator'`. It also forbids any rule equal to `mcp__claude-in-chrome` or ending in `__*`.
- Planted negatives detected: `Bash(git add *)`, `Bash(git add -- *)`, `mcp__claude-in-chrome__*`, `mcp__claude-in-chrome`, `mcp__claude-in-chrome__navigate`, `mcp__claude-in-chrome__javascript_tool`, `mcp__claude-in-chrome__computer`, each Chrome rule moved to `ask`, and either deny rule removed.

**§3.2 AH-31 (R16), hermetic injected deps, SLOT_A a real path.**

GRANT rows:
- `git add qa/x_offline.js`;
- `git add -- qa/x_offline.js work/<id>/review.md`;
- 64 paths.

NO-OPINION rows, one check each:
- `git add .`, `-A`, `-u`, `-p`, `-N`, `--all`, `-f`, `--force`, `-- -f`;
- a glob `qa/*.js`, a quoted path, `$VAR`, backtick, `\`;
- `..`, a dot-segment, `:(top)x`, an ADS `x:y`;
- two spaces, a trailing space, a leading `cd x && `, `; true`, `| cat`, `> f`, a newline, `GIT_DIR=x git add f`, `git -C x add f`, `git  add`;
- 65 paths, a duplicate path;
- a path ∉ land-scope, ∈ protected-scope, `.claude/x`, `AGENTS.md`, `CHECKPOINT.md`, `node_modules/x`;
- a missing path, a directory, a junction, a hard link, an 8.3 form, a case variant whose real path differs;
- cwd a subdirectory of the slot;
- PD/HC in different slots;
- canonical / MAIN cwd;
- `permission_mode` `acceptEdits`, `auto`, absent;
- detached HEAD;
- no or invalid record, brief sha mismatch, base not an ancestor;
- land-scope missing or duplicated;
- a dep throws;
- budget overrun.

Rows that must keep their existing decision byte-for-byte:
- `git add x && git commit -m y` (r9 compound denial);
- `git add .git/x` (R10);
- an R12 text form.

Mutants (planted on the guard source, each caught):
- S2 anchor `^` or `$` removed;
- `--` handling allowing other options;
- S3 removed;
- S5 removed;
- S6 land-scope check removed;
- S7 protected-scope check removed;
- S8 regular-file and nlink check removed;
- SE mapped to grant;
- R16 evaluated before the existing Bash rules;
- `runCli` accepting a Bash grant without the `R16 stage grant ` reason (this replaces the WEP planted negative "`runCli` mapping `grant` for Bash", which is narrowed, not removed);
- an R15 file grant still blocked for Bash.

**§3.3 PL rows (`qa/pt_land_offline.js`), hermetic tmpdir dep:**
- `task-start` with S absent: S created and `scratch: created`.
- S present as a real directory: `present`, no change.
- S a file, or S a junction: `NOT READY`, exit code and record unchanged.
- mkdir throws: `NOT READY`, verb still OK.
- `adopt`: the same four cases.
- Mutants: mkdir made recursive; NOT READY failing the verb; S derived from an unrealpathed tmpdir; S deleted when present.

**§3.4 Pins:** `AH_CONTRACT_PIN` and `LAND_CONTRACT_PIN` list the guard and `pt-land.js` as E1 digest parts. They are re-pinned after `protected-commit` from forced replays (`PT_QA_FORCE_HEAVY=1`), one heavy run at a time (D-6).

## §3a Step-0 and step-10 QA
- Step 0: full `npm run qa:offline`, count recorded.
- Targeted runs against the candidates: `AH_HOOK_PATH=<cand guard> AH_SETTINGS_PATH=<cand settings> node qa/auto_mode_hardening_offline.js` and `AH_HOOK_PATH=<cand guard> PT_LAND_TOOL_PATH=<cand landtool> node qa/pt_land_offline.js`. Both variables are existing overrides of those suites, verified at `ecd9988`: `qa/pt_land_offline.js:29` and `:1121`.
- Step 10 on the protected commit: full `qa:offline`, same count; stale-pin lines PASS.
- Step 10c after the pins: full `qa:offline`, same count, SKIP lines. This is the LAND QA; its count is the LAND-EVIDENCE N.

## §4 Steps

| Step | Who | Action |
|---|---|---|
| 0 | Worker | §TS; integrity `--print-record`; process check; step-0 `qa:offline`. `plan.md` holds the four CLAUDE.md items:<br>- Pattern Auditing: the R15 grant path (`fileToolDecision`, G3–G12); the `runCli` grant mapping; `parseLandScope` in the land tool; `runTaskStart`/`runAdopt` report printing.<br>- State & Boundary Isolation: no `localStorage`, DOM, scoring or scan path.<br>- Gate Verification: R16 = own key `permission_mode` + exact `"default"` + §2.3; feature env toggles N/A.<br>- Definition of Done = §5.<br>Plus the requirement→test map. |
| 1 | Worker | Tests first: the AH-31 and PL rows against the base (they fail). Build `cand-guard.js`, `cand-landtool.js` (the land-tool candidate; the name must not contain the R12 trigger text), `cand-settings.json` and `cand-agents.md` under `<os.tmpdir()>/pt-worker-permission-profile-1/protected/` from the base blobs plus §2, with `manifest.json` listing the four targets. Never an Edit/Write on a target in the slot. |
| 2 | Worker | Implement until the targeted runs are green; §2.4a checklist; the settings candidate parses and AH-8 passes on it. |
| 3 | Worker | Self-review; Codex on the real diff (task-branch diff plus the four candidates vs their base blobs); FIX/DEFER/REJECT. |
| 4 | Worker | **First r9 commit:** `git add -- qa/auto_mode_hardening_offline.js qa/pt_land_offline.js`. `git diff --cached --name-only` lists exactly those (else STOP-1). Then `git commit -m` as a separate call. |
| 5 | Worker → Owner | **13a:** `protected-request` → report + line → STOP → Owner PROTECTED `!` line → `protected-commit`. Verify that the four committed blobs' sha256 equals the candidates'. |
| 6 | Worker | Step 10, then the forced replays one at a time; set the two pins. |
| 7 | Worker | Step 10c. |
| 8 | Worker | `review.md`: requirement→test results; the Codex ledger; `## Backlog reconciliation`: none; `## Lessons`; one column-1 `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`. Then the final Codex check. |
| 9 | Worker | **Second r9 commit:** `git add -- qa/auto_mode_hardening_offline.js qa/pt_land_offline.js work/worker-permission-profile-1/review.md`; exact cached list check; separate commit call; integrity check. |
| 10 | Worker / MAIN / Owner | `land-request` → STOP → LAND line → `land` → `push-request` → PUSH line → `push` → `cleanup`. |
| §LC | Owner + MAIN | Separate, Owner-approved, after LAND. Not part of the DoD. |

**STOP for:**
- any change outside §1, or a §2 deviation;
- a candidate or committed sha mismatch;
- a TS failure or a 13a refusal;
- a hook denial that is STOP-6 (a form denial is reissued once in compliant form and logged);
- any R15 mode-lock denial;
- two heavy runs at once.

**Note for this task's own session:** after `protected-commit` the slot runs the new guard. Its own staging calls may already get the R16 grant. That is expected and is recorded in `review.md` as an observation, not as LC evidence.

## §5 Definition of Done
1. The four committed protected files equal the PROTECTED-approved candidates. `settings.json` differs from the base only by §2.1's hunks; `AGENTS.md` only by W1–W2 (§2.4a). The guard and `pt-land.js` change only as §2.2–§2.3 describe.
2. `git diff --stat <base>..<tip>` lists exactly the seven §1 files.
3. Step-7 `qa:offline` PASS with the step-0 count; the land-test passes; every AH-31 and PL row passes; every mutant is caught.
4. Observable contract:
   - an R16 grant = exit 0 + the R15 allow JSON with reason `R16 stage grant …`;
   - task-start prints exactly one `scratch:` line;
   - every other existing decision and verb output is byte-identical.
5. `review.md` is complete, with exactly one `LAND-EVIDENCE` line.

## §INV Invariants confirmed intact (each checked by an existing or new row)
| Control | Status | Evidence |
|---|---|---|
| Every existing `deny` rule | Unchanged; 2 added | AH-8 set equality (`EXPECT_DENY_R11` + `WPP_DENY_ADDED`) |
| Every existing `ask` rule (incl. `WebFetch`, `curl`, `netlify api*`, `pt-land land`/`push`, `brief.md`, governance files) | Unchanged | AH-8 `EXPECT_ASK_R11` set equality; AH-23 still forbids `pt-land.js land task` / `push)` in allow |
| `defaultMode: default`, bypass disabled, `onFailure: block`, hook matcher | Unchanged | AH-8 / AH-10 |
| R11 brief-commit gate, R12 records, PROTECTED gate (13a), r9 commit gate | Unchanged code paths | existing AH/PL rows byte-identical; §3.2 "must keep" rows |
| Execution envelope V1–V8 (incl. V8 mode/ruling) | Text untouched | §2.4 edits only the two named places |
| R15 grant scope, and the R15 mode lock | Unchanged; R16 reuses G3–G11 and runs only after the lock passes | existing AH-27/AH-28 rows; AH-31 mode rows |
| Task-scope enforcement: land-scope L7/L8 at LAND, `protected-scope` only via 13a | Unchanged; R16 grants only land-scope ∖ protected-scope | PL rows; AH-31 S6/S7 rows |
| `netlify dev`, Netlify writes, live calls | Still prompt or deny | no rule added |

## §6 Risks
| # | Risk | Mitigation |
|---|---|---|
| R-1 | R16 over-grant from a parser bug | Anchored raw-string regex with no shell metacharacters possible; runs only after every existing Bash rule passes; deny/ask rules win (DOC-2); mutants; LAND L7/L8 still refuse out-of-scope paths; r9 still gates the commit. |
| R-2 | The first Bash grant path in the guard | `runCli` accepts it only with the R16 reason prefix (planted negative); D-2 lets the Owner keep staging prompting. |
| R-3 | A scratch dir pre-created by another process as a junction | §2.2 reports `NOT READY`; R15's real-directory check then refuses, and the write prompts (fail-safe). |
| R-4 | Chrome read tools expose page content to the transcript | Only tabs in the MCP tab group; network reads excluded (D-4); every acting tool still prompts. |
| R-5 | Worker non-compliance with the command rules | A deviation costs a prompt, never a grant. |
| R-6 | `onFailure: block` plus a guard crash blocks every session | Unchanged residual; recovery as in worker-exec-permissions-1 R-3. |

## §LC Post-LAND live check (separate Owner-approved step; Owner present; one Manual Worker session in a slot task-started on the landed tools, on a task whose brief has a land-scope)

1. LC-1: task-start prints `scratch: created`; the first Write under `<os.tmpdir()>/pt-<id>/` doesn't prompt.
2. LC-2: `git add -- <land-scope file>` doesn't prompt.
3. LC-3: `git add <file outside land-scope>` prompts; the Owner answers No.
4. LC-4: `git add -f x` is denied.
5. LC-5: `read_page` and `get_page_text` don't prompt; `tabs_context_mcp`, `read_network_requests` and `navigate` prompt.
6. LC-6: a `WebFetch` still prompts.
7. LC-7: Shift+Tab to `acceptEdits`, then any Bash call → R15 mode-lock DENY (STOP-6 by design).

A failed expectation is reported; an over-reaching grant leads to an immediate revert by the Owner in a normal terminal.

## §PROJ Projected Owner interruptions per task (baseline = portfolio-live-budget-fix-1, measured)

| Category | Baseline | After | Changed by |
|---|---|---|---|
| **Routine permission prompts:** Worker | 9 | 2–3 | A (6), D-1 (1), R16 (staging part of 1); 2 Codex ledger calls remain by D-7; +0–1 for non-compliance |
| **Routine permission prompts:** MAIN (brief placement `cp`/`mkdir`) | 1 | 1 | none (`work/*/brief.md` is ask by design) |
| **Mandatory governance approvals:** gate lines (R11, PUSH brief, LAND, PUSH) | 4 | 4 | none |
| **Mandatory governance approvals:** `pt-land land`/`push` ask prompts (brief push, LAND, PUSH) | 3 | 3 | none (Owner ruling) |
| **Retained boundary prompts:** `netlify api` deploy read, DEV `curl` | 2 | 2 | none (Owner ruling) |
| **Rulings** | 2 | 1–2 | A removes form-denial rulings, not design rulings |
| **Total** | **21** | **13–15** | routine prompts 10 → 3–4 |

For a walkthrough task like portfolio-today-1 (post-restart Worker window, 35 prompts):
- **A + D-1 + R16** remove about 15 prompts: 13 shell-form and Codex-forensics prompts, and 2 staging.
- **Already gone:** 3 `.gitignore` prompts (`--skip-gitignore`).
- **What remains, about 17:**
  - 7 `netlify dev` launches (boundary, unchanged);
  - 4 netlify-cli source reads (investigation only);
  - 4 Chrome prompts: `tabs_context_mcp` ×2, `tabs_create_mcp`, `browser_batch`. All stay prompting by ruling;
  - 2 Codex ledger calls (D-7).

**B-4's measured saving is about zero.** The Chrome prompts that occurred came from tools that stay excluded. Reads done inside `browser_batch` prompt as `browser_batch`. The four allowed tools save a prompt only when they're called directly. B-4 is still in the package because the Owner approved it in principle and it costs nothing, but it isn't counted in the projection.

## §CMD Command card (one Bash call per line; read files with Read / Grep)

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
git ls-tree HEAD .claude/hooks/
node qa/guard_integrity_check.js --task task/worker-permission-profile-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
wmic process where "name='node.exe'" get ProcessId,CommandLine
npm run qa:offline
node qa/auto_mode_hardening_offline.js
node qa/pt_land_offline.js
AH_HOOK_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-guard.js AH_SETTINGS_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-settings.json node qa/auto_mode_hardening_offline.js
PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js
PT_QA_FORCE_HEAVY=1 node qa/pt_land_offline.js
AH_HOOK_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-guard.js PT_LAND_TOOL_PATH=C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-landtool.js node qa/pt_land_offline.js
sha256sum /c/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-guard.js /c/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-landtool.js /c/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-settings.json /c/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/protected/cand-agents.md
node .claude/hooks/pt-land.js protected-request task/worker-permission-profile-1
node .claude/hooks/pt-land.js protected-commit task/worker-permission-profile-1
git add -- qa/auto_mode_hardening_offline.js qa/pt_land_offline.js
git add -- qa/auto_mode_hardening_offline.js qa/pt_land_offline.js work/worker-permission-profile-1/review.md
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/worker-permission-profile-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/worker-permission-profile-1
codex exec --sandbox read-only -o C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/codex-r<N>.md <prompt naming a scratch prompt file> < /dev/null
{ printf '<round heading>'; cat C:/Users/Owner/AppData/Local/Temp/pt-worker-permission-profile-1/codex-r<N>.md; } >> work/worker-permission-profile-1/codex.md
<!-- cmd:end -->

No card line contains the R12 trigger text except the exact R12 forms.

## §PEP Execution preflight (A auto-approved · B permission prompt · C governance gate · D hook-denied, must not appear)

| Step | A | B | C | D |
|---|---|---|---|---|
| 0 | git read-only lines; `--print-record`; `npm run qa:offline`; Read / Grep / Glob; Write of `plan.md` / `qa.log` (R15) | the `wmic` line only if not yet allowed in the slot | Owner go-ahead (no envelope) | PowerShell in the slot; `node -e`/`-p`; shell writes |
| 1–3 | AH/PL runs; `sha256sum`; `codex exec …` (foreground, no redirect); scratch Writes outside `protected/` (R15, directory created by task-start); QA-suite edits (D-5) | Writes of the four candidates and `manifest.json` under `…/protected/` (excluded from R15 by design); the env-prefixed override runs; the per-round `codex.md` append call (D-7) | none | an Edit/Write on a protected target in the slot |
| 4, 9 (r9) | `git diff --cached --name-only`; `git log -1 …`; `git commit -m` | `git add -- …` (until R16 is in this slot's guard) | Owner go-ahead | `git add … && git commit …` in one call |
| 5 (13a) | `protected-request` | `protected-commit` | **Owner PROTECTED `!` line** | staging a protected path by hand |
| 6–7 | `npm run qa:offline`; AH; PL | `wmic`; both forced replays | none | a second concurrent heavy run |
| closure (10) | `land-request`; `push-request`; `cleanup` | `land`, `push` (ask rules) | **Owner LAND `!` line; Owner PUSH `!` line** (public Netlify DEV deploy) | `git push`, `merge`, `rebase`, `pull`; any Netlify command; `curl` / WebFetch |

Slice-to-slice continuation (0 → 1 → 2 → 3 → 4, and 6 → 7 → 8 → 9) needs no Owner input when the gates PASS. Scratch: `<os.tmpdir()>/pt-worker-permission-profile-1/`; 13a candidates under its `protected/`.

## §UER Execution readiness

**ATTENDED-ONLY.** Mode: **Manual** (DENY-tier and ASK-tier protected files; M5 security surface).

**§L:** no partial land.

<!-- auto-edit-scope:begin -->
qa/auto_mode_hardening_offline.js
qa/pt_land_offline.js
work/worker-permission-profile-1/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
.claude/hooks/pretooluse-guard.js
.claude/hooks/pt-land.js
.claude/settings.json
AGENTS.md
qa/auto_mode_hardening_offline.js
qa/pt_land_offline.js
work/worker-permission-profile-1/review.md
<!-- land-scope:end -->
<!-- protected-scope:begin -->
.claude/hooks/pretooluse-guard.js
.claude/hooks/pt-land.js
.claude/settings.json
AGENTS.md
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/auto_mode_hardening_offline.js
node qa/pt_land_offline.js
<!-- land-tests:end -->
