# Task brief: ai-output-1-s1a — AI reply JSON repair for syntax defects inside a field (replacement of ai-output-1-s1)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

| | |
|---|---|
| Master / slice | `ai-output-1`, slice **S1** (R-7 fix). Main Control rulings OD-1, OD-2, OD-3 (2026-10-11) and S1A-1…S1A-3 (2026-10-11, §0) |
| Lineage | **Replaces `ai-output-1-s1`** (brief `a844576`, task-base record base `a8445762`). Option B (S1A-1): a recorded brief is not amended. The `s1` task is retired unlanded; its implementation and evidence are seed material (§7) |
| Backlog | Entry **38** (NVDA AI parse failure, R-7) — expected effect **`close`**. `BACKLOG.md` is in scope for the step-10a reconciliation only: entry 38's heading / status text plus one DONE line |
| Baseline | The `branch-dev` tip at this brief's commit. **Valid only if all three hold at that tip:** (1) `git diff --quiet ac8f39b <tip> -- index.html qa/fixtures/index-pins.json qa/ai_parse_repair_offline.js` exits 0; (2) the single line matching `^| 38 |` in `BACKLOG.md` is byte-identical in `git show ac8f39b:BACKLOG.md` and `git show <tip>:BACKLOG.md`; (3) `git show <tip>:BACKLOG.md` has exactly one such line. Otherwise HOLD and re-pin |
| Branch / slot | `task/ai-output-1-s1a`, **Worker A** (`pt-wt-worker-a`). Bootstrap creates the branch at this brief's commit **after** the §7 migration steps M1–M2 and runs `task-start` |
| Mode | **Manual** (OD-3; the AI-output parse path) |
| qa:offline | step-0 count **77** (reused under S1A-3, or a fresh run) → **+1** (`qa/ai_parse_repair_offline.js`, auto-discovered; `qa/run-offline.js` unchanged) |
| Parallel with | Worker B (`catalyst-evidence-2-s1`). No shared file except `BACKLOG.md`, and each task edits a different entry. **One heavy run at a time:** step 10 (and a fresh step 0, if needed) only with the Owner's heavy-lane go-ahead, never while another full run is active. If `branch-dev` moves, AGENTS 9.4 / 9.5 apply as written |
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

- **S1A-1 — Option B (Main Control, 2026-10-11).** The replacement is a new task id. The `ai-output-1-s1` implementation and evidence are preserved and migrated (§7).

- **S1A-2 — the R10 exception, relative to `ac8f39b` (Main Control, 2026-10-11).** Established by Worker A's `s1` evidence and reproduced by COWORK at `ac8f39b`:
  - the pin-map extractor counts braces character by character;
  - at `ac8f39b` it ends `repairJSON` at the `}` inside the regex literal `/,\s*([\]}])/g`, so the pinned `functions.repairJSON` is a **57-character stub**;
  - the remaining **530 characters** of the old body (LF text, sha256 `dc87ebdd84b977d4fee4e7a8f0506ccea97911b171f179ca45c5b171712fb2cd`) sit in the remainder, immediately after the `\u0000functions.repairJSON\u0000` placeholder;
  - any change to `repairJSON` therefore moves the remainder.

  R10 is replaced by **R10a** (§2). Nothing else about the pin map is relaxed.

- **S1A-3 — Owner-authorised step-0 reuse (Main Control, 2026-10-11)** — a task-specific exception to AGENTS step 0's fresh run.
  - **What is reused:** `ai-output-1-s1`'s step-0 baseline: **PASS, 77 suites, 1 312 674 ms**, run in `pt-wt-worker-a` at base `a8445762c3f3571cacd21cdf68defc7bd67f64f4`. Its `qa.log` is preserved in the §7 archive.
  - **When:** only if **every** condition C-1…C-6 holds and is recorded. Any condition that fails or cannot be proven → a **fresh full step 0** (normal AGENTS step 0, on the Owner's heavy-lane go-ahead). That is not a STOP.

| ID | Condition | Exact check (Worker A, in its slot, before any edit) | Required result |
|---|---|---|---|
| C-1 Tree | Only QA-inert brief additions since the reused run | `git diff --name-only a8445762c3f3571cacd21cdf68defc7bd67f64f4 HEAD` | exactly `work/ai-output-1-s1a/brief.md` and `work/catalyst-evidence-2-s1/brief.md` — any other path (e.g. a Worker B LAND) fails C-1 |
| C-2 Suites | The suite set is unchanged | `git diff --name-only a8445762c3f3571cacd21cdf68defc7bd67f64f4 HEAD -- qa package.json package-lock.json` | empty → the same 77-suite set |
| C-3 Environment | The same pinned execution environment as the reused run (whose GC-4 gate skipped in 1.07 s) | `node qa/git_contract_offline.js`; `node qa/fixture_template_offline.js`; `node --version`; `ls -ld --time-style=full-iso node_modules` | GC-4 prints `SKIP  (contract pinned: 552ccfc8e1ee/ef28452b4eb8)`; FT prints `SKIP  (contract pinned: 288591877fee/ef28452b4eb8)`; both suites PASS; `node_modules` time `2026-09-26 01:30:35` (no `npm ci` since); the Node version recorded |
| C-4 Working-tree bytes | The same slot, no checkout since the run other than the §7 WIP commit and the switch onto this task | `git reflog -n 4`; `git status --short`; `sha256sum index.html qa/fixtures/index-pins.json`; `test ! -e qa/ai_parse_repair_offline.js` | the reflog shows only the switch to `task/ai-output-1-s1a` and the WIP commit after `a844576`; status clean; `index.html` = `3be4e783be975aceb077fb2d7d56ddc5fd4e3590ca61ca22c866d83daec4c25d` (the step-0 bytes = the canonical CRLF form); `index-pins.json` = `43faa9e9260a706730bc1bca70b8c0b62a5b3ae2d9da79f05fec8c968b719dfd` (unchanged LF form); the suite file absent |
| C-5 Brief-file readers | No suite observes the added brief files | `git diff --name-only a8445762c3f3571cacd21cdf68defc7bd67f64f4 HEAD -- qa` empty (C-2), plus `node qa/run_offline_discovery_offline.js`, `node qa/instruction_layer_offline.js`, `node qa/tools/index-pins.js --check`, `node qa/index_pins_offline.js` | all PASS |
| C-6 Age | Date-dependent drift is bounded | the `task-start` time of `task/ai-output-1-s1a` | before **2026-10-12 00:00 UTC** |

**Basis of C-5 (COWORK read-only analysis at `afd3f87`; it holds while `qa/` is unchanged):**
- **No active suite reads a real `work/**` file.** Every `brief.md` mention under `qa/` is a comment, or a path inside a throw-away fixture repository (`auto_mode_hardening`, `pt_land`, `task_base`, `pt_land_resync`, recorder).
- The suites that run git at the repository root read only **fixed commits**:
  - `fixture_template` (`f3c0728`);
  - `task_base` (`1e4b773`);
  - `p5_step5_ui` (`36bf497`);
  - `news_catalysts_replay` / `_provider` (`52c322b`);
  - `qa/tools/index-pins.js` only with `--diff <ref>`.
- Commits that add brief files therefore cannot change any suite's result.
- Every reader of `qa/fixtures/index-pins.json` parses it with `JSON.parse`, so it is line-ending-insensitive.

**Evidence (line 1 of `work/ai-output-1-s1a/qa.log`):**
- `STEP-0 REUSED (Owner ruling S1A-3): PASS 77 suites, 1312674 ms, ai-output-1-s1 base a8445762 (pt-wt-worker-a) · archived qa.log sha256 acacb53d8aba3d238727fbf1d5b072e9ee8fcce0a83fb6d059a047a664ec8e97 · C-1…C-6 PASS · HEAD <oid> · node <version>`.
- Below it, the verbatim outputs of every C-check.
- If reuse fails, line 1 is the normal fresh step-0 line instead.

## 1. Situation (read-only, `ac8f39b`; unchanged at `afd3f87`)

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

**Pin map:** `qa/fixtures/index-pins.json` has entries `functions.repairJSON` (the 57-character stub, S1A-2) and `functions.parseJSON`.
- `parseJSON` holds a literal `{` inside a log string, so the extractors end it at its column-0 closing brace (`qa/lib/index-pins-core.js`; `qa/no_synthetic_score_offline.js` `extractTopLevelFn`).

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
| R9 | **Extractor compatibility.** `repairJSON` and `parseJSON` each still end at a column-0 `}` line. No `\n}\n` sequence occurs inside either function. After the change, `qa/lib/index-pins-core.js` extracts `repairJSON` **in full**, up to its column-0 `}` (a SETUP row asserts it) |
| R10a | **Pin map (S1A-2).** `node qa/tools/index-pins.js --diff ac8f39b` lists **exactly**: changed `functions.repairJSON`, `functions.parseJSON` (only if R2 needed a change), `remainder`; the file digest; nothing added or removed; no region. **The remainder change is exactly one deletion:** the new remainder text equals the `ac8f39b` remainder text with the 530-character tail (sha256 `dc87ebdd…2cb2cd`) removed from immediately after the `\u0000functions.repairJSON\u0000` placeholder, and nothing added anywhere. Proven by a scratch script outside the repository (it reads `git show ac8f39b:index.html` and the working `index.html` through `qa/lib/index-pins-core.js` `buildMapDetailed`; deleted after use), with its output in `qa.log` and `review.md`. Then `--update`, then `--check` OK |

**Not in scope:**
- the prompt text, `fetchAnthropicAnalysis`, `analyzeChunk`, `orchestrate`, `enforceScoreConsistency`, scores, Actionable Take, persistence (`pt_*` keys);
- the per-ticker extraction regex;
- the R-6 checker (K3 / K4);
- Tech Score rounding;
- any live or DEV scan;
- the pin-map extractor itself (`qa/lib/index-pins-core.js`).

## 3. QA

**Suite `qa/ai_parse_repair_offline.js`** (seed: migrated from `ai-output-1-s1`, §7):
- extracts the real `repairJSON` and `parseJSON` from `index.html` (with `qa/lib/index-pins-core.js`, column-0 rule) into a sandbox with a capturing console. No network, no file writes;
- every "clean twin" is a valid reply. Every defective fixture is that twin with exactly one reconstructed defect, **except AR-2**. AR-2 is an intentional combined-defect case: it reproduces recorded signature 1, which has text around the JSON plus missing closers (RP-1 + RP-2), and is exempt from the one-defect rule. RP-1 alone is covered by AR-4;
- every row has a **planted negative** on an in-memory copy of the functions, never on the real file.

**Sequence — RED before restore:**
1. After step 0 (reused or fresh), restore **only** the suite from the archive (§7) and verify its sha256.
2. Run it against the **unchanged** `index.html`. It must reproduce the `s1` RED exactly:
   - **FAIL:** SETUP, AR-2, AR-3, AR-3b, AR-4, AR-5, AN-1, AN-3, AN-4 (9 rows);
   - **PASS:** AR-1, AN-2, AN-5, AN-6, AN-7, AN-8.

   Record the result. Any other outcome → STOP.
3. Restore `index.html` from the archive, verify its sha256, then GREEN.
4. Record the mutation proofs.

| ID | Assertion |
|---|---|
| SETUP | The real functions are extracted, and each ends at a column-0 closing brace (R9) |
| AR-1 | A valid reply yields the identical object, and no repair runs: a spy on `repairJSON` counts 0 |
| AR-2 | Signature 1 (`after array element` at end of input; text before the `{` and after the JSON; the `]}` after the last element missing) → deep-equal to the clean twin (RP-2, RP-1) |
| AR-3 | Signature 2 (an unescaped `"` inside a long `summary`; the reply ends `] } ] }`) → deep-equal to the clean twin, with the quote kept as text (RP-3) |
| AR-3b | A single unescaped quote (odd count) inside `summary` → deep-equal to the clean twin (RP-3) |
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
- the R10a proof, then `node qa/tools/index-pins.js --update`, then `--check` OK;
- `qa/index_pins_offline.js`, `qa/no_synthetic_score_offline.js` (NS-1 / NS-11 unchanged and green), and the map-based whole-file suites green: `analyst_parser`, `high1y_label`, `ma_stack_label`, `ath_isolation`;
- the `index.html` readers green and unchanged: `narrative_consistency`, `scan_results_enrichment`, `deep_dive_v0`, `ui_hygiene`;
- **full `qa:offline` = step-0 count + 1 (78)**, on the heavy-lane go-ahead — always a fresh run; S1A-3 never covers step 10.

**Codex:**
- step 8 on the implementation diff;
- step 12 final check;
- FIX / DEFER / REJECT;
- Codex must specifically confirm R1, R7, R8, R10a (single deletion) and that every AN row has a biting negative.
- Codex is given S1A-1…S1A-3 and the C-check record, so the step-0 reuse is reviewed as a ruling, not as a missing step.

## 4. STOP (in addition to STOP-1..6)

- Any edit outside `repairJSON` / `parseJSON` in `index.html`.
- A new top-level function.
- Any prompt, score or persistence change.
- An `--diff` result beyond R10a, or a remainder change that is not exactly the single S1A-2 deletion.
- Any edit to `qa/lib/index-pins-core.js` or `qa/tools/index-pins.js`.
- A valid reply whose parse result changes.
- Any AN row satisfied by weakening its assertion.
- Any live or DEV scan.
- A fixture presented as a captured reply.
- `BACKLOG.md` edited beyond entry 38's status text and its DONE line.
- A full `qa:offline` started while another heavy run is active.
- **Migration:** a restored file whose sha256 differs from §7; the RED-before-restore result differing from the recorded `s1` RED; a `land-request` for `task/ai-output-1-s1`.

## 5. Definition of Done

- The step-0 baseline recorded: reused under S1A-3 with C-1…C-6, or fresh.
- RED-before-restore reproduced; SETUP and AR-1…AR-5 (incl. AR-3b) and AN-1…AN-8 green; every mutation proof recorded.
- R10a proof recorded; `--update`; `--check` OK.
- Full `qa:offline` = 78, PASS (fresh).
- Codex: no unresolved Class I.
- `review.md`:
  - the evidence limitation (§0) verbatim;
  - S1A-1…S1A-3 and the C-check record;
  - the R10a proof and the `--diff ac8f39b` output;
  - `## Backlog reconciliation`: 38 → closed (`work/ai-output-1-s1a/`);
  - a LAND-EVIDENCE line.
- Step 13 commit; integrity (record form); LAND / push / cleanup via R12 lines.

## 6. Files, land-scope, land-tests

```
index.html                              repairJSON (RP-0..RP-3, SC); parseJSON only per R2
qa/ai_parse_repair_offline.js           NEW (seed, §7)  SETUP, AR-1..AR-5, AR-3b, AN-1..AN-8, mutation proofs
qa/fixtures/index-pins.json             regenerated (R10a)
BACKLOG.md                              step 10a only: entry 38 status + DONE line
work/ai-output-1-s1a/review.md          evidence
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
- `pt-offline-suite` **Required**. For `index.html` pins, R10a governs: the five revert chains are frozen and are not extended.
- `/plan` is mandatory.

## 7. Seed material and migration (from the retired `ai-output-1-s1`)

**Seed files** (in `pt-wt-worker-a`, uncommitted, read by COWORK on 2026-10-11; the hashes are the identity):

| File | sha256 (as on disk) |
|---|---|
| `index.html` (implementation; CRLF; changes only at `repairJSON` :5953–5966 and `parseJSON` :5980) | `0f39077b0dc6c1999658f91668974cdaf02e91196efbd82aef0e91b54ffef57d` |
| `qa/ai_parse_repair_offline.js` (LF) | `6228ff58b7490575b9d3e142af276c83fdf6accf956fd984b5843251f583330e` |
| `work/ai-output-1-s1/plan.md` | `f205e109f0a8eeea947ef69958cf7c87ea2a4cbc06f2e872dbbf60855b3da744` |
| `work/ai-output-1-s1/qa.log` (step-0 baseline + RED) | `acacb53d8aba3d238727fbf1d5b072e9ee8fcce0a83fb6d059a047a664ec8e97` |

**Migration steps:**
- **M1 — archive (before anything else).** All four files are copied to a new `pt-work-artifacts/ai-output-1-s1/<UTC stamp>/` with exclusive create. Each copy is re-hashed against the table; an inventory file lists path, sha256 and size. Nothing is moved or deleted.
- **M2 — WIP commit.** On `task/ai-output-1-s1`, through r9:
  - `git add index.html qa/ai_parse_repair_offline.js`;
  - `git diff --cached --name-only` = exactly those two;
  - plain `git commit -m "wip(ai-output-1-s1): R-7 repair + suite (retired, migrated to ai-output-1-s1a)"`;
  - the slot is then clean.

  The retired branch is never land-requested. It and its task record are removed later by the Owner.
- **M3 — this brief is recorded; then the switch and `task-start`.** The task branch is created from `branch-dev` at this brief's commit.
- **M4 — restore** from the M1 archive (the authority), in the order of §3 (suite first, RED, then `index.html`), each verified against the table.

**Carries no approval:** the seed is re-verified (RED, GREEN, mutation proofs, Codex, full run) under this brief. Its code comments name `ai-output-1 S1` and are kept byte-identical (the hashes are the evidence).

**The `s1` evidence stays archived** and is never renamed into `work/ai-output-1-s1a/`. The new task writes its own `plan.md`, `qa.log` and `codex.md`.

**Placement conditions (checked by COWORK at placement):**
- M1 and M2 done and verified;
- the canonical checkout CLEAN on `branch-dev`, and the Baseline row holds;
- `work/ai-output-1-s1a/`, `task/ai-output-1-s1a` and its record absent;
- slot A clean on `task/ai-output-1-s1` (after M2).
