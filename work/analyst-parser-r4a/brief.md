# Task brief: analyst-parser-r4a — parse analyst actions item by item, separating rating and price-target changes

Operational only when the Owner has approved these exact contents and the brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 33 — `close`** ("Fix analyst-action / price-target parsing", Track 3 · Research & AI Analysis). Added by Owner ruling 2026-10-03. The entry does not exist at the baseline: this task adds it already closed (B1) plus its DONE / HISTORY line (B2), as for entry 32. Number 31 is reserved by the held P2a brief |
| Baseline | `dd51188c906910928a1672091c00a9a800b24729` (`branch-dev` = `origin/branch-dev`, clean, 2026-10-03). Anchors and the RED measurement verified at this commit; `index.html` 15,920 lines, CRLF |
| Branch / slot | `task/analyst-parser-r4a`, Worker B (`pt-wt-worker-b`, free, detached at `dd51188`) |
| Mode | **Manual, attended** — the new optional fields on `analystActions` rows flow into `item._catalysts.analystActions`, which is persisted in `pt_results` (an additive persisted-shape change, AGENTS.md M5). The Worker still runs plan → tests → implementation → QA → Codex on its own and stops only on STOP-1..6 or an Owner gate |
| qa:offline | baseline at Step 0 → **+1** (`qa/analyst_parser_offline.js`) |
| Parallel with | Worker A `task/second-finisher-resync` — no shared file. One full `qa:offline` at a time on the machine |
| Status | FINAL. Owner rulings 1–3 and the backlog ruling (2026-10-03) recorded; no decision open |

Objective: replace the single-regex analyst extractor inside `parsePerplexityContext` with an item-by-item parser
that separates **rating** changes from **price-target** changes, keeps the existing `bank` / `action` / `target`
contract for every current consumer, and preserves rating-only events. Parser only.

## 1. Owner rulings (2026-10-03; not reopened)

1. When a price-target change exists, legacy `action` is the price-target action
   ("upgraded to Buy and cut PT from $300 to $280" → `action: cut`, `ratingAction: upgraded`, `ptAction: cut`).
2. Rating-only changes are preserved by the parser. Displaying them is a separate, later slice.
3. The `$5,000` ceiling is removed. A `$` amount is a target only when the text clearly marks it as one; revenue,
   share price or other amounts are never targets.

Out of scope: the Perplexity prompt (`fetchPerplexityContext` query text), any UI, R-1, R-2, R-3, R-5, R-4b.

## 2. Current behaviour (validated read-only, `_held-briefs/r4-analyst-parser-validation.md`)

One regex (`ACTION_RE`, `index.html:5647`) scans the `ANALYST_ACTIONS` line. Its firm pattern is case-insensitive,
it ignores `|` / `;`, it keeps the **first** verb and the **first** `$` within 80 characters, it drops rows above
$5,000 or without a `$`, and it reads only the first line. Against the 42-case set: **17** cases give a wrong
`bank`/`action`/`target`, rating-only events are lost in **5**, and no row carries rating or previous-target data.

## 3. Exact change — `index.html`, inside `parsePerplexityContext` (`:5597–5749`) only

**P1 — replace `ACTION_RE` and `_extractActions` (`:5645–5664`)** with local helpers inside the same function:

- **Verb vocabulary** — unchanged set (raised, cut, lowered, trimmed, reduced, boosted, hiked, set, upgraded,
  downgraded, initiated, reiterated, maintained, started, launched, reinstated, resumed), now also matching the
  base, `-s` and `-ing` forms. Output is always the past-tense form above. Groups:
  - target verbs: raised, cut, lowered, trimmed, reduced, boosted, hiked, set;
  - rating verbs: upgraded, downgraded, reiterated, maintained;
  - coverage verbs: initiated, started, launched, reinstated, resumed.
- **Rating vocabulary** (matched case-insensitively, hyphen = space, longest first; output in this spelling):
  Strong Buy, Strong Sell, Buy, Outperform, Overweight, Accumulate, Add, Positive, Hold, Neutral, Equal Weight,
  Market Perform, Sector Perform, Peer Perform, In Line, Market Weight, Sector Weight, Underperform, Underweight,
  Reduce, Sell, Negative. Ratings are read **only** in fixed positions: after `to` / `from … to`; directly after a
  rating or coverage verb (optionally `coverage`, `at`, `with`, `on`); after `with` / `rated` / `at`; or as a
  parenthesis directly after the firm name.
- **Amounts** — `$` + digits with commas/decimals. An amount followed by B / M / K / bn / mn / billion / million /
  thousand is never a target. No ceiling.
- **Splitting** (`_aaItems`):
  1. remove `[` and `]`;
  2. split on `|`, `;` and line breaks;
  3. split again before `while` / `whereas` / `and` / `but` / `meanwhile` **only** when the next words are a
     capitalised name followed by a vocabulary verb ("… while Deutsche Bank raised …"). "… and maintained Neutral"
     stays in the same item;
  4. an item that **starts** with `PT` / `price target` / `target` and has no verb is joined to the previous item
     ("…; PT unchanged at $120").
  Commas never split, so "Stifel, Nicolaus & Co." survives.
- **Per item** (`_aaParseItem`):
  - **Firm** = text before the first vocabulary verb, after removing leading bullets and connector words (and,
    while, whereas, but, also, meanwhile, plus, with). A trailing parenthesis is removed and kept as a rating hint;
    trailing has / have / also / now and trailing commas are removed.
  - The item is rejected when the firm is empty, longer than 60 characters, contains `$`, or is just a connector,
    "the", "consensus" or "analyst(s)". Case is preserved ("jefferies" stays).
  - **Target**, first rule that applies:
    - (a) `from $X to $Y` → target Y, `ptFrom` X;
    - (b) `to $Y[,] from $X` → target Y, `ptFrom` X;
    - (c) a target word followed by an amount, allowing of / at / to / is / was / `unchanged at` / `:` in between.
      `unchanged at` also sets `ptAction: maintained`;
    - (d) an amount followed by a target word ("a $426 PT");
    - (e) coverage verb + rating + `at` / `with a` + amount ("initiated Overweight at $300");
    - (f) when a target word is in the item, `to $Y` ("raised PT by $10 to $300" → 300).
    - (a), (b) and (f) require a target word (`PT`, `price target`, `target`) somewhere in the item.
  - **Rating** = the new rating:
    - the rating after `to`; else the rating after `from … to`; else the rating after a verb; else after
      with / rated / at;
    - else the parenthesis hint.
  - **ratingAction** = the first rating or coverage verb.
  - **ptAction** =
    - the first target verb, but only when the item has a target or a target word;
    - for coverage verbs with a target, that coverage verb;
    - `maintained` for `unchanged at`.
  - **Rating moves worded with a target verb:** when the item has no target and reads `<target verb> to <Rating>`,
    it is a rating action, not a target action. cut / lowered / trimmed / reduced → `downgraded`; raised /
    boosted / hiked → `upgraded`.
  - **`action`** (legacy) = `ptAction` when it is a change (anything except `maintained`); otherwise
    `ratingAction`; otherwise `ptAction`.
  - An item with no `ratingAction` and no `ptAction` is skipped.
- **Rows:**
  - item with a target → `analystActions` row
    `{ bank, action, target, raw, ratingAction, rating, ptAction, ptFrom }`. The four new keys are always present
    (`null` when absent); `raw` = the item text, max 100 characters;
  - item with no target but a `ratingAction` → `ratingOnlyActions` row `{ bank, action, ratingAction, rating, raw }`
    with `action = ratingAction` and no `target` key.
- **De-duplication** (deterministic, first wins):
  - `analystActions` by `bank.toLowerCase() + '|' + target` (unchanged key);
  - `ratingOnlyActions` by `bank.toLowerCase() + '|' + ratingAction + '|' + rating`.
  - Both lists are capped at 5 (unchanged cap for `analystActions`).

**P2 — read the whole `ANALYST_ACTIONS` field (`:5676`).** Use a local reader that returns the labelled line's value
plus every following line up to the next template label line (`^[A-Z_]{3,}:`) or the end of the block. `_readField`
itself is unchanged and still used for every other label.

**P3 — result object (`:5677`, `:5691–5702`).**
- `analystActions` comes from the new extractor (same key, same cap).
- Add `ratingOnlyActions` next to it.
- The `_allNone` expression (`:5705–5712`) is **byte-identical**: rating-only rows do not count, exactly as today
  where they were dropped.

**P4 — `__raw__` fallback (`:5733–5737`).** Use the same extractor on `raw`:
- `analystActions` = its rows;
- add `ratingOnlyActions`;
- `_allNone = rawActions.length === 0` unchanged.

**Brace rule:** `qa/*` suites extract functions by brace matching. Every `{` / `}` inside regex or string literals
in the new code must stay balanced.

**Nothing else changes:**
- `fetchPerplexityContext` and its prompt text;
- `formatNewsContext`, `orchestrate`, `renderMainPanel` (caliper-pinned), `_actionStateOf`, the Scan Results PT
  cell, the Research panel and the retry heuristics;
- `localStorage` / `pt_*` code;
- any UI.

### `BACKLOG.md` — step 10a (effect `close`; CRLF line endings preserved; nothing else changes)

**B1 — new entry 33, closed.** Insert after line `:155` (entry 32's `*Deps:* none.`), before the blank line and
`---` that precede `## LATER`, with one blank line before the heading:

```
### 33 · Fix analyst-action / price-target parsing — **DONE**
**Research / Analysis** · data honesty · **bug, added 2026-10-03**

The analyst-action parser read one regex over the whole `ANALYST_ACTIONS` line: connector words
became firm names ("and"), one firm's clause took the next firm's target, the first verb and the
first `$` won (rating and target changes mixed; "from $300 to $315" read as 300), unrelated
amounts became targets, and rating-only changes and targets above $5,000 were dropped (found in
the 2026-10-03 consistency pilot, ROK).
*Done when:* all 42 parser cases pass; the ROK, CBOE and MRNA regressions pass; the 25
currently-correct legacy bank/action/target outputs are unchanged; rating-only events are
preserved internally but not displayed; no prompt, UI, consumer, retry-logic or live-API change.
*Landed (`work/analyst-parser-r4a/`):* item-by-item parsing with separate rating and price-target
fields. Rating-only display and the structured AI prompt (R-4b) remain separate work.
*Deps:* none.
```

**B2 — DONE / HISTORY line.** Insert immediately after line `:241`
(``**32** Technical snapshot reuses a stale price — `work/tech-snapshot-price-cache/` ·``):

```
**33** Fix analyst-action / price-target parsing — `work/analyst-parser-r4a/` ·
```

## 4. Consumers (none edited) and what they will see

| Consumer | Reads | Effect after R-4a |
|---|---|---|
| `formatNewsContext` (`:5760`) — Anthropic context | `bank`, `target` | Correct firm names and targets (ROK: "Deutsche Bank PT $500", "UBS PT $475" instead of "and PT $500 / $475"). Prompt template unchanged |
| `orchestrate` "verify if recent" alerts (`:6043–6048`) | `bank`, `target` | same values, now correct |
| AI-failure fallback alerts (`:6612`) | `bank`, `target` | same |
| `item._catalysts.analystActions` (`:6135`) → `pt_results` | whole row | rows gain 4 keys; old stored rows lack them and stay valid; `ratingOnlyActions` is **not** persisted (no `orchestrate` edit) |
| Catalysts panel (`:8091`, inside caliper-pinned `renderMainPanel`) | `bank`, `action`, `target` | **Row colour follows the target change** (Ruling 1): CBOE Goldman "upgraded + cut" turns red; "maintained Buy and raised PT" turns green. MRNA Citi "downgraded to Sell + raised PT to $80" turns **green**: the rating downgrade will only be visible once the rating-display slice lands |
| Scan Results PT cell (`:10478`) | first row `bank`, `target` | correct first row |
| Research panel (`:11322`) | `bank`, `action`, `target` | wording follows the new `action` |
| Retry heuristics (`:6345–6392`) | `analystActions.length` | counts reflect correct parsing; may change a retry decision at the margin; logic unchanged |

No `qa/*` suite reads `analystActions` or calls `parsePerplexityContext`, so no existing test changes.

## 5. Tests — `qa/analyst_parser_offline.js` (new) + `qa/fixtures/analyst-parser/cases.json` (new)

- **Fixture:** an exact copy of `C:\Users\Owner\Documents\Project\_held-briefs\r4a-analyst-parser-cases.expected.json`
  (sha256 `f01adf53c416547b4e68e63df36a1b701a588225b866cfe1c5daa043b13bf268`, 42 cases).
  - It holds the 40 validation cases from `r4-parser-cases.json`, plus X1 ("JPMorgan cut to Neutral from
    Overweight") and X2 ("Citi lifted its PT to $300", the documented residual).
  - Each case has its exact expected `analystActions` (without `raw`) and `ratingOnlyActions` (without `raw`).
  - The fixture is copied, never edited.
- **Harness:**
  - `parsePerplexityContext` is extracted with the `extractFunctionSource` pattern of `qa/deep_dive_v0_offline.js`
    and run in a `new Function` sandbox with a silent `console`.
  - Each case is fed as `TICKER: TST\nANALYST_ACTIONS: <input>\nEARNINGS: NONE\n`; multi-line inputs exercise P2.

| ID | Assertion |
|---|---|
| AP-1 | For all 42 cases: `analystActions` and `ratingOnlyActions` deep-equal the fixture, ignoring `raw`. `raw` is a string of at most 100 characters |
| AP-2 | **Regression ROK (8a):** 4 rows — Goldman Sachs cut 485 (maintained, Neutral); **Deutsche Bank** raised 500 (maintained, Equal Weight); **UBS** initiated 475 (Hold); Wells Fargo initiated 426. No row has `bank` "and" |
| AP-3 | **Regression CBOE (8b):** Goldman Sachs `action: cut`, `ratingAction: upgraded`, `rating: Neutral`, `ptAction: cut`, target 300. Piper Sandler `action: maintained`, `ptAction: null`, target 320 |
| AP-4 | **Regression MRNA (8c):** Citigroup `action: raised`, `ratingAction: downgraded`, `rating: Sell`, `ptAction: raised`, target 80 |
| AP-5 | from/to: 6a, 6b, 11e give target = Y and `ptFrom` = X; 8d and 8i (`to $Y, from $X` / `to $Y from $X`) likewise; 11b "by $10 to $300" gives 300 and `ptFrom: null` |
| AP-6 | Unrelated amounts: 10b ($2.3B revenue) and 10c ($1,250 share price) give **no** `analystActions` row and one rating-only row each |
| AP-7 | Rating-only preserved: 4b, 10a, 10b, 10c, X1 each give exactly one `ratingOnlyActions` row and no `target` key |
| AP-8 | No ceiling: 11a gives target 5600 |
| AP-9 | Firm names: no row's `bank` matches `^(and\|while\|whereas\|but\|also\|meanwhile\|plus\|with)\b`; 8f keeps "Stifel, Nicolaus & Co." and "Keefe, Bruyette & Woods"; 8e keeps "jefferies" |
| AP-10 | Shape: every `analystActions` row has exactly the keys `bank, action, target, raw, ratingAction, rating, ptAction, ptFrom`, with `target` a finite number > 0. Every rating-only row has exactly `bank, action, ratingAction, rating, raw` |
| AP-11 | Legacy compatibility: for the 25 cases whose legacy output is already correct (all except the 17 listed in §6), `bank` / `action` / `target` equal the baseline parser's values. These are embedded as literals, captured at Step 0 from the baseline |
| AP-12 | Determinism and de-duplication: two parses of every case give identical JSON. 8j gives one row; 8k gives two rows in input order; 11g is capped at 5 |
| AP-13 | `_allNone`: for a block whose only analyst content is rating-only (10a) with all other labels NONE, `_allNone === true`, as at baseline. The `_allNone` expression is byte-equal to the baseline (sha256 pin captured at Step 0) |
| AP-14 | Static isolation: every function in `index.html` other than `parsePerplexityContext` is byte-equal to the baseline, via a sha256 pin of the file with that function's body masked, captured at Step 0. The `fetchPerplexityContext` query literal is byte-equal. The new code contains no `localStorage`, `fetch`, `document` or `window` |

**Planted negatives** (each must fail the named row):
- case-insensitive firm start → AP-2 / AP-9;
- first `$` as target → AP-5;
- `< 5000` ceiling restored → AP-8;
- amounts allowed without a target word → AP-6;
- rating-only rows dropped → AP-7;
- `action` = first verb → AP-3 / AP-4;
- continuation lines ignored → AP-1 (11f);
- a consumer function edited → AP-14.

**RED before implementation (required, recorded in `review.md`):** run the suite against the baseline after writing
the tests. It must fail with at least:
- 17 legacy mismatches — `1b 2b 6a 6b 7c 8a 8b 8c 8d 8f 8h 10b 10c 11a 11b 11e 11f`;
- 32 cases with missing structured fields;
- 5 missing rating-only events — `4b 10a 10b 10c X1`.

(Measured against `dd51188` with a scratch harness on 2026-10-03.)

<!-- land-scope:begin -->
index.html
qa/analyst_parser_offline.js
qa/fixtures/analyst-parser/cases.json
BACKLOG.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/analyst_parser_offline.js
node qa/vis_score_caliper_offline.js
node qa/deep_dive_v0_offline.js
<!-- land-tests:end -->

## 6. Files — exactly 5

```
index.html                                  P1–P4, inside parsePerplexityContext only (CRLF preserved)
qa/analyst_parser_offline.js                NEW — §5
qa/fixtures/analyst-parser/cases.json       NEW — exact copy of the held fixture (sha256 f01adf53…)
BACKLOG.md                                  B1 and B2 only (step 10a, effect close)
work/analyst-parser-r4a/review.md           NEW — RED/GREEN evidence; ## Backlog reconciliation (close, entry 33); LAND-EVIDENCE
```

None is ASK- or DENY-tier or protected.

## 7. Residual ambiguity after R-4a (stated, not fixed)

| Case | Remaining ambiguity |
|---|---|
| 8k | Same firm, two targets: both kept in input order. Dates are not parsed, so neither is marked as the newer one |
| 3a, 3b, 8b-Piper | "upgraded/maintained … with a $X PT": the target is stated but whether it changed is unknown (`ptAction: null`) |
| 4a | "PT unchanged at $X" → `ptAction: maintained` (an interpretation) |
| 8d | "(Neutral)" after the firm is read as the current rating with no `ratingAction`; it could also be the prior rating |
| 11c | "set a $50 PT with Buy": rating without a rating action |
| X1 | "cut to Neutral" read as a downgrade (inferred from the verb) |
| X2 | Verbs outside the vocabulary (lifted, slashed, bumped, moved) are still not recognised: no row. Vocabulary is unchanged by design |
| — | A firm whose own name contains " and " followed by a capitalised word and a verb (e.g. "Fox and Company raised …") would be split; none seen in the data |
| 8c | Correct per Ruling 1, but the catalyst row turns green for a Sell downgrade until the rating-display slice |

## 8. Flow, STOP, Definition of Done

**Pre-flight checklist (`plan.md`):**
- **Pattern Auditing:** `qa/deep_dive_v0_offline.js` (extract + sandbox) and `_readField` / `_splitList` (label
  reading).
- **State and boundaries:** no `pt_*` code touched; the persisted change is additive via existing `orchestrate`
  copying.
- **Gate Verification:** not applicable, stated. This hardens an always-on parser; there is no new capability or gate.
- **Definition of Done:** below.

**Flow:** AGENTS.md steps 0–16, Mode Manual (attended).
- Step 0: one full `qa:offline` (one at a time on the machine), capture the AP-11 / AP-13 / AP-14 baseline values.
- Tests first: RED as specified. Then P1–P4, GREEN, then the land-tests.
- Full `qa:offline` = baseline + 1.
- Step 10a: B1 and B2; `review.md` with `## Backlog reconciliation` (`close` / entry 33 DONE).
- Codex review; FIX / DEFER / REJECT.
- LAND and push through R12 with the Owner's two lines; cleanup.
- **No live Perplexity or Anthropic call.**

**STOP:**
- STOP-1..6;
- any `index.html` change outside `parsePerplexityContext`;
- any change to the prompt text, a consumer, `_allNone` or the retry logic;
- the fixture not byte-equal to the held file;
- an AP-11 legacy case changing;
- caliper or `qa/deep_dive_v0_offline.js` failing;
- any `BACKLOG.md` edit beyond B1 and B2, or any `pt_*` code edit;
- a live API call;
- any edit to an existing test;
- a RED run that does not fail as specified;
- a `qa:offline` count other than baseline + 1.

**Definition of Done** (= the entry-33 DONE conditions, Owner 2026-10-03):
- all 42 parser cases pass (AP-1);
- the ROK, CBOE and MRNA regressions pass (AP-2…AP-4);
- the 25 currently-correct legacy `bank` / `action` / `target` outputs are unchanged (AP-11);
- rating-only events are preserved internally (`ratingOnlyActions`, AP-7) and not displayed;
- no prompt, UI, consumer, retry-logic or live-API change (AP-13, AP-14, STOP list);
- P1–P4 and B1–B2 exact;
- AP-1…AP-14 and the planted negatives PASS;
- RED and GREEN evidence in `review.md`;
- land-tests PASS;
- full `qa:offline` = baseline + 1;
- Codex with no unresolved Class I finding;
- LANDed, pushed, cleaned.
- After push, the DEV check of a real scan needs a separate Owner OK (live APIs).

