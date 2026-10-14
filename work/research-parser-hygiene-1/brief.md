# Task brief: research-parser-hygiene-1 — keep real catalysts, drop bare dashes, read "PT $X to $Y" correctly (CB-1b: PA-S06, PA-17, PA-S07)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-14). Swept at `branch-dev` = `origin/branch-dev` = `9c4bff4`. Placed only on the Owner's R11 approval of this exact hash, after independent Codex review.

| | |
|---|---|
| Problem (reproduced at `9c4bff4`) | In `parsePerplexityContext`: <ul><li>**PA-S06 (Medium):** a catalyst that starts with "-" or "Unknown" is treated as NONE and the whole field is dropped. `BEARISH: -5% guidance cut for Q4` → no bearish catalyst, and `_allNone` true. `MACRO: Unknown impact of new tariffs on margins` → dropped.</li><li>**PA-17 (Low–Med):** a bare `-` / `—` is kept as a catalyst.</li><li>**PA-S07 (Low–Med):** `Goldman raised PT $180 to $200` → target **180**. `from $180 to $200` already gives 200.</li></ul> |
| Objective | <ul><li>`NONE` / `N/A` at the start of a value still mean none.</li><li>`unknown` and dashes mean none **only when they are the whole value**.</li><li>`PT $X to $Y` (no "from") → target Y, from-target X.</li><li>`by $10 to $300` (a change amount) stays target 300 with no from-target.</li></ul> Nothing else changes |
| Source | Correction backlog CB-1b (`CORRECTION-BACKLOG.md` ranks 14, 27, 34); `FINDINGS-REGISTER.md` PA-S06, PA-17, PA-S07 |
| Backlog | **none** (audit correction batch). No `BACKLOG.md` edit |
| Baseline / start (§TS) | Start at the current tip T. Valid only if `qa/analyst_parser_offline.js` (blob `fd2624ea…`) is unchanged and both §2 anchors occur exactly once in `index.html`; otherwise HOLD |
| Branch / slot | `task/research-parser-hygiene-1`, **Worker A** |
| Mode | **Manual** (`index.html`) |
| qa:offline | step-0 count **+1** (`qa/research_parser_hygiene_offline.js`) |
| Parallel with | `news-token-collision-1` (Worker B): **no shared file**. One heavy run at a time (AGENTS process check) |
| Scoring boundary | No scoring code is touched. `analyzeChunk`'s separate 7B-3B3 none-test (used only for the Perplexity retry heuristic on `earnings`) is **not** changed. Effect: the AI prompt now receives catalysts that were wrongly dropped, which is the purpose of the fix |

## §1 Files (exactly)

- `index.html` — **only** inside `parsePerplexityContext` (§2)
- `qa/fixtures/index-pins.json` — `node qa/tools/index-pins.js --update` (only `parsePerplexityContext` and the file digest change)
- `qa/research_parser_hygiene_offline.js` (new)
- `work/research-parser-hygiene-1/review.md`

**Forbidden:**
- every other function (incl. `analyzeChunk`, `orchestrate`, `enforceScoreConsistency`);
- `qa/analyst_parser_offline.js` and its fixtures (must pass unchanged);
- `netlify/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Exact change (anchors at `9c4bff4`)

| # | From (exactly once) | To |
|---|---|---|
| E-1 | `const NONE_RE = /^(NONE\|N\/?A\|-\|—\|unknown)\b/i;` | `const NONE_RE = /^(?:(?:NONE\|N\/?A)\b\|unknown\.?$\|[-—–]+\.?$)/i;` plus a two-line comment |
| E-2 | before `const _AA_RULE_C = new RegExp(` | add `const _AA_RULE_A2 = new RegExp('(?<!\\bby\\s{0,3})' + _AA_AMT + '\\s+to\\s+' + _AA_AMT, 'i');` |
| E-3 | after the `_AA_RULE_B` branch in `_aaParseItem` | `else if (hasTW && (m = _AA_RULE_A2.exec(item))) { target = _aaNum(m[2]); ptFrom = _aaNum(m[1]); }` |

## §3 QA — new suite `qa/research_parser_hygiene_offline.js`

Extract `parsePerplexityContext` exactly as `qa/analyst_parser_offline.js` does.

| Row | Input | Expect |
|---|---|---|
| RP-1 | `BEARISH: -5% guidance cut for Q4` | one bearish catalyst; `_allNone` false |
| RP-2 | `MACRO: Unknown impact of new tariffs on margins` | one macro driver |
| RP-3 | `BULLISH: -` / `BEARISH: —` / `– ` / `--` | none; `_allNone` true when everything else is NONE |
| RP-4 | `NONE`, `None reported`, `N/A`, `NA`, `Unknown`, `unknown.` | none (unchanged behaviour) |
| RP-5 | `ANALYST_ACTIONS: Goldman raised PT $180 to $200 (Oct 2)` | target 200, from 180 |
| RP-6 | `raised PT from $180 to $200`; `PT to $200, from $180` | unchanged (200 / 180) |
| RP-7 | `raised PT by $10 to $300` | target 300, from-target null (unchanged) |
| RP-8 | `$1.2B to $1.5B revenue` with no target word | no target |
| RP-N1…N3 | planted negatives on a mutated copy (each anchor exactly once), each must fail: <ul><li>E-1 reverted → RP-1 / RP-3;</li><li>E-2 / E-3 removed → RP-5;</li><li>the `by` look-behind dropped → RP-7</li></ul> | — |

**Must stay green:**
- `node qa/analyst_parser_offline.js`: **57 / 57, unchanged file**, all 42 fixture cases deep-equal;
- `qa/no_synthetic_score_offline.js`;
- `qa/tase_units_offline.js`;
- `qa/index_pins_offline.js`;
- `node qa/tools/index-pins.js --check`.

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | write the suite; RP-1, RP-2, RP-3 and RP-5 fail on the current source; record |
| S2 GREEN | E-1…E-3; `index-pins --update`; all rows + negatives + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1 / §2;
- any change to `analyst_parser_offline` expectations;
- a denied protected action or an integrity FAIL.

## §5 Definition of Done

1. RP-1…RP-8 and RP-N1…N3 pass.
2. The must-stay-green suites pass unchanged.
3. Step 10 PASS at step 0 + 1.
4. Codex: no unresolved Class I.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/research-parser-hygiene-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/research_parser_hygiene_offline.js
node qa/analyst_parser_offline.js
node qa/no_synthetic_score_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/research-parser-hygiene-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/research-parser-hygiene-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/research_parser_hygiene_offline.js
work/research-parser-hygiene-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/research_parser_hygiene_offline.js
node qa/analyst_parser_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
