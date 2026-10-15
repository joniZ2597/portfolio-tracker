# Task brief: analyst-action-coverage-1 — read the analyst actions the parser misses or misreads

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 3, re-pinned, HELD — NOT R11-ready** (COWORK, 2026-10-16).
- **Rev 3** answers the Codex review of rev 2: verdict **Conditional pass** (preserved in `shared-reports/codex/2026-10-16_analyst-action-coverage-1-brief-review.md`) with two Class I findings. Both were confirmed and fixed; the N-8 "and" firm-name split is guarded.
- **Rev 2** added N-8 and N-9.
- Prior revisions are kept in `rev1/` and `rev2/`.
- A focused Codex re-check of the rev 2 → rev 3 delta is required before R11. Re-pinned to `branch-dev` = `origin/branch-dev` = `05e9fac` (`research-ai-context-1` LANDed as `9a49190`). Its `index.html` (LF sha256 `ad9f0707…d5ac`) is identical to the pre-re-pin base, so every anchor and result is unchanged. **Remaining before R11:** independent Codex brief review, the Main Control / Owner package, final hash acceptance, and the Owner's go-ahead after the DEV validation review. Pre-re-pin copy: `pre-repin/`.


| | |
|---|---|
| Problem (live + real stored text) | Of 10 analyst actions in the 8 live responses: **4 correct, 4 partial, 2 lost, 0 wrong numbers**. Two stored real items are misattributed. Findings: <ul><li>**N-1:** "J.P. Morgan **reaffirmed** Buy and $625 PT" is dropped.</li><li>**N-2:** "Truist maintained Buy **at $110**" loses the target.</li><li>**N-3:** "**Equalweight**" is not read as a rating.</li><li>**D-12:** "cut PT **$24 from $27**" loses the from-target.</li><li>**D-7:** "PT **$180 → $200**" is read as 180.</li><li>**D-5:** a "**consensus** PT $109.48" is booked as Wall Street Zen's own target.</li><li>**D-6:** the firm is read as "**Energy stock saw a 12-month price target**".</li><li>**N-9** (DEV validation, GEV live): "cut PT to $1,270 **(October 14)** from $1,300" loses the from-target when a date sits between the target and "from" (also stored CRWD).</li><li>**N-8** (DEV validation, NVDA live): "**KeyBanc, Mizuho, and UBS** reiterated …" keeps only UBS.</li></ul> |
| Objective | The parser reads these forms correctly. Every other analyst-action result is unchanged: the 42-case fixture, the existing suites and the unrelated live / stored items |
| Source | `shared-reports/research/2026-10-15_live-perplexity-sampling.md` (N-1…N-3, D-5…D-7, D-12); `shared-reports/deploy/2026-10-16_cycle-N-six-ticker-dev-validation.md` (N-8, N-9); captures `…/2026-10-15_live-capture/raw-captures.json` (sha256 `e6230373…87ca`) |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | **`research-ai-context-1` LANDed.** Same function (`parsePerplexityContext`) and pin map, and that task's suite consumes these parser outputs |
| Baseline / start (§TS) | Start at the current tip T **after** that LAND. Valid only if all of these hold; otherwise HOLD: <ul><li>`qa/analyst_parser_offline.js` = `fd2624ea8f5262a6600560891202713fe2be494a`;</li><li>`qa/research_parser_hygiene_offline.js` = `294068a9705e7bc56e18738aebba9dbd89359e32`;</li><li>`qa/research_ai_context_offline.js` = `9a91e9a6f1ff69f5d6bd0cbacf5682a3745871cf`;</li><li>every §2 anchor occurs exactly once in `index.html`.</li></ul> |
| Branch / slot / mode | `task/analyst-action-coverage-1` · **Worker A** · **Manual** |
| qa:offline | step-0 count **+1** (`qa/analyst_action_coverage_offline.js`) |
| Parallel with | nothing in lane A (sequential). Lane B is unassigned |
| Scoring boundary | No scoring code, prompt text, `formatNewsContext` or persisted shape is changed. The AI receives more complete analyst lines, so AI-generated fields may shift: the same principle as `research-ai-context-1` OD-1 |

## §1 Files (exactly)

- `index.html` — **only** the `_aa*` helpers inside `parsePerplexityContext` (§2)
- `qa/fixtures/index-pins.json` — `--update`; only `parsePerplexityContext` and the file digest change
- `qa/analyst_action_coverage_offline.js` (new)
- `qa/research_ai_context_offline.js` (landed blob `9a91e9a6…`) — **exactly three expected deltas**. Verified by running the landed suite against the candidate: RC-3, RC-4 and RC-6 fail; the other 28 asserts pass.
  - **RC-3:** the ENPH expected strings become `Morgan Stanley: PT cut to $24 from $27; maintained Underweight (October 14; year unverified)` and `Susquehanna: PT cut to $35 from $37; maintained Neutral (October 14; year unverified)`. MSFT / RBC strings unchanged.
  - **RC-4:** no capture keeps a rating-only action (Truist becomes a PT action). RC-4 is re-pointed to a fixed input built from the real stored item `Wall Street Zen upgraded FROG from Hold to Buy, consensus PT $109.48 (October 10)` **plus one BULLISH line** (so the block is not all-none). It asserts the line `RATING ACTIONS (no PT): Wall Street Zen: upgraded Buy (October 10; year unverified)`. RC-N3 keeps targeting RC-4.
  - **RC-6:** in `BASE`, only the `analystActions` / `ratingOnlyActions` of `MSFT#2` (adds J.P. Morgan / reaffirmed / 625 / Buy), `FROG#3` (Morgan Stanley rating Equal Weight; Truist / maintained / 110 / Buy as a PT action; no rating-only) and `ENPH#4` (ptFrom 27 / 37).

  Any other change to that suite is a STOP.
- `work/analyst-action-coverage-1/review.md`

**Forbidden:**
- `formatNewsContext` and every other function;
- `qa/analyst_parser_offline.js` and its fixtures (57 / 57 and 42 cases, unchanged);
- `qa/research_parser_hygiene_offline.js`;
- `netlify/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Exact change (reference `evidence/aac-apply.py`, rev 3; 14 anchored edits)

| # | Change |
|---|---|
| E-1 (AC-1) | Rating verb group gains `reaffirmed: ['reaffirmed','reaffirms','reaffirm','reaffirming']`, reported as `reaffirmed` |
| E-2 (AC-3) | Rating names match with an optional separator (`[\s-]*` instead of `[\s-]+`). `_aaRatingName` compares without spaces / hyphens, so "Equalweight" → `Equal Weight` |
| E-3 (AC-2, AC-4, AC-5, AC-6) | New rules: <ul><li>**B2** `PT $X, from $Y` → target X, from Y. Placed after B, before A2 / C;</li><li>**A3** `PT [to] $X → $Y` / `->` → target Y, from X. **Anchored to a target word (rev 3)**, so a share-price move written with an arrow is never read as a target (AC-16). Placed after A2;</li><li>**E2** `maintained / reiterated / reaffirmed <Rating> at / with $X` → target X, **unless the amount is followed by "per share" / "a share" / "/share" / "share" (rev 3)**; then it is a rating-only action (AC-17, AC-18). Placed after E, before F;</li><li>**consensus guard** — when the target equals an amount introduced by "consensus / average / mean / median (price) target / PT", the target is dropped. A rating action stays as a rating-only action</li></ul> |
| E-4 (AC-7) | A firm string containing stock(s) / shares / saw / (price) target(s) is not a firm (the item is dropped) |
| E-5 (N-9) | New rule **B3** `PT [to] $X (…) [,] from $Y` → target X, from Y. **Rev 3:** anchored to a target word, and the parenthetical (≤ 40 characters) **may not contain a `$` amount**. So a share-price move such as "stock jumped to $95 (October 2) from $88" is never read as a target (AC-14, AC-15). Placed after B2. The date is still read from `raw` by `formatNewsContext` |
| E-6 (N-8) | `_aaItems` splits before a connector ("and", "while" …) only when the part **before** it has its own action verb. A firm list such as `KeyBanc, Mizuho, and UBS reiterated …` therefore stays one item; two complete clauses still split as today |
| E-7 (N-8) | `_extractActions`: when the parsed firm contains " and ", it is split on commas / "and" into separate firms. Each gets the same verb, rating and target, then the existing dedupe and the 5-action caps apply. Firm names with commas but no "and" (e.g. `Keefe, Bruyette & Woods`) are not split. **Rev 3:** if any split part is a corporate suffix (Co / Co. / Cos / Company / Partners / Associates / Sons), the whole string stays one firm ("Johnson Rice and Company", "Stifel, Nicolaus and Company"; AC-19, AC-20) |

## §3 QA — new suite `qa/analyst_action_coverage_offline.js`

Extract `parsePerplexityContext` as `analyst_parser_offline` does; pure Node.

| Row | Input | Expect |
|---|---|---|
| AC-1 | `J.P. Morgan reaffirmed Buy and $625 PT (October 13)` | J.P. Morgan / reaffirmed / 625 / Buy |
| AC-2 | `Truist maintained Buy at $110` | Truist / maintained / 110 / Buy; no rating-only entry |
| AC-3 | `Morgan Stanley raised PT to $100 and maintained Equalweight` | rating `Equal Weight` |
| AC-4 | `Morgan Stanley cut PT $24 from $27 and maintained Underweight (October 14)` | 24 from 27 |
| AC-5 | `Goldman raised PT $180 → $200 (Oct 2)` | 200 from 180 |
| AC-6 | `Wall Street Zen upgraded FROG from Hold to Buy, consensus PT $109.48` | no PT action; rating-only Wall Street Zen / upgraded / Buy |
| AC-7 | `Energy stock saw a 12-month price target cut to $46.51` | nothing |
| AC-U1…U5 | PA-S07 `$180 to $200`; `by $10 to $300`; Barclays `to $600 from $512`; `initiated Equal-Weight with a $301 PT`; `Analysts average PT $150` | unchanged |
| AC-8 | the 8 live captures | only MSFT, FROG and ENPH analyst arrays change, exactly as in §1; all other parsed fields identical |
| AC-9 | 21 real stored items (as listed in `evidence/stored-items.txt`) | 16 identical; 5 intended changes: <ul><li>FROG → rating-only;</li><li>CRWD TD Cowen gains from 250;</li><li>**CRWD StoneX gains from 250 (N-9)**;</li><li>MSFT Wells Fargo gains from 700;</li><li>ENPH → nothing</li></ul> |
| AC-10a–c (N-9) | `Susquehanna maintained Buy and cut PT to $1,270 (October 14) from $1,300` · `JPMorgan … cut PT to $1,150 (October 9) from $1,330` · `StoneX maintained Buy and raised PT $325 (October 6) from $250` | 1270 from 1300 · 1150 from 1330 · 325 from 250 |
| AC-11 (N-8) | `KeyBanc, Mizuho, and UBS reiterated bullish stances; consensus PT approximately $322–$334` | rating-only ×3: KeyBanc, Mizuho, UBS / reiterated / null; no PT action (consensus range ignored) |
| AC-12 (N-8) | `Goldman Sachs and Morgan Stanley raised PT to $500 (Oct 2)` | two PT actions, 500 each |
| AC-13 | `Oppenheimer reiterated Buy at $1,450 and RBC maintained Buy at $1,225` (GEV live) | two PT actions: 1450 / Buy, 1225 / Buy (E2 + unchanged clause split) |
| AC-U6, U7 | `Keefe, Bruyette & Woods raised PT to $60` · `Goldman raised PT to $500 and Morgan Stanley cut PT to $400` | unchanged |
| AC-14 | `Citi maintained Buy and raised PT to $120 as the stock jumped to $95 (October 2) from $88` | 120, from null (not 95 from 88) |
| AC-15 | `Citi cut PT to $100 (estimate $90) from $80` | 100, from null (no `$` inside the parenthetical) |
| AC-16 | `Citi raised PT to $120 as shares moved $90 → $95` | 120, from null |
| AC-17, AC-18 | `Truist maintained Buy at $110 per share` · `… at $110 a share` | no PT action; rating-only Truist / maintained / Buy |
| AC-19, AC-20 | `Johnson Rice and Company raised PT to $60` · `Stifel, Nicolaus and Company cut PT to $45` | one firm each, full name |
| AC-21 | `KeyBanc, Mizuho, and UBS raised PT to $300 \| Jefferies cut PT to $250 \| Citi raised PT to $320 \| BofA raised PT to $310` | the existing 5-action cap keeps the first 5 in source order: KeyBanc, Mizuho, UBS, Jefferies, Citi (BofA dropped). Documents R-8 |
| AC-22, AC-23 | `Argus upgraded to Strongbuy and set PT $200` · `Evercore reiterated its view; results inline with estimates` | rating `Strong Buy` · prose "inline" is not a rating |
| AC-24, AC-25 | `Wall Street Zen upgraded to Buy, consensus PT $322–$334` · `Citi raised PT to $350, above consensus PT of $330` | consensus range dropped (rating-only) · firm PT 350 kept |
| AC-N1…N12 | planted negatives, one per rule or guard: E-1, E-2, B2, A3 (+ its PT anchor), E2 (+ its share lookahead), consensus guard, firm filter, B3 (+ its PT anchor, + its no-`$` rule), list-split guard, multi-firm emit, corporate-suffix guard | the matching row fails |

**Must stay green:**
- `analyst_parser_offline` 57 / 57 (unchanged file);
- `research_parser_hygiene_offline` 18;
- `research_ai_context_offline` (with the §1 deltas only);
- `tase_units_offline`;
- `no_synthetic_score_offline`;
- `high1y_label_offline`;
- `tech_snapshot_cache_offline`;
- `index_pins_offline`;
- `index-pins --check`.

**Sandbox preflight** (`evidence/feasibility.md`):
- AC rows (rev 3): **32 / 32 at candidate; 18 fail at base `05e9fac`**. The rev-2 candidate fails exactly the 7 new risk rows (AC-14…AC-20), which shows each row detects its defect.
- Rev 3 vs rev 2 on all real text (8 live captures, 21 stored items): **identical**.
- Rev 2 vs rev 1 on the 8 live captures: identical, so the three RC deltas are unchanged.
- All coupled suites pass.
- Pin delta: `parsePerplexityContext` only.
- `rac-proto` RC rows: only RC-3b, RC-4 and RC-6 change, as expected.

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | the new suite; AC-1…AC-7 fail on the current source |
| S2 GREEN | E-1…E-4; the §1 deltas to `research_ai_context_offline`; `--update`; all rows + negatives + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1 / §2;
- any `analyst_parser_offline` expectation change;
- a `research_ai_context_offline` change beyond the listed deltas;
- a pin delta beyond `parsePerplexityContext`;
- a denied protected action or an integrity FAIL.

## §5 Risks

| # | Risk | Assessment / control |
|---|---|---|
| R-1 | AI output shifts (fuller analyst lines) | Same principle as `research-ai-context-1` OD-1; no scoring code changes |
| R-2 | Optional separator matches unusual one-word forms ("Inline" for In Line, "Strongbuy") | These only match in rating positions (after to / with / at / a rating verb). Acceptable |
| R-3 | E2 reads an "at $X" price as a target | **Closed in rev 3** for the per-share forms (AC-17, AC-18). Residual: an unlabelled price right after "maintained <Rating> at $X" is still read as a target, which is the intended reading of that phrase |
| R-4 | The consensus guard drops a real firm target | Only when the target amount equals the amount introduced by the consensus / average phrase |
| R-5 | The firm filter rejects a real firm | No known firm name contains those words; the 42-case fixture is unchanged |
| R-7 | E-7 splits a firm name that itself contains " and " | **Guarded in rev 3** for the corporate-suffix forms (AC-19, AC-20). Residual: a two-word firm joined by "and" with no suffix would still split. None is known in sell-side coverage |
| R-8 | A firm list uses several of the 5 action slots | **Accepted limitation.** The existing cap is unchanged (it is pinned by `analyst_parser_offline`), and order is deterministic (AC-21) |
| R-9 | **Pre-existing, out of scope (N-10):** the landed A2 rule (`$X to $Y`, research-parser-hygiene-1) also reads a share-price move ("shares rose $90 to $95") as a target when a PT word is in the same item | Not changed here: its anchor text is pinned by `research_parser_hygiene_offline` (unchanged file). Recorded for a Main Control decision |
| R-6 | **Observed at re-pin (pre-existing, out of scope):** a block whose only content is rating-only actions is `_allNone`, so `formatNewsContext` returns the all-none sentence and the RATING ACTIONS line is not sent | Not changed here, because changing `_allNone` alters the retry / data-missing inputs. Recorded for the Owner as a separate decision (see the DEV validation report) |

## §7 Decisions

AD-1 (`reaffirmed` label), AD-2 (consensus → rating-only) and AD-3 (firm filter words) are COWORK defaults within the existing R-4a parser design. They go to the Owner only if Codex disputes them.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/analyst-action-coverage-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/analyst_action_coverage_offline.js
node qa/analyst_parser_offline.js
node qa/research_parser_hygiene_offline.js
node qa/research_ai_context_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/analyst-action-coverage-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/analyst-action-coverage-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/analyst_action_coverage_offline.js
qa/research_ai_context_offline.js
work/analyst-action-coverage-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/analyst_action_coverage_offline.js
node qa/analyst_parser_offline.js
node qa/research_ai_context_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
