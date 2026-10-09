# Task brief: pin-consolidation — one `index.html` pin map replaces per-suite pins; revert chains frozen

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **none** — QA tooling (PC-5; precedents `task-base-record`, `late-sync-1`). No `BACKLOG.md` edit |
| Baseline | `006db3d6b1d5ef9f409d0eeb4df5272002e2006b` = `branch-dev` (late-sync-1 brief recorded); `main` = `fbec2c1`. Inventory: `_held-briefs/masters/pin-inventory-006db3d.md`. **Valid at any later tip where `git diff 006db3d <tip>` is empty for `index.html` and every file in §8** (late-sync-1 touches none of them) |
| Branch / slot | `task/pin-consolidation`, **Worker A** (`pt-wt-worker-a`, free); Bootstrap creates the branch at this brief's commit and runs `task-start` |
| Mode | **attended Auto** (PC-4), limited to the in-scope offline work in §8. No ASK / DENY / protected file. Any need outside §8 → STOP-1 |
| qa:offline | step-0 count (**76** at `006db3d`: 87 discovered − 11 denylisted) → **+1** (`qa/index_pins_offline.js`) |
| Parallel with | Worker B (`late-sync-1`): no shared file. **Never a full `qa:offline` while Worker B runs a heavy run or GC-4 / FT replay**; ask for the heavy-lane go-ahead before step 0 and step 10 |
| Status | FINAL on Owner approval; rulings PC-1…PC-5 (2026-10-10) |

**Objective.** A later task that changes `index.html` updates **one generated map** instead of re-pinning about 11
suites and extending 5 revert chains. Every existing behaviour assertion stays. Every existing "unchanged" guarantee
keeps an equal-or-finer replacement, and its planted negative is still caught.

## 0. Owner rulings (2026-10-10, not reopened)

- **PC-1 = A:**
  - one generated `index.html` pin map (functions, named non-function regions, remainder), a check / update tool and
    one new suite;
  - every live `index.html` pin in the 13 pinning suites moves to the map;
  - behaviour assertions unchanged;
  - **the shared extractor / helper-list consolidation is out of scope**.
- **PC-2:** the revert chains are frozen — **effective only after the replacement coverage passes QA** (§5,
  sequencing).
- **PC-3: deferred.** The rule "no new top-level function referenced by `renderMainPanel`" stays in force. The fixed
  helper lists (`RENDER_REAL`, `helperNames`, `FNS`, `SR_FNS`, `HELPERS`) are untouched.
- **PC-4:** attended Auto, in-scope offline work only.
- **PC-5:** no BACKLOG entry.
- **Unchanged:** `qa/run-offline.js`, `package.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, every product file
  (`index.html` included — read only), `GC-4` / `FT-0` inputs.

## 1. Situation (read-only, `006db3d`)

- **30** active suites read `index.html`; **13** carry SHA-256 pins on it.
- **Pin classes:**
  - **a — per-function digests:** caliper `PROTECTED_FN_HASHES` (CRLF raw), `tech_snapshot` `BASE_PINS` / `NEW_RM_*`,
    `no_synthetic_score` `ISOLATION_PINS`, `dh_ui_vocabulary` `FN_HASHES` / `AG6_HASHES`, `eod_preexport_warning`,
    `eod_packet_v0` (live part), `ts1` `BASE_HASHES`, `ma_stack_label` `PIN_CLASSIFY_LF`,
    `pulse_analyst_view` `PIN_PROMPT_FN_LF`, `high1y_label` layer 2, `analyst_parser` `PIN_FETCH_PPLX`;
  - **b — whole-file / masked:** AP-14 `PIN_MASKED_FILE`, AR-7i `index.html`, HL-8 layer 1, MS-8
    `PIN_MASKED_MINUS_RM_LF`, NS-11 `PRE_MASKED_FIVE`;
  - **sub-function / non-function regions:** the caliper protected CSS block, the TS1 region (`BASE_TS1_REGION`),
    `CONST_HASH` (dh), the eod `VARS` / `DH_DISPLAY`, AP-13 `_allNone` expression, MS `PIN_TSASSESSMAP_LF`;
  - **revert chains (5):** TC-10 (`tech_snapshot`), MS-7 (`ma_stack_label`), NS-12 (`no_synthetic_score`), the
    chains in `pulse_analyst_view` and `ath_client`.
- **Normalised pins:** `high1y_label` layer 2 hashes *normalised* function text (names / wording masked). The map's raw
  digest is **stricter**, which is allowed: equal or finer, never coarser. Layer 1 (`layer1`) is a masked whole-file
  digest (class b). `dh_ui_vocabulary` `CONST_HASH` covers several declarations (`PF_*`, `STALE_RESULT_THRESHOLD_MS`) →
  one region per declaration. `eod_preexport_warning` pins `DH_DISPLAY` (a top-level `var`) → a region.
- **Cross-suite text reads:** `tech_snapshot_cache` asserts on the source text of `vis_score_caliper_offline.js`
  (TC-11) and `ts1_default_exposure_offline.js`.
- **Out of scope by tier:** `qa/run-offline.js` has one historical pin (`HELPER_SHA_PRE_SLICE_B`, :3916) — untouched.

## 2. The map (new)

**`qa/lib/index-pins-core.js`** — pure, no I/O except what the caller passes in.
- **Input:** `index.html` text, LF-normalised. Digests are always computed on LF, so a CRLF checkout yields the same
  map.
- **Functions:**
  - every top-level `function NAME(` / `async function NAME(` declaration;
  - brace-matched with the same rules as the existing extractors (strings, template literals, comments, `async`
    prefix included);
  - duplicates keyed `NAME`, `NAME#2`, … in file order, and reported.
- **Regions:** named spans defined **in the map file** by `{start, end, occurrence}` anchors. Each must match exactly
  once; otherwise the map is invalid (fail closed). Regions may lie inside a function (sub-function guards) or outside
  any function (CSS, constants). Every region named in §1 becomes one entry, plus any further one the ledger (§3)
  needs.
- **Remainder:** the file with every function span and every out-of-function region span replaced by a fixed
  placeholder `\u0000NAME\u0000`; one digest.
- **Output:**
  ```
  { schema: 'index-pins/v1', fileSha256, functions: {name: sha256}, regions: {name: {start, end, occurrence, sha256}}, remainderSha256 }
  ```
  Keys sorted; no timestamp (deterministic).

**`qa/fixtures/index-pins.json`** — the committed map for `index.html` at the task tip.

**`qa/tools/index-pins.js`** (`qa/tools/` is not discovered by the runner):
- `--check`: exit 0 if the map equals the file; exit 1 with the list of changed / added / removed entries.
- `--update`: rewrites only `qa/fixtures/index-pins.json`.
- `--diff <git-ref>`: prints the entries that differ from the map at `<git-ref>`, with a unified line diff of each
  changed span. This is the line-level evidence that replaces hand-written revert tables for future tasks. It writes
  nothing.

**`qa/fixtures/index-pins-frozen.json`** — the exact LF sources the 5 revert chains operate on today, keyed by chain
and function, so the frozen chains keep running green and keep their planted negatives (§3 R4).

## 3. Migration rules (ledger required, one row per pin)

The Worker writes the full **pin → replacement ledger** in `plan.md` before any edit. Every row carries a **mutation
proof**: the same mutation is caught before (by the old pin) and after (by the map suite or a remaining assertion).

| Rule | Pin kind | Replacement |
|---|---|---|
| **R1** | live per-function digest | removed; covered by `functions[NAME]` in the map |
| **R2** | whole-file / masked digest | removed; covered by all function entries + regions + remainder |
| **R3** | live digest of a sub-function or non-function span | removed; covered by a **named region** of the same span (equal granularity, never coarser) |
| **R4** | revert chain (reconstructs historical text) | **frozen:** the chain's input becomes the frozen source in `index-pins-frozen.json` instead of live `index.html`; its tables are not extended; its planted negatives still run. Applied **only after** R1–R3 pass QA (PC-2) |
| **R5** | historical / reconstructed / fixture / non-`index.html` digest (`*_PRETASK_*`, `OLD_*`, `PIN_FIXTURE`, server modules in AR-7i, run-offline :3916) | **unchanged**. A constant that is both a live pin and an operand of a historical assertion (e.g. `EOD_PACKET_TO_MARKDOWN_DH_M1_SHA256 !== …_PRETASK_SHA256`) keeps its value for the historical assertion only; its live comparison moves to the map |
| **R6** | cross-suite text assertion (TC-11 reading the caliper / TS1 suites) | rewritten to assert the corresponding map entry, so the intent "this guard exists" is kept |
| **R7** | behaviour assertion (extracts a real function and runs it) | **unchanged, byte for byte** |

A suite's console PASS count may fall by the number of removed pin checks. That is the only allowed change to its
output.

## 4. Requirements

1. **IP suite (`qa/index_pins_offline.js`)**, written first and seen to fail before the core exists (§5).
2. Every live `index.html` pin in the 13 suites (§8) is migrated per §3. No pin in another file changes.
3. `node qa/tools/index-pins.js --check` passes at the task tip; `qa/fixtures/index-pins.json` is generated by
   `--update`, never edited by hand.
4. The map covers every function and region subject of every removed pin. The ledger proves it name by name.
5. `index.html` is byte-identical to the baseline (read only).
6. No helper-list or extractor change (PC-3 / scope).

## 5. QA

**Tests-first sequence:**
1. Write `qa/index_pins_offline.js` (IP rows below) and run it red.
2. Build the core, tool and map → IP green.
3. Migrate the R1–R3 / R6 pins suite by suite. After each suite: that suite plus IP green, and its ledger rows'
   mutation proofs recorded.
4. **Gate:** the IP suite and all 13 migrated suites green, and the full ledger proven → only then R4 (freeze chains),
   then re-run.

**IP rows** (each with a planted negative on an in-memory copy, never on the real file):

| ID | Assertion |
|---|---|
| IP-1 | the committed map equals the map computed from `index.html` (`--check` semantics) |
| IP-2 | a 1-byte change inside a function changes exactly that function's entry |
| IP-3 | a 1-byte change inside a named region changes exactly that region (and its enclosing function if inside one) |
| IP-4 | a 1-byte change outside all functions and regions changes only `remainderSha256` |
| IP-5 | an added, deleted or renamed top-level function is reported as added / removed |
| IP-6 | a region anchor matching 0 or > 1 times → the map is invalid (fail closed) |
| IP-7 | CRLF and LF forms of the file yield the identical map |
| IP-8 | duplicate function names are keyed deterministically (`#2`) |
| IP-9 | `--update` is deterministic (two runs, identical bytes) and writes only the map file |
| IP-10 | `--diff <ref>` lists exactly the changed entries and prints their line diff; it writes nothing |
| IP-11 | the extractor agrees byte-for-byte with the existing extractors' output for every function a migrated suite named (a parity check against copies of today's extraction code) |

**Plus:**
- the 13 migrated suites green;
- the frozen chains green on the frozen sources, with their planted negatives caught;
- **full `qa:offline` = step-0 count + 1** (77 at this baseline), with the heavy-lane go-ahead.

**Codex:**
- step 8 on the implementation diff, with the ledger supplied as review evidence;
- FIX / DEFER / REJECT;
- step 12 final check on the task diff.

**Codex must specifically confirm:**
- no coverage loss (each removed pin has a proven replacement);
- R7 assertions byte-unchanged;
- `index.html` untouched.

## 6. STOP (in addition to STOP-1..6)

- Any change to `index.html`, a product file, `qa/run-offline.js`, `package.json`, `AGENTS.md`, `CLAUDE.md` or
  `.claude/**`.
- Any change to a behaviour assertion (R7), a helper list, or an extractor used by a sandbox.
- A removed pin without a ledger row and a passing mutation proof.
- A replacement coarser than the pin it replaces (R3).
- Freezing a chain (R4) before the §5 gate has passed.
- A GC-4 / FT-0 digest input touched.
- A full `qa:offline` started while Worker B is running a heavy run.
- Anything that would need Manual mode.

## 7. Definition of Done

- IP-1…IP-11 green, each planted negative caught.
- 13 suites migrated per §3, with a ledger in `plan.md` / `review.md` row by row (pin → replacement → mutation proof).
- Chains frozen after the gate.
- Full `qa:offline` = step 0 + 1, PASS.
- Codex: no unresolved Class I.
- `review.md`:
  - `## Backlog reconciliation: none`;
  - a LAND-EVIDENCE line;
  - a closing `index-pins --diff <task base>` output showing **no function or region change** (`index.html`
    untouched).
- LAND / push / cleanup via R12 lines.

**Follow-ups outside this task:**
- the `pt-offline-suite` Skill text and any AGENTS wording (governance-docs-1, G2);
- the shared extractor (a later task, PC-3).

## 8. Files, land-scope, land-tests

```
qa/lib/index-pins-core.js              NEW   §2 core
qa/tools/index-pins.js                 NEW   --check / --update / --diff
qa/fixtures/index-pins.json            NEW   generated map
qa/fixtures/index-pins-frozen.json     NEW   frozen chain inputs (R4)
qa/index_pins_offline.js               NEW   IP-1…IP-11
qa/vis_score_caliper_offline.js        R1 (PROTECTED_FN_HASHES) · R3 (protected CSS)
qa/tech_snapshot_cache_offline.js      R1 · R3 (TS1 region) · R4 (TC-10) · R6 (TC-11 / TS1 text reads)
qa/no_synthetic_score_offline.js       R1 (ISOLATION_PINS) · R2 (PRE_MASKED_FIVE) · R4 (NS-12)
qa/dh_ui_vocabulary_offline.js         R1 · R3 (CONST_HASH)
qa/eod_preexport_warning_offline.js    R1 · R3
qa/eod_packet_v0_offline.js            R1 (live pins only; PRETASK stays, R5)
qa/ts1_default_exposure_offline.js     R1 (TX-3)
qa/ma_stack_label_offline.js           R1 · R2 (MS-8) · R3 (_tsAssessMap) · R4 (MS-7)
qa/pulse_analyst_view_offline.js       R1 (PIN_PROMPT_FN_LF) · R4
qa/high1y_label_offline.js             R1 (layer 2) · R2 (HL-8 layer 1)
qa/analyst_parser_offline.js           R1 (PIN_FETCH_PPLX) · R2 (AP-14) · R3 (AP-13 _allNone); PIN_FIXTURE stays
qa/ath_isolation_offline.js            R2 (AR-7i index.html entry only; server pins stay)
qa/ath_client_offline.js               R4
work/pin-consolidation/review.md       evidence
```

<!-- land-scope:begin -->
qa/lib/index-pins-core.js
qa/tools/index-pins.js
qa/fixtures/index-pins.json
qa/fixtures/index-pins-frozen.json
qa/index_pins_offline.js
qa/vis_score_caliper_offline.js
qa/tech_snapshot_cache_offline.js
qa/no_synthetic_score_offline.js
qa/dh_ui_vocabulary_offline.js
qa/eod_preexport_warning_offline.js
qa/eod_packet_v0_offline.js
qa/ts1_default_exposure_offline.js
qa/ma_stack_label_offline.js
qa/pulse_analyst_view_offline.js
qa/high1y_label_offline.js
qa/analyst_parser_offline.js
qa/ath_isolation_offline.js
qa/ath_client_offline.js
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/index_pins_offline.js
node qa/tools/index-pins.js --check
node qa/vis_score_caliper_offline.js
node qa/tech_snapshot_cache_offline.js
node qa/no_synthetic_score_offline.js
node qa/dh_ui_vocabulary_offline.js
node qa/eod_preexport_warning_offline.js
node qa/eod_packet_v0_offline.js
node qa/ts1_default_exposure_offline.js
node qa/ma_stack_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/high1y_label_offline.js
node qa/analyst_parser_offline.js
node qa/ath_isolation_offline.js
node qa/ath_client_offline.js
node qa/narrative_consistency_offline.js
node qa/scan_results_enrichment_offline.js
node qa/deep_dive_v0_offline.js
node qa/ui_hygiene_offline.js
<!-- land-tests:end -->

The last four land-tests are untouched suites that read `index.html`; they must pass unchanged.

**Skills:** `pt-offline-suite` **Required** (pin classes, mutation proofs, ledger). `/plan` is mandatory, with the
`CLAUDE.md` pre-flight checklist:
- **pattern audit:** the existing extractors in `tech_snapshot_cache` / `run-offline.js`; the digest-gate pattern in
  `git_contract_offline` / `fixture_template_offline`;
- **gate verification:** no client / server feature gate applies — the map `--check` is the gate;
- **Definition of Done** = §7.

**Revalidation before Worker A starts:**
- COWORK re-runs `git diff 006db3d <tip> -- index.html qa/` at placement.
- Any change in `index.html` or a §8 suite → re-pin this brief (new baseline, re-inventory) before approval of the
  brief-only commit.
- Late-sync-1's own files are outside §8.
