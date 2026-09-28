# Task brief: BACKLOG reconciliation — landed entries, entry 7 status, hub-page closure, snapshot

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Baseline | 9be77177234822fefb7a403d1b5459f90578bef0 = branch-dev (main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b) |
| Branch / slot | `task/backlog-reconcile`, created from this brief's commit in Worker B (`pt-wt-worker-b`) |
| Mode | **Auto** (attended; see §8) |
| qa:offline | 50 → 50 (documentation only; no suite reads BACKLOG.md) |
| Parallel with | Worker A `task/dh-ruled-surfaces` (DH-M2b). The file sets are disjoint. |
| Status | CODE-READY on Owner approval of this brief, incl. rulings BR-1 and BR-2 |

Objective. Bring `BACKLOG.md` back in line with the repository. Record what has already landed,
restate entry 7's real remaining work, close the measured hub-page candidate, and refresh the base
snapshot. This is a documentation change only: no code, no QA-suite change, no new work item except
BR-2.

## 1. Rulings (approved with this brief)

- **BR-1 — close the `/news/latest` hub-page candidate (entry 4).** The measurement landed at
  `3fc3e61`: 35 survivors over 9 cases were all article-specific; 7 hub-class URLs were none a
  candidate, survivor or skip; neither candidate predicate dropped a survivor or changed a
  `fixtureSha256`. **No filtering-rule change.** It reopens only if a hub-class survivor appears in a
  new corpus.
- **BR-2 — add entry 29, "Remote push prevention"**, under HOLD — Owner-sequenced (§4, E8). It is the
  recorded prerequisite for unattended Auto and the Cloud Night Shift pilot.
- Entry 10's narrowing (no Risk/Reward in Scan Results; Owner ruling 2026-09-26) and every other
  existing ruling are carried as recorded — not reopened.

## 2. Implementation file set — exactly 2

```
BACKLOG.md                              edits E1–E9 (§4) only
work/backlog-reconcile/review.md        NEW — tracked task evidence
```

**QA suites that read in-scope files as text:** none. `qa/run-offline.js` and `qa/arc_registry_offline.js`
mention "BACKLOG" only in comments or unrelated literals.

## 3. Editing rules

- Change only the text named in §4.
- `BACKLOG.md` is checked out with **CRLF** line endings; keep them. No other formatting churn.
- Every commit SHA written must exist. Verify each one with `git cat-file -e <sha>^{commit}` and
  record the results in `review.md`.
- Use no wording beyond §4, except the values §4 tells the Worker to compute. Those are computed
  from Git and recorded, never estimated.

## 4. Edits

- **E1 — Base snapshot (table under "## Base snapshot").** Replace the five value cells:
  - `Normalized` → `2026-09-29`.
  - `branch-dev` → the task's actual base SHA (short), followed by "— brief-only commit for this
    reconciliation".
  - `origin/main` → "`fbec2c1` — `branch-dev` is **N commits ahead of production**". N is
    `git rev-list --count fbec2c1..<base>`.
  - `Active entries` → the count under the rule in E9. The expected value is **21**.
  - `qa:offline` → "**50** effective suites (auto-discovered, minus the denylist)". Verify it at
    step 0; a different value is STOP-2.

- **E2 — Entry 4 hub-page candidate (BR-1).** Replace the paragraph that starts
  "*Slice candidate — `/news/latest`-class hub source pages" and ends "…or reopen Worker 2." with:

  > *Hub-page candidate — **MEASURED, closed; no rule change** (`3fc3e61`, `work/s2-hub-page-measurement/`).* 35 corpus survivors over 9 cases are all article-specific; the 7 hub-class `nvidianews.nvidia.com/news/latest` URLs are none a candidate, survivor or skip, and neither candidate predicate dropped a survivor or changed a `fixtureSha256`. Reopens only on a hub-class survivor in a new corpus.

- **E3 — Entry 6 duplicate.** Delete the whole `### 6 · Technical Score v1 surfacing — **DONE**`
  block from NEXT (heading through its *Legacy refs* line). Entry 6 already appears in DONE / HISTORY
  (`**6** … — aa62aea`), which is unchanged.

- **E4 — Entry 7 status.** In entry 7, replace the paragraph starting "*What remains:* readiness
  block in `_eodBuildPacket`" (through "optional pre-export UI warning.") with:

  > *Landed:* DH-M1 readiness block + shared display table (`98d3d68`); DH-M2 U1–U8 display vocabulary (`5ad0a5f`). *Briefed:* DH-M2b — ruled words R1/R3/R4 on three render-only sites (brief `9be7717`). *What remains:* (a) R2 — usable-but-aged FX → `Current · N d old` — together with DH-M1's export reasons `fx-missing` / `fx-aged`: **needs an Owner ruling** on the age basis and on how the readiness verdict treats aged-but-valid FX; (b) R1's export/prompt-fed sites (needs-attention title, completeness reason, EOD limitation) — Manual; (c) DH-M3 pre-export warning, which must also explain that the first export after DH-M1 reads `not-representative` until each holding is refreshed once.

  Also replace the *Deps:* paragraph ("**resolve first** — two competing freshness authorities…") with:

  > *Deps:* the competing-freshness-authority question is **resolved** by DH-M0b ruling D1 (one freshness owner per domain; 2026-09-26).

  The absorbed-presentation paragraph and *Legacy refs* are unchanged.

- **E5 — Entry 9 landed.** Delete the whole `### 9 · UI hygiene bundle` block from NEXT.

- **E6 — Entry 10 landed.** Delete the whole `### 10 · Scan Results row enrichment` block from NEXT.

- **E7 — DONE / HISTORY list.** After the `**8a** … — \`9f8171d\` ·` item, insert:

  > **9** UI hygiene bundle — `bf936de` ·
  > **10** Scan Results HELD marker — `df5ad24` (narrowed by Owner ruling 2026-09-26: no Risk / Reward column or chips in Scan Results) ·

- **E8 — Entry 29 (BR-2).** Under "## HOLD — Owner-sequenced (not blocked)", after entry 16's block,
  insert:

  > ### 29 · Remote push prevention
  > **Workflow / Dev Infra** · **new 2026-09-29** · **Owner-only**
  >
  > Prerequisite for **unattended Auto** and the **Cloud Night Shift** pilot: a Worker-written script can still invoke `git` with the machine's credentials (T6), which the command-text hook cannot prevent and the integrity check only detects. Either a GitHub ruleset blocking direct pushes to `main` (and, if chosen, `branch-dev`), or Worker sessions without push-capable credentials. Owner decision and external setting — not Worker execution. Attended Auto does not depend on it.

- **E9 — Traceability count.** Replace "The 17 active entries above are exact." with "The **21**
  active entries above are exact (numbered entries in NOW, NEXT, LATER, HOLD and HOLD / EXTERNAL;
  DONE-marked entries excluded)."
  - Count after E3–E8: NOW 4 · NEXT 7, 8, 11, 12, 22 · LATER 13, 14, 15, 24, 25, 26, 27, 28 · HOLD 16,
    29 · HOLD / EXTERNAL 17, 18, 19, 20, 21 = **21**.
  - The value written in E1 and E9 is the result of this rule. A result other than 21 is STOP-2.

**Unchanged:**
- entries 8, 11, 12, 22, all LATER rows, entries 16–21 and the P-5 row;
- the VERIFY table and KNOWN HISTORICAL EXCEPTIONS;
- every other line.

## 5. QA

- **Step 0:** `npm run qa:offline` PASS 50, recorded in `qa.log`.
- **Text checks** (a scratch script outside the repo, deleted after use; results in `review.md`):
  - NEXT contains no `### 6`, `### 9` or `### 10` heading;
  - DONE / HISTORY contains `**9**` with `bf936de` and `**10**` with `df5ad24`;
  - entry 29 exists exactly once, under HOLD — Owner-sequenced;
  - every numbered entry heading or row is unique;
  - the E1 and E9 counts are equal and computed by the E9 rule;
  - every SHA written resolves to a commit;
  - `git diff --stat` touches only `BACKLOG.md`;
  - the diff hunks map one-to-one to E1–E9;
  - `BACKLOG.md` is still CRLF throughout.
- Full `npm run qa:offline` PASS 50 (unchanged).
- **QA lesson:** any check whose assertion calls something with real side effects computes its result
  once and asserts on the stored value.

## 6. Worker flow (AGENTS.md contract, attended Auto)

1. **Step 0:**
   - confirm cwd = `pt-wt-worker-b` and HEAD on `task/backlog-reconcile` at this brief's commit;
   - run the current-guard check: the branch descends from current `branch-dev` and
     `git status --porcelain .claude` is empty;
   - record the baseline.
2. **`plan.md`:** requirement→test map plus the CLAUDE.md pre-flight checklist.
   - Gate Verification: state that no gated execution path exists or changes (documentation only).
   - Definition of Done: §9.
3. Apply E1–E9, then run the text checks.
4. Worker-launched Codex read-only review (`codex exec --sandbox read-only`) on the diff.
   - Focus: every factual claim is supported by the repo, only E1–E9 changed, no ruling invented.
   - Resolve findings FIX / DEFER / REJECT.
5. Full `qa:offline`, then `review.md`, then the Codex final check on the task diff.
6. **Step 13:**
   - stage `BACKLOG.md` and `work/backlog-reconcile/review.md` with explicit paths in one call;
   - `git commit -m "docs(backlog): reconcile landed entries, entry 7 status and snapshot"` in a
     separate call (r9 gate);
   - then run:
     `node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b --base-dev <this brief's full commit OID> --task task/backlog-reconcile --since <task-start ISO> --root <canonical checkout>`
7. **STOP** and request LAND.
   - If DH-M2b lands first, the Owner rebases this branch in a normal terminal; Worker B then
     re-runs `qa:offline` and the text checks and reports.
   - The files are disjoint, so no content conflict is expected.

## 7. STOP conditions

- **STOP-1..5** per AGENTS.md, including any file outside §2, any edit outside E1–E9, or any fact
  in §4 contradicted by the repo (STOP-2 / M6).
- **STOP-6:**
  - any hook denial, Auto-mode safety-classifier block, or integrity-check FAIL;
  - any Manual fallback trigger;
  - the Owner becoming unavailable.

  Never retry in another form.
- Any touch of `index.html`, `qa/**`, `work/dh-ruled-surfaces/**`, Worker A's slot, `AGENTS.md`,
  `CLAUDE.md` or `.claude/**`.
- Any new task, ruling or status beyond §1/§4.
- Any push, merge, rebase, LAND, deploy, environment or `main` action.

## 8. Why Mode: Auto (AGENTS.md eligibility)

- Approved committed brief with explicit files and STOP conditions.
- Bounded documentation work in an ORDINARY-tier file.
- Offline QA only.
- No schema, persistence, architecture, contract, scoring or ranking change.
- No ASK/DENY file in scope.
- No environment, runtime or deploy work.
- Every disposition is ruled in §1 or recorded in the repo.
- Runs in its own slot under the current guard.
- **Attended only.** Manual or `acceptEdits` remain permitted; unattended Auto is prohibited.

## 9. Definition of Done

- E1–E9 applied exactly; the text checks pass.
- `BACKLOG.md` is the only changed product-side file, with CRLF preserved.
- Full `qa:offline` PASS 50.
- Codex: no unresolved Class I finding.
- One gated task-branch commit containing exactly the §2 files.
- Integrity check PASS.
