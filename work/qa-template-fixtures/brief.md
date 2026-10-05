# Task brief: qa-template-fixtures — Stage 1: build identical land-suite fixture bases (and the landed cleanup state) once per run and copy them

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **none** — workflow tooling (Track 6, "Faster land-tool tests", Slice 1); no `BACKLOG.md` change |
| Baseline | `f3c0728807c7bc2d66faaf4cc1387a83f8a979e6` (`branch-dev` = `origin/branch-dev`; Slice 0 landed). Anchors verified at this commit |
| Branch / slot | `task/qa-template-fixtures`, Worker A (`pt-wt-worker-a`, free, detached at `f3c0728`) |
| Mode | **Manual (attended)** — changes how the governance-tool tests build their repositories. Test-only: no tool, hook, protected, ASK-tier or `qa/run-offline.js` change |
| qa:offline | baseline at Step 0 → **+1** (`qa/fixture_template_offline.js`). After a Second-LAND re-sync, the baseline is the re-synced count, measured fresh |
| Parallel with | Worker B `task/r1a-high1y-relabel`: no shared file. **Heavy QA one at a time across Workers** (full `qa:offline`, `pt_land_offline`, `pt_land_resync_offline`); light runs any time |
| QA cost flag | **QA-heavy by nature** (≈ 2–2.5 h of runs against a half-day implementation), justified because the slice changes the heavy suites themselves. The "before" numbers are taken from Slice 0's measurements, not re-measured (start counts are deterministic) |
| Status | FINAL, **FABLE consolidation amendment** (2026-10-06): Stage 1 = Slice 1 + the landed-and-pushed cleanup template. Owner exception for 18 assertion-neutral row-text lines (§1.2b). No governance tiering; no decision open |

## 0. Inputs

- **Slice 0 measurements** (`work/qa-isolation-meter/review.md`, laptop, direct `git.exe`):

  | Suite | Git starts | Share of metered time | Avg per start | Rows |
  |---|---|---|---|---|
  | `pt_land_offline` | 8,475 | **fixture 64.1 %**, tool 31.6 %, other 4.3 % | 191–270 ms | 166 |
  | `pt_land_resync_offline` | 4,234 | **fixture 47.0 %**, tool 31.0 %, other 22.0 % | 198–327 ms | 49 |

  - In `pt_land_offline`, the cleanup group builds a 122-start fixture per row (base + brief + slots + a real
    LAND, push-request and push through the tool).
  - Every resync fixture is 21 starts, and most rows build two.
- **FABLE:** real Git stays where Git semantics matter; repeated *setup* is the first waste to remove. Tiering is
  not part of this stage.
- **FABLE consolidation ruling (2026-10-06):** Stage 1 = this slice plus **exactly one** addition — a
  landed-and-pushed cleanup fixture template for the main suite. Not added:
  - zero-process oracle, logic-body thinning, row removal;
  - tiering, parallel-runner changes, Git-runner seam.
- **Owner exception (2026-10-06).** The nine real-tool landed cleanup rows each use a different task id
  (`cl1`, `cl4`…`cl10`). That id is part of the committed Git content, and several rows hard-code it in paths, so
  one shared landed template is impossible without touching those rows. The Owner approved, for these rows only,
  replacing the hard-coded ids with `fx.taskShort` and routing the rows to the shared template (§1.2b). Unchanged:
  every assertion, row name and row order.
- **Worker A's latest read-only Slice 1 design** is not on disk where COWORK can read it. This brief derives from
  the held Slice 1 draft and Slice 0's code and measurements. If Worker A's design differs materially, record it
  under M6 at Step 0; STOP-2 only if this brief cannot be satisfied as written.

## 1. Exact changes

### 1.1 `qa/lib/fixture-template.js` (new; `qa/lib/` is not auto-discovered)

- **`template(key, build)`**:
  - first use: calls `build(dir)` into `<os.tmpdir()>/tpl-<sha256(key) first 12>` (inside Slice 0's private run
    root, so it is removed with the run);
  - caches the directory for the process; later calls return it;
  - a template directory is never handed to a test.
- **`materialize(tplDir, destDir, rewrites)`**:
  - `fs.cpSync(tplDir, destDir, { recursive: true })`;
  - in text files only — `.git/config`, `.git/worktrees/*/gitdir`, every slot's `.git` file — replaces each
    template absolute path with the destination path, in **both** slash forms (`\` and `/`);
  - afterwards scans every non-object file under `destDir` and **throws** if any template path remains;
  - starts no Git process, changes no environment variable.
- **`timings()`**: cumulative build ms, copy ms, rewrite ms and counts, for the review and the benchmark.

### 1.2 `qa/pt_land_offline.js` — inside `function buildFixture(opts)` only (`:71` at `f3c0728`)

- The base steps (bare `init`, canonical `init`, two `config`, `remote add`, README commit, `branch`, the pushes,
  `checkout`, the tool + integrity-check commit and push, plus the optional `.gitignore` commit and push) come from
  `template()` + `materialize()`.
- The `require('./lib/fixture-template')` is **inside** the function body (lazy), so no line outside
  `buildFixture` changes.
- **Templated only when** the tool source's content hash equals `REAL_TOOL_PATH`'s **and** `opts.originUrl` is
  unset. Every mutant source and every `originUrl` fixture runs today's code path line for line.
- **Key** = real-tool content hash + `.gitignore` text (or none).
- Everything after the base (brief, push, `rev-parse`, worktrees, implementation commit, the returned object) is
  unchanged. `buildCleanupFixture`, `buildProtectedFixture` and `buildApprovedLandFixture` are unchanged; they
  benefit through `buildFixture`.

### 1.2a `qa/pt_land_offline.js` — the `landed` option, inside `function buildCleanupFixture(opts)` only (`:992` at `f3c0728`)

- **New option `opts.landed === true`.** It builds the landed-and-pushed state **once per run**, through today's
  fresh path:
  - `buildFixture` with the `.gitignore` text and the fixed task id `LANDED_TASK_SHORT = 'cltpl'`;
  - a real `runLand`, `runPushRequest` and `runPush`, each with its single-use record.

  The result is captured with `template()`, and every call **materialises its own isolated copy**.
- **Allowed only for:** the real tool source (content hash equal to `REAL_TOOL_PATH`'s), no `originUrl`, and
  `land` / `push` not `false`. Any other combination with `landed: true` **throws** (fail closed).
- **Unchanged paths:** calls without `landed` behave exactly as today. That covers `cl2` (`land: false`), `cl3`
  (`push: false`) and the mutant rows `mu4`–`mu7`, all built fresh.
- **Copy rewrites** (in addition to §1.1's):
  - the origin URL in the canonical `.git/config`;
  - `.git/worktrees/*/gitdir`;
  - each slot's `.git` file.

  `.git/pt-land-log` holds no paths (verb, task, OIDs, timestamp). If the leak scan finds a template path in any
  other file → STOP and report.
- **Returned object** has the same fields as `buildFixture`'s:
  - `tmp`, `bareDir`, `canon`, `slotA`, `slotB` and `commonDir` are derived from the copy;
  - `task`, `taskShort`, `base`, `tip` and `mainOid` come from metadata recorded when the template was built (the
    OIDs are identical in the copy);
  - `requireTool`, `writeLandRecord`, `writePushRecord` and `cleanup` are bound to the copy.
- All new code lives in `fixture-template.js` or inside `buildFixture` / `buildCleanupFixture` (lazy requires), so
  no other function changes.

### 1.2b `qa/pt_land_offline.js` — the 18 approved row-text lines (Owner exception; nothing else in any row)

| Row (name unchanged) | Line at `f3c0728` | Old → new |
|---|---|---|
| PL-22 valid cleanup | `:1041` | `buildCleanupFixture({ taskShort: 'cl1' })` → `buildCleanupFixture({ landed: true })` |
| | `:1056` | `path.join(archiveRoot, 'cl1', …)` → `path.join(archiveRoot, fx.taskShort, …)` |
| | `:1058` | `path.join(fx.slotA, 'work', 'cl1', name)` → `path.join(fx.slotA, 'work', fx.taskShort, name)` |
| PL-25 tracked modification | `:1106` | `{ taskShort: 'cl4' }` → `{ landed: true }` |
| | `:1109` | `'work', 'cl4', 'foo.txt'` → `'work', fx.taskShort, 'foo.txt'` |
| PL-25 untracked file | `:1121` | `{ taskShort: 'cl5' }` → `{ landed: true }` |
| PL-26 non-directory destination | `:1137` | `{ taskShort: 'cl6' }` → `{ landed: true }` |
| | `:1141`, `:1145`, `:1153` | `'cl6'` → `fx.taskShort` (path segment only) |
| PL-26 destination file exists | `:1159` | `{ taskShort: 'cl6b' }` → `{ landed: true }` |
| | `:1163`, `:1167`, `:1175` | `'cl6b'` → `fx.taskShort` (path segment only) |
| PL-27 second cleanup | `:1187` | `{ taskShort: 'cl7' }` → `{ landed: true }` |
| PL-28 checked out nowhere | `:1204` | `{ taskShort: 'cl8' }` → `{ landed: true }` |
| PL-29 planted hook | `:1219` | `{ taskShort: 'cl9' }` → `{ landed: true }` |
| PL-31 CLI cleanup | `:1244` | `{ taskShort: 'cl10' }` → `{ landed: true }` |

On each of these 18 lines only the quoted token changes; the rest of the line is byte-identical.

### 1.3 `qa/pt_land_resync_offline.js` — inside `function buildFixture(o)` only (`:107` at `f3c0728`)

- The whole recipe (origin, canonical, files, `.gitignore`, tool commit, briefs, push, both worktrees) comes from
  `template()` + `materialize()`, with the require inside the function body.
- **Templated only when** the tool source's content hash equals the real `TOOL_PATH`'s. Mutant sources build
  fresh, exactly as today.
- **Key** = real-tool content hash + the `briefs` list.
- **Rewrites:**
  - the origin URL in the canonical `.git/config`;
  - `.git/worktrees/pt-wt-worker-a/gitdir` and `.git/worktrees/pt-wt-worker-b/gitdir`;
  - each slot's `.git` file.
- `base` is re-read with the existing `rev(canon, 'branch-dev')`. The returned object is unchanged.

### 1.4 `qa/run_isolation_offline.js` — RI-6 only

- RI-6 rebuilds each land suite as "baseline `cd2c54b` + E1–E3" and requires an exact match, so Slice 1 would
  break it.
- Minimum edit, in `checkEdits` before the final comparison:
  - (a) **mask `buildFixture` and `buildCleanupFixture`** (brace-matched, each replaced by
    `function <name>(/*masked*/)`) in both `cur` and `expected`;
  - (b) for `qa/pt_land_offline.js` only, apply the §1.2b table to `expected`. Each old line must occur exactly once
    and is replaced by its new line, so the 18 approved row lines are the **only** unmasked differences.
- Planted cases added to the RI-6 negatives test:
  - an edit outside both masked functions and outside the table is detected;
  - an edit inside either masked function is masked (positive control);
  - a §1.2b line left unapplied is detected;
  - an extra `'clN'` → `fx.taskShort` substitution on an unlisted line is detected.
- No other line of the suite changes; RI-1…RI-5 and MT-1…MT-7 are untouched. The §1.2b table lives in this suite
  as a literal.

### 1.5 `qa/fixture_template_offline.js` (new suite)

| ID | Acceptance (Owner) | Assertion |
|---|---|---|
| FT-1 | 1 — equivalence | For each `pt_land` key (plain; `.gitignore`), a copied fixture and a fresh-built fixture with the same options have:<br>- identical ref names, **tree OIDs** per ref, commit messages and parent shape;<br>- the same `HEAD` symbolic ref and branch config;<br>- remote URL = the new directory's own origin;<br>- clean `git status --porcelain`;<br>- `git fsck --no-dangling` clean |
| FT-1c | 1 — landed equivalence (FABLE) | A copied landed fixture and a fresh landed fixture (same task id `cltpl`) have:<br>- identical canonical `branch-dev`, `origin/branch-dev` (remote-tracking) and **bare-origin** `branch-dev` and `main` tree OIDs, commit messages and parent shape;<br>- the same slot A / slot B HEAD (OID or detached state) and clean status;<br>- **exactly one** `land` `ok` and one `push` `ok` line in `.git/pt-land-log`;<br>- **no** `pt-land-approval` / `pt-push-approval` record;<br>- **no** `pt-land.lock` |
| FT-2 | 1 — equivalence | The same for the resync fixture, plus `git worktree list --porcelain`: the same worktrees, branches and HEADs, with paths under the new directory; both slots clean |
| FT-3 | 2 — no path leak | After materialisation, no file outside `objects/` contains the template path in either slash form. **Planted negative:** a skipped rewrite is caught |
| FT-4 | 3 — independence | Two fixtures from one template: a commit, a branch and a worktree in one change neither the other nor the template (ref lists and a file-tree hash compared) |
| FT-5 | 4 — fresh paths | Static and behavioural (spy on `template()`):<br>- a mutant source, an explicit non-real `toolSource` and an `originUrl` fixture never call `template()`; the real source passed explicitly *does*;<br>- `buildCleanupFixture` with `landed: true` plus a mutant source, `originUrl`, `land: false` or `push: false` **throws**;<br>- the mutant cleanup rows (`mu4`–`mu7`) and `cl2` / `cl3` take the fresh path |
| FT-6 | — scope | Both land suites equal `f3c0728` except inside the masked functions, plus — for `pt_land_offline.js` — exactly the 18 §1.2b lines (comparison as in §1.4). `run_isolation_offline.js` differs only by §1.4 |
| FT-7 | — no vacuous checks | For a materialised landed fixture, every path the nine rows inspect exists before cleanup, under `work/<fx.taskShort>/` in slot A and as `task/<fx.taskShort>` in the canonical refs. A copy whose task id differed from its committed content would fail here |

**Planted negatives:**
- a divergent template (one push left out) → FT-1;
- a landed template missing the push (or with an approval record left behind) → FT-1c;
- a missing worktree rewrite → FT-2 / FT-3;
- a shared directory → FT-4;
- a mutant routed through a template, or `landed` with a mutant not throwing → FT-5;
- an unlisted row edit → FT-6;
- a copy whose metadata task id mismatches its content → FT-7.

<!-- land-scope:begin -->
qa/lib/fixture-template.js
qa/pt_land_offline.js
qa/pt_land_resync_offline.js
qa/run_isolation_offline.js
qa/fixture_template_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/fixture_template_offline.js
node qa/run_isolation_offline.js
<!-- land-tests:end -->

## 2. Files — exactly 6

```
qa/lib/fixture-template.js          NEW — §1.1
qa/pt_land_offline.js               inside buildFixture / buildCleanupFixture (§1.2, §1.2a) + the 18 row lines (§1.2b)
qa/pt_land_resync_offline.js        inside buildFixture only (§1.3)
qa/run_isolation_offline.js         RI-6 masking (two functions) + row-line table + planted cases only (§1.4)
qa/fixture_template_offline.js      NEW — §1.5
work/qa-template-fixtures/review.md NEW — ## Backlog reconciliation: none; benchmark; meter before/after; LAND-EVIDENCE
```

## 3. Expected effect

| | Git starts before (Slice 0) | Saved (est.) | After (est.) | Acceptance floor | Runtime (est.) |
|---|---|---|---|---|---|
| `pt_land_offline` | 8,475 | ~2,700–2,800: bases ~1,750 (117 fixtures) + landed ~1,000 (9 rows × 122, minus one landed build of ~104) | **~5,700–5,800 (−32 to −33 %)** | **≥ 30 %** (≤ 5,932) | ≈ −30 % (−9 to −12 min of 28–40) |
| `pt_land_resync_offline` | 4,234 | ~900–1,100 | **~3,200 (−21 to −26 %)** | **≥ 15 %** (≤ 3,598) | ≈ −20 % (−3 to −5 min of 14–24) |
| full `qa:offline` | ~12,700 in these two | ~3,600–3,900 | ~8,900–9,100 | — | **≈ −12 to −17 min of ~50** |

These are estimates, net of copy cost, which §4.2 measures first. The main-suite 30 % floor depends on the landed
template.

## 4. QA (laptop)

1. **Step 0:**
   - full `qa:offline` baseline (57 at `f3c0728`), with no other heavy QA running;
   - capture the FT-6 / §1.4 baselines;
   - the "before" meter numbers are Slice 0's (§0); they are not re-measured.
2. **Pre-step benchmark (before any suite edit; Owner acceptance 8–9):** a scratch script under
   `/tmp/pt-qa-template-fixtures/`, using `fixture-template.js`, measures on the laptop:
   - (a) **setup replaced**: median of 5 fresh builds of each base (the pt_land plain base, the `.gitignore` base,
     the **landed-and-pushed cleanup state**, the resync full recipe), timing only the steps the template replaces;
   - (b) **copy cost**: median of 5 `materialize()` runs of the same template (copy + rewrite + leak scan).

   Record `copy ÷ setup` per base in `review.md`. **STOP if copy > 40 % of setup for any base.**
3. **Tests first:** `qa/fixture_template_offline.js` is RED (no helper yet), then §1.1–§1.4, then GREEN. RI-6 passes
   with the masking; its new planted cases bite.
4. **Behaviour proof:**
   - `node qa/pt_land_offline.js` → **PASS 166**, and `node qa/pt_land_resync_offline.js` → **PASS 49/49** (Owner
     acceptance 5);
   - every planted mutant row PASSes, i.e. the mutant is still caught (acceptance 6).

   The two may run side by side, since isolation is proven, only when no other heavy QA runs on the laptop and free
   memory is ≥ 2 GB. Otherwise run them one after the other.
5. **Meter (acceptance 7):** from those runs' `@@QA-SURFACE@@` lines, Git starts must fall versus Slice 0 by:
   - **main suite ≥ 30 %** (8,475 → ≤ 5,932);
   - **resync suite ≥ 15 %** (4,234 → ≤ 3,598).

   Record starts, fixture share and wall time before and after.
6. **Full `qa:offline` = Step-0 count + 1** (58; acceptance 10).

## 5. Flow, STOP, Definition of Done

**Flow:** AGENTS.md steps 0–16 in Manual; step 10a effect `none`; Codex review; LAND and push through R12 with the
Owner's two lines; cleanup.

**STOP:**
- STOP-1..6;
- the benchmark shows copy > 40 % of replaced setup for any base;
- any edit outside `buildFixture` / `buildCleanupFixture` in either land suite other than the 18 §1.2b lines, or
  beyond §1.4 in `run_isolation_offline.js`;
- any row, assertion, row name, row order or mutant text changed beyond §1.2b;
- `landed: true` reaching a mutant, `originUrl`, `land: false` or `push: false` path without throwing;
- a template path found in any copied file other than the listed rewrite targets;
- FT-7 failing (a vacuous path check);
- a mutant or `originUrl` fixture routed through a template;
- a PASS count other than 166 / 49;
- any mutant no longer caught;
- an equivalence or leak row failing;
- a Git-start drop below **30 %** (main) or **15 %** (resync). Report it; do not tune further in this task;
- any change to `.claude/hooks/*`, `qa/run-offline.js` or another suite;
- two heavy runs on the laptop at once outside §4.4's condition.

**Definition of Done:**
- §1 exact;
- FT-1, FT-1c, FT-2…FT-7, RI-6 and all planted negatives PASS;
- benchmark recorded and within limit;
- PASS 166 / 49 with every mutant caught;
- ≥ 30 % (main) and ≥ 15 % (resync) fewer Git starts;
- full `qa:offline` = baseline + 1;
- Codex with no unresolved Class I;
- LANDed, pushed, cleaned.
