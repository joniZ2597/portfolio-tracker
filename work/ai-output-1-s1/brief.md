# Task brief: ai-output-1-s1 — AI reply JSON repair for syntax defects inside a field, with semantic-safety tests

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

| | |
|---|---|
| Master / slice | `ai-output-1`, slice **S1** (R-7 fix). Main Control rulings OD-1, OD-2, OD-3 (2026-10-11) |
| Backlog | Entry **38** (NVDA AI parse failure, R-7) — expected effect **`close`**. `BACKLOG.md` is in scope for the step-10a reconciliation only: entry 38's heading / status text plus one DONE line |
| Baseline | `ac8f39bbd8e868116437fd524d1c7f2d15e72f36` = `branch-dev` = `origin/branch-dev`; `main` = `fbec2c1`. **Valid at a later tip only if all three checks hold:** (1) `git diff --quiet ac8f39b <tip> -- index.html qa/fixtures/index-pins.json qa/ai_parse_repair_offline.js` exits 0; (2) the single line matching `^| 38 |` in `BACKLOG.md` (entry 38's row) is byte-identical in `git show ac8f39b:BACKLOG.md` and `git show <tip>:BACKLOG.md`; (3) `git show <tip>:BACKLOG.md` has exactly one such line. Otherwise HOLD and re-pin |
| Branch / slot | `task/ai-output-1-s1`, **Worker A** (`pt-wt-worker-a`, detached at `ac8f39b`). Bootstrap creates the branch at this brief's commit and runs `task-start` |
| Mode | **Manual** (OD-3; the AI-output parse path) |
| qa:offline | step-0 count (**77** at `ac8f39b`) → **+1** (`qa/ai_parse_repair_offline.js`, picked up by auto-discovery; `qa/run-offline.js` is not changed) |
| Parallel with | Worker B (`catalyst-evidence-2-s1`). No shared file except `BACKLOG.md`, and each task edits a different entry. **One heavy run at a time on the laptop:** step 0 and step 10 only with the Owner's heavy-lane go-ahead, never while another full run is active. If `branch-dev` moves, AGENTS 9.4 / 9.5 apply as written |
| Status | FINAL on Owner approval |

**Objective.** An Anthropic scan reply whose JSON has a **syntax defect inside a field** is parsed into the result its clean form would give. Two defects are in scope: trailing text after the object, and an unescaped quote inside a text value. Unclosed brackets after the last complete element are also handled. A reply that is still ambiguous after repair ends exactly where it ends today: the per-ticker extraction, then R-3's honest failed state. **A repair never creates, moves, overwrites or changes a field.**

## 0. Rulings and evidence (not reopened)

- **OD-1:** `ai-output-1` S1 runs before `surface-1`.
- **OD-3:** parser repair only. **No prompt change.**
- **OD-2:** R-7 is classified from the repeat pilot of 2026-10-10, without another NVDA scan. The pilot record is `_held-briefs/notebooklm-pilot/2026-10-10-repeat-consistency-pilot.md` :98–106:
  - 3 of 7 Anthropic calls failed: MRNA twice, CBOE once (recovered on retry);
  - NVDA parsed;
  - recorded errors: `Expected ',' or ']' after array element at position 6043` with `rawLen 6353 > jsonLen 6043`, and `Expected ',' or '}' after property value … line 7 column 1256` on a reply that ends `] } ] }`;
  - class: "position error inside a field" (R-7 plan §3).
- **Evidence limitation (OD-2 condition — copy it verbatim into `review.md`):**
  1. The raw replies were never stored. Only the parser's console lines exist: the `e1` message and a 120-character head and tail. Every fixture is a **reconstruction** that reproduces a recorded error signature, not the model's actual text.
  2. The evidence is three failing calls, on two tickers, in one session. NVDA, the original R-7 case, parsed that day; its original failure is assumed to be the same class, not shown.
  3. Truncation and prose replies are not excluded in general, only absent from this evidence. S1 does not claim to fix them; they keep today's behaviour.
  4. A future failure whose signature matches none of the repairs is out of scope. It is recorded as a `[backlog]` lesson, never a reason to widen this task.

## 1. Situation (read-only, `ac8f39b`)

**`index.html` `repairJSON` (:5952–5967):**
- removes trailing commas with `str.replace(/,\s*([\]}])/g, '$1')`. This is **not string-aware**: it also edits text inside string values;
- counts brackets string-aware;
- when unbalanced, cuts to the last `}]` and appends `}`.

**`parseJSON` (:5969–5994):**
- strips code fences;
- slices from the first `{` to the **last** `}`. Trailing text that contains a `}` therefore ends up inside the slice;
- then tries, in order: `JSON.parse` (console `[PT] parseJSON e1:`), `JSON.parse(repairJSON(…))`, a per-ticker regex extraction;
- if all of these fail: `[PT] parseJSON: ALL tiers failed (…)` → `{ results: [] }`.

**Callers:** `analyzeChunk` :6780 (first reply) and :6799 (retry). The failure reason `parse-fail-after-retry` is at :6846.

**Pin map:** `qa/fixtures/index-pins.json` has entries `functions.repairJSON` and `functions.parseJSON`.
- `parseJSON` holds a literal `{` inside a log string, so the extractors end it at its column-0 closing brace. This applies to `qa/lib/index-pins-core.js` and to `qa/no_synthetic_score_offline.js` `extractTopLevelFn`.

**`qa/no_synthetic_score_offline.js`:**
- runs the real `parseJSON` with `repairJSON` stubbed as identity (`buildAnalyzeChunk` :311–334);
- its NS-1 replies (`'no json here …'`, `'short'`) contain no `{`;
- NS-11 checks every map entry except its five functions.

## 2. Requirements

| # | Requirement |
|---|---|
| R1 | **Tier order unchanged.** A reply that `JSON.parse` accepts never reaches a repair. Repairs run only after `e1`, before the per-ticker extraction. The console lines `e1`, `no { found`, `falling back to per-ticker extraction`, `ALL tiers failed` and `extracted N items via fallback` keep their text |
| R2 | **Where:** inside the existing `repairJSON`, and in `parseJSON` only the minimum needed to pass the text from the first `{` to `repairJSON` (for RP-1). **No new top-level function, no new global, no change to any other function** |
| R3 | **RP-0 — string-aware trailing commas.** The trailing-comma removal applies only to structural commas, never inside a string value. This replaces today's global regex |
| R4 | **RP-1 — trailing text.** If a string-aware scan from the first `{` finds a complete, balanced top-level object followed by more non-whitespace text, the candidate is that object alone. Only characters **after** the balanced end are removed |
| R5 | **RP-2 — missing closers after a complete element.** If the text ends, ignoring whitespace, immediately after a complete value at depth > 0 — `}`, `]`, a closed string, a number or a literal — append exactly the closers implied by the string-aware bracket stack. Never applied when the text ends inside a string, after a key, after `,` or after `:`. Those cases keep today's `}]` cut and fallback |
| R6 | **RP-3 — interior quote.** Inside a string **value** (never a key), a `"` whose next non-whitespace character is not `,` `}` `]` is escaped as `\"`. **Known limitation (accepted):** an interior quote whose next non-whitespace character *is* `,` `}` or `]` (e.g. `…said "x", then…`) cannot be told apart from a closing quote and is **not** repaired. Such a reply must take today's fallback path (per-ticker extraction, else `{ results: [] }` and R-3's failed state) — the candidate fails to parse or is discarded by SC (R7). It is never accepted with altered fields. Covered by AN-6 |
| R7 | **Safety check (SC).** A repaired candidate is accepted only if: it parses; **every object in it has exactly the keys that appear as structural keys of that object in the unrepaired text** (no key created, none lost); and the number of objects carrying `ticker` equals the number of structural `"ticker":` keys in the unrepaired text. Otherwise the repair is discarded and the existing per-ticker extraction / fallback runs |
| R8 | **Numbers and literals are never created or changed by a repair.** Only these edits are allowed: insert `\` before a quote (RP-3), remove structural trailing commas (RP-0), cut text after a balanced end (RP-1), append closers (RP-2) |
| R9 | **Extractor compatibility.** `repairJSON` and `parseJSON` each still end at a column-0 `}` line. No `\n}\n` sequence occurs inside either function |
| R10 | **Pin map.** `node qa/tools/index-pins.js --diff ac8f39b` lists only `functions.repairJSON` (and `functions.parseJSON` if R2 needed a change) plus the file digest. No other function, no region, `remainderSha256` unchanged. Then `--update`, then `--check` OK |

**Not in scope:**
- the prompt text, `fetchAnthropicAnalysis`, `analyzeChunk`, `orchestrate`, `enforceScoreConsistency`, scores, Actionable Take, persistence (`pt_*` keys);
- the per-ticker extraction regex;
- the R-6 checker (K3 / K4);
- Tech Score rounding;
- any live or DEV scan.

## 3. QA

**New suite `qa/ai_parse_repair_offline.js`:**
- extracts the real `repairJSON` and `parseJSON` from `index.html` (with `qa/lib/index-pins-core.js`, column-0 rule) into a sandbox with a capturing console. No network, no file writes;
- every "clean twin" is a valid reply. Every defective fixture is that twin with exactly one reconstructed defect, **except AR-2**. AR-2 is an intentional combined-defect case: it reproduces recorded signature 1, which has text around the JSON plus missing closers (RP-1 + RP-2), and is exempt from the one-defect rule. RP-1 alone is covered by AR-4;
- every row has a **planted negative** on an in-memory copy of the functions, never on the real file.

**Tests-first sequence:**
1. Write the AR / AN rows.
2. Run them **red** against `ac8f39b`. Every AR row must fail; AN rows may pass. Record the result.
3. Implement.
4. Green.

| ID | Assertion |
|---|---|
| AR-1 | A valid reply yields the identical object, and no repair runs: a spy on `repairJSON` counts 0 |
| AR-2 | Signature 1 (`after array element` at end of input; text before the `{` and after the JSON; the `]}` after the last element missing) → deep-equal to the clean twin (RP-2, RP-1) |
| AR-3 | Signature 2 (an unescaped `"` inside a long `summary`; the reply ends `] } ] }`) → deep-equal to the clean twin, with the quote kept as text (RP-3) |
| AR-4 | Trailing text containing `{…}` / `}` after the JSON → deep-equal to the clean twin (RP-1) |
| AR-5 | A structural trailing comma → removed. A `", ]"` inside a string value of an otherwise defective reply → kept byte-for-byte (RP-0) |
| AN-1 | A quote that *closes* a string and is followed by a valid delimiter is not escaped: field count and values equal the clean twin |
| AN-2 | Field-boundary attack: `summary` text containing `", "action": "BUY` in a defective reply. The result never carries an `action` or `sentiment_score` taken from the summary; it is the clean twin or the fallback |
| AN-3 | Two ticker objects, one malformed. No field moves between objects: per-ticker values equal the clean twin, or that ticker falls back alone |
| AN-4 | A repaired result never contains a number or literal the clean twin lacks, nor a changed one (`sentiment_score`, price levels) |
| AN-5 | Trailing `{…}` text is never merged in: the top-level key set equals the clean twin's |
| AN-6 | A reply still invalid after all repairs (truncated inside a string; ends after `:`; an interior quote followed by `,` — the R6 known limitation) → the existing path: per-ticker extraction or `{ results: [] }`, the same console lines, no invented or altered field |
| AN-7 | A reply whose text ends inside a key or after `,` is not closed by RP-2 (today's behaviour) |
| AN-8 | SC: a repair that would add or drop a key or a ticker object is discarded (fallback path); the planted variant without SC fails this row |

**Mutation proofs (in-memory):**
- each of RP-0…RP-3 removed → its AR row fails;
- SC removed → AN-2 / AN-3 / AN-8 fail;
- RP-3 applied to keys → AN-1 fails.

**Plus:**
- `node qa/tools/index-pins.js --check` OK after `--update`;
- `qa/index_pins_offline.js`, `qa/no_synthetic_score_offline.js` (NS-1 / NS-11 unchanged and green), and the map-based whole-file suites green: `analyst_parser`, `high1y_label`, `ma_stack_label`, `ath_isolation`;
- the `index.html` readers green and unchanged: `narrative_consistency`, `scan_results_enrichment`, `deep_dive_v0`, `ui_hygiene`;
- **full `qa:offline` = step-0 count + 1**, on the heavy-lane go-ahead.

**Codex:**
- step 8 on the implementation diff;
- step 12 final check;
- FIX / DEFER / REJECT;
- Codex must specifically confirm R1, R7, R8 and that every AN row has a biting negative.

## 4. STOP (in addition to STOP-1..6)

- Any edit outside `repairJSON` / `parseJSON` in `index.html`.
- A new top-level function.
- Any prompt, score or persistence change.
- An `--diff` entry beyond R10.
- A valid reply whose parse result changes.
- Any AN row satisfied by weakening its assertion.
- Any live or DEV scan.
- A fixture presented as a captured reply.
- `BACKLOG.md` edited beyond entry 38's status text and its DONE line.
- A full `qa:offline` started while another heavy run is active.

## 5. Definition of Done

- AR-1…AR-5 and AN-1…AN-8 green, with the red run recorded and every mutation proof recorded.
- R10 map diff exact; `--check` OK.
- Full `qa:offline` = step 0 + 1, PASS.
- Codex: no unresolved Class I.
- `review.md`:
  - the evidence limitation (§0) verbatim;
  - the `--diff ac8f39b` output;
  - `## Backlog reconciliation`: 38 → closed (`work/ai-output-1-s1/`);
  - a LAND-EVIDENCE line.
- LAND / push / cleanup via R12 lines.

## 6. Files, land-scope, land-tests

```
index.html                              repairJSON (RP-0..RP-3, SC); parseJSON only per R2
qa/ai_parse_repair_offline.js           NEW   AR-1..AR-5, AN-1..AN-8, mutation proofs
qa/fixtures/index-pins.json             regenerated (R10)
BACKLOG.md                              step 10a only: entry 38 status + DONE line
work/ai-output-1-s1/review.md           evidence
```

<!-- land-scope:begin -->
index.html
qa/ai_parse_repair_offline.js
qa/fixtures/index-pins.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/ai_parse_repair_offline.js
node qa/tools/index-pins.js --check
node qa/index_pins_offline.js
node qa/no_synthetic_score_offline.js
node qa/analyst_parser_offline.js
node qa/high1y_label_offline.js
node qa/ma_stack_label_offline.js
node qa/ath_isolation_offline.js
node qa/narrative_consistency_offline.js
node qa/scan_results_enrichment_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

**Skills:**
- `pt-ai-output-change` **Required** (the parse-fallback surface; finding vocabulary).
- `pt-offline-suite` **Required**. For `index.html` pins, this brief's R10 map procedure governs: the five revert chains are frozen and are not extended.
- `/plan` is mandatory.

**Placement conditions (checked by COWORK at placement):**
- the canonical checkout is CLEAN on `branch-dev` = `ac8f39b`, or a later tip satisfying the Baseline row;
- `work/ai-output-1-s1/` and `task/ai-output-1-s1` are absent, and so is the task-base record;
- slot A is detached and clean.
