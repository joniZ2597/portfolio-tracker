# Task brief: qa-stage2-git-contracts — Stage 2: zero-process decision tests on recorded Git contracts, real-Git thinning, template-contract gating

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **none** — workflow tooling (Track 6, "Faster land-tool tests", Stage 2); no `BACKLOG.md` change |
| Baseline | `bb9f94c59e4ca3faae94cbdfad48c36a2fc70eea` (`branch-dev`; Stage 1 landed, pushed, cleaned) |
| Branch / slot | `task/qa-stage2-git-contracts`, Worker A (`pt-wt-worker-a`, free, detached at `bb9f94c`) |
| Mode | **Manual (attended)**, with a mid-task **Owner gate G-MAP** (§6): no existing row is deleted before the Owner approves the row map and its dual-run evidence |
| Scope boundary | Test-only. **No** change to `.claude/hooks/*` (the land tool stays byte-identical), `qa/run-offline.js`, `AGENTS.md`, `CLAUDE.md` or any product file. **No** tiering (Stage 3), **no** parallel heavy execution |
| qa:offline | baseline 59 → **62** (+`qa/pt_land_logic_offline.js`, +`qa/pt_land_resync_logic_offline.js`, +`qa/git_contract_offline.js`) |
| QA cost flag | ≈ 3 h of task QA (Step-0 full run ≈ 74 min, a one-time dual-run ≈ 50 min, final full run ≈ 20–26 min) against a multi-day change. **Justified**: this is the stage that removes the recurring cost |
| Status | FINAL. **Owner-approved 2026-10-06**: D1–D3 approved (§9); G-MAP unchanged; one amendment — the execution-environment fingerprint (§3.6) is part of every pinned digest |

## 1. Problem, measured

Stage 1 met its Git-start gates (main 8,475 → 5,869, −30.7 %; resync 4,234 → 3,216, −24.0 %), but wall-clock
time went up.

| Laptop, full run `bb9f94c` (Stage 1) | ms | min |
|---|---|---|
| `pt_land_offline.js` | 2,275,931 | 37.9 |
| `pt_land_resync_offline.js` | 821,208 | 13.7 |
| `fixture_template_offline.js` (new in Stage 1) | 1,028,555 | 17.1 |
| everything else (56 suites) | ≈ 285,850 | ≈ 4.8 |
| **full `qa:offline`** | **4,411,546** | **73.5** (previous 56.9) |

Three findings:
- **The equivalence suite reruns real-Git proofs on every full run (17.1 min).** Their inputs rarely change.
- **The real-Git heavy body costs ≈ 0.25–0.35 s per Git start.** The main suite averaged 251 → 354 ms per start in
  the Stage 1 run. Per-start time is noisy and machine-dependent; start counts are deterministic.
- **Most real-Git rows check decisions, not Git behaviour.** Per-row meter (Slice 0, pre-Stage 1):
  - of 166 main rows, 104 assert a refusal, parse or shape that depends only on Git's **answers**;
  - of 49 resync rows, 33 do the same;
  - resync mutant rows re-run the real scenario as a control in every row (`mutantRow`: `scenario(TOOL_PATH)` per
    mutant).

## 2. Approach (FABLE architecture, as approved)

1. **Git contract transcripts.** Real Git, recorded once per scenario family as normalised transcripts: ordered
   argv, cwd role, stdin hash, exit status, stdout and stderr, with OIDs and paths replaced by stable placeholders.
   A contract suite replays them against real Git whenever their inputs change (§3.3).
2. **Strict load-time fake.** In-process, the land tool and its integrity module receive a fake `child_process`.
   It answers only from transcripts, in exact order, and throws on any unscripted call (`UNSCRIPTED_GIT`). The file
   system stays real (private temp root), so records, locks, audit, archives and hooks directories are genuine.
3. **Zero-process unchanged-state oracle.** For refusal rows, "nothing changed" becomes:
   - no mutating Git call in the recorded sequence (closed classification, §3.1);
   - and a byte-level snapshot of the watched directories that is equal except the expected audit line(s).
4. **Real-Git thinning, row by row** (§5). A family's decision variants move to the logic suites. **One real-Git
   representative per family stays**, and every row whose point is Git, process or file-system semantics stays
   real.
5. **Duplicated real-Git controls removed:**
   - resync `mutantRow` controls are computed **once per scenario helper per run** (memoised) instead of once per
     mutant;
   - variant rows that rebuild a fixture only to reach a pure parser are moved (§5).
6. **Template-contract gating** for `fixture_template_offline.js` (§4): the real-Git equivalence proofs run
   whenever any input changes, and are skipped only when a pinned digest of every input still matches.

## 3. New components

### 3.1 `qa/lib/git-fake.js` (new)

- **`withFakeGit(transcript, fn)`** — installs a `Module._load` hook for `'child_process'`, scoped by the
  requiring file. Only modules whose filename is a `pt-land.js` or `guard_integrity_check.js` copy under the
  private root receive the fake. Every other module gets the real one. The hook is removed in `finally`.
- **Fake `spawnSync(file, args, opts)`:**
  - `file` must be `'git'` or the configured `gitExec`, otherwise it throws;
  - it matches the next transcript entry by normalised argv, cwd role and stdin hash, and returns
    `{ status, stdout, stderr, signal: null }` in the requested encoding;
  - a mismatch or exhaustion throws `UNSCRIPTED_GIT <argv>`.
- **The fake's `exec`, `spawn`, `execFile`, `fork` and `execSync` throw.**
- **Mutation classification** (closed list; anything unlisted is mutating):
  - **read-only:** `rev-parse`, `status`, `log`, `rev-list`, `cat-file`, `show`, `ls-files`, `ls-tree`,
    `for-each-ref`, `show-ref`, `merge-base`, `diff`, `diff-tree`, `patch-id`, `worktree list`, `config --get*` /
    `--list`, `symbolic-ref` with one argument, `hash-object` without `-w`, `--version`;
  - **object-only:** `hash-object -w`, `write-tree` / `read-tree` / `update-index` with a temporary
    `GIT_INDEX_FILE` — allowed only where the brief of the verb allows unreferenced objects (protected-request);
  - **mutating:** everything else (`update-ref`, `commit*`, `merge`, `reset`, `checkout`, `switch`, `branch`,
    `worktree add|remove|prune`, `push`, `tag`, `config` set, two-argument `symbolic-ref`, `add`, `rm`,
    `rebase`, `cherry-pick`, `stash` …).
- **`oracle(recorded, watchDirs, before, allowAudit)`** — returns true only with zero mutating calls **and** equal
  snapshots (allowing exactly the named audit lines).

### 3.2 `qa/lib/git-transcript.js` (new)

- Normalisation: OIDs → `<oid:N>` in first-seen order; absolute paths → `<canon>` / `<slotA>` / `<slotB>` /
  `<bare>` / `<tmp>`; times → `<ts>`.
- Load and save.
- `replay(transcript, fixture)` against real Git, comparing outputs after normalisation.

### 3.3 `qa/fixtures/git-contract/*.json` and `qa/git_contract_offline.js` (new)

- **One transcript per scenario family** used by the logic suites, recorded by `qa/tools/record-git-transcripts.js`
  (new; not a suite, since `qa/tools/` is not discovered). Each run starts from a Stage 1 template fixture.
- **`git_contract_offline.js`:**
  - **GC-1** strict fake self-tests (unscripted call, wrong order, extra call, non-git file → throw);
  - **GC-2** classification table (every subcommand in every transcript classified; unlisted → mutating);
  - **GC-3** oracle planted negatives (a scripted `update-ref` in a refusal, a write into the common dir, a
    changed slot file → oracle false);
  - **GC-4** contract replay, **digest-gated**:
    - **source digest** = sha256 of `pt-land.js`, `guard_integrity_check.js`, `qa/lib/fixture-template.js`, the
      extracted builder sources and every transcript file;
    - **environment digest** = the §3.6 execution-environment fingerprint;
    - `GIT_CONTRACT_PIN` holds one source digest and a **set** of proven environment digests;
    - **source digest = pin and environment digest ∈ the set:** replay is skipped with an explicit
      `SKIP (contract pinned: <source>/<env>)` line;
    - **source digest = pin, environment digest not in the set:** every transcript is replayed against real Git and
      must match. If replay passes → PASS with the notice "environment not pinned: <env digest>; record it in a
      task to enable the fast path". **Evidence is never reused across a different environment;**
    - **source digest ≠ pin:** replay, then **FAIL "re-pin required: <digest>"**, so the task that changed an
      input re-proves and re-pins in its own diff;
    - **planted negatives:**
      - a one-byte change to any source input changes the source digest;
      - each §3.6 factor (platform, `core.autocrlf`, `core.eol`, `LANG`, Git build, a planted extra global config
        key) changes the environment digest when altered in a synthetic snapshot.

### 3.4 `qa/pt_land_logic_offline.js` and `qa/pt_land_resync_logic_offline.js` (new)

- **Zero-process:** the meter must report `git=0 node=0` starts for the whole suite; any start fails the suite.
- **Each moved row keeps its exact name with the suffix ` [logic]`** and asserts:
  - the same outcome tuple (`ok`, `exitCode`, `verb`, the reason regex);
  - its "nothing changes" through the oracle.
- **Moved mutants** load the mutated tool source under the fake. A mutant counts as caught only through a row
  assertion or the oracle. **`UNSCRIPTED_GIT`-only catches are not accepted**: the dual-run records the mutant's
  real call sequence, so the transcript covers it.
- Already zero-process rows stay where they are, untouched: `PL-21` ×12, `PL-54`, `MUT-OAG-3`.

### 3.5 `qa/tools/pt_land_dualrun.js` (new; not a suite)

The one-time equivalence evidence for G-MAP. For every moved row, it runs the real-Git row and the logic row on
the same scenario. It then asserts:
- an identical outcome tuple;
- **the real "nothing changed" verdict equal to the oracle verdict**;
- for moved mutants, both catch the mutant.

Output goes to `work/qa-stage2-git-contracts/dualrun.log` (ignored); the summary goes into `review.md`.

### 3.6 `qa/lib/exec-env-fingerprint.js` (new) — execution-environment fingerprint (Owner amendment 2026-10-06)

Cached equivalence and transcript evidence is reused only when the execution semantics are equivalent. The
fingerprint is a sha256 over a canonical JSON of the following. It costs exactly **2 Git starts**.

| Factor | How it is read | Why it matters |
|---|---|---|
| OS / platform | `process.platform`, `process.arch`, `os.release()` | path syntax, line endings, process and filesystem behaviour |
| Filesystem semantics of the temp root | two fs probes under the private root: case-insensitivity (write `a`, stat `A`) and symlink support (try `fs.symlinkSync`, record the result) | ref / path collisions, worktree and checkout behaviour |
| Git build | `git version --build-options` (full output) | Git version **and** build features (e.g. fsmonitor, compiler, platform port) |
| Effective Git configuration, **system + global scopes** | one `git config --list --show-scope --show-origin -z` run from the private root, outside any repo | the configuration every fixture repository inherits |
| — explicit fields, also stored readably | `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.filemode`, `core.ignorecase`, `core.symlinks`, `core.precomposeunicode`, `core.longpaths`, `core.fsmonitor`, `core.untrackedCache`, `core.hooksPath`, `core.excludesFile`, `core.attributesFile`, `init.defaultBranch`, `safe.directory`, `color.*`, `status.*`, `diff.*`, `merge.*`, `rebase.*`, `pull.*`, `push.*`, `advice.*`, `i18n.*`, `log.*`, `format.*`, `filter.*` (incl. LFS), `url.*`, `index.*`, `feature.*`, `commit.gpgSign`, `tag.gpgSign`, `gpg.*` | line-ending conversion, output text and colour, porcelain shape, merge / rebase defaults, filters, hooks location |
| — all other keys | included in the digest by key and value; **only** `user.*`, `credential.*`, `core.editor`, `core.pager`, `sequence.editor`, `gui.*` and `alias.*` are excluded (identity, editors, aliases — none can change a built-in command's semantics) | any configuration a transcript might depend on is covered conservatively |
| Git-relevant environment | the names and values of every `GIT_*` variable, plus `LANG`, `LC_ALL`, `LC_MESSAGES`, `TZ`, `HOME`, `XDG_CONFIG_HOME` | message language, dates, which config files apply |
| Node | major version | `fs.cpSync` and `child_process` semantics used by the copies and the meter |

- **Privacy:** values enter only the digest. The readable manifest stored next to the pin holds the platform
  fields, the Git version line and the explicit `core.*` fields — **no URLs, credentials or paths**.
- Fixture-local configuration set by the builders (e.g. `user.email`) is covered by the source digest.
- **Used by:**
  - GC-4 (§3.3);
  - FT-0 (§4);
  - the meter's `@@QA-SURFACE@@` line also prints the environment digest, so every run says which environment it
    proved.

## 4. `fixture_template_offline.js` — remove the 17-minute recurring cost without weakening it

- **New FT-0, the template-contract digest.** Its parts:
  - the **source digest**: sha256 of `qa/lib/fixture-template.js`, the extracted `buildFixture` (both suites) and
    `buildCleanupFixture` sources, the baseline builder sources it compares against, `pt-land.js`,
    `guard_integrity_check.js` and the FT suite's own heavy-row sources;
  - the **environment digest** of §3.6.

  `TEMPLATE_CONTRACT_PIN` holds the source digest and a set of proven environment digests.
- **The heavy real-Git rows (FT-1, FT-1c, FT-2, FT-3, FT-4 and their planted negatives) run unless the source
  digest equals the pin *and* the environment digest is in the pinned set.** The rules are the same as GC-4:
  - an unpinned environment → run, and PASS with the "environment not pinned" notice;
  - a source difference → FAIL "re-pin required".

  The FT-0 planted negatives mirror GC-4's.
- **The zero-process FT rows always run:** the FT-5 spies and fail-closed throws, FT-7 static path checks, and the
  pure negatives.
- **Equivalence is unchanged.** These all re-run every real equivalence row:
  - a template, builder or tool change;
  - a change of OS, Git build, Git configuration (e.g. `core.autocrlf`), locale, time zone or Node major.

  Only byte-identical sources in an already proven environment skip them.
- **FT-6 is retired (R-row).** It was the Stage 1 scope guard (land suites = `f3c0728` + builders + 18 lines),
  which Stage 2's approved row map supersedes. Same for **RI-6's whole-file comparison** in
  `qa/run_isolation_offline.js`. RI-6's structural checks stay: E1 before the `child_process` destructuring and
  the first `os.tmpdir(`, E2 and E3 present.
- **This task sets `TEMPLATE_CONTRACT_PIN` and `GIT_CONTRACT_PIN`** (source digest + the laptop's environment
  digest, with its readable manifest) after one passing real run each, in the Worker environment that runs the
  full `qa:offline`. Further environments (e.g. the Owner's terminal) are added only by a later task with
  evidence.

## 5. Row map — real-Git rows kept (K), moved (M), duplicate control removed (D), retired (R), already zero-process (Z)

Row counts are from the Slice 0 per-row meter. "Real coverage remaining" names the real-Git row(s) that still
exercise the family's Git semantics. **Proof for every M row:** a dual-run identity (§3.5), plus the moved row's
planted negative (the original mutant where one exists, otherwise a new seeded variant that must fail). The
exact per-row map, with line numbers, is G-MAP deliverable `work/qa-stage2-git-contracts/row-map.md`.

### 5.1 `qa/pt_land_offline.js` (166 rows → 48 K real, 104 M, 14 Z; Git starts ≈ 5,869 → ≈ 2,100)

| Family (rows) | K kept real | M moved | Why real Git is unnecessary for M | Replaced by | Real coverage remaining |
|---|---|---|---|---|---|
| PL-1, PL-2, PL-4, PL-5, PL-12, PL-14, PL-15, PL-16, PL-19 (9) | all 9 | — | — (LAND fast-forward, push to bare, race, blob self-integrity, ancestry, origin refs) | — | themselves |
| PL-3 record checks (6) | "no record" | malformed, wrong task, stale tip, stale base, PUSH-in-LAND | the record is a file parsed before any Git write; the Git answers are identical across variants | logic rows on one transcript + oracle | PL-3 "no record", PL-2, PL-4 |
| PL-6 merge commit (2) | first | second variant | same `rev-list --merges` answer shape | logic + transcript | PL-6 first |
| PL-7 dirty / branch (5) | "canonical dirty (tracked)" | untracked, not on branch-dev, slot dirty, task worktree dirty | the decision reads porcelain answers | logic, a transcript per state | PL-7 tracked |
| PL-8 brief (5) | "brief edited by the task" | missing at base ×2, legacy, no land-scope | text checks on a blob answer | logic | PL-8 edited |
| PL-9 scope (6) | "diff outside land-scope" | review missing, protected AGENTS.md, `.claude/hooks/x`, `package.json`, `work/x/brief.md` | path predicates over the same diff answer | logic | PL-9 outside |
| PL-10 evidence (4) | "LAND-EVIDENCE missing" | classI=1, qa FAIL, duplicated | regex on review text | logic | PL-10 missing |
| PL-11 hooks (2) | first | second | — | logic (decision) | PL-11 first; PL-29, PL-44 (hooks never executed) |
| PL-13 lock (1) | — | lock exists | a file-system lock; the fake keeps the real fs | logic (real fs) | every real LAND/push acquires and releases the lock (PL-2, PL-16) |
| PL-17 no push record (3) | first | 2 | record parsing | logic | PL-17 first, PL-16 |
| PL-18 push preconditions (5) | "remote moved" | not ahead, pushurl, insteadOf, URL not expected | the decision reads config / ref answers | logic | PL-18 remote moved, PL-16 |
| CDX-1 flaky Git, CDX-5 CLI stderr (2) | both | — | process boundary | — | themselves |
| CDX-2, CDX-3, CDX-4 (3) | — | all | path predicate; audit-write fault injection is file-system only | logic (real fs fault) | CDX-5, PL-2 |
| PL-20 CLI exit codes (4) | all 4 | — | process boundary | — | themselves |
| PL-21 ×12, PL-54 (13) | — | — (Z) | already zero-process | unchanged | — |
| MUT land L12, L3, scope, protected list, evidence (5) | — | all | decision mutants | mutant under fake; caught by the same assertion | the K rows of PL-3, PL-5, PL-9, PL-10 |
| MUT cleanup K3, K4 (2) | — | both | decision mutants | under fake + oracle | PL-22, PL-25 tracked |
| MUT cleanup K8 `-d`→`-D`, K6 archive sha256 (2) | both | — | Git branch-delete semantics; real archive bytes | — | themselves |
| PL-22, PL-28, PL-29, PL-31 (4) | all | — | real worktree / branch / archive / hooks / CLI | — | themselves |
| PL-23, PL-24, PL-27 (3) | — | all | ancestry, tracking and branch-absent answers | logic | PL-22, PL-28, RS-11 |
| PL-25 dirty task worktree (2) | tracked | untracked | porcelain answer | logic | PL-25 tracked |
| PL-26 archive destination (2) | — | both | archive destination is file-system only (real fs kept) | logic (real fs) | PL-22 |
| PL-32 exports (2), PL-33 brief-request (16) | PL-33 "two staged entries" | 2 + 15 (6 path-shape rows built an unused 19-start fixture) | exports and path shapes are pure; others read porcelain / config / env | logic | PL-33 two staged, PL-34 end to end |
| PL-34, PL-35 (2) | both | — | end-to-end request verbs | — | themselves |
| PL-36 protected-commit (5) | valid, atomic, CAS negative, live index | "audit entry load-bearing" | an audit-write fault is file-system only | logic | the 4 K rows |
| PL-37 tree mismatch (1) | yes | — | real tree hashing | — | itself |
| PL-38, PL-39 ×5 (6) | PL-39 "another tree" | PL-38, PL-39 other 4 | OID / record comparisons | logic | PL-37, PL-39 another tree |
| PL-40, PL-41 ×7, PL-42 ×10, PL-43, PL-45 (20) | — | all | scope / manifest validation, dirty answer, record reuse | logic (real fs manifests) | PL-35, PL-36 valid |
| PL-44 hooks (1) | yes | — | process | — | itself |
| PL-46 ×2, PL-47, PL-50 (4) | PL-46 first, PL-47, PL-50 | PL-46 second | — | logic | the 3 K rows |
| PL-48 ×2, PL-49, PL-51, PL-52 ×3 (7) | — | all | audit-entry / scope text predicates | logic | PL-46, PL-47, PL-50 |
| PL-53 approval-line shapes (1, 117 tool starts) | — | moved | output text shape | logic (every verb's printed line) | PL-1, PL-15, PL-34, PL-35 print real lines |
| PL-55 CLI exit codes (1) | yes | — | process | — | itself |
| MUT-OAG-1, -2, -4, -7, -9 (5) | — | all | decision mutants | under fake | PL-33, PL-36, PL-46/47 K rows |
| MUT-OAG-5 tree, -6 blob, -8 CAS (3) | all | — | real tree / blob / update-ref CAS semantics | — | themselves |
| MUT-OAG-3 (1) | — | — (Z) | already zero-process | unchanged | — |

### 5.2 `qa/pt_land_resync_offline.js` (49 rows → 16 K real, 33 M; Git starts ≈ 3,216 → ≈ 1,200)

| Family (rows) | K kept real | M moved | Why real Git is unnecessary for M | Replaced by | Real coverage remaining |
|---|---|---|---|---|---|
| RS-1 Mode F (1), RS-1b (1) | RS-1 | RS-1b (own-slot cwd) | cwd → slot resolution from worktree answers | logic | RS-1 |
| RS-2 overlap (4) | "unstaged edit of a base-changed file" | staged, untracked-vs-added, identical-content | overlap is computed from status / diff answers | logic, a transcript per state | RS-2 unstaged |
| RS-3, RS-3b, RS-4, RS-4b (4) | all | — | real replay, patch-id, conflict, temp-worktree failure | — | themselves |
| RS-5 ×2, RS-6 ×2, RS-7 (5) | — | all | dirty / protected-path / audit-entry / up-to-date answers | logic + oracle | RS-13 dirty canonical, RS-3, RS-11 |
| RS-8 refs byte-identical after F and R (1) | yes | — | the real unchanged-state anchor | — | itself |
| RS-9 hook (1) | yes | — | process | — | itself |
| RS-10 in-progress / lock (3) | "rebase in progress" | merge/cherry-pick in progress, lock held | state-file presence and fs lock (real fs) | logic | RS-10 rebase |
| RS-11 end to end (1) | yes | — | — | — | itself |
| RS-12 printed values (1) | — | yes | text of the printed `--base-dev` / `--since` | logic | RS-11 |
| RS-13 preflight (12) | "canonical checkout is dirty" | 11 (env, hooksPath, self-integrity, not on branch-dev, branch missing / no slot / not a Worker slot / other slot, brief missing, malformed name) | env, config and ref answers, pure name parsing | logic | RS-13 dirty; PL-14 (self-integrity, same helper) |
| MUT-RS-1 `--keep`→`--hard`, -3 R4, -6, -6b hooks, -7 temp worktree (5) | all | — | reset modes, patch-id, hook execution, worktree removal are Git or process semantics | — (controls **D**: memoised per scenario) | themselves |
| MUT-RS-2, -2b, -4, -5, -8 … -13 (10) | — | all | decision mutants; -12 / -13 are caught by the oracle instead of RS-8's real snapshot | under fake + oracle | RS-6 / RS-5 / RS-7 / RS-10 / RS-13 K rows, RS-8 |

### 5.3 Other assertion changes (R and D)

| Item | Kind | Reason | Replacement |
|---|---|---|---|
| `fixture_template_offline.js` FT-6 | R | Stage 1 scope pin; Stage 2 rows legitimately change | G-MAP row map + this brief's STOP list |
| `run_isolation_offline.js` RI-6 whole-file equality and its "extra changed line" negative | R | same | RI-6 structural checks (E1 / E2 / E3) remain with their negatives |
| resync `mutantRow` per-mutant `scenario(TOOL_PATH)` | D | the unmutated control is identical for mutants sharing a scenario helper | memoised once per helper per run; same assertion |

## 6. Owner gate G-MAP (mid-task STOP)

Before any existing row is deleted, the Worker delivers:
- **`row-map.md`:** every one of the 166 + 49 rows, plus FT-6 and RI-6, with:
  - K / M / D / R / Z;
  - the replacement row name(s);
  - the real coverage remaining;
  - the planted negative.
- **Dual-run summary:** every M row identical; every moved mutant caught by assertion or oracle.
- **Codex review** of both.

Then **STOP for the Owner**. Deletions happen only after approval. A family whose dual-run is not identical stays
real (K).

## 7. Acceptance gates

| Gate | Measure | Threshold (target) |
|---|---|---|
| **A1 Git starts** (deterministic, meter) | real-Git starts: `pt_land_offline` / `pt_land_resync_offline` | **≤ 2,400 / ≤ 1,500** (expected ≈ 2,100 / ≈ 1,200) |
| | `fixture_template_offline` and `git_contract_offline` on a pinned source + environment digest | ≤ 50 starts each (fingerprint = 2) |
| | both logic suites | **exactly 0** Git and 0 Node starts |
| **A2 heavy-suite runtime** (laptop, quiet, each suite alone; median of 2) | main / resync / FT (pinned) / contract (pinned) | ≤ 12 / ≤ 7 / ≤ 1 / ≤ 1 min |
| | **heavy body** (their sum) | **≤ 18 min** (target 12–16) |
| **A3 full `qa:offline`** | PASS, 62 suites, 0 failures | **≤ 26 min** (target 18–26) |
| **A4 coverage preserved** | `row-map.md` accounts for every row; every M row has a logic row with the same name + ` [logic]`, the same outcome assertion and an oracle; every previous mutant still exists (real or fake) and is caught by assertion or oracle | 100 % |
| | dual-run identity for every M row | 100 % |
| | logic assertions + kept real assertions per family ≥ before | per family |
| | GC-3 and FT-0 digest planted negatives bite | yes |

- **A2 / A3 noise rule:** per-start time varied 191–354 ms between runs. If A1 is met but A2 or A3 is missed and the
  meter's average per Git start is above 300 ms, re-run once on a quiet laptop.
- If they are still missed → **STOP and report** with the numbers; the Owner decides. A2 / A3 never pass by
  re-measuring selectively.

## 8. Files

```
qa/lib/git-fake.js                          NEW — §3.1
qa/lib/git-transcript.js                    NEW — §3.2
qa/lib/exec-env-fingerprint.js              NEW — §3.6 (Owner amendment)
qa/fixtures/git-contract/*.json             NEW — transcripts (one per scenario family)
qa/tools/record-git-transcripts.js          NEW — recorder (not a suite)
qa/tools/pt_land_dualrun.js                 NEW — one-time equivalence evidence (not a suite)
qa/git_contract_offline.js                  NEW — §3.3
qa/pt_land_logic_offline.js                 NEW — §3.4 (main families)
qa/pt_land_resync_logic_offline.js          NEW — §3.4 (resync families)
qa/pt_land_offline.js                       M rows removed per approved row map; nothing else
qa/pt_land_resync_offline.js                M rows removed; mutantRow control memoised (D); nothing else
qa/fixture_template_offline.js              FT-0 digest gate + pin; FT-6 retired (R); nothing else
qa/run_isolation_offline.js                 RI-6 whole-file comparison retired (R); structural checks kept
work/qa-stage2-git-contracts/row-map.md     NEW — G-MAP deliverable (tracked)
work/qa-stage2-git-contracts/review.md      NEW — Backlog none; gates A1–A4; dual-run summary; LAND-EVIDENCE
```

The land-scope block lists exactly these paths (the fixtures directory by its files). Land-tests: the three new
suites, `node qa/run_isolation_offline.js`, `node qa/fixture_template_offline.js`.

## 9. Owner decisions (2026-10-06)

- **D1 — digest-gated real-Git proofs (FT-0, GC-4): APPROVED** (Owner 2026-10-06), amended so the digest includes
  the §3.6 execution-environment fingerprint.
- **D2 — one real representative per decision family: APPROVED.**
- **D3 — retire FT-6 and RI-6's whole-file comparison, keep RI-6's structural checks: APPROVED.**
- **G-MAP mid-task gate: kept exactly as proposed** (§6).

## 10. QA, flow, STOP, Definition of Done

**QA:**
1. Step 0: full `qa:offline` (59, ≈ 74 min, nothing else heavy on the laptop).
2. Build §3.1–§3.4 test-first; GC-1…GC-4 RED, then GREEN.
3. Record transcripts; run the dual-run.
4. G-MAP STOP.
5. After approval: remove M rows, memoise controls, apply FT-0 / FT-6 / RI-6.
6. Heavy suites alone: A1, A2.
7. Pin `TEMPLATE_CONTRACT_PIN` / `GIT_CONTRACT_PIN` after one passing real run each.
8. Full `qa:offline`: A3.

**Flow:** AGENTS.md steps 0–16 in Manual; step 10a effect `none`; Codex review; LAND and push via R12 with the
Owner's lines; cleanup.

**STOP:**
- STOP-1..6;
- any edit to `.claude/hooks/*`, `qa/run-offline.js` or a product file;
- any row deleted before G-MAP approval or not in the approved map;
- a logic suite making any process start;
- a mutant caught only by `UNSCRIPTED_GIT`;
- a dual-run mismatch left in the moved set;
- a K row's assertions changed;
- an unclassified Git subcommand treated as read-only;
- a pin updated without a passing real run in this task;
- the environment fingerprint missing any §3.6 factor, or its readable manifest containing a URL, credential or
  path;
- evidence reused across a different environment digest;
- any tiering or parallel-run mechanism;
- A1 or A4 missed;
- A2 / A3 missed after the noise rule;
- a `qa:offline` count other than 62.

**Definition of Done:**
- G-MAP approved;
- §3–§5 implemented exactly per the approved map;
- A1–A4 met (A2 / A3 per the noise rule);
- pins set from passing real runs;
- Codex with no unresolved Class I;
- LANDed, pushed, cleaned.

## 11. Expected outcome (estimates; A1 is the firm gate)

| | Stage 1 (measured) | Stage 2 (expected) |
|---|---|---|
| main real-Git starts | 5,869 | ≈ 2,100 (−64 %) |
| resync real-Git starts | 3,216 | ≈ 1,200 (−63 %) |
| FT + contract per ordinary run | 17.1 min | < 1 min each (pinned) |
| heavy body | ≈ 68.7 min | **≈ 14–18 min** at 0.25–0.30 s per start |
| full `qa:offline` | 73.5 min | **≈ 20–24 min** |

Stage 3 (tiering) would then take ordinary product LANDs toward the 5–8 min target. It is not in this brief.
