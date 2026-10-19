# Brief: scan-action-gate-breakdown — land the Capability Breakdown for the scan action gate (docs only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below. DRAFT by the Planner (2026-10-19) for MAIN's review; not approved, not committed, not staged. Nothing in it authorizes a gate. Order of events: the Owner's R11 brief approval and the brief-only commit (Bootstrap / MAIN steps, AGENTS.md "task folder" section) come first; the Worker starts only after that commit exists, so the Worker steps in §3 begin at step 0 and contain no brief-request.

| | |
|---|---|
| Problem | `scan-action-gate-1` triggers the Domain-logic rule of AGENTS.md "Capability Breakdown" (it changes Actionable Take and a category mapping), so a Breakdown with a `## Domain logic` section must exist before its brief. The text exists only in `Pulse-Planning`. AGENTS.md gives no standing allowance for `work/<capability>/breakdown.md`: a task that owns it must land it |
| Objective | `work/scan-action-gate/breakdown.md` exists on `branch-dev`, byte-identical to the text embedded in §2, and conforms to the Breakdown shape rules |
| Source text embedded in §2 | `Pulse-Planning/planner/scan-action-gate-breakdown/breakdown.fixed.md`, git blob `718bf5938e4dc2d86508ca010de5aac59de712d6`, sha256 `71fcc4e34b600f2de53d4b88712278720756b0c4db75478c71d3dec86a2b46fb` (LF, 94 lines, 62 outside Domain logic). It derives from MAIN's draft `Pulse-Planning/scan-action-gate-1/breakdown.md`, sha256 `23678e6f75ceae67c18fe9f2c51385517438e35026daf0566137e67aaa5fce0e`, with only the boundary fixes of §2a |
| Backlog | **none** (no matching entry; the parent task has none either). No `BACKLOG.md` edit. A stale entry noticed on the way is a `[backlog] — pending routing` lesson |
| Baseline (§TS) | `branch-dev` tip at task-start (checked by the Planner 2026-10-19: `branch-dev` = `origin/branch-dev` = `612f385`; neither `work/scan-action-gate/` nor `work/scan-action-gate-1/` exists there). Valid only if `work/scan-action-gate/` does not exist and `work/scan-action-gate-1/` does not contain `breakdown.md`. No code blob matters (docs only) |
| Branch / slot / mode | `task/scan-action-gate-breakdown` · **first free slot (Worker B expected)** · **Manual**, attended |
| qa:offline | count unchanged (no new suite) |
| Parallel with | any task: no shared file. One heavy run at a time |
| Scoring boundary | none touched. No code, no `index.html`, no `qa/`, no pin map |
| Gate verification | N/A (docs only; no runtime path) |
| Skills | none required |

## §1 Files (exactly)

- `work/scan-action-gate/breakdown.md` — new; content exactly §2
- `work/scan-action-gate-breakdown/review.md`

**QA suites that read in-scope files as text:** none (Grep at drafting: no `qa/` suite reads a `breakdown.md`; the hits for "breakdown" in `qa/` are comments and unrelated variable names). **Re-check at step 0** and record the result; any suite that lints Breakdown shape makes the §2a items blocking.

**Forbidden:** `BACKLOG.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `index.html`, every `qa/**` and `services/**` file, `work/scan-action-gate-1/**` (the child brief is a separate task), `package*.json`, any Git configuration.

## §2 Content (normative)

The file `work/scan-action-gate/breakdown.md` is exactly the text between the two `<!-- breakdown:begin -->` / `<!-- breakdown:end -->` markers below (the marker lines are not part of the file). It ends with the final newline of its last table row. LF line endings.

### §2a Boundary fixes applied to MAIN's draft (the only differences)

| # | Where | Change | Rule |
|---|---|---|---|
| F-1 | Current / Change Map, Client row | function name removed ("the scan scoring step in `index.html`") | the Breakdown boundary allows one-file component names, not function names |
| F-2 | Change Map, QA row | suite and test-ID letters (NS / TC / HL / DC / HY / TS) and the function name removed; the cell, which named two verbs (`new` and `modify`), now starts with the single word `modify` | no test IDs outside Domain logic; `Change` starts with exactly one of `none` / `new` / `modify` / `read` |
| F-3 | Change Map, every `Change` cell | the bold markers around the leading word are removed so each cell begins with the word itself (`modify` or `none`) | same |
| F-4 | Not in v1, first bullet | `renderMainPanel` and the code expression `${item.action …` replaced by "the main ticker panel" and "when the action is empty" | no function names or code |
| F-5 | Not in v1, last bullet | `.startsWith` removed | same |

Nothing else is changed: Outcome, Decisions, Unknowns, Split / Dependencies, the vocabulary and every Domain-logic row are verbatim. **Known open point for MAIN (not applied):** §5 still says "No dependency on an unlanded task"; the child task now also runs after `evidence-capture-1` (shared `index.html`, pin map and the capture suite's whole-file hash). The Breakdown's "shares `index.html` and the pin map … not parallel" sentence already covers the ordering; adding a named dependency is optional and would be a text change to the embedded block (new hash). **Intent, stated for the reader:** this task is deliberately landed first so that the child brief can cite an existing parent; the sentence "No dependency on an unlanded task" is read as "the child depends on nothing except this Breakdown and the ordering above". The embedded wording is kept verbatim.

### §2b Conformance checklist (the Worker verifies each and records it in `review.md`)

1. Six sections plus `## Domain logic` are present in order: Outcome · Current / Change Map · Decisions · Unknowns / Gaps · Split / Dependencies · Not in v1 · Domain logic.
2. The Change Map has exactly nine rows (Client · Server functions · Storage / schema · Scores / Actionable Take · Persistence · Gates / environment · QA · Deploy / external · Docs), and each `Change` cell begins with exactly one of `none` / `new` / `modify` / `read`.
3. 62 lines outside `## Domain logic` (limit 80): lines 1–62 of the file, i.e. everything before the `## Domain logic` heading on line 63, including the separator blank line 62; the file has 94 lines in all.
4. No function name in the Change Map or Not-in-v1 sections.
5. Domain logic trigger is answered by the presence of the `## Domain logic` section (Actionable Take affected); the "Domain logic: none, engineering-only" line is correctly absent.
6. Blob id of the staged file equals `718bf5938e4dc2d86508ca010de5aac59de712d6` (`git rev-parse :work/scan-action-gate/breakdown.md` after `git add`).

### §2c The text

<!-- breakdown:begin -->
~~~~markdown
# Capability breakdown: Scan action gate (setup → action enforcement)

> Created 2026-10-19 from the MAIN Phase 1 scoring diagnosis and the Owner rulings DR-1 / DR-2 /
> DR-3, D1–D11, F1, Q1–Q3. Child task: `work/scan-action-gate-1/` (this capability's only v1
> child). **Where this file and the approved brief differ, the brief wins.**

## 1 · Outcome

The scan's Actionable Take action always fits the deterministic technical setup for setups 1–7.
An invalid or unsupported AI action is never turned into another add; AI `trim` / `avoid` risk
warnings are kept; the deterministic setup is the only setup the product uses. Scores are not
changed by any new logic. **Known limitation (D11-D):** on `unknown` the AI action still passes
through unchanged — this is **not** complete eight-setup enforcement.

## 2 · Current / Change Map

| Surface | Today | Change |
|---|---|---|
| Client | the scan scoring step in `index.html` gates the action for `extended_near_ath` and `below_key_mas` only; keeps the AI setup claim when the deterministic setup is `unknown` | modify — action gate for setups 1–6 inside that scoring step; DR-2 setup authority |
| Server functions | not involved | none |
| Storage / schema | `pt_results` item shape | none — same fields; new scans may store a different `action` / `technical_setup` value |
| Scores / Actionable Take | AI score + four existing clamps; action prompt-only for 6 setups | modify — Actionable Take action for setups 1–6; **no score logic added** (D10 edge accepted) |
| Persistence | saved results restored as stored | none — no migration (D8); legacy results keep their stored action until rescan |
| Gates / environment | no flag | none — Gate Verification feature flag N/A (Owner Q2) |
| QA | offline suites pin the scan scoring step or the whole page file | modify — the pinned digests are re-pinned and the pin map regenerated; a new offline suite covers the gate |
| Deploy / external | none | none — no live AI call, no DEV scan in this task |
| Docs | prompt contract lists fewer actions than the code accepts | none — the prompt is unchanged (Q1 = X); the safety exception is documented in the brief and a code comment |

## 3 · Decisions

All Owner-answered 2026-10-19 (see Domain logic for DR-1 / DR-2):
- **DR-3:** no score manipulation; prompt and ETF recalibration deferred; missing action chips are a
  separate UI issue.
- **Q1 = X:** prompt unchanged; documented safety exception (below). **Q2:** feature flag N/A.
- **D2** keep AI `trim` / `avoid` · **D4** `breakdown_risk` hold → `avoid` · **D6** trim + lowercase,
  else unrecognised · **D7** console-only override log · **D8** new scans only · **D9 / D10** DR-2
  and its 62-cap consequence accepted · **F1** `extended_near_ath`: `hold` → `hold_wait`.
- **D11 = D:** the `unknown` gate (Q3) is **not** in this task; follow-up D11-A owns it.

## 4 · Unknowns / Gaps

None blocking v1. Known gaps, all routed out (Not in v1). Per-ticker causes of the observed
PLTR / IGV / MSTR / ARM results stay unevidenced (no raw AI responses exist); this capability fixes
the structural path, not a named ticker.

## 5 · Split / Dependencies

One child: `scan-action-gate-1` (this folder). No dependency on an unlanded task. It shares
`index.html` and the pin map with any concurrent `index.html` task — not parallel with one.

## 6 · Not in v1

- **D11-A (required follow-up):** on `unknown`, suppress the action **and** change the main ticker
  panel so Key Risk, Conflict, Invalidation, Bias and Entry Zone still render when the action is
  null (today the whole block hides when the action is empty).
- Missing action chips in the portfolio row / research detail panel (allowlist `buy` / `hold_wait`
  / `avoid` only) — separate UI issue.
- Prompt-contract alignment, AI score calibration, ETF-specific calibration (DR-3, deferred).
- R10-E guard false positive — separate governed docs task registers BACKLOG entry 39 (Owner B).
- The existing `extended_near_ath` gate throws on a truthy non-string action — recorded, not fixed
  here.

## Domain logic

**Vocabulary.** *Setup* — the eight deterministic `classifyTechnicalSetup` values. *Action enum* —
`hold_wait`, `hold`, `add_on_pullback`, `add_on_reclaim`, `add_on_breakout`, `trim`, `avoid`; `buy`
is recognised as an add. *Add* — `add_*` or `buy`. *Risk warning* — `trim` or `avoid`.
*Unrecognised* — missing, null, non-string, or any string not in the enum after trim + lowercase.

**Inclusion / boundary.** Applies to new scans, non-failed items (`_aiUnavailable !== true`) only.
Setups 1–6 are gated by DR-1; setup 7 keeps its existing gate unchanged; `unknown` is not gated.

**Precedence.** The existing `extended_near_ath` / `below_key_mas` gates and clamps run first,
unchanged; the DR-1 gate runs after them. A valid AI action passes in canonical (lowercase) form.
An invalid one becomes the setup's single fallback. The code never chooses `trim`.

**Safety exception (Q1 = X).** The code accepts more than the unchanged prompt lists, only in the
safer direction: `hold_wait` for setups 4–5 and the AI's own `trim` / `avoid` for setups 1–5.

| Ruling | Rule | Positive example | Negative / boundary example | Test |
|---|---|---|---|---|
| **DR-1 row 1** `extended_near_ath` | allowed `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait`; **`hold` → `hold_wait` (F1)** | `trim` stays `trim` | SG-1, SG-4 |
| **DR-1 row 2** `healthy_uptrend_near_ath` | allowed `hold_wait` `add_on_pullback` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait` (never `add_on_pullback`) | `add_on_pullback` stays | SG-1, SG-3 |
| **DR-1 row 3** `healthy_uptrend` | allowed `hold` `add_on_pullback` `add_on_breakout` `trim` `avoid`; fallback `hold` | `add_on_reclaim` → `hold`; `hold_wait` → `hold` | `add_on_breakout` stays | SG-1, SG-3 |
| **DR-1 row 4** `pullback_in_uptrend` | allowed `add_on_reclaim` `add_on_pullback` `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_breakout` → `hold_wait`; `hold` → `hold_wait` | `add_on_reclaim` stays | SG-1, SG-3 |
| **DR-1 row 5** `support_test` | allowed `add_on_pullback` `hold_wait` `trim` `avoid`; fallback `hold_wait` | `add_on_reclaim` → `hold_wait`; `buy` → `hold_wait` | `add_on_pullback` stays | SG-1, SG-3 |
| **DR-1 row 6** `breakdown_risk` | allowed `trim` `avoid`; fallback `avoid` (D4) | `add_on_pullback` → `avoid`; `hold_wait` → `avoid` | `trim` stays (never forced to sell, never fabricated) | SG-1, SG-4 |
| **DR-1 row 7** `below_key_mas` | existing gate, unchanged: every action → `avoid` | `trim` → `avoid` | — | SG-2 |
| **DR-1 row 8** `unknown` | **not gated (D11-D)**; AI action unchanged — known limitation | `add_on_breakout` stays `add_on_breakout` | — | SG-5a |
| **DR-1 D6** normalisation | trim + lowercase before matching; output is canonical | `' Add_On_Pullback '` on row 2 → `add_on_pullback` | `strong_buy` / `null` / `7` on row 2 → `hold_wait` | SG-1 |
| **DR-1 R3** scope | failed items untouched | `_aiUnavailable` item: no `action` key | — | SG-7 |
| **DR-2** setup authority | `technical_setup` = deterministic value; `unknown` when classification is `unknown` | AI claims `healthy_uptrend`, code `unknown` → `unknown` | code `support_test` → `support_test` whatever the AI said | SG-5b |
| **DR-2 D10** cap consequence | no 62 cap from an AI-claimed `extended_near_ath` when the code says `unknown` | AI claim + score 90 + code `unknown` → score 90 | code `extended_near_ath` + 90 → 62 (unchanged) | SG-6 |
| **DR-3** no score logic | the gate writes only `action`; DR-2 writes only `technical_setup` | every non-action field equals the reverted function | D10 case excluded (SG-6) | SG-8 |
~~~~
<!-- breakdown:end -->

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS (the two paths absent); the process check (Bash `wmic process where "name='node.exe'" get ProcessId,CommandLine`; never PowerShell in a slot) → step-0 `qa:offline` (PASS expected: `qa-evidence-changes-eol-1` landed at `612f385`; a failure is recorded and reported to MAIN); re-check the "suites that read text" Grep; `plan.md` with the CLAUDE.md four items (Pattern Auditing: an earlier landed Breakdown or the AGENTS.md shape rules; State & Boundary Isolation: docs only; Gate Verification N/A; Definition of Done = §4) |
| 1 | Write `work/scan-action-gate/breakdown.md` from §2c with the Write tool (not retyped: copy the block between the fences; build any scratch under `/tmp/pt-scan-action-gate-breakdown/`); byte audit: LF only (`git ls-files --eol` after `git add`), no CRLF rewrite of the Edit/Write tool; checklist §2b items 1–6 |
| 8 | Codex round one (diff review): confirms only the two §1 files, the text equals §2c, the boundary rules hold |
| 10 | process check → full `qa:offline` PASS (count unchanged) |
| 11–13 | `review.md` (checklist results; `## Backlog reconciliation` none; lessons; exactly one line at column 1 `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`, written only after step 10, the land-tests and Codex pass), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP for:** any change outside §1; a text difference from §2c; a Breakdown-shape lint in `qa/` that the text fails; any guard denial except an AGENTS.md form denial (reissue once in compliant form, log it in `review.md`, report to MAIN); a second concurrent heavy run.

**Coordination:** the Worker reports `ACK-ASSIGN`, `PROGRESS`, `GATE`, `STOP` and `RESULT` to MAIN under the handoff pilot; a message never approves a gate.

## §4 Definition of Done

1. `work/scan-action-gate/breakdown.md` has blob id `718bf593…2d6` and the §2b checklist passes.
2. Only the two §1 files changed; `qa:offline` PASS with the step-0 count.
3. The known-limitation wording ("not complete eight-setup enforcement") is present in the landed file.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git ls-files --eol work/scan-action-gate/breakdown.md
git rev-parse :work/scan-action-gate/breakdown.md
node qa/guard_integrity_check.js --task task/scan-action-gate-breakdown --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/scan-action-gate-breakdown --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/scan-action-gate-breakdown
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

## §PEP Execution preflight

| Class | Items |
|---|---|
| **A (allowed, no prompt expected)** | the git read-only lines of the card; `--print-record`; `npm run qa:offline` after the process check; `node qa/index_pins_offline.js`; Read / Write / Edit tools on the two §1 files; Grep |
| **B (expected prompts)** | `git add <the two explicit §1 paths>`; the Bash `wmic` listing before each heavy run; `git ls-files --eol`; `codex exec --sandbox read-only <prompt>` |
| **C (Owner)** | R11 on this brief; the step-13 commit approval if prompted; LAND; PUSH |
| **D (never)** | PowerShell in the slot; `node -e` / `-p`; any Git configuration change; editing any file outside §1; `curl`, `WebFetch`, `netlify` |

## §UER Execution readiness

**ATTENDED-ONLY.**

**§L:** no partial land.

<!-- land-scope:begin -->
work/scan-action-gate/breakdown.md
work/scan-action-gate-breakdown/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/index_pins_offline.js
<!-- land-tests:end -->

**Note on land-tests:** a docs-only task has no targeted suite; the gate is the full `qa:offline` at step 10. The one line above is a cheap smoke check that no pinned file moved (the task touches none). `LAND-EVIDENCE` `targeted=PASS` means this line passed.
