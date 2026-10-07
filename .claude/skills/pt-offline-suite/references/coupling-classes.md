# Coupling classes (a)–(e)

How an existing offline suite can be coupled to a function, region or file a task edits. For each
class: what it looks like, how to find it with Grep, the instances known when this file was
written, and what an edit trips. Instances are named by suite and symbol only — **re-verify every
one at your task's baseline with Grep before using it; nothing here is a substitute for the
sweep.** Suites in the runner's denylist are not executed and are not listed.

## (a) sha256 pins of a function or region

**Looks like:** a 64-hex string literal keyed by a function name or held in a named constant, compared
with `sha256(extractFunctionSource(content, name))` or with the hash of a delimited region.

**Grep:** `'[0-9a-f]{64}'` across `qa/*.js` and `qa/lib/*.js`; then read the surrounding lines for
the key or constant name and for the EOL form (`replace(/\r\n/g, '\n')` = LF-normalised; a
`crlf(...)` helper = CRLF form).

**Known instances (re-verify):**
- `qa/vis_score_caliper_offline.js` — `PROTECTED_FN_HASHES` (`_ptScoreNorm`, `_ptScoreText`,
  `_ptScoreCmp`, `_ptScoreAvg`, `_ptScoreStates`, `_ptScoreFillHtml`, `_ptScoreDial`,
  `_srGroupResults`, `_srRenderGrouped`, `renderMainPanel`) and the protected CSS block hash.
  CRLF form (the file is read raw from the working tree).
- `qa/ts1_default_exposure_offline.js` — TX-3 pins (`runTechScoreV1`, `_ts1FillRow`, `_ts1RowText`,
  `renderMainPanel`). LF-normalised.
- `qa/tech_snapshot_cache_offline.js` — `BASE_PINS` (the technical helpers incl.
  `classifyTechnicalSetup`, `buildTechSnapshotBlock`, `computeHigh1yDistance`,
  `enforceScoreConsistency`, the TS1 row helpers, the score helpers), `BASE_TS1_REGION`,
  `BASE_RM_LF`, `OLD_RM_CALIPER_PIN`, `NEW_RM_LF`, `NEW_RM_CALIPER_PIN`, `BASE_CALIPER_PINS`,
  `BASE_CALIPER_CSS_HASH`, the TS1 cross-pins. Holds both EOL forms of `renderMainPanel` and
  cross-checks the caliper and TS1 pins (TC-11, TC-13).
- `qa/high1y_label_offline.js` — HL-8 pins of the technical helpers at its baseline. LF-normalised.
- `qa/analyst_parser_offline.js` — `PIN_FETCH_PPLX` (`fetchPerplexityContext`), `PIN_ALLNONE_EXPR`,
  `PIN_FIXTURE` (the held fixture). LF-normalised. (Its `PIN_MASKED_FILE` is class (b).)
- `qa/dh_ui_vocabulary_offline.js` — pins of the `_pf*` portfolio helpers, `_dhLabel`,
  `CONST_HASH`, the panel and banner markup.
- `qa/eod_preexport_warning_offline.js` — pins of the `_eod*` helpers, `_dhLabel`, `DH_DISPLAY`.
- `qa/eod_packet_v0_offline.js` — `EOD_PACKET_TO_MARKDOWN_*_SHA256`, `IS_STALE_BASE_SHA256`.
- `qa/instruction_layer_offline.js` — fingerprints of `CLAUDE.md` and two legacy Skill files.
- `qa/fixture_template_offline.js`, `qa/git_contract_offline.js` — source and environment digests
  of the land-tool fixtures (land-tool suites; out of this Skill's scope).

**Trips on:** any byte change inside the pinned function or region, including comments,
whitespace and line endings. A pin the brief names is re-pinned with a revert proof (SKILL.md §4);
a pin the brief does not name is STOP-1 material (`AGENTS.md`).

## (b) whole-file or masked-file pins

**Looks like:** the whole target file, or the file with one function masked out, hashed and
compared with a constant.

**Grep:** `PIN_MASKED_FILE`, `sha256(masked)`, `/*MASKED*/`, `sha256(content)`,
`wholeFileMinus`.

**Known instances (re-verify):**
- `qa/analyst_parser_offline.js` — AP-14 `PIN_MASKED_FILE`: `index.html` with
  `parsePerplexityContext` masked. **Every `index.html` edit outside that function trips it**,
  whatever the task is about.
- `qa/vis_score_caliper_offline.js` — `wholeFileMinusCssAndCell` (a negative scan of the whole
  file minus the protected CSS and cell: no stray `vsc-` class elsewhere). Trips only if the edit
  adds the forbidden prefix.

**Trips on:** any edit outside the masked region. Re-pin only if the brief names the pin.

## (c) sandbox dependency lists

**Looks like:** an array of function names whose sources are extracted and concatenated into a
`new Function` or `vm` sandbox; a call to a name missing from the list throws `ReferenceError`
at run time, usually inside a guarded check that then reports FAIL.

**Grep:** `FNS = [`, `ENGINE_FNS = [`, `names = [`, `REAL_FNS = [`, `RENDER_REAL = [`,
`helpers = [`.

**Known instances (re-verify):**
- `qa/deep_dive_v0_offline.js` — `FNS` (`_dd0RunCard`, `_dd0RenderResultHtml`, `_dd0FetchAnalysis`,
  `_crEsc`, `buildTechSnapshotBlock`, `_techSnapFor`, `_techRefInput`, `_setupDisplay`).
- `qa/tech_snapshot_cache_offline.js` — `ENGINE_FNS` (the technical helpers), `RENDER_REAL` (the
  real helpers given to the render harness), and the TC-6 `names` list (`_dd0RunCard`,
  `buildTechSnapshotBlock`, `_techRefInput`, `_techSnapFor`, `_setupDisplay`). **TC-6 is the list
  that broke R-1 Slice A** when `buildTechSnapshotBlock` gained the `_setupDisplay` callee.
- `qa/scan_results_enrichment_offline.js` — `FNS` (the score helpers, `_vscCellHtml`,
  `_srGroupResults`, `_crEsc`, `_srHeldMap`, `_srHeldHtml`, …).
- `qa/run-offline.js` — `REAL_FNS` (`_srGroupResults`, `enforceScoreConsistency`,
  `_isValidScanResult`, `mergeResultsByTicker`). **ASK-tier file** (`AGENTS.md`).
- `qa/eod_packet_v0_offline.js`, `qa/eod_preexport_warning_offline.js`, `qa/p5_call1_offline.js`,
  `qa/p5_call2_offline.js`, `qa/p5_packet_offline.js` — `FNS` of the `_pf*` / `_eod*` helpers;
  `qa/p5_step5_ui_offline.js` — `ENGINE_FNS`.
- `qa/fund_facts_panel_offline.js`, `qa/fund_facts_read_client_test.js`,
  `qa/news_catalysts_client_test.js` — `names` lists of their own helpers / globals.

**Trips on:** an edited function calling a name not on the list (new helper, new global). The fix
is usually to add the callee to the list — which is an edit to that suite and must be in the
brief's file set.

## (d) extracted-function harnesses

**Looks like:** `extractFunctionSource(content, 'name')` or `extractFn(src, 'name')` — a
brace-balanced extraction starting at `function name(`; the source is then executed, hashed or
string-searched.

**Grep:** `extractFunctionSource(` and `extractFn(` per edited symbol across `qa/*.js` including
`qa/run-offline.js`. Each suite defines its own copy of the helper; read it, because the
extraction rules differ (some accept `async function`, some do not; some stop at `\n}\n`).

**Known instances (re-verify):** about twenty suites plus the runner. The ones that extract the
most-edited product functions: `qa/run-offline.js` (T6: `renderMainPanel`, `_ts1FillRow`,
`_ts1RowText`; many others — **ASK-tier**), `qa/tech_snapshot_cache_offline.js`,
`qa/ts1_default_exposure_offline.js`, `qa/vis_score_caliper_offline.js`,
`qa/ui_hygiene_offline.js` (UH-6 / UH-7 on `renderMainPanel` and `runAnalysis`),
`qa/deep_dive_v0_offline.js`, `qa/high1y_label_offline.js`, `qa/analyst_parser_offline.js`,
`qa/selected_only_watchlist_offline.js`, `qa/dh_ui_vocabulary_offline.js`,
`qa/scan_results_enrichment_offline.js`, `qa/ui1b_cards_offline.js`, `qa/fund_facts_panel_offline.js`.

**Trips on:** a changed signature (the extractor searches the exact `function name(` prefix), an
unbalanced brace inside a template literal or regex, a renamed function, or a new free name the
sandbox does not supply.

## (e) literal-text assertions on edited code

**Looks like:** `indexOf('literal') !== -1`, `countOf(src, '<markup>') === 1`,
`src.split('x').length === n`, a regex such as `/const _tsAssessMap = (\{…\});/.exec(fnSrc)` that
extracts a literal shape, a signature regex such as `/^function orchestrate\(claudeResults, …\) \{/`,
a line-count delta ("line count = base + 3"), or a negative scan ("no `_techCache` inside
`renderMainPanel`").

**Grep:** the literal strings the edit changes; `indexOf('`, `countOf(`, `.exec(`, `split(`,
`.length ===`, `.test(` around the edited symbol.

**Known instances (re-verify):**
- `qa/run-offline.js` — T6: the single `<span class="rr-lbl">Score</span>` row in
  `renderMainPanel`, the single "Tech Score v1" literal, "never calls `runTechScoreV1(` inline",
  the `_ts1FillRow(item.ticker)` ordering. **ASK-tier.**
- `qa/tech_snapshot_cache_offline.js` — TC-10 (exactly the I7a–I7i lines changed; line count =
  base + 3), TC-13 (the rr-lbl "Score" literal exactly once), TC-5 (no `_techCache` in
  `renderMainPanel`), TC-4 (`orchestrate` signature regex, no `_techCache`), the `_tfMap` and
  `_tsAssessMap` literal-shape extractions, TC-15 ("Scan setup" never bare "Setup").
- `qa/high1y_label_offline.js` — HL-3 (`_tsAssessMap` extraction and wording, "1Y High Dist:"),
  the rr-lbl Distance row regex, HL-5 setup wording, HL-6 (no `TECHNICAL SETUP` line without a
  setup).
- `qa/ui_hygiene_offline.js` — UH-6 (no `rsCls`, no `const rs ` in `renderMainPanel`), UH-7
  (`localStorage.setItem` counts per function).
- `qa/scan_results_enrichment_offline.js` — `SIDE` negative regex over the extracted sources.
- Many server-side suites carry a **negative** regex that the extracted server code must not
  mention `orchestrate`, `analyzeChunk`, `enforceScoreConsistency` or `_techCache`. They scan
  other files, not `index.html`; a sweep for those symbols lists them as hits and explains them
  as "negative scan of another file — not tripped".

**Trips on:** wording, markup, order or line-count changes inside the edited function, even when
every pin is re-pinned.

## Reporting a hit

suite · symbol · class · what trips it · tripped by the planned edit? (yes / no / only if …) ·
covered by the brief? (yes: which line / no) · ASK-tier? — one row per coupling, using the block
in `templates/plan-sections.md`. Explain every hit that is not tripped; an unexplained hit is an
incomplete sweep.
