# Task brief: pt-skills-v1 — create `pt-offline-suite`, refresh `browser-integrity-qa`, create `pt-ai-output-change`

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **none** — workflow tooling (Track 6, reusable Worker Skills); no `BACKLOG.md` change |
| Baseline | `d9c5a0ec55fb834ddfa1829ad552c7fbf11bdf5e` (`branch-dev` = `origin/branch-dev`, 2026-10-07, QA Stage 2 landed, pushed and cleaned). Every anchor below was verified at this commit. If `branch-dev` has moved by more than brief-only commits when the Worker starts, STOP-2 for a re-pin |
| Branch / slot | `task/pt-skills-v1`, **Worker A** (`pt-wt-worker-a`, detached and clean at `d9c5a0e`). The branch is created from the then-current `branch-dev` after the brief commit |
| Mode | **Auto (attended), after `/plan`.** Ordinary-tier files only (no ASK- or DENY-tier file), offline validation only, no runtime / live / deploy work; every Owner ruling exists (§0) |
| qa:offline | **one full run, at the end** (§0.2). Baseline **63** suites, from the Stage 2 `LAND-EVIDENCE`. Expected at the end: **63** (no suite is added, edited or removed) |
| Parallel with | Worker B `task/r1b-ath-store-seed`: no shared file. **One full `qa:offline` on the laptop at a time** — never while Worker B runs its full suite |
| LAND path | **Owner LAND in a normal terminal** (§0.8); push and cleanup through `pt-land.js` (R12) |
| Status | FINAL, 2026-10-07. Sources: Owner rulings §0; approved specs `_held-briefs/skills/skill-specs-2026-10-07.md`; approved plan `_held-briefs/skills/skills-implementation-plan-2026-10-07.md` |

## 0. Owner rulings (2026-10-07; not reopened)

1. One task for all three Skills, to avoid three full `qa:offline` runs.
2. **No pre-edit full `qa:offline`; one full run at the end.** For this task, this replaces the AGENTS.md step-0
   pre-edit full run:
   - the baseline evidence is the final Stage 2 result in `work/qa-stage2-git-contracts/review.md` at `d9c5a0e`:
     `LAND-EVIDENCE: qa-offline=PASS 63; targeted=PASS; codex-classI-unresolved=0` (PASS, 63 suites, 14 phases,
     0 failures, 683,861 ms);
   - the Worker copies that line, with its source path and commit, to the first line of `work/pt-skills-v1/qa.log`.

   This is a task-specific exception, justified because the task adds and changes no suite and no product file. It
   is not a precedent.
3. Execute after QA Stage 2 has landed and been cleaned (met at `d9c5a0e`). Worker A.
4. Mode Auto (attended), after `/plan`.
5. No optional test-hygiene task (the shared `renderMainPanel` pin) in this slice.
6. No governance duplication from `AGENTS.md` / `CLAUDE.md`. No change to `.claude/rules/qa-suites.md`, the hooks,
   the settings or any other governance file.
7. All validation offline and read-only. Historical replays read files through `git show <commit>:<path>`. No
   browser, no network, no live request.
8. **LAND path.** `pt-land.js` treats every path under `.claude/` as protected (`PROTECTED_PATH_RES`), and its
   PROTECTED gate cannot approve `.claude/skills/**` (not in `PROTECTED_TARGET_RES`). Therefore:
   - the Worker commits on its own task branch through the r9 gate (step 13). `.claude/skills/**` is not in the r9
     staged-deny set and is not ASK- or DENY-tier;
   - at step 14, `land-request` is expected to refuse with "protected path not PROTECTED-approved: Owner LAND".
     This is **not** a STOP-6: the Worker reports it and **STOPs for an Owner LAND** (AGENTS.md step 14,
     "Otherwise");
   - the Owner fast-forwards `branch-dev` to the task tip in a normal terminal;
   - push (step 15) and cleanup (step 16) then run through `pt-land.js` as usual;
   - no `protected-scope` block, no PROTECTED request, no hook or settings change.

## 1. Objective

Three reusable Worker Skills, as specified and approved:
- **`pt-offline-suite`** — the coupling sweep (5 classes), suite patterns, planted negatives, re-pin with revert
  proof, count discipline.
- **`browser-integrity-qa`** refresh:
  - no `CHECKPOINT.md` / `/phase-start` dependency;
  - a live-scan protocol (state snapshot and restore, selection-only scanning, bounded evidence extraction,
    one-action discipline) and an extended report;
  - **stays `disable-model-invocation: true`** and keeps its read-only boundary.
- **`pt-ai-output-change`** — the AI-surface map by function name, the data-gating pattern, wording /
  banned-term / enum-display checks, the consumer-impact note, the A / B / C / D finding taxonomy, and the DEV
  hand-off.

**Out of scope:**
- the test-hygiene pin task;
- retiring or editing `phase-start` or any other existing Skill (incl. `workflow-visualizer`, `Frontend Design`,
  `Decision_Council`, the `arc-*` family);
- fixing the broken `figma-generate-design` symlink;
- any `qa/**`, product, `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/rules/**`, `.claude/hooks/**` or
  `.claude/settings*` change.

## 2. Required / Recommended Skills (for executing this task)

| Skill | Required / Recommended | Why |
|---|---|---|
| — | — | **None required, none recommended.** No existing Skill covers Skill authoring in this repo. The legacy Skills (`phase-start`, `lab-planner`, `portfolio-skill-router`, `approval-flow-optimizer`, `arc-*`) must **not** be used |

The three Skills being built are exercised **only** in the validation replays and dry runs (§5). They are not used to
plan this task.

## 3. What must be true

1. **Contents:**
   - each Skill has the sections, responsibilities, boundaries, inputs, outputs, `/plan` interaction and STOP
     conditions of the approved spec, and nothing more;
   - frontmatter carries `name` and a **narrow** `description` ("use when the approved brief lists …");
   - the two new Skills are model-invocable; `browser-integrity-qa` keeps `disable-model-invocation: true`.
2. **No line numbers stored:** surfaces and couplings are named by file and function / symbol, with an instruction
   to re-verify them at the task's baseline.
3. **Governance only by reference:** to `AGENTS.md`, `CLAUDE.md` (`<frontend_aesthetics>`) and
   `.claude/rules/qa-suites.md` (§6).
4. **No executable side effects:** the Skills contain no instruction that commits, pushes, writes approval
   records, calls the network or starts a live request by itself.
5. **Procedures use the agent's own tools:** the coupling sweep uses Grep / Read; no new script, and no command that
   needs an allowlist entry.
6. **Self-contained:** each Skill's supporting files are referenced from its own `SKILL.md`. None references another
   task's brief or a file outside the repository.

## 4. Files — exactly 11

```
.claude/skills/pt-offline-suite/SKILL.md                              NEW
.claude/skills/pt-offline-suite/references/coupling-classes.md        NEW — classes (a)–(e), search patterns, current instances (re-verify)
.claude/skills/pt-offline-suite/references/suite-patterns.md          NEW — pointers to existing harness patterns (no copies)
.claude/skills/pt-offline-suite/templates/plan-sections.md            NEW — sweep table, requirement→assertion map, planted negatives, re-pin ledger
.claude/skills/browser-integrity-qa/SKILL.md                          EDIT — R1–R7 of the approved refresh plan
.claude/skills/browser-integrity-qa/references/live-scan-protocol.md  NEW — the ordered live-scan protocol
.claude/skills/browser-integrity-qa/templates/report.md               NEW — the compact report incl. pre/post pt_* table
.claude/skills/pt-ai-output-change/SKILL.md                           NEW
.claude/skills/pt-ai-output-change/references/ai-surfaces.md          NEW — surface map by function, what each feeds
.claude/skills/pt-ai-output-change/templates/findings.md              NEW — finding table (A/B/C/D) + wording-check table
work/pt-skills-v1/review.md                                           NEW — validation evidence (§5), governance check (§6), LAND-EVIDENCE
```

**Verified at `d9c5a0e`:**
- `.claude/skills/pt-offline-suite/` and `.claude/skills/pt-ai-output-change/` do not exist.
- `.claude/skills/browser-integrity-qa/` contains only `SKILL.md` (55 lines). It references `/phase-start` and
  `CHECKPOINT.md`, and carries `disable-model-invocation: true` and the closing read-only paragraph.
- **Tier:** no file above is ASK- or DENY-tier, and none matches the r9 staged-deny set. Under `pt-land.js` they are
  protected for LAND only (§0.8).
- **Coupling sweep of the 10 Skill paths:**
  - no discovered suite reads `.claude/skills/{pt-offline-suite,browser-integrity-qa,pt-ai-output-change}/**`;
  - `qa/instruction_layer_offline.js` pins only `portfolio-skill-router/SKILL.md` and
    `approval-flow-optimizer/references/optimization-rules.md`, both untouched;
  - the suites reading other `.claude/skills/**` paths (`arc_*`, `phase_gate`) are in `OFFLINE_TESTS_DENYLIST`;
  - the suite count therefore stays 63.

<!-- land-scope:begin -->
.claude/skills/pt-offline-suite/SKILL.md
.claude/skills/pt-offline-suite/references/coupling-classes.md
.claude/skills/pt-offline-suite/references/suite-patterns.md
.claude/skills/pt-offline-suite/templates/plan-sections.md
.claude/skills/browser-integrity-qa/SKILL.md
.claude/skills/browser-integrity-qa/references/live-scan-protocol.md
.claude/skills/browser-integrity-qa/templates/report.md
.claude/skills/pt-ai-output-change/SKILL.md
.claude/skills/pt-ai-output-change/references/ai-surfaces.md
.claude/skills/pt-ai-output-change/templates/findings.md
<!-- land-scope:end -->

Land-tests: none. The task adds no code; its validation is the read-only evidence in §5, plus the single full
`qa:offline`.

## 5. Validation (offline, read-only; all evidence in `review.md`)

### 5.1 `pt-offline-suite`

- **V1-OS — historical replay of the R-1 Slice A miss.**
  - **Input:** run the sweep against `57afd9d6896f5f4d6d7f1cc6135a684e3792bad8`, reading every file through
    `git show 57afd9d:<path>`.
  - **Edit list:** Slice A's **original** list (all present in `index.html` at `57afd9d`): `computeATHDistance`,
    `classifyTechnicalSetup`, `buildTechSnapshotBlock`, `_techDeriveSnap`, the scan-prompt gating text in
    `fetchAnthropicAnalysis`, the `orchestrate` audit trail, `_srGroupResults`, `renderMainPanel`,
    `_dd0FetchAnalysis`.
  - **Must list**, with suite, symbol and class:
    - **the three couplings that forced amendments 1 and 2:**
      - `qa/ts1_default_exposure_offline.js` TX-3 `renderMainPanel` (class a);
      - `qa/analyst_parser_offline.js` `PIN_MASKED_FILE` (class b);
      - `qa/tech_snapshot_cache_offline.js` TC-6 `names` sandbox list (class c);
    - **the couplings the original brief already had:** the `vis_score_caliper` `renderMainPanel` and
      `_srGroupResults` pins, `tech_snapshot_cache` `BASE_PINS`, `deep_dive_v0` `FNS`.
  - **Pass:** all present; every other hit explained.
  - **Fail:** any of the three missing → the Skill is not done.
- **V2-OS — template fit:** the `templates/plan-sections.md` blocks are filled for dry run D1 (§5.4), with every field
  sourced.
- **V3-OS — no side effects:** a read of the Skill files shows no write, commit, push, approval-record or network
  instruction.

### 5.2 `browser-integrity-qa` (DEV / browser-skill replay)

- **V1-BQ — tabletop replay of two real DEV runs.** No browser is opened. Walk the new protocol against what these
  runs needed:
  - **2026-10-03 consistency pilot** (DEV, 4 tickers):
    - snapshot the `pt_*` state and the scan selection;
    - select only the four tickers for the scan (checkbox, never removal);
    - one scan;
    - extract evidence from the result objects;
    - restore selection and watchlist;
    - verify that no unplanned `pt_*` change remains.
  - **2026-10-05 R-4a post-push check** (DEV, one approved scan, report of exact parser fields).

  Map every protocol step to an action those runs needed. Each recorded incident must be covered by a named rule:
  - **I-1:** JavaScript output truncated at about 1,000 characters → chunked extraction (≤ 950 characters per chunk);
  - **I-2:** output containing URLs / query strings blocked by the tool → strip URLs and `?`, `&`, `=` before
    output;
  - **I-3:** a stale element-reference click on "Run scan" did not fire → check state (no scan running, selection
    correct) before any retry, so a scan is never duplicated;
  - **I-4:** the renderer froze after a watchlist action (CDP timeout), although the action had succeeded → the same
    state-check-before-retry rule; never repeat an action blindly.
- **V2-BQ — negative read:**
  - no reference to `CHECKPOINT.md` or `/phase-start`;
  - no instruction that triggers a live request by itself;
  - `disable-model-invocation: true` kept;
  - the closing read-only boundary paragraph kept.

### 5.3 `pt-ai-output-change`

- **V1-AO — historical replay of R-1 Slice A.** Apply the surface map at `57afd9d` with Slice A's change ("never
  call the 1Y high ATH").
  - **Must list every AI-facing location** that `git diff 57afd9d 138a681 -- index.html` changed:
    - the `buildTechSnapshotBlock` label;
    - the two scan-prompt gating lines, plus the inserted explanation line, in `fetchAnthropicAnalysis`;
    - the Deep Dive `TECHNICAL SETUP` line in `_dd0FetchAnalysis`;
    - the consumer note for the `*_near_ath` setup names.
  - **Banned-term check:** `\bATH\b|all-time` on those 1Y-metric surfaces gives hits at `57afd9d` and **none** at
    `138a681`.
- **V2-AO — taxonomy fit:** classify every finding of the 2026-10-03 consistency pilot with `templates/findings.md`,
  giving each a primary class (and a secondary where the pilot has one).
  - The answer key is the pilot's own classes:

    | Classes | Findings |
    |---|---|
    | A | M2, N2, R1, R2 |
    | B | M3, M4, M6, C1, C2, C3, C4, N1, R3, R5, R6 |
    | B + C | M1, R4 |
    | A + B | M5, C6, R7 |
    | D | C5 |

  - The finding texts are read, read-only, from
    `../_held-briefs/notebooklm-pilot/2026-10-03-post-fix-consistency-pilot.md` (relative to the slot; outside the
    repository, never copied into it). If the file is unreadable, STOP-2.
  - **Pass:** each classification matches the key.

### 5.4 Dry runs through `/plan` (written into `review.md` as illustrative `plan.md` excerpts; no implementation)

| ID | Example task | Skills | What the dry run must show |
|---|---|---|---|
| **D1** | **R-2 MA stack** (edit the stack claim / `_tsAssessMap` in `renderMainPanel`) | `pt-offline-suite` | The sweep at `d9c5a0e` lists:<br>- the caliper `renderMainPanel` pin, TS1 TX-3, tech-snapshot `NEW_RM_LF` / `NEW_RM_CALIPER_PIN`;<br>- tech-snapshot TC-10 ("exactly I7a–I7i changed", trips if lines are added);<br>- the `_tsAssessMap` literal-shape extractions (tech-snapshot, `high1y_label` HL-3);<br>- `analyst_parser` `PIN_MASKED_FILE`;<br>- the `qa/run-offline.js` T6 checks that extract `renderMainPanel`, **marked ASK-tier**;<br>- the `deep_dive_v0` / `ui_hygiene` extractions.<br>Plus the "brief must list each, otherwise STOP-1" outcome |
| **D2** | **R-7 NVDA parse investigation** (one approved DEV scan) | `browser-integrity-qa` | The planned protocol steps and the restore checklist. The live step is marked "the Owner or COWORK triggers `/browser-integrity-qa` after approval". The permitted `pt_*` changes are `pt_date` and the NVDA entry of `pt_results`. A raw failure not capturable from existing debug evidence → STOP for a separate debug brief |
| **D3** | **R-5 Pulse vs Analyst** (Owner ruling D5: dial = Pulse only; analyst rating as "Analyst view"; prompt `Rating:` unchanged) | `pt-ai-output-change` + `pt-offline-suite` | The surface map lists:<br>- every `RATING_SUMMARY_RE` consumer at `d9c5a0e`: `_srGroupResults`, `_srRenderGrouped`, `openScanResultsOverlay`, `renderMainPanel` (dial), `_renderPortfolioPanel`;<br>- the other `Rating:` text uses in `renderMainPanel` (section terminator, Actionable Take strip);<br>- the scan prompt's `Rating:` instruction in `fetchAnthropicAnalysis`.<br>The consumer-impact note covers Daily Review and Scan Results grouping. The sweep adds the caliper `_srGroupResults` pin. The DEV visual step is handed to `browser-integrity-qa` |

## 6. Governance-duplication search (recorded in `review.md`)

Grep all 10 Skill files for these patterns:
- `pt-land.js`, `printf`, `pt-brief-approval`, `pt-land-approval`, `pt-push-approval`;
- `git commit`, `git push`, `git merge`, `git rebase`, `git reset`;
- `R11`, `R12`, `r9`, `R3g`, `R3m`;
- `STOP-[1-6]` (followed by a definition), `Mode: Auto` / `Mode: Manual` rules;
- `DENY`, `ASK` (tier definitions), `land-scope`;
- `#080D16`, `#101A2A`, `#4B82F1`, `#22C58B`, `#F05D6C`, `#F4B860`;
- `Netlify`, `deploy`, `CHECKPOINT`.

**Pass:** every hit is a **reference**, not a restatement. Allowed examples:
- "flag `qa/run-offline.js` as ASK-tier (see AGENTS.md)";
- "per CLAUDE.md `<frontend_aesthetics>`";
- "needs the approval the brief lists".

Any restated rule, definition, command sequence or value → FIX before the commit.

## 7. Flow

AGENTS.md steps 0–16 in Mode Auto (attended), with these task specifics:
- **Step 0:** worktree bootstrap as usual. Per §0.2, **no pre-edit full run**: the baseline line is copied into
  `qa.log`.
- **`/plan` is mandatory before any file is written.** `plan.md` holds:
  - the `CLAUDE.md` pre-flight checklist, with Gate Verification stated as "not applicable — no runtime code";
  - the requirement → evidence map (§3 and §5 → files and checks);
  - the order: Skill 1 → validation 5.1, then Skill 2 → 5.2, then Skill 3 → 5.3, then D1–D3, then §6.
- **Implementation in that order.** One task-branch commit per Skill is allowed.
- If the harness asks permission for an edit under `.claude/skills/`, the attended Owner answers it. A denial or a
  safety-classifier block is STOP-6.
- **Codex read-only review** of the actual diff, plus the §5 / §6 evidence (steps 8–9).
- **One full `qa:offline` at the end** (step 10): PASS, 63 suites. It runs only when no other full suite is running
  on the laptop.
- `review.md` with `## Backlog reconciliation` (none) and `LAND-EVIDENCE`. Then the final Codex check (step 12).
- **Steps 13–16:**
  - step 13: task-branch commit and integrity check;
  - step 14: `land-request`, then STOP for the Owner LAND (§0.8);
  - after the Owner's fast-forward: push via `push-request` and the Owner's line;
  - `cleanup task/pt-skills-v1`.

## 8. STOP conditions (in addition to STOP-1..6)

- `/plan` not completed before the first file write;
- any file outside §4, or any change to `.claude/rules/**`, `.claude/hooks/**`, `.claude/settings*`, `AGENTS.md`,
  `CLAUDE.md`, `BACKLOG.md`, `qa/**`, product files or another Skill;
- V1-OS missing any of the three historical couplings;
- V1-AO missing any Slice A AI-facing location, or the banned-term check not behaving as specified;
- V1-BQ leaving a recorded incident (I-1 … I-4) uncovered;
- V2-AO not matching the answer key;
- `browser-integrity-qa` losing `disable-model-invocation: true` or its read-only boundary;
- any Skill instruction that would start a live request, write an approval record, commit or push;
- §6 finding a restated governance rule that cannot be reduced to a reference;
- the full `qa:offline` failing, or its count differing from 63;
- `branch-dev` moved by anything other than brief-only commits before the Worker starts (re-pin).

## 9. Definition of Done

- The 10 Skill files exist exactly as §4, meeting §3.
- V1-OS, V2-OS, V3-OS, V1-BQ, V2-BQ, V1-AO and V2-AO PASS.
- D1–D3 are recorded.
- §6 is PASS (references only).
- One full `qa:offline`: PASS, 63 suites.
- Codex has no unresolved Class I finding.
- `review.md` is complete.
- Owner-LANDed, pushed and cleaned.

## 10. Execution cost

- **Measured after Stage 2:** a full `qa:offline` takes 11.4 min on the laptop (63 suites; Stage 1: 73.5 min). This
  is why the task waited for Stage 2.
- **One full run in total:** §0.2 removes the step-0 pre-edit run, which is safe here because no suite or product
  file changes.
- The rest of the task is reading and writing (≈ 2–3 h), with no heavy process.
- **Resource rule:** the one full run never overlaps Worker B's full run.
- **Under the proposed Stage 3 tiers**, a task like this would need only a light tier. Until those tiers exist, the
  one full run stays.
