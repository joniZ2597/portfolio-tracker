# Brief: qa-evidence-changes-eol-1 — make `qa/evidence_changes_offline.js` independent of working-tree line endings (QA-only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. Drafted by MAIN, 2026-10-19 (Owner ruling "D-1 / D-2 APPROVED": D-2 = a separate task, limited to normalising line endings when reading the two evidence modules, with CRLF / LF regression evidence and planted negatives).

| | |
|---|---|
| Problem | `qa/evidence_changes_offline.js:42-43` reads `services/evidence-memory.js` and `services/evidence-changes.js` raw. On this host `core.autocrlf=true` (system gitconfig), so every checkout has CRLF working copies (`git ls-files --eol`: `i/lf w/crlf`, canonical checkout and slots). Eight planted negatives whose anchors span a newline — EC-N7, N8, N9, N12, N15, N16, N18, N21 — then fail with `anchor not found exactly once`, and the suite exits 1. Rows EC-1…EC-19 pass |
| Evidence | evidence-capture-1 step-0 and step-10 runs (`pt-wt-worker-a/work/evidence-capture-1/qa.log` lines 1 and 7: the same 8 negatives, before and after that task's edits). The suite landed in `1eef672` with `qa-offline=PASS 102`, which only an LF working copy produces. **Pre-existing on `branch-dev`; not caused by any open task** |
| Impact | Every full `qa:offline` on a normal checkout of `branch-dev` fails, so no task can pass step 10 / L9 / LAND. evidence-capture-1 waits on this task |
| Objective | The suite gives the same result on LF and CRLF working copies, with no weaker assertion |
| Backlog | **none** (no matching entry) |
| Baseline (§TS) | `branch-dev` tip at task-start, valid only if: `qa/evidence_changes_offline.js` = `2a9ce622f5ebc8f75d629aea95e8add344b6497b`; `services/evidence-changes.js` = `d086cb92eb6bf39172700c024ff004fc1e79ec39`; `services/evidence-memory.js` = `c74d64040c99936d7aee03f945818cab41da90ef`. Drafted at `14d26db` |
| Branch / slot / mode | `task/qa-evidence-changes-eol-1` · **Worker B** · **Manual**, attended |
| qa:offline | count unchanged (no new suite; 102 at `14d26db`) |
| Parallel with | evidence-capture-1 (Worker A, paused at its step 10): no shared file. One heavy run at a time |
| Scoring boundary | none touched: QA file only; no product code, no `index.html`, no `services/**` |
| Gate verification | N/A (QA-only; no runtime path) |
| Skills | `pt-offline-suite` Required (planted negatives with anchors and positive controls; count discipline) |

## §1 Files (exactly)

- `qa/evidence_changes_offline.js` — only:
  1. the two reads at `:42-43` go through one local helper that converts CRLF to LF (`text.replace(/\r\n/g, '\n')`, the rule `qa/lib/index-pins-core.js` `normalizeText` applies to `index.html`);
  2. new row **EC-20** and new planted negative **EC-N23** (§2);
  3. the header comment lists EC-20 / EC-N23.
  Every existing row, every existing negative (EC-N1…N22), every anchor text and every expected value is byte-identical.
- `work/qa-evidence-changes-eol-1/review.md`

**QA suites that read in-scope files as text:** none. No suite, pin map or fixture references `qa/evidence_changes_offline.js` (Grep at drafting: only `work/` briefs and reviews mention it).

**Forbidden:** `services/**`, `index.html`, every other `qa/` file (including `qa/run-offline.js`, `qa/lib/**` and `qa/fixtures/**`), `.gitattributes`, any Git configuration (no `core.autocrlf` or `git add --renormalize`), `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Contract and tests

| ID | Requirement | Assertion | RED first |
|---|---|---|---|
| EC-20a | The module texts the suite tests contain no CR, whatever the working-tree EOL | `S1_SRC` and `SRC` contain no `\r` | RED in the Worker B slot (CRLF working copy) before the helper; GREEN after |
| EC-20b | The negatives are EOL-independent | For a CRLF rendering of the LF module text (`lf.replace(/\n/g, '\r\n')`) passed through the helper: the result equals the LF text byte-for-byte, and every EC-N1…N22 anchor occurs exactly once in it | GREEN with the helper |
| EC-20c | Behaviour is EOL-independent | `rows()` on the module loaded from the CRLF-then-helper text equals `rows()` on the LF text (all EC-1…EC-19 identical) | GREEN with the helper |
| EC-N23 | Planted negative on the **fixture input**, not the test: the CRLF rendering fed **without** the helper | EC-20b must fail: at least the 8 newline-spanning anchors (EC-N7, N8, N9, N12, N15, N16, N18, N21) are not found exactly once | must fail; the positive control is EC-20b on the helper output |

**Regression evidence (in `qa.log` and `review.md`):**
1. RED: the unchanged suite in the CRLF slot → `FAIL` with exactly the 8 negatives above (reproduces the defect);
2. RED: EC-20a added before the helper → fails in the CRLF slot;
3. GREEN: with the helper → `EVIDENCE CHANGES OFFLINE: PASS (20 rows, 23 negatives)` in the CRLF slot;
4. LF evidence: EC-20b / EC-20c prove the LF and CRLF renderings give identical text and rows. MAIN or the Owner may additionally run the suite on an LF working copy, but this is not required.

**Invariants:** no assertion is loosened; the 22 existing negatives each still fail their named rows; no product file changes; the suite count is unchanged.

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS; the process check (the Bash `wmic process where "name='node.exe'" get ProcessId,CommandLine` listing — never PowerShell in a slot) → step-0 `qa:offline` (expected FAIL with exactly this suite, recorded); `plan.md` with the CLAUDE.md four items (Gate Verification N/A, QA-only) |
| S1 RED | regression evidence 1–2 |
| S2 GREEN | the helper + EC-20 / EC-N23; regression evidence 3–4 |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` **PASS** (count unchanged) |
| 11–13 | `review.md` (line-ending byte audit of the edited file; `## Backlog reconciliation` none; exactly one line at column 1 `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`, written only after step 10, the land-tests and Codex pass), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12; this task lands **before** evidence-capture-1 resumes |

**STOP for:** any change outside §1; an existing row / negative / anchor changed; any other suite failing at step 10; any guard denial except an AGENTS.md form denial (reissue once in compliant form, logged in `review.md`, reported to MAIN); a second concurrent heavy run.

**Coordination:** Worker B reports `ACK-ASSIGN`, `PROGRESS`, `GATE`, `STOP` and `RESULT` to MAIN (`SendMessage`) under the handoff pilot; MAIN records them in `C:\Users\Owner\Documents\Pulse-Planning\handoffs\qa-evidence-changes-eol-1.md`. A message never approves a gate.

## §4 Definition of Done

1. EC-1…EC-20 and EC-N1…EC-N23 PASS in a CRLF working copy, with the regression evidence of §2 recorded.
2. `qa:offline` PASS at step 10 with the step-0 count.
3. Only `qa/evidence_changes_offline.js` (and `review.md`) changed; the existing assertions are byte-identical.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/qa-evidence-changes-eol-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/evidence_changes_offline.js
node qa/evidence_memory_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/qa-evidence-changes-eol-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/qa-evidence-changes-eol-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the `wmic` process listing before each heavy run; `git ls-files --eol qa/evidence_changes_offline.js` for the byte audit; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.
- **D (never):** PowerShell in the slot; `node -e` / `-p`; any Git config change.

**§UER:** ATTENDED-ONLY. **§L:** no partial land.

<!-- land-scope:begin -->
qa/evidence_changes_offline.js
work/qa-evidence-changes-eol-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/evidence_changes_offline.js
node qa/evidence_memory_offline.js
<!-- land-tests:end -->
