# Task brief: catalyst-evidence-2-s1 — deterministic `subType` formatting in the news-catalysts provider (A7a, Option A)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

| | |
|---|---|
| Master / slice | `catalyst-evidence-2`, slice **S1** (A7a / S2-M3, formatting only). Main Control OD-4 = **A** (2026-10-11) |
| Backlog | Entry **4** (catalyst news evidence pipeline, merged into `catalyst-evidence-2`) — expected effect **`partial`** (A7a done; A3b / A4 / A7b remain). `BACKLOG.md` is in scope for the step-10a reconciliation only: entry 4's status text |
| Baseline | `ac8f39bbd8e868116437fd524d1c7f2d15e72f36` = `branch-dev` = `origin/branch-dev`; `main` = `fbec2c1`. **Valid at any later tip where `git diff ac8f39b <tip>` is empty for every file in §6 except `BACKLOG.md` entries other than 4** |
| Branch / slot | `task/catalyst-evidence-2-s1`, **Worker B** (`pt-wt-worker-b`, detached at `ac8f39b`). Bootstrap creates the branch at this brief's commit and runs `task-start` |
| Mode | **attended Auto** (OD-4 = A): offline server-library and QA work only. No ASK / DENY / protected file, no env, no live call. Any need outside §6 → STOP-1 |
| qa:offline | step-0 count (**77** at `ac8f39b`) → **unchanged** (no suite added; `qa/news_catalysts_provider_offline.js` stays on the `run-offline.js` denylist and runs as a land-test) |
| Parallel with | Worker A (`ai-output-1-s1`). No shared file except `BACKLOG.md`, and each task edits a different entry. **One heavy run at a time:** step 0 and step 10 only on the Owner's heavy-lane go-ahead, never while another full run is active. If `branch-dev` moves, AGENTS 9.4 / 9.5 apply as written |
| Status | FINAL on Owner approval |

**Objective.** The same catalyst label always gets the same `subType` text: `clinical data presentation`, `Clinical-Data-Presentation` and `clinical_data_presentation` all become `clinical_data_presentation`.

**Formatting only.**
- No vocabulary: distinct labels stay distinct (`clinical_data_presentation_acceptance` is not merged).
- No structural change: the frozen D-S3-1 reader contract keeps its field set, order, types and conditional-null rule.
- Only `subType` values change, as carve-out C-1 already allows ("values may change under S2-M3 (A7a); a reader must never switch on `subType` string equality").

## 0. Rulings (not reopened)

- **OD-4 = A:** a formatting normaliser only, attended Auto. A closed vocabulary or any merging of distinct values needs a new Owner ruling (STOP).
- **D-S3-1 C-1** (`work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md` :58, :69): values may change, the structure may not.
- **FABLE direction (2026-10-11):** 3A-L and `governance-docs-1` are not prerequisites of this Master.

## 1. Situation (read-only, `ac8f39b`)

**Provider** — `netlify/functions/lib/news-catalysts-provider.js`:
- schema `subType: string|null` (:150, :170);
- prompt text (:281, :314);
- validity: a non-empty trimmed string iff `category === 'other_catalyst'`, else exactly `null` → otherwise skip `INVALID_SUB_TYPE` (:724–732);
- the identity tuple (:739–750) does **not** contain `subType`;
- projection: `subType: raw.subType` (:815).

**Consumers** (read-only, unchanged by this task):
- `news-catalysts-core.js` (:88, :347–354) and `news-catalysts-read-core.js` (:454–458) check presence and the null rule only;
- `services/news-catalysts-client.js` :210–236 treats `subType` as opaque text;
- `index.html` does not read `subType`.

**Corpus** (`qa/fixtures/replay/`, 9 cases): 6 survivor values.
- One formatting variant: `p4-20260921T2307Z-MRNA` expects `"clinical data presentation"` (fixture line 60).
- The others are already canonical: `product_webinar`, `user_conference`, `clinical_data_presentation`, `clinical_data_presentation_acceptance`, `analyst_day`.

**Replay suite** (`qa/news_catalysts_replay_offline.js`):
- compares the replayed `items` to each fixture's recorded `expected` snapshot (:300);
- pins every fixture's bytes to `index.json` `fixtureSha256` (R-9, :477–487);
- R-12 (:959) allows exactly three cases to differ from the `52c322b` baseline;
- R-14 (:984) requires the other six files to be byte-equal to that baseline;
- R-16 (:1004) is the precedent for an exact, reverted-and-deep-equal divergence proof. `providerVersion` was kept.

## 2. Requirements

| # | Requirement |
|---|---|
| R1 | **One normaliser**, applied to non-null `subType` **after** the existing validity check (:724–732) and before the projection (:815): `s.trim().toLowerCase()` → each run of whitespace or `-` becomes `_` → runs of `_` collapse to one → leading / trailing `_` removed. Locale-independent (`toLowerCase`, never `toLocaleLowerCase`). No other character is removed or changed |
| R2 | An empty result after normalisation (e.g. `"-"`, `"_"`) is skipped with the **existing** reason `INVALID_SUB_TYPE`. No new skip reason |
| R3 | `null` stays `null`; the conditional-null rule is unchanged |
| R4 | Idempotent: `norm(norm(x)) === norm(x)` |
| R5 | `identityHash`, field order, every other item field, `skippedItems`, `evidenceBindings` and `dateProvenance` are unchanged for every input |
| R6 | **Replay re-snapshot, exactly one value.** In `qa/fixtures/replay/p4-20260921T2307Z-MRNA.json`, `expected.items[k].subType` `"clinical data presentation"` → `"clinical_data_presentation"`. Every other byte of the file is unchanged (`captureSha256` and the raw capture untouched; `expected.providerVersion` unchanged, following the R-16 precedent). `index.json`: only that case's `fixtureSha256` is updated |
| R7 | **Replay suite:** R-12 allows exactly four diverging cases (adds `p4-20260921T2307Z-MRNA`); R-14 excludes that case (now five files byte-equal to `52c322b`). A new **R-17**, in R-16's style, with two assertions in this order: **(a)** the current fixture's `expected.items[k].subType` for that item is exactly `"clinical_data_presentation"` — this fails on the pre-change fixture, which equals the `52c322b` baseline; **(b)** with that one value reverted to `"clinical data presentation"`, the **whole** fixture object deep-equals the `52c322b` baseline. No other assertion is changed or relaxed |
| R8 | **Provider suite:** new NP rows (NP63+), keeping NP01…NP62 byte-unchanged in assertion. NP63 is the normaliser table: spaces, hyphens, mixed case, repeated and edge underscores, already-canonical values unchanged, `_acceptance` kept distinct, non-ASCII kept as text. NP64 idempotence. NP65 null rule + empty-after-normalise → `INVALID_SUB_TYPE`. NP66 `identityHash` and the item key order are identical for two candidates differing only in `subType` formatting |

**Not in scope:**
- `news-catalysts-core.js`, `news-catalysts-read-core.js`, `services/news-catalysts-client.js`, `index.html`;
- the provider prompt (A7b);
- A3b / A4 date enforcement (blocked, O-4);
- A6;
- any env, Netlify or live action.

The server gate `PT_ENABLE_NEWS_CATALYSTS_SERVER` stays as it is.

## 3. QA

**Tests-first sequence:**
1. Write NP63–NP66 and R-17, and update R-12 / R-14.
2. Run them **red** against `ac8f39b`: the NP rows fail, R-12 fails (three cases diverge, not four), and R-17 fails at assertion (a) while the fixture still holds the old value.
3. Implement R1–R5.
4. Re-snapshot per R6.
5. Green.

**Mutation proofs:**
- the normaliser removed → NP63 / NP64 and the replay comparison (:300) on `p4-20260921T2307Z-MRNA` fail;
- a normaliser that also strips other characters → NP63 ("non-ASCII kept") fails;
- `subType` added to the identity tuple → NP66 fails;
- any second fixture byte changed → R-17 or R-14 fails.

**Plus:**
- `news_catalysts_core_offline`, `news_catalysts_read_offline` and `news_catalysts_client_test` green and unchanged (the structural contract is byte-stable);
- **full `qa:offline` = step-0 count**, on the heavy-lane go-ahead.

**Codex:**
- step 8 on the implementation diff;
- step 12 final check;
- FIX / DEFER / REJECT;
- Codex must specifically confirm R5, R6 (single-value fixture diff) and that C-1 is respected (no consumer switches on `subType`).

## 4. STOP (in addition to STOP-1..6)

- Any change to a file outside §6, or to the reader / client / core contract.
- A vocabulary or merge of distinct values.
- A new skip reason.
- Any replay difference beyond the one value in R6.
- Any change to a raw capture, `captureSha256` or `providerVersion`.
- An `identityHash` change.
- Any live call, env or Netlify action.
- `BACKLOG.md` edited beyond entry 4's status text.
- A full `qa:offline` started while another heavy run is active.

## 5. Definition of Done

- NP63–NP66, R-17 and the updated R-12 / R-14 green; the red run and every mutation proof recorded.
- The fixture diff is exactly one line (R6), plus one `fixtureSha256` line in `index.json`.
- Full `qa:offline` = the step-0 count, PASS.
- Codex: no unresolved Class I.
- `review.md`: the fixture diff, `## Backlog reconciliation` (4 → updated: A7a done; remaining `A3b* → A4*/A7b*`), and a LAND-EVIDENCE line.
- LAND / push / cleanup via R12 lines.

## 6. Files, land-scope, land-tests

```
netlify/functions/lib/news-catalysts-provider.js   R1–R5 normaliser
qa/news_catalysts_provider_offline.js              NP63–NP66
qa/news_catalysts_replay_offline.js                R-12 / R-14 update, R-17 new
qa/fixtures/replay/p4-20260921T2307Z-MRNA.json     R6 one value
qa/fixtures/replay/index.json                      R6 one fixtureSha256
BACKLOG.md                                         step 10a only: entry 4 status text
work/catalyst-evidence-2-s1/review.md              evidence
```

<!-- land-scope:begin -->
netlify/functions/lib/news-catalysts-provider.js
qa/news_catalysts_provider_offline.js
qa/news_catalysts_replay_offline.js
qa/fixtures/replay/p4-20260921T2307Z-MRNA.json
qa/fixtures/replay/index.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/news_catalysts_provider_offline.js
node qa/news_catalysts_replay_offline.js
node qa/news_catalysts_core_offline.js
node qa/news_catalysts_read_offline.js
node qa/news_catalysts_client_test.js
<!-- land-tests:end -->

**Skills:**
- `pt-offline-suite` **Recommended** (mutation proofs, fixture re-snapshot ledger).
- `/plan` is mandatory.

**Placement conditions (checked by COWORK at placement):**
- the canonical checkout is CLEAN on `branch-dev` (`ac8f39b`, or the tip after `ai-output-1-s1`'s brief commit);
- `work/catalyst-evidence-2-s1/` and `task/catalyst-evidence-2-s1` are absent, and so is the task-base record;
- slot B is detached and clean.
