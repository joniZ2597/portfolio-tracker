# Task brief: governance-update-2 — Execution preflight / readiness rules (AGENTS.md) and permission hardening (settings.json)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. **Status: FINAL, HELD** (COWORK, 2026-10-12, swept at `eb362b0`; A1–A4 applied). Re-pinned and placed only in the A2 window (both active MASTERs closed) and on Main Control's separate placement authorisation of the exact hash. If the tip moved, the Baseline row is re-verified first; this brief's content does not change unless a Baseline item fails.

| | |
|---|---|
| Rulings | Main Control 2026-10-12: **GU-1** (AGENTS execution preflight + execution readiness), **GU-2** (settings hardening G-PEP-2/3, G-UER-2…5, exact diff), **GU-5** (active MASTERs unaffected); **A1** variant B (held G-1 + GU-2), **A2** timing, **A3** V1…V6 verification |
| Backlog | **none** (governance; BACKLOG 29 is a separate prerequisite, not closed here). `BACKLOG.md` not in scope |
| Baseline | the `branch-dev` tip at this brief's commit. **Valid only if** at that tip: `AGENTS.md` blob LF sha256 = `b1b61aa0fa4f529a52bcf8598914e1a2f090e04b7cadfaeacdeddc5a598a11ca` (the variant-B candidate already contains the held G-1 insertions, so G-1 is applied by this task and not separately); `.claude/settings.json` blob = `39b17320f403451467eae35c9f8f1665383bcd727cb0c4bc1c15cbd659b05de3`; `.claude/hooks/*` and `qa/guard_integrity_check.js` unchanged since `eb362b0`. Otherwise HOLD and re-pin |
| Branch / slot | `task/governance-update-2`, **Worker B** (lane B; no `index.html`). **Timing (A2):** task-start only when `market-data-1` **and** `surface-1b` are LANDed, pushed and cleaned, and no other task is in flight. Worker A's next MASTER is task-started on a base **after** this task's LAND. No running Worker ever receives the new settings, `AGENTS.md` or AH suite mid-task |
| Mode | **Manual** (protected paths via step 13a) |
| qa:offline | **no new suite; count unchanged** |
| Parallel with | **none.** It runs alone, so no active Worker is affected by the configuration change (A2). Worker A may prepare, but does not task-start, until this task LANDs. **One heavy / forced run at a time** |

**Objective.** Make the GU-1 rules part of `AGENTS.md`, and make the GU-2 permission rules technically effective in `.claude/settings.json`, with the auto-mode-hardening suite (AH) asserting the new settings exactly. Hooks, `pt-land.js`, the integrity module and every other file are unchanged.

## 1. Exact target contents (flat candidates; LF — committed blobs must equal these bytes)

| Target | Candidate | LF sha256 |
|---|---|---|
| `AGENTS.md` — **variant B (selected, A1)**: held G-1 (I-1…I-3) + GU-2 (I-4…I-6) + consistency fixes C1 / C2 / C4 | `AGENTS.g1-plus-gu2.lf.md` | `3de6f56d4de0b891b51a96b1e550e762136c92ff3c5fccfc90ea41177606ec76` |
| `.claude/settings.json` | `settings.gu2.lf.json` | `48172673ed8a58827593af9cd75296655a02ffaea57a0af0852b30d9f5ff3025` |

**AGENTS variant: B** (Main Control A1, 2026-10-12).

**`AGENTS.md` changes (variant B vs current: +66 / −1 lines):**
- From the held G-1 package (unchanged):
  - multi-slice Master briefs convention;
  - step-0 baseline reuse — C4 adds the four E1 SKIP lines to its environment condition;
  - STOP-2 Owner-ruled resolution.
- Task brief convention: **Execution preflight block** and **Execution readiness block** (ATTENDED-ONLY / UNATTENDED-READY).
  - The scratch rule names the step-13a `<os.tmpdir()>/pt-<id>/protected/` exception (C1).
- Worker mode policy: **attended Auto vs unattended readiness**. Written rules and the Auto classifier are never security boundaries.
- Updated auto-approved list plus the always-prompt list. Boundary wording (C2): the hook and `deny` rules block; `ask` rules force a prompt in every mode; written rules and the classifier are not boundaries.

**`.claude/settings.json` changes (minimal diff):**

| Change | Entries |
|---|---|
| `ask` += | `Bash(node .claude/hooks/pt-land.js land *)`, `Bash(node .claude/hooks/pt-land.js push)`, `Bash(netlify env:get*)`, `Bash(netlify env:list*)`, `Bash(curl *)`, `Bash(wget *)`, `PowerShell(Invoke-WebRequest *)`, `PowerShell(Invoke-RestMethod *)`, `PowerShell(iwr *)`, `PowerShell(irm *)`, `WebFetch` |
| `allow` −= | `Bash(netlify env:list*)`, `Bash(netlify env:get*)` (moved to ask) |
| `allow` += | `Bash(node qa/tools/index-pins.js --check)`, `Bash(node qa/tools/index-pins.js --update)`, `Bash(node qa/tools/index-pins.js --diff *)`, `Bash(sha256sum *)`, `Bash(ls *)`, `Bash(diff *)`, `Bash(cmp *)` |
| permissions += | `"disableBypassPermissionsMode": "disable"` |

- **Counts:** allow 49 → 54, ask 32 → 43, deny 50 (unchanged).
- **Unchanged:** `defaultMode` (`default`), hooks block, matcher.

## 2. Slices (continuous; automatic continuation on PASS)

### S1 — AH suite expectations (ordinary file) + candidate validation

`qa/auto_mode_hardening_offline.js`:
- **New constants:** `GU2_ALLOW_ADDED` (7), `GU2_ALLOW_REMOVED` (2), `GU2_ASK_ADDED` (11).
- **Expected sets:** the AH-8 expected sets become `EXPECT_ALLOW = (current) − GU2_ALLOW_REMOVED + GU2_ALLOW_ADDED` and `EXPECT_ASK_R11 = (current) + GU2_ASK_ADDED`.
- **`settingsProblems`** also requires `permissions.disableBypassPermissionsMode === 'disable'`.
- **`appliedSettings()`** is updated to the same shape.
- **New planted negatives** (each must be rejected):
  1. any one `GU2_ASK_ADDED` entry missing;
  2. `Bash(netlify env:get*)` back in `allow`;
  3. the bypass key absent or `"enable"`;
  4. `Bash(node .claude/hooks/pt-land.js land *)` moved to `allow`;
  5. `WebFetch` missing from `ask`;
  6. any `GU2_ALLOW_ADDED` entry in `ask`.
- All existing AH rows and negatives unchanged; the E1 machinery unchanged except the AH pin (S2).

**Validation (before any commit).** The candidate files are copied to `/tmp/pt-governance-update-2/` (sha256 checked), then:
- `AH_SETTINGS_PATH=/tmp/pt-governance-update-2/settings.json node qa/auto_mode_hardening_offline.js` → all rows PASS. This is the E1 override path: heavy rows run, no pin verdict.
- The same run with the **current** `settings.json` must FAIL AH-8 only. This proves the suite bites.

### S2 — protected application + AH pin initialisation

**Ordering rule (brief-specific, M6: more specific than the AGENTS step order).** The protected files can enter only at step 13a, and the AH pin depends on them. So this task runs:

step 13 (S1 commit) → 13a (protected commit) → AH pin-initialisation → pin commit → **step 10 on the final tree** → integrity → LAND / push.

"Before LAND, `qa:offline` passes at the final commit" is unchanged.

1. **Step 13:** commit S1 (r9).
2. **Step 13a:**
   - one manifest with `AGENTS.md` (the chosen variant) and `.claude/settings.json` as flat LF files under `<os.tmpdir()>/pt-governance-update-2/protected/`;
   - `protected-request` → **Owner PROTECTED record** → `protected-commit`;
   - verify: `git show HEAD:AGENTS.md | sha256sum` and `git show HEAD:.claude/settings.json | sha256sum` equal §1.
3. **AH pin-initialisation checkpoint** (the E1 pattern; never reported as a QA PASS):
   - run `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js` on the protected-commit tree (heavy-lane go-ahead);
   - **valid only if** every row and assertion PASSes and the only failure is the expected `re-pin required: source <64> environment <64>` (AH's source and settings changed);
   - recompute the source digest independently (scratch, `/tmp/pt-governance-update-2/`);
   - set `AH_CONTRACT_PIN` to the printed values (a pin-statement-only edit) and commit (r9).
4. **Step 10, on the final tree:**
   - full `npm run qa:offline` → PASS, count unchanged;
   - all four `E1 … SKIP` lines present, AH with the new `src12`;
   - GC-4 / FT SKIP lines unchanged.
5. **Integrity, LAND, push:** `node qa/guard_integrity_check.js --task … --root …` (record form) → R12 LAND → R12 PUSH → cleanup.

## 3. Execution preflight (GU-1 dogfood)

| Step | Item | Class |
|---|---|---|
| all | `node qa/*_offline.js`, `npm run qa:offline`, `git status / diff / show / log`, `git commit` (r9), `codex exec --sandbox read-only` | A |
| S1 | copy the candidates to `/tmp/pt-governance-update-2/` | A (Edit `//tmp/pt-*`) |
| S1 | candidates read from `_held-briefs/governance-update-2/candidate/` (outside the slot) | B — one batch |
| S1 | `AH_SETTINGS_PATH=… node qa/auto_mode_hardening_offline.js` (×2) | B (env prefix) |
| S1 | AH-10 instantiates the 7 new allow patterns against the hook — checked at `eb362b0`: the hook returns `allow` for each, in slot and canonical cwd | A |
| S2 | flat files under `<os.tmpdir()>/pt-governance-update-2/protected/` (AGENTS step 13a path) | B |
| S2 | `protected-request`, `protected-commit` | A / B · **C: Owner PROTECTED record** |
| S2 | `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js` | B · **C: heavy-lane go-ahead** |
| S2 | the scratch digest recompute (one script) | B (one prompt) |
| close | integrity (A) · `land-request` / `push-request` (A) · `land` / `push` (B, and `ask` after this task) | **C: R12 LAND / PUSH records** |

**Gates:** R11 brief record · PROTECTED record · heavy-lane go-ahead · R12 LAND · R12 PUSH. **Expected prompts:** about 6, all batched at the listed points. Slice-to-slice continuation needs no Owner input. No D items.

**Execution readiness: `ATTENDED-ONLY`** — protected paths, Owner records, and T6 / forgery not technically mitigated.

## 4. STOP (in addition to STOP-1…6)

- Any change to `.claude/hooks/**`, `qa/guard_integrity_check.js`, `qa/lib/**`, another suite or any other path.
- A committed blob hash ≠ §1.
- The AH validation not failing on the current settings (suite does not bite) or not passing on the candidate.
- The pin-initialisation checkpoint not valid.
- Any E1 line other than SKIP in step 10.
- Any GC-4 / FT pin change.
- A `settings.local.json` edit by the Worker.
- Two heavy / forced runs at once.

## 5. Files, land-scope, protected-scope, land-tests

<!-- land-scope:begin -->
qa/auto_mode_hardening_offline.js
AGENTS.md
.claude/settings.json
<!-- land-scope:end -->
<!-- protected-scope:begin -->
AGENTS.md
.claude/settings.json
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/auto_mode_hardening_offline.js
node qa/instruction_layer_offline.js
node qa/git_contract_offline.js
node qa/fixture_template_offline.js
node qa/run_offline_discovery_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory.

**Rollback:** Owner `git revert` of the task's commits in a normal terminal, plus an R12 push. AH expectations, AH pin, settings and `AGENTS.md` return together, so the E1 SKIP is valid again (`GU2-IMPLEMENTATION-PACKAGE.md` §4).
