# Brief: cop-display-fix-1 — the ticker view stops presenting unverified AI figures as verified (display only)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. DRAFT by the Planner, 2026-10-24, for MAIN's intake. **Nothing here is approved.** Baseline `branch-dev` `b24b830` (`qa-lifecycle-v2` has landed and pushed; the `4c02a78..b24b830` diff has zero overlap with this brief's land-scope, so the §0 evidence read at `4c02a78` still holds). Every line number, hash and count below is **re-sweep at that LAND tip** (T2).

**What the Owner sees afterwards (one outcome):** in the ticker view, the confidence badge no longer says "High confidence" next to a flagged conflict; Entry Zone, Invalidation and the "Analyst view · PT" line are visibly marked as unverified AI-written figures; and the Perplexity citations already stored with the research are listed as the sourced evidence. No score, action, prompt or stored research changes.

| | |
|---|---|
| Source | COP triage (MAIN, 2026-10-24); `Pulse-Planning\explorer-1\section-4.md` D1/D2; Owner-approved C-1/C-2/C-3, DEV only |
| Branch / slot / mode | `task/cop-display-fix-1` · first free slot · **Manual**, attended |
| Scoring boundary | **No** change to scoring (`orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_techCache`), Actionable Take text/logic, recommendations, prompts, normal scan, persistence (`pt_results`, `pt_tickers`, any localStorage key) or production. Display layer of `renderMainPanel` only |
| Gate verification | N/A: no fetch, no storage, no new behaviour switch, so no client/server gate is added. `plan.md` records this with the other three pre-flight items (CLAUDE.md checklist) |
| Deploy | branch-dev → DEV branch deploy via the Owner's push record (R12). No `main`/production, no other Netlify write |
| qa:offline | **+1 suite** (`qa/cop_display_offline.js`, auto-discovered); step-10 count = step-0 count + 1 |
| Skills | `pt-offline-suite` — **Required** (edits `index.html`, which many suites pin). Optional: `portfolio-tracker-ux-review` |

## §0 Evidence (verified by reading `index.html` at `4c02a78`; re-sweep at T2)

| # | Finding | Where |
|---|---|---|
| E-1 | `deriveDataConfidence(it)` reads only `_aiUnavailable`, `_catalystDataMissing`, whether `_catalysts` has any bullish/bearish/analystActions entry, and `_auditTrail.sourceTrace`. It never reads `item.conflict`, the K1–K6 results, `hasData`, result age or the `unknown` setup. HIGH = "catalyst rows exist". Label "High confidence", reason "Market data and catalyst context are present." | `index.html:9899-9913`; badge HTML `:9915` |
| E-2 | The same card prints `⚠ Conflict` (`:10064`) and a `Consistency` line (`_nlmLine`, `:9879-9884`, from `_nlmConsistencyChecks`, K1–K6). The badge sits at `:10055`, above both | `:10055`, `:10064`, `:10072` |
| E-3 | Entry Zone and Invalidation render `item.entry_zone` / `item.invalidation` (AI-written, no source tag). Only a blanket "AI-generated analysis · Verify independently" subtitle | `:10054`, `:10065-10066` |
| E-4 | The "Analyst view · RATING · PT $x" line comes from regex over the AI's own summary text (`RATING_SUMMARY_RE` `:6058`, `PT:` regex `:9514`), **not** from the Perplexity analyst rows | `:9513-9516`, render `:10057` |
| E-5 | Sourced data exists but is not shown: `_catalysts.sources` (≤ 8 `{url,title,date}`) is stored (`:7651`) and sent to the AI (`:7152-7153`); the ticker view never renders it. The SOURCE TRACE strip shows provider names and counts only (`:10190-10204`). The bank-named analyst rows (`_catalysts.analystActions`) do render in the catalyst list | `:7651`, `:9788-9798` |
| E-6 | Conflict text has two authors (the model, prompt rule `:7377-7378`; `orchestrate` fallbacks `:7576-7596`); the UI shows both identically | explorer D2 |

## §1 Design (display only; quoted literals are exact; each anchor occurs once at T2, re-verified by Grep in §TS)

**Safety rule:** `deriveDataConfidence` is **not edited** (byte-identical). `qa/catalyst_hygiene_offline.js` CH-10/CH-17 extract it and assert `.level` for fixed inputs; leaving it alone keeps them valid. All changes are new nested helpers plus render lines inside `renderMainPanel`; **no new free names** (only `_esc`, `_trunc70`, builtins and values already in scope), so sandbox harnesses with fixed function lists keep working.

### C-1 — the badge says what it measures
New nested pure helper `_dcCoverage(dc, item, ks)` (after `deriveDataConfidence`, before `_dcHtml`) returns `{label, reason, cls, note}`:
- Labels become **data coverage**, never "confidence": HIGH → `Data coverage: high`, MODERATE → `Data coverage: moderate`, LIMITED → `Data coverage: limited`; `AI unavailable` unchanged. Reason text says "present", not "confident".
- If `item.conflict` is a non-empty string **or** `ks.length > 0` (K1–K6 warnings), the badge never uses the green `pos` class: it uses `warn`, and `note` = `Coverage is not agreement: this result carries a conflict or consistency warning (see below).` The data level stays HIGH/MODERATE; only the presentation changes.
- `ks` is computed **once**: a single `const _nlmKs = (item._aiUnavailable === true) ? [] : _nlmConsistencyChecks(item, {…same arguments as today…})` placed before `_nlmLine`; `_nlmLine` reuses it and its output stays byte-identical. Badge and line cannot disagree.
- `_dcHtml` renders `_dcCoverage(...)`. Classes `dc-row`, `dc-dot`, `dc-lbl`, `dc-reason` unchanged; the note is an extra `<span class="dc-reason">` in the same row.

### C-2 — unverified vs sourced
- **Unverified tags (new sibling elements; no existing element's text changes):** after the `Entry Zone` and `Invalidation` rows, once per card: `<div class="src-tag unv">AI-written level · not sourced</div>`; after the `at-analyst-line` div: `<div class="src-tag unv">Read from the AI's own summary text · not a sourced analyst feed</div>`. Existing strings stay byte-identical, so `Analyst view · SELL · PT $80`, the Entry/Invalidation values, `countOf(html,'at-analyst-line') === 1` and NC-8's regex `<span class="mp-act-lbl">Entry Zone</span><span class="mp-act-val">([^<]*)</span>` keep passing.
- **Sourced block** in the Signals card after the `cat-list` div (`:10048`): header `Cited sources · Perplexity`, listing `item._catalysts.sources` (≤ 8): title (escaped, truncated like `_trunc70`), host, date. A link **only if** the URL parses as `http:` or `https:` (`rel="noopener noreferrer" target="_blank"`); any other scheme (e.g. `javascript:`) renders as plain escaped text. `_catalysts` present and `sources` empty: one line `No citations stored for this result`. `_catalysts` absent (pre-7B-2A results): nothing.
- Bank-named analyst rows are marked sourced by the block header text (`Analyst rows above are Perplexity-sourced actions`), not by editing each row.
- CSS: `.src-tag`, `.src-tag.unv` (amber `#F4B860`), `.src-tag.sourced` (green `#22C58B`) in the existing style block; semantic colours only, no glow, no new motion.

### Not changed, stated plainly
- Scores, dial, `item.action`, the `entry_zone`/`invalidation` values, the summary, prompts and stored fields. No localStorage read/write is added.
- **D11 is NOT solved here.** `scan-action-gate-1` enforces the setup→action contract for setups 1–7 only; on `unknown` the AI action passes through unchanged (D11-D). Follow-up **D11-A** owns the `unknown` gate together with its own `renderMainPanel` change. This task adds no `unknown` gate and no per-setup logic; `review.md` repeats the limitation verbatim.
- The Scan Results table's `⚠ n` badge is unchanged.

## §TS Task-start checks (read-only, at T2)
| # | Check (else STOP, return to MAIN) |
|---|---|
| TS-0 | `branch-dev` = `origin/branch-dev` = the tip after `qa-lifecycle-v2` landed; clean tree; the default-fail runner (`qa-lifecycle-v2` Option B) is in place |
| TS-1 | Every anchor occurs once (Grep): `function deriveDataConfidence(`, `const _dcHtml =`, `const _nlmLine = (() => {`, `Entry Zone</span>`, `Invalidation</span>`, `at-analyst-line`, the `cat-list` div in `renderMainPanel`, `sources:         _pplx6a?.sources`. Zero or double → STOP |
| TS-2 | The coupling sweep of §2 is **completed read-only at T2 by the Planner and MAIN before R11**, so land-scope and auto-edit-scope list every suite that will be edited. At task-start the Worker only re-confirms it (Grep each pin/anchor); **any new hit = STOP, no amendment** (an amended brief after R11 would break the integrity chain) |
| TS-3 | `cp10-decouple-1` has not landed (no work folder). If it lands before T2, `qa/evidence_capture_offline.js` leaves the certain set and the sweep/blocks are redone before R11; otherwise its `BASE_INDEX_SHA` is re-pinned here (CP-10 trips on any `index.html` byte) |
| TS-4 | `node qa/index_pins_offline.js` is in the step-0 PASS set (no pre-existing red) |

## §2 Coupling sweep (pt-offline-suite, classes (a)–(f)). Seed from the Planner's read at `4c02a78`; **Planner + MAIN complete it read-only at T2 before R11**; the Worker re-confirms only (TS-2)

| Class | Suite · symbol | Tripped? | Handling |
|---|---|---|---|
| (a) function sha256 | `qa/ai_request_hygiene_offline.js:47`, `qa/labs_panel_offline.js:21`, `qa/market_daily_change_offline.js:68`, `qa/portfolio_today_offline.js:69` — each pins the **current** `renderMainPanel` hash `61e663bf…` | **yes** (any byte inside `renderMainPanel`) | re-pin, revert proof each (skill §4); in land-scope |
| (a)/(d) pin map | `qa/fixtures/index-pins.json` (generated; `renderMainPanel` entry `:396`, region and remainder hashes), checked by `qa/index_pins_offline.js` | **yes** | regenerate with `node qa/tools/index-pins.js --update`, never by hand; review the diff; in land-scope |
| (a) revert chains | `qa/no_synthetic_score_offline.js`, `qa/pulse_analyst_view_offline.js`, `qa/ma_stack_label_offline.js`, `qa/tech_snapshot_cache_offline.js`, `qa/ath_client_offline.js` run historical R-3 tables on `qa/fixtures/index-pins-frozen.json` (frozen, never edited) | frozen sources: no. Live-file legs (e.g. `BASE_DIGESTS.renderMainPanel`; `scan-action-gate-1` precedent: 3 `BASE_DIGESTS.orchestrate` constants) | run each targeted after the edit (RED expected only on live constants); re-pin only constants that name the live `renderMainPanel`, one at a time, with revert proof |
| (b) whole-file | `qa/evidence_capture_offline.js` CP-10 `BASE_INDEX_SHA` (whole-file `index.html`) | **yes, certain** (unless `cp10-decouple-1` lands first, TS-3). `analyst_parser_offline.js` AP-14: `PIN_MASKED_FILE` no longer occurs there, already decoupled | re-pin with revert proof; in land-scope |
| (c) sandbox lists | suites that build `renderMainPanel` in a sandbox with a fixed `FNS`/`names` list (`narrative_consistency`, `pulse_analyst_view`, `ui_hygiene`, `ui1b_cards`) | only if new helpers call a name outside the list | design constraint: no new free names; the targeted run proves it |
| (d) extracted function | `qa/catalyst_hygiene_offline.js` `deriveDataConfidence` (CH-10, CH-17) | no (function byte-identical) | stays valid |
| (e) literal text | `pulse_analyst_view_offline.js` PA-2/3/4/11 (`Analyst view · SELL · PT $80`, `countOf(html,'at-analyst-line')===1`, `ANALYST_RE`); `narrative_consistency_offline.js` NC-8; `ma_stack_label`, `no_synthetic_score`, `tech_snapshot_cache` use the `at-analyst-line` line as a splice anchor | no, **by construction**: those lines are untouched, the tags are new sibling lines | the new suite asserts each literal still present (CD-12) |
| (f) digest-part lists | no hit: `index.html` is in no E1/FT/GC digest part. `pin-deps.js` at `b24b830`: "no digest pin includes a changed file"; its one REVIEW row (AH <- `index.html`) is string literals only (AH's parts are guard/settings/integrity/fingerprint), so not stale | — | `pin-deps.js`, §PIN |

## §PIN Contract-pin dependencies (`pin-deps.js`; MAIN re-runs at T2)
Command: `node C:/Users/Owner/Documents/Pulse-Planning/tools/pin-deps.js --repo C:/Users/Owner/Documents/Project/portfolio-tracker --brief <this brief>`; result for this draft in `pin-deps-output.txt` (this folder). Tool result (fixed tool, sha256 c9b15eb4…): `no digest pin includes a changed file`. One REVIEW line remains: `qa/auto_mode_hardening_offline.js <- index.html (string literal at line 1228, 2228, 2607)`; read: these are test-input string literals (e.g. the AH-17 benign file-tool list), not digest parts (AH parts: `auto_mode_hardening_offline.js:96-101`). **No digest pin includes a changed file.** Any STALE row at T2 → STOP (the default-fail run would fail).

**PC-2 runtime plan:** after `qa-lifecycle-v2` all six pins are fresh, so each full `qa:offline` is ≈ 2.5 min, foreground, under 600 s. Heavy runs: step 0 (reuse under `AGENTS.md` baseline reuse if its four conditions hold, else one full run), the targeted suites of step 3 (seconds to ~1 min each), step 10 (one strict run). Total ≤ 3 full runs ≈ 8 min, no background run; MAIN preflight before each (free RAM ≥ 4 GB, 0 `qa` processes, no orphans). A killed run is not evidence.

## §3 New suite `qa/cop_display_offline.js` (C-3). Renders the real extracted `renderMainPanel` in a vm sandbox (pattern: `narrative_consistency_offline.js`, `pulse_analyst_view_offline.js`); offline; planted negatives mutate an in-memory copy of `index.html`, never the test

| ID | Assertion |
|---|---|
| CD-1 | item with `_catalysts.bullish` rows and no conflict/K warning → `Data coverage: high`, class `pos` (positive control) |
| CD-2 | same item with `item.conflict` → `Data coverage: high` in class `warn` (never `pos`), the note present, the `⚠ Conflict` row rendered once |
| CD-3 | same item with a K1–K6 warning (fixture making `_nlmConsistencyChecks` return ≥ 1) and no conflict → `warn` + note; the badge's warning count equals the Consistency line's (single computation) |
| CD-4 | `High confidence` / `Moderate confidence` appear nowhere in the panel for all four `deriveDataConfidence` levels |
| CD-5 | `deriveDataConfidence` fixed-input table keeps its `.level` for ≥ 6 inputs; its source has no `conflict` token |
| CD-6 | Entry Zone / Invalidation values render byte-identically (escaped); the `unv` tag appears exactly once when either row is present, zero times otherwise |
| CD-7 | `Analyst view · SELL · PT $80` byte-identical, `at-analyst-line` count 1, exactly one `unv` tag for it; none when `rating` is null |
| CD-8 | `_catalysts.sources` with 3 items → 3 entries, titles escaped, http(s) as links with `rel="noopener noreferrer"`; more than 8 stored → 8 shown |
| CD-9 | a source with a `javascript:`, `data:` or malformed URL → plain text, no `href` |
| CD-10 | `_catalysts` present with `sources: []` → `No citations stored for this result`; `_catalysts` absent → no sources block |
| CD-11 | isolation: rendering mutates no field of `item` (deep-equal before/after), performs 0 `localStorage` writes, leaves `pt_results` untouched |
| CD-12 | the literals other suites rely on are still present once each (`at-analyst-line` line markup, `<span class="mp-act-lbl">Entry Zone</span><span class="mp-act-val">`, `Analyst view ·`) |
| CD-13 | `renderMainPanel` text has no scoring-engine call or `_techCache` token and no new top-level function (nested helpers only) |

**Planted negatives (each must make the named row FAIL):** N1 restore `label: 'High confidence'` → CD-4; N2 `_dcCoverage` ignores `conflict` → CD-2; N3 ignores `ks` → CD-3; N4 drop the Entry/Invalidation tag → CD-6; N5 drop the analyst tag → CD-7; N6 stop rendering `sources` → CD-8; N7 allow any URL scheme as `href` → CD-9; N8 add `localStorage.setItem` in a helper → CD-11/CD-13; N9 make `deriveDataConfidence` read `conflict` → CD-5; N10 colour the unverified tag green (`pos`/`sourced`) → CD-6. Revert proof per N: restore the text, the row passes.

## §4 Steps
| Step | Action |
|---|---|
| 0 | §TS checks at T2; baseline `npm run qa:offline` (reuse only if the four `AGENTS.md` conditions hold); record count N (N = 106 at `b24b830`) |
| 1 | RED first: write `qa/cop_display_offline.js` (CD-1…13, N1–N10); run it on unmodified `index.html`: C-1/C-2 rows red, isolation/preservation rows green |
| 2 | Implement C-1, then C-2 in `index.html` (`renderMainPanel` only; EOL per file via `git ls-files --eol`; byte-audit after each Edit) |
| 3 | Targeted: the new suite green; then each §2 suite one at a time (RED only on pinned constants); re-pin with revert proof; `node qa/tools/index-pins.js --update`, review the diff |
| 4 | Codex review of the actual diff (two diffs per `AGENTS.md`); classify, fix in scope |
| 5 | Sync with `branch-dev` (conflict → STOP) |
| 6 | Step 10: the plain `npm run qa:offline` (default-fail; allow-listed): PASS, count 107 (N = 106 + 1), `Stale pins: none`. `review.md` carries the exact `LAND-EVIDENCE: qa-offline=PASS 107; targeted=PASS; codex-classI-unresolved=0` line once, and a separate `QA-LIFECYCLE: mode=default run=<id> stale=0 pinned_skip=6/6 total_s=<n> regression=none` line. Integrity chain, land-request, Owner LAND, then the Owner's push = DEV deploy |
| 7 | Browser check by a read-only browser session after the DEV deploy: a ticker with a stored conflict shows the amber coverage badge; Entry Zone/Invalidation tagged; citations listed; before/after screenshots; storage keys unchanged |

## §5 Files and tiers
| Path | Change | Tier |
|---|---|---|
| `index.html` | `renderMainPanel` display lines + CSS (§1) | ordinary (heavily pinned) |
| `qa/cop_display_offline.js` (new) | §3 | ordinary |
| `qa/ai_request_hygiene_offline.js`, `qa/labs_panel_offline.js`, `qa/market_daily_change_offline.js`, `qa/portfolio_today_offline.js` | the live `renderMainPanel` hash constant only | ordinary |
| `qa/evidence_capture_offline.js` | the CP-10 `BASE_INDEX_SHA` constant only (TS-3) | ordinary |
| `qa/ath_client_offline.js`, `qa/ma_stack_label_offline.js`, `qa/no_synthetic_score_offline.js`, `qa/pulse_analyst_view_offline.js`, `qa/tech_snapshot_cache_offline.js` | only those the pre-R11 sweep shows have a live-file constant; they are then moved into the certain rows and the blocks. If none, they stay untouched | ordinary |
| `qa/fixtures/index-pins.json` | regenerated by `--update` only | ordinary (generated) |
| `work/cop-display-fix-1/review.md` | evidence | ordinary |

**Forbidden:** `qa/run-offline.js`, `AGENTS.md`, `.claude/**`, `netlify/**`, `services/**`, `package*.json`, `qa/fixtures/index-pins-frozen.json` (frozen), the land tool, guard and settings, `work/*/brief.md`. **PROTECTED approval: none needed.**

## §6 Acceptance and rollback
**Done =** CD-1…13 green and N1–N10 red-then-green; every §2 suite green; the plain step-10 run PASS with count 107 (N = 106 at `b24b830`, +1); the step-7 browser check matches; `review.md` states the D11 limitation verbatim and the pin ledger.
**Rollback:** revert the task commits on `branch-dev`, then the Owner's push (R12). No data rollback: nothing stored changes.
**Stop rules:** any scoring/action/stored-field change in the diff; any new top-level function; `deriveDataConfidence` bytes differ; a suite outside §2 needs more than a constant edit; a CD row passes only by loosening another suite → STOP, MAIN.

## §7 Risks and decisions for the Owner
- `renderMainPanel` is the most-pinned function in the repo: the sweep is the main cost (about 9 suites, constants only). The sibling-line design keeps all literal anchors intact.
- Wording: "Data coverage" is decided (Owner, 2026-10-24).
- Citations show what Perplexity returned; they do not prove the AI's figures match them. The tag says "not sourced", not "false".

## §UER Execution readiness
**ATTENDED-ONLY.** Mode: **Manual**. **§L:** no partial land. The blocks below are final at R11; a hit outside them is a STOP, not an amendment (TS-2).

<!-- auto-edit-scope:begin -->
index.html
qa/cop_display_offline.js
qa/ai_request_hygiene_offline.js
qa/labs_panel_offline.js
qa/market_daily_change_offline.js
qa/portfolio_today_offline.js
qa/evidence_capture_offline.js
qa/fixtures/index-pins.json
work/cop-display-fix-1/review.md
<!-- auto-edit-scope:end -->
<!-- land-scope:begin -->
index.html
qa/cop_display_offline.js
qa/ai_request_hygiene_offline.js
qa/labs_panel_offline.js
qa/market_daily_change_offline.js
qa/portfolio_today_offline.js
qa/evidence_capture_offline.js
qa/fixtures/index-pins.json
work/cop-display-fix-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/cop_display_offline.js
<!-- land-tests:end -->
