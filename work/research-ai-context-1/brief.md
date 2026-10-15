# Task brief: research-ai-context-1 — guidance, contracts, peer moves and full analyst-action detail reach the AI

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT, HELD** (COWORK, 2026-10-15). Swept at `branch-dev` = `origin/branch-dev` = `5be9c6a`. Codex brief review done (HOLD, adjudicated; `shared-reports/codex/2026-10-15_research-ai-context-1-brief-review.md`). **Rev 3** (2026-10-15) applies the Main Control corrections:
- retry wording (E-2, R-7);
- size bounds (R-5);
- year-less analyst dates U-1 (E-3, E-5, E-7; RC-10).

A focused Codex re-check of the rev-3 delta, plus Owner decisions OD-1…OD-4 (§7), come before R11. Rev 2 recorded the R-4b relation (OD-4). Prior revision: `rev2/`.

| | |
|---|---|
| Problem (live evidence, 8 Perplexity responses, 2026-10-15) | <ul><li>The scan prompt asks for GUIDANCE, CONTRACTS and PEER_MOVE, but `parsePerplexityContext` never reads them and `formatNewsContext` never sends them. **11 substantive fields in 6 / 8 responses** never reached the AI (NVDA ×3, NXSN.TA ×3 + ×2, MSFT, QQQ, MGOR.TA).</li><li>Analyst actions reach the AI as `Bank PT $X` only: no direction, from-target, rating or date. ENPH's two **cuts** read "Morgan Stanley PT $24 \| Susquehanna PT $35".</li><li>Rating-only actions are parsed but never sent (FROG "Truist maintained Buy").</li></ul> |
| Objective | The AI's research block carries those three fields and the full parsed analyst detail. Nothing else in the scan changes: no scoring code, no prompt text, no persisted shape, no UI |
| Source | `shared-reports/research/2026-10-15_live-perplexity-sampling.md` (D-9, D-10); captures `…/2026-10-15_live-capture/raw-captures.json` (sha256 `e6230373a999d09eb0d9507b3db3da17a0032adca389f08841e2c49b9cb887ca`) |
| Backlog | none (research stability findings). No `BACKLOG.md` edit. **Related:** BACKLOG 33-residual R-4b ("rating-only display / strict analyst template", ruling pending per ai-output-2 AO2-4). This task sends rating-only actions to the **AI context only**; R-4b's display and strict-template parts stay open and unchanged (OD-4) |
| Baseline / start (§TS) | Start at the current tip T. Valid only if **all** of these hold; otherwise HOLD: <ul><li>`qa/analyst_parser_offline.js` is blob `fd2624ea8f5262a6600560891202713fe2be494a`;</li><li>`qa/research_parser_hygiene_offline.js` is blob `294068a9705e7bc56e18738aebba9dbd89359e32`;</li><li>every §2 anchor occurs exactly once in `index.html`.</li></ul> |
| Branch / slot | `task/research-ai-context-1`, **Worker A** |
| Mode | **Manual** (`index.html`) |
| qa:offline | step-0 count **+1** (`qa/research_ai_context_offline.js`) |
| Parallel with | nothing planned. The follow-ups `analyst-action-coverage-1` and `catalyst-hygiene-2` also edit `index.html` and run after this one |
| Scoring boundary | No change to `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_techCache`, `fetchAnthropicAnalysis` (system / user prompt text, model, `max_tokens`) or the AI output parser. **The AI's input changes, so AI-generated fields can change** (§5, OD-1) |

## §1 Files (exactly)

- `index.html` — **only** inside `parsePerplexityContext` and `formatNewsContext` (§2)
- `qa/fixtures/index-pins.json` — `node qa/tools/index-pins.js --update`. Only those two functions and the file digest may change
- `qa/fixtures/research-live-2026-10-15.json` (new) — byte copy of the capture file above (sha256 `e6230373…87ca`)
- `qa/research_ai_context_offline.js` (new)
- `work/research-ai-context-1/review.md`

**Forbidden:**
- every other function, including `fetchAnthropicAnalysis`, `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `renderMainPanel` and every renderer;
- the `item._catalysts` shape and anything persisted (`pt_results`);
- `qa/analyst_parser_offline.js` and its fixtures; `qa/research_parser_hygiene_offline.js`;
- `netlify/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 Exact change (anchors at `5be9c6a`; reference implementation `evidence/rac-apply.py`, diff `evidence/candidate-index.diff`)

| # | Where | Change |
|---|---|---|
| E-1 | `parsePerplexityContext` → `flushTicker`, after `const earnings = _readField('EARNINGS', …) \|\| 'NONE';` | `const guidance = _readField('GUIDANCE', currentLines);`, the same for `contracts` (`CONTRACTS`) and `peerMove` (`PEER_MOVE`). `_readField` already returns `''` for absent / NONE |
| E-2 | result object, after `earnings,` | add `guidance, contracts, peerMove,`. No other key changes. Arrays, caps, `_allNone`, the `__raw__` path and the **retry-decision inputs** (`_allNone`, counts, parsed fields read by `_detectWeakPerplexity` / `_retryIsBetter`) are unchanged. **Every AI call, including any retry, receives the expanded research context**, because `fetchAnthropicAnalysis` builds it with `formatNewsContext` on each call |
| E-3 | `formatNewsContext`, before the `_allNone` return | local helpers: `_cap(v, 300)` (trim, cut to 300 with "…"); `_dateOf(raw)`, which takes the first "(Mon D[, YYYY])" in the action's `raw`. **U-1 date rule:** <ul><li>the date appears **exactly as reported**;</li><li>a year is **never inferred or inserted**;</li><li>a year-less date renders as `Mon D; year unverified` and sets a flag.</li></ul> The task does not look up the year elsewhere; verifying it against other sources is out of scope. Then Build `_extra` = `GUIDANCE: …`, `CONTRACTS: …`, `PEER MOVE: …` for non-empty fields. The `_allNone` return keeps its sentence **verbatim** and appends `_extra` lines only when present |
| E-4 | analyst line | each action renders `Bank: PT <verb> to\|at $T[ from $F][; <ratingAction> <rating>][ (<date>)]`. The verb is `ptAction`, or `ratingAction` when no rating is named. "to" is used for raised / cut / lowered / trimmed / reduced / boosted / hiked, "at" otherwise. The "No verified analyst PTs…" line is unchanged |
| E-5 | after the analyst block | when `ratingOnlyActions` is non-empty: `RATING ACTIONS (no PT): Bank: <action> <rating>[ (<date>)] \| …`. If any rendered date was year-less, add the line: `DATE NOTE: analyst dates marked "year unverified" are as reported by the source, without a year. The year is not verified; do not treat these actions as recent on that basis.` |
| E-6 | after the EARNINGS line | `lines.push(..._extra);` |
| E-7 | the analyst-line freshness tag | ` [data: <freshness>]` → ` [research freshness: <freshness>]`. It names the research as a whole, so it is not read as an action date (U-1) |

**Example, MSFT capture — before:**

    ANALYST ACTIONS: Barclays PT $600 | Morgan Stanley PT $600 [data: today]

**After:**

    ANALYST ACTIONS: Barclays: PT raised to $600 from $512; maintained Buy (October 14; year unverified) | Morgan Stanley: PT $600; maintained Buy (October 14; year unverified) [research freshness: today]
    DATE NOTE: analyst dates marked "year unverified" are as reported by the source, without a year. The year is not verified; do not treat these actions as recent on that basis.
    …
    CONTRACTS: Contracted capacity is a current AI-infrastructure investor focus (October 12); no specific new Microsoft contract or backlog figure reported

## §3 QA — new suite `qa/research_ai_context_offline.js`

Extract the real `parsePerplexityContext` and `formatNewsContext` from `index.html` (brace matching, as in `analyst_parser_offline`). Use the fixture file; assert its sha256 first (RC-0). Pure Node; no network, no storage.

| Row | Assertion |
|---|---|
| RC-0 | fixture sha256 = `e6230373…87ca`, 8 captures |
| RC-1 | on all 8 captures, every non-NONE GUIDANCE / CONTRACTS / PEER_MOVE value (11 fields) appears in the context as `GUIDANCE: ` / `CONTRACTS: ` / `PEER MOVE: ` + value (first 120 chars) |
| RC-2 | NONE / absent fields produce no line (FROG) |
| RC-3 | exact substrings: <ul><li>MSFT `Barclays: PT raised to $600 from $512; maintained Buy (October 14; year unverified)`;</li><li>ENPH `Morgan Stanley: PT cut to $24; maintained Underweight (October 14; year unverified)` and `Susquehanna: PT cut to $35; maintained Neutral (October 14; year unverified)`;</li><li>FROG `RBC: PT maintained at $118 (October 13; year unverified)`</li></ul> |
| RC-4 | FROG has the line `RATING ACTIONS (no PT): Truist: maintained Buy` |
| RC-5 | no invented numbers: every `$` amount in the ANALYST ACTIONS line occurs in that capture's raw ANALYST_ACTIONS field (8 captures) |
| RC-6 | the existing parsed fields (analystActions, ratingOnlyActions, bullish / bearish / macro, earnings, revisionDirection, dataFreshness, `_allNone`) equal the base values recorded in the suite for all 8 captures |
| RC-7 | `_allNone` with no new fields → exactly the current sentence; with GUIDANCE → that sentence + `\nGUIDANCE: …` |
| RC-8 | `_unavailable`, missing-ticker and `__raw__` outputs are unchanged (exact strings / synthetic `__raw__` input) |
| RC-9 | a 500-char GUIDANCE renders as 300 chars ending "…" |
| RC-10 | U-1: <ul><li>(a) `(Oct 2)` → `(Oct 2; year unverified)` plus the DATE NOTE line;</li><li>(b) `(Oct 2, 2025)` → as reported, with no marker and no note;</li><li>(c) on all 8 captures, no 4-digit year appears in the ANALYST / RATING lines unless it is in the raw capture (never inferred);</li><li>(d) the tag reads `[research freshness: …]` and `[data: ` is gone</li></ul> |
| RC-N1…N4 | planted negatives on a mutated copy (each anchor exactly once), each must fail: <ul><li>`lines.push(..._extra)` removed → RC-1;</li><li>`ptFrom` / direction removed from E-4 → RC-3;</li><li>E-5 removed → RC-4;</li><li>the year-less marker removed → RC-10a</li></ul> |

**Must stay green (unchanged files):**
- `analyst_parser_offline` 57 / 57;
- `research_parser_hygiene_offline` 18;
- `tase_units_offline`;
- `no_synthetic_score_offline`;
- `high1y_label_offline`;
- `tech_snapshot_cache_offline`;
- `index_pins_offline`;
- `index-pins --check` (after `--update`).

COWORK sandbox preflight (`evidence/feasibility.md`): all pass at candidate, and the full-run failing-suite set equals base. **Rev-3 sandbox preflight:**
- the prototype `evidence/rac-proto.js` gives 17 / 17 at candidate and 10 failures at base;
- the 7 coupled suites pass;
- the pin delta is the two functions only;
- the full-run failing-suite set equals base (17 environment-only).

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (the four CLAUDE.md pre-flight items; Gate Verification per OD-2) |
| S1 RED | fixture + suite; RC-1, RC-3, RC-4, RC-7b, RC-9, RC-10a/b/d fail on the current source; record |
| S2 GREEN | E-1…E-7; `index-pins --update`; all rows + negatives + must-stay-green pass |
| 8 | Codex round one (diff) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |
| DEV | per OD-3 |

**STOP only for:**
- a change outside §1 / §2;
- any change to an existing suite's expectations;
- a pin-map delta other than the two functions and the file digest;
- a denied protected action or an integrity FAIL.

## §5 Downstream prompt / output-contract risk assessment

| # | Risk | Assessment | Control |
|---|---|---|---|
| R-1 | **AI scores and actions shift.** The unchanged system prompt already weights "guidance cut" (25–45 band), "sector peer catalyst … ±8", "analyst revision: bank + PT + date … ±15". The AI can now apply those weights | Expected and intended; the size per ticker is unknown offline. Deterministic clamps (`extended_near_ath` 62, `below_key_mas` 45) and action gates still apply afterwards | **OD-1**; optional DEV comparison (OD-3) |
| R-2 | The AI cites an old target as current ("from $512") | Format puts the current target first and "from" after; the prompt's "never generate PTs not in context" is unchanged | RC-3, RC-5 |
| R-3 | Rating-only line read as a price target | Labelled "(no PT)"; the no-verified-PT rule is unchanged | RC-4 |
| R-4 | Output contract | AI JSON schema, prompt text, `max_tokens` 1800 and the response parser are unchanged | Forbidden list |
| R-5 | Prompt size / cost | **Bounds:**<ul><li>each added GUIDANCE / CONTRACTS / PEER MOVE line is capped at **300 characters of value** (RC-9), so ≤ about 930 characters for the three lines;</li><li>the analyst lines are bounded by the parser's existing caps: ≤ 5 PT actions + ≤ 5 rating-only actions, each built from ≤ 100-char `raw`, plus one fixed DATE NOTE;</li><li>`analyzeChunk` runs one ticker per AI call, so the per-call bound equals the per-ticker bound.</li></ul>**Measured on the 8 captures:** rev 2 added **+86 … +439** characters per ticker; rev 3 (with the date marker and note) adds **+184 … +456**, about +50–115 tokens. `anthropic-proxy` rejects request bodies over 64 KB; the largest rev-3 research block is 1,338 characters | RC-9; per-call bound above |
| R-6 | Persistence / UI | `_catalysts`, `pt_results` and the renderers are unchanged. New fields exist only in memory (`pplxData`, `_pplxDebug`) | Forbidden list; RC-6 |
| R-7 | Retry heuristic / "data missing" flag | **The retry-decision inputs are unchanged:** `_allNone`, counts and parsed fields. Whether and when a retry happens is therefore unchanged. **The content of every AI call, including retries, changes:** each call receives the expanded research context | RC-6, RC-7a |
| R-8 | **Narrative ↔ display gap.** The AI may cite guidance or contracts the Catalyst panel doesn't show | Real, low. Display is out of scope | Advisory: a later display task |
| R-10 | **Year-less analyst dates (U-1).** An old action could read as recent; the NXSN.TA capture had a "January 16" action | Dates are kept as reported and never completed. Year-less dates are marked "year unverified", with an explicit DATE NOTE not to treat them as recent on that basis. The freshness tag is renamed so it isn't read as an action date. Verifying the year from other sources is out of scope | RC-10 |
| R-11 | Parser result shape gains `guidance`, `contracts`, `peerMove` | Read only by `formatNewsContext`. They also travel inside the serialized `pplxData` that `fetchAnthropicAnalysis` re-parses, and appear in the memory-only `_pplxDebug`. `orchestrate` builds `_catalysts` from named fields, so nothing persisted changes | RC-6; forbidden list |
| R-9 | Low-quality source text reaches the AI (stale guidance "5 months ago", TASE contradictions) | The AI's recency / confidence rules apply; TASE quality is handled separately | TASE recommendation (separate) |

## §6 Definition of Done

1. RC-0…RC-10 and RC-N1…N4 pass.
2. The must-stay-green suites hold, unchanged.
3. Step 10 PASS at step 0 + 1.
4. The pin delta is exactly the two functions and the file digest.
5. Codex: no unresolved Class I.

## §7 Owner decisions (before R11; OD-4 added in rev 2; U-1 ruled by Main Control in rev 3)

- **OD-1 — accept AI-output shift.** The scoring code is unchanged, but AI-generated `sentiment_score`, `action`, `news_bias` and the Actionable Take text may change because the AI now sees this research. (Required by the CLAUDE.md boundary on scoring / Actionable Take.) **Recommended: accept.**
- **OD-2 — feature gate.** Recommended: **no gate.** This modifies the existing scan path, like research-parser-hygiene-1; rollback is a revert. `plan.md` records Gate Verification as "N/A — existing ungated path, Owner OD-2". Alternative: a client `=== true` flag defaulting off.
- **OD-4 — R-4b boundary.** Confirm that sending rating-only actions to the AI context is allowed ahead of the separate R-4b ruling. That ruling still governs any rating-only **display** and any strict analyst prompt template. **Recommended: confirm.** If declined, drop E-5 and RC-4 / RC-N3; the rest stands.
- **OD-3 — DEV check after LAND.** Option (a), recommended: offline QA only. Option (b): one Owner-approved scan of 2 tickers (e.g. ENPH + NVDA). That is 2 Perplexity + 2 Haiku calls and writes `pt_results` for those tickers; it records whether the summary now cites guidance / contracts / direction.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/research-ai-context-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/research_ai_context_offline.js
node qa/analyst_parser_offline.js
node qa/research_parser_hygiene_offline.js
node qa/no_synthetic_score_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/research-ai-context-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/research-ai-context-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH; OD-3 (b) if chosen.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/fixtures/research-live-2026-10-15.json
qa/research_ai_context_offline.js
work/research-ai-context-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/research_ai_context_offline.js
node qa/analyst_parser_offline.js
node qa/research_parser_hygiene_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
