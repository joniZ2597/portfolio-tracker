# Task brief: evidence-capture-1 — every finished scan keeps its research history (S1 snapshots in the browser)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 1.1 — the one pre-R11 Codex review is complete and triaged under C+ (W findings in §W, M corrections applied); ready for the Owner's R11** (COWORK draft; Bootstrap M revision, 2026-10-17). Built on `branch-dev` = `792da92` (`origin/branch-dev` = `2b197a1` = V-1 landed; `792da92` adds only `work/evidence-memory-1-s2-r2/brief.md`); the current tip is `1eef672` (`evidence-memory-1` S2-r2 landed and pushed: it adds only `services/evidence-changes.js`, `qa/evidence_changes_offline.js` and `work/` documents; every §TS blob below re-verified unchanged at `1eef672`). Ruled: **D-22** (Main Control, 2026-10-16: W2 lane A, enabled by default, visible export / clear, strict S1 privacy), **R-3** (local browser storage, structured snapshots + source metadata, 90 days, local export, no sync / cloud / auth), **D-26** (V-1 first — landed). C+ review workflow (§C+). **Pre-R11 review:** done, the one review C+ allows (`shared-reports/codex/2026-10-17_evidence-capture-1-review.md`, "Rev 1 — verdict"); no further pre-R11 review. **Remaining:** the Owner's R11 on the final hash. The appendices (§A1–§A3) are unchanged from the reviewed text.

| | |
|---|---|
| Problem | "What changed since the last scan" (`evidence-memory-1` S2 engine, `what-changed-1` surface) needs a previous scan to compare with. Today nothing is kept: `window._pplxDebug` is wiped at every scan start and `pt_results` keeps only the latest result per ticker, in a lossy shape (`_catalysts` has no rating-only actions, guidance, contracts or peer move) |
| Objective | Every finished scan stores one S1 snapshot per scanned ticker in this browser (IndexedDB, 90 days), through the landed S1 module and its privacy allowlists, without changing the scan; the Owner can see, export and clear the history |
| Source | D-22, R-3; S1 contract (`services/evidence-memory.js`, landed `0903940`); S2 rule "unknown is not a change" (`work/evidence-memory-1-s2-r2/brief.md` §2); D2 breakdown `evidence-capture-1.BREAKDOWN.md` (C-1…C-7) |
| Decisions | none open (D-22, R-3 ruled). The control's place and wording are presentation details the breakdown left to D3 (§2 C-6) |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | S1 landed (`0903940`) ✓ · V-1 landed (`2b197a1`; lane A free) ✓ |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all hold; otherwise HOLD: <ul><li>`index.html` = `17e2ffdfa23a14dac1d875c84ef99cfa638c664b` (every §A1 OLD block exactly once);</li><li>`services/evidence-memory.js` = `c74d64040c99936d7aee03f945818cab41da90ef` (sha256 `378bd80a…7a78`);</li><li>`qa/ai_request_hygiene_offline.js` = `88f55981c495c82e6b3e3398cb0b74b0efb07dac`;</li><li>`qa/market_daily_change_offline.js` = `c7dd1fa23e4329dbc9273e3e9f9f55f58363920a`;</li><li>`qa/fixtures/index-pins.json` = `885d04c3d52641403cc17ad83eccf6fe8891b64e`;</li><li>`qa/lib/index-pins-core.js` = `a8ae73317d65aa43129b9fe41aa09f4c34d5e888`;</li><li>`qa/labs_panel_offline.js` = `f120a7f00a595c46fb7f0c286cc59a029f0a0cab` (not edited; must stay green);</li><li>`qa/fixtures/research-live-2026-10-15.json` = `54526e2c15414dab849bd52cb544daaff5bcd2b3`;</li><li>`qa/evidence_capture_offline.js` does not exist.</li></ul>Any tip on which all of these blobs match is valid |
| Branch / slot / mode | `task/evidence-capture-1` · **Worker A** · **Manual** (new persistence path in the browser) |
| qa:offline | step-0 count **+1** (`qa/evidence_capture_offline.js`; 101 → 102 at `792da92`; auto-discovered; the runner stays forbidden). If `evidence-memory-1-s2-r2` lands first, its suite makes it 102 → 103 (refreshed at R11) |
| Parallel with | Worker B (`evidence-memory-1-s2-r2`: `services/evidence-changes.js`, `qa/evidence_changes_offline.js`, both new): no shared file. One heavy QA run at a time |
| Skills | none required |
| Scoring boundary | **No scoring or scan-result change**: `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `renderResults`, `mergeResultsByTicker`, `_isValidScanResult` unchanged (CP-10); scan output identical with capture on, off or failing (CP-4) |
| Gate verification | Client: `PT_EVIDENCE_CAPTURE === true` (top-level code constant, default `true` per D-22, resets on reload), checked before any capture (CP-5). Server: N/A (no server path, no network) |

## §1 Files (exactly)

- `index.html` — three insertions (exact text **§A1**): **E-1** after the `sec-evidence-store-client` block: the inlined S1 module in a one-global wrapper, then the capture section (`PT_EVIDENCE_CAPTURE`, `_ehMemory`, `_ehCaptureInput`, `_ehCaptureScan`, `_ehStatusText`, `_ehRender`, `_ehExport`, `_ehClear`); **E-2** in `runAnalysis`, three lines after the final `renderResults` try / catch; **E-3** in the settings modal, a collapsed "Research history" box after `#labsBox`
- `qa/fixtures/index-pins.json` — `node qa/tools/index-pins.js --update`; exactly: `fileSha256`, `remainderSha256` and `functions.runAnalysis` change; **45 functions are added** (the 38 S1 functions, now column-0 inside the wrapper, and the 7 `_eh*` functions: see §3); `regions` unchanged; nothing removed
- `qa/ai_request_hygiene_offline.js` (blob `88f55981…`) and `qa/market_daily_change_offline.js` (blob `c7dd1fa2…`) — **one line each**: the pinned `runAnalysis` digest → `7d5c029b…aa7` (**§A3**). Any other change to these suites is a STOP
- `qa/evidence_capture_offline.js` (new) — exact text **§A2**
- `work/evidence-capture-1/review.md`

**Forbidden:** every other function and line of `index.html` — in particular `toggleApiStatus`, `renderLabsToggles`, `setLabsFlag` and `#labsBox` (pinned by `labs_panel` LB-1…LB-10), `orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `renderResults`, `mergeResultsByTicker`, `_isValidScanResult`, `exportJSON`, `_ptDownload`, `_ptTimestamp`, `showToast`, `parsePerplexityContext`; `services/**` (S1 is inlined, never edited); `netlify/**`; `qa/run-offline.js`; every other `qa/` file; `package*.json`; `.claude/**`; `AGENTS.md`; `CLAUDE.md`; `BACKLOG.md`.

## §1a Consumer sweep

| Reader | Effect | Assertion |
|---|---|---|
| `runAnalysis` final block | one added call after the final `pt_results` / `pt_date` write and `renderResults`; not awaited; inside the existing `try` (it never throws) | CP-4, CP-10 |
| `pt_results`, `pt_date`, `results`, `renderResults`, rendering | unchanged (identical writes and render calls with capture off / on / throwing / rejecting / hanging / factory failure). The capture does **not** delay rendering and does **not** await storage; it does build its inputs and open the store **synchronously** after the render and before `runAnalysis` returns (a small synchronous cost, not measured; "no timing change" is not claimed) | CP-4 |
| `window._pplxDebug` | read only (`parsed`, `unavailable`); never modified, never stored (holds `rawText`) | CP-2, CP-8 |
| S1 store (IndexedDB database `pulse-evidence-memory`, store `kv`) | new local data; readers: the Research history box; later S2 / `what-changed-1` | CP-5…CP-7 |
| Settings modal (⚙) | new collapsed `<details>` box after `#labsBox`; the Labs box and `toggleApiStatus` unchanged | `labs_panel` 32 / 32 (sandbox) |
| Cloud sync, portfolio backup / restore, EOD packet, `exportJSON` | do not read the store (separate IndexedDB database; never uploaded) | no reader (by construction; CP-10 scope) |
| Pin map; suites pinning `runAnalysis` (`ai_request_hygiene`, `market_daily_change`); `ui_hygiene` UH-5 / UH-7 (runAnalysis strings, catch / finally shape, 4 `setItem`); `run-offline` Phase 3 (catch block writes no `pt_results`) | digests via §A3 / `--update`; shapes unchanged | sandbox PASS |
| `run-offline` Phase 3 client-gate list | a fixed list in `qa/run-offline.js` (forbidden here); the new gate is not in it | CP-5 covers the strict check |

## §2 Contract (normative; exact code §A1)

| # | Rule |
|---|---|
| C-1 | **Isolation.** The text between `var PulseEvidenceMemory = (function (module) {` and `return module.exports;` is **byte-identical** to `services/evidence-memory.js` (sha256 `378bd80a…7a78`). The block adds exactly one page global, `PulseEvidenceMemory` (S1's CommonJS exports); none of S1's 61 top-level names becomes a page global; S1's `'use strict'` applies inside the wrapper as in Node. *(Correction of the D2 note: `MONTHS`, `ISO_RE` and `finish` exist in `index.html` only as nested locals, so a top-level paste would not redeclare them; the wrapper is kept to avoid 61 new globals and for strict mode.)* |
| C-2 | **Privacy (strict S1).** `put` receives exactly `{ ticker, capturedAt, research, assessment: { action, technicalSetup, sentiment, sentimentScore, catalystDirection }, market: { price, currency: null } }`: `research` = `window._pplxDebug[T].parsed` (the parser output of the winning attempt) — never the debug record (it holds `rawText`), never `item._catalysts` (lossy); `market.price` = `_verifiedPrice` (provider units: `.TA` in agorot, the same in every snapshot; `currency` `null` because no producer field exists, which S2 treats as one series). S1's allowlists and drop-not-truncate rules apply unchanged. **Limit of the privacy guarantee:** S1 enforces field shape, length and its allowlists, not the *meaning* of allowed text; sensitive content that sits inside an allowed parser field (a catalyst text, a source title) would be stored under S1's R-3 allowance (validated structured items of at most 300 characters, never a whole response). "Strict privacy" (D-22) means S1's allowlists, not semantic detection. Never passed: raw AI text, debug fields, AI free text (`summary`, `key_risk`, `entry_zone`, `invalidation`), holdings, keys, `pt_*` storage, prompts |
| C-3 | **No effect on the scan.** The call runs after the final save and render, is not awaited and never throws; the scan's writes, results and render calls are identical whether capture is on, off, throwing, rejecting, hanging or its factory fails; a failure shows as one `console.warn` only |
| C-4 | **Gate.** `var PT_EVIDENCE_CAPTURE = true;` checked with `!== true` before any capture work; any other value captures nothing. The Research history controls work in every gate state |
| C-5 | **Lazy.** No IndexedDB access at page load or for a scan with capture off; one store per page, created on first capture or control use (the S1 backend opens on its first operation) |
| C-6 | **Controls** (⚙ settings → "Research history", collapsed; the status loads when it is opened): status `N snapshots · M tickers · <oldest> to <newest>` (singular forms; one day shown once), `No research history stored yet.`, or `Research history is not available in this browser.`; **EXPORT ↓** downloads S1's canonical export as `pulse-research-history_<local timestamp>.json` via `_ptDownload` (a failure toasts "Research history export failed" and downloads nothing); **CLEAR** asks "Delete all research history stored on this device? This cannot be undone." and only then clears, toasting "Research history cleared" or "Research history could not be cleared" |
| C-7 | **Fallbacks.** AI analysis failed (`_aiUnavailable`): research captured, `action`, `sentiment`, `sentimentScore` `null` (the fallback values are placeholders), setup / direction / price kept. Research call failed (`unavailable`): captured with `research.unavailable` (S2: not observed). No debug entry or `parsed`: not captured |
| C-8 | **Scope of a capture.** Only this scan's validated results (`dedupedNew`, one per ticker; a cancelled scan's completed tickers), `capturedAt` = the run's `runTimestamp`. Inputs are built at once; stores run in order on one queue, also across back-to-back scans. A result whose content equals the ticker's previous snapshot is not stored again (S1 `UNCHANGED`) |

## §3 QA — new suite `qa/evidence_capture_offline.js` (exact text §A2)

Runs the **real** inlined S1 module and capture section, `runAnalysis`, `mergeResultsByTicker`, `_isValidScanResult` and `parsePerplexityContext` (on the 8 live captures) extracted from `index.html`, with stubbed scan inputs, S1's memory backend, recording / failing / hanging backends and a counting `indexedDB` fake. Expected values come from §RT (written before the suite).

| Row | Checks |
|---|---|
| CP-1 | inlined text byte-identical to `services/evidence-memory.js`; the block adds only `PulseEvidenceMemory` |
| CP-2 | unique tokens in `rawText`, debug fields, `summary`, `key_risk`, `entry_zone`, `invalidation`, a holding → none in the export; a parsed catalyst token **is** stored; one snapshot per ticker |
| CP-3 | the 8 live captures (real parser) + rating-only / guidance / contracts stored from `parsed`, not `_catalysts` |
| CP-4 | `runAnalysis` output (writes, results, render calls; only the run's own id / timestamp normalized) identical with capture off / memory / throwing / rejecting / hanging / factory failure; it always finishes |
| CP-5 | gate `true` stores; `'true'`, `1`, `false`, `undefined` store nothing; status, Export and Clear work with the gate off |
| CP-6 | no `indexedDB.open` at load or in a capture-off scan; the first status read opens it; unavailable wording |
| CP-7 | Clear cancelled → nothing removed; Export → one download, valid per S1 `validateExport`, exact file name; status wordings; failing store → failure toasts, no download; confirmed Clear empties |
| CP-8 | AI-failed result → nulls + non-AI fields kept; unavailable research → `unavailable`; no / null debug entry, stale entry, `null`, string, array, throwing getter → skipped; a ticker S1 refuses → counted failed |
| CP-9 | two captures started back to back: every put of the first before the second |
| CP-10 | removing the three insertions gives the base `index.html` byte-for-byte (`73a40426…6000`); the call appears once, not awaited, after the final render and before the catch |
| CP-N1…N9 | wrapper removed · debug record as research · `_catalysts` as source · capture awaited · truthy gate · store opened at load · clear without confirmation · AI placeholders kept · no queue — each makes its named rows fail |

**COWORK sandbox preflight** (git archive of `792da92`; Linux, node 22; edits from §A1 / §A3, suite from §A2):
- Suite **10 / 10 rows, 9 / 9 negatives PASS** (≈ 1 s); on the unedited base every row fails (no inlined block).
- `index-pins --check` OK after `--update` with exactly the §1 delta (3 changed, 45 added, 0 removed, regions equal); `ai_request_hygiene` 11 / 15, `market_daily_change` 17 / 16, `labs_panel` 32, `ui_hygiene`, `index_pins`, `no_synthetic_score`, `high1y_label`, `pulse_analyst_view`, `evidence_memory` 27 / 26, `ath_isolation`, `tase_units`, `deep_dive_v0` PASS.
- Full `run-offline`: **101 → 102 suites**, the **same 17** environment-only failing suites as the pristine `792da92`; Phase 3 PASS (the one smart-quote warning is pre-existing, shifted by the insertion).

## §RT Risk & Test Design (spec-first matrix `risk-test-design.spec-first.md`, sha256 `e792e31c046255a41a9f4cf72794985b5b7c4d39f166be7a4b0d7b7774a5be27`, written before the suite)

**Task type:** storage + privacy + UI + integration into the scan flow.

| Requirement | Failure mode | Test | Expected |
|---|---|---|---|
| C-1 | top-level paste; copy drifts | CP-1, CP-N1 | byte-identical; one global |
| C-2 | raw text / debug record / AI free text / holdings stored | CP-2, CP-N2 | none stored; parsed text stored |
| C-2 | lossy source | CP-3, CP-N3 | full parser output kept |
| C-3 | capture awaited / throws / rejects / hangs / alters results | CP-4, CP-N4 | identical output; always finishes |
| C-4 | truthy gate; controls off with the gate | CP-5, CP-N5 | only `true` captures; controls work |
| C-5 | eager open | CP-6, CP-N6 | 0 opens until first use |
| C-6 | clear without confirmation; invalid export; failure shown as success | CP-7, CP-N7 | as specified |
| C-7 | placeholders recorded; unavailable dropped | CP-8, CP-N8 | nulls; `unavailable` |
| C-8 | interleaved writes | CP-9, CP-N9 | in order |
| Scope | other code changed | CP-10 | base bytes after removal |

**Self-review findings (before Codex):**
1. The D2 breakdown's collision reason was wrong (the three names are nested locals); the wrapper stays for a different reason (C-1).
2. The AI-failure fallback carries placeholder `sentiment: 'neutral'` and possibly a placeholder `action`; stored as an assessment they would read as a change in S2 → `null` (C-7).
3. The pin tool lists every column-0 declaration, including those inside the wrapper → 38 S1 functions join the pin map (drift detection; no duplicate names).
4. `labs_panel` LB-9 pins `toggleApiStatus`'s open line → the box loads its status from its own `<details>` toggle instead.
5. Two suites pin `runAnalysis`'s digest → §A3.
6. Back-to-back scans could interleave S1 puts (S1 decides caps per call) → one queue (C-8).
7. Suite error in my own draft: CP-4 first compared the run's own id / timestamp → only those are normalized.

**Held-out probe** (not in the suite): an identical second scan stores nothing new (2 × `UNCHANGED`); a scan cancelled after its first ticker stores one snapshot (as `pt_results`); `TEVA.TA` is stored with its agorot price and `currency` `null`.

**Accepted limits:** real IndexedDB behaviour (quota, eviction, private mode, a second tab) is checked only on DEV after LAND; a store operation that never settled would hold later captures until reload (S1 transactions settle on complete, error or abort); two tabs writing at once can overshoot S1's caps per call (S1 §2.2); storage grows to at most S1's caps (10 per ticker per day, 20 000 in total, 90 days).

## §C+ Review workflow (adopted 2026-10-17; this text is part of the approved brief)

- **Classification.** Bootstrap classifies every Codex finding: **S** specification / contract / scope / product decision → COWORK / Main Control; **W** implementation or test defect inside approved scope → the Worker after R11; **M** mechanical documentation / status / hash / reference correction → Bootstrap (recorded as an exact line diff with the new sha256 in the review record; the Owner's R11 line on the new hash is the acceptance). One initial pre-R11 Codex review; a focused re-review only for a substantive S change.
- **Appendix-amendment clause.** The appendices are the **reference implementation**. A W finding may be fixed by amending them **only inside the §1 files**, without touching §2 (contract), land-scope, land-tests, the base digest of CP-10 or the pin set of §1 (the pinned names / regions and their scope stay fixed; the digest *values* that an authorized amendment legitimately changes are refreshed by the §4 `index-pins --update` step). Closure needs RED / GREEN evidence including a **planted negative that fails on the appendix as given**; every delta is listed in `review.md` under "Appendix deltas" and its hunks get independent Codex verification. W fixes are made and verified in the step-8 / 9 loop, so step 12 stays a final check; a W finding first seen at step 12 that needs a second re-pass goes to the Owner at the step-13 STOP. **Bound (ruling S-6, Main Control, 2026-10-17):** "An amendment may not change the meaning of a §2 rule or weaken a test; any change to observable contract behaviour or acceptance criteria is an S change needing a revised brief and a focused review." Anything beyond this is an S finding.

### §W Known findings (required behaviour for the Worker)

Classified W by Bootstrap from the one pre-R11 Codex review (`shared-reports/codex/2026-10-17_evidence-capture-1-review.md`, "Rev 1 — verdict"). They are **required behaviour and tests, implemented by the Worker after R11** under the amendment clause above (RED / GREEN including a planted negative that fails on the appendix as given; each delta in `review.md` under "Appendix deltas"; independent Codex verification of the changed hunks). None changes §2, the scope, land-scope, land-tests or the CP-10 base digest.

- **W1 — Clear versus a queued capture.** `_ehClear` runs through the same serialisation queue (`_ehQueue`) as the captures, or the brief's race behaviour is stated and tested: after a confirmed Clear, a capture that was queued before it must not re-create history that the user just deleted. Test: queue a capture, confirm Clear, assert the store is empty afterwards, in both orders of arrival; planted negative: Clear bypasses the queue.
- **W2 — Export and Clear failure containment, and status announcement.** A throwing `_ptDownload` (not only a resolved `null`) shows the "Research history export failed" toast and downloads nothing; the status element is announced to assistive technology (`role="status"` or `aria-live="polite"`) when it changes. Tests: a throwing download; the markup attribute; planted negatives for each.
- **W3 — CP-3 full parser-output mapping.** Assert the parser-output → snapshot mapping field by field on the live captures (bearish / macro lists, earnings, peer move, revision direction / recency, data freshness, guidance, contracts, source metadata, rating-only actions), so a dropped or mis-mapped field fails; planted negative: one field dropped.
- **W4 — CP-4 / CP-1 / CP-7 gaps.** CP-4: cancellation after one ticker completes (only the completed ticker is captured), a second `runAnalysis` started while a capture is pending (its puts stay behind the first's), the capture receives only the tickers scanned in this run (not merged prior results). CP-1: the wrapper is strict at run time (an assertion that fails if the `'use strict'` directive is removed). CP-7: clear racing a queued capture is covered by W1. Planted negatives for the new assertions.

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (CLAUDE.md preflight: **Pattern Auditing** — the inlined-service pattern of `services/research-evidence-client.js` / `sec-evidence-store-client.js` (verbatim copy between banner lines, parity test against the committed file), the `_ptDownload` + `_ptTimestamp` export pattern (`exportPortfolioBackup`, EOD packet) and the `.labs-box` markup of `#labsBox`. **State & Boundary Isolation** — no `localStorage` read or write (CP-4: identical writes), DOM only `#ehBox`, no scoring / scan / Deep Dive / Actionable Take change (CP-10). **Gate Verification** — client `PT_EVIDENCE_CAPTURE !== true` → no capture; server N/A. **Definition of Done** — §5) |
| S1 RED | `qa/evidence_capture_offline.js` (§A2) fails: no inlined block |
| S2 GREEN | §A1 E-1…E-3; §A3; `node qa/tools/index-pins.js --update` (exactly the §1 delta); all rows + negatives + must-stay-green pass |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9, incl. "Appendix deltas" if any), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:** a change outside §1 / §2; a suite change beyond §A3 (amendments of the **new** suite §A2 under §C+ / §W are not a STOP); a pin delta beyond §1; any existing suite failing; a denied protected action or an integrity FAIL.

**After LAND (DEV, separate Owner approval; snapshot / restore protocol):** one scan of ≤ 3 tickers (the usual paid calls of a scan, nothing else) → ⚙ → Research history shows the count; Export downloads a document with no raw AI text; an immediate second scan of the same tickers adds only changed snapshots; Clear: cancel keeps, confirm empties; DevTools shows the `pulse-evidence-memory` database; `pt_results` behaves as before.

## §5 Definition of Done

1. CP-1…CP-10 and CP-N1…CP-N9 pass; `ai_request_hygiene` and `market_daily_change` pass with the §A3 lines; `labs_panel`, `ui_hygiene` and the pin-map readers pass; `index-pins --check` OK; `qa:offline` PASS at step 0 + 1.
2. After every finished scan with the gate on, each validated result with a research record is stored as one S1 snapshot (or recognised as unchanged); nothing outside C-2 reaches the store; the scan's own behaviour is unchanged.
3. The Research history box shows, exports and (after confirmation) clears the history.
4. No file or function outside §1 changes (CP-10).
5. The §W assertions (W1–W4) are present in the suite, each with RED / GREEN evidence and the appendix deltas listed in `review.md` under "Appendix deltas".

## §6 Decisions and risks

No open decision: D-22 and R-3 are applied as ruled; C-6 (place, wording, file name) and C-7 (AI placeholders → `null`, derived from S2's "unknown is not a change") are presentation / derived details.

| # | Risk | Control |
|---|---|---|
| R-1 | Real IndexedDB fails (private mode, quota, blocked upgrade) | contained by S1 (never throws); one warning; status says "not available"; checked on DEV |
| R-2 | A never-settling store operation holds later captures until reload | S1 transactions settle on complete / error / abort; accepted |
| R-3 | Two tabs scanning at once overshoot S1's per-call caps | S1 §2.2 (accepted at S1) |
| R-4 | Storage growth | S1 caps (10 / ticker / day, 20 000 total, 90 days); typical use is a few MB |
| R-5 | `.TA` prices in agorot without a currency | consistent units across snapshots; a currency field is added when a producer exists |

## §A Appendix — exact inputs the Worker needs (the reference implementation; see the amendment clause in §C+)

<!-- pep-lint:off -->
<!-- (text to apply with the Read / Edit / Write tools, not commands) -->

### §A1 `index.html` — the three insertions (Edit tool: replace each OLD, which occurs exactly once, with NEW; LF; literal text). Reference script: `evidence/apply.py`

#### A1.1 — E-1 the inlined S1 module and the capture section (inserted after the `sec-evidence-store-client` end banner)

OLD (exactly once):

~~~~text
// ═══ end services/sec-evidence-store-client.js ═══════════════════
~~~~

NEW = the OLD line, then text **H**, then the **complete file `services/evidence-memory.js` byte-for-byte** (read it with the Read tool; 786 lines, sha256 `378bd80a3875592f4119b8daa1a6a18816700292655477da838413a1d6b77a78`, ending with its final newline; nothing added, removed or re-indented), then text **T**. CP-1 checks the copy.

Text **H** (it starts with one empty line):

~~~~text

// ═══ services/evidence-memory.js — inlined (evidence-capture-1) ═══════════
// Byte-identical copy of the committed services/evidence-memory.js (evidence-memory-1 S1, 0903940; sha256
// 378bd80a3875592f4119b8daa1a6a18816700292655477da838413a1d6b77a78) between the wrapper lines below. The wrapper
// keeps the module's 61 top-level names out of the page scope, lets its 'use strict' directive apply as in Node,
// and hands its CommonJS exports to one global. Inert: no IndexedDB access until a capture or a Research history
// control uses it (the backend opens on its first operation).
var PulseEvidenceMemory = (function (module) {
~~~~

Text **T**:

~~~~text
return module.exports;
})({ exports: {} });
// ═══ end services/evidence-memory.js ═══════════════════════════════════════

// ── evidence-capture-1: research history (Main Control D-22; strict S1 privacy) ──────────────────────
// Every finished scan stores one S1 snapshot per scanned ticker in this browser (IndexedDB, 90 days), so the
// change engine (evidence-memory-1 S2) has a previous scan to compare with. Capture never changes a scan: it runs
// after the results are saved and shown, is never awaited, and contains every failure (one console warning).
// Client gate: a code constant checked with === true before any capture (resets on reload). No server path.
// The Research history controls (count, Export, Clear) work whether or not capture is on.
var PT_EVIDENCE_CAPTURE = true;
var _ehMem = null;                  // one store per page, created on first use: no IndexedDB access at page load
var _ehQueue = Promise.resolve();   // captures run one after another, also across back-to-back scans

function _ehMemory() {
  if (!_ehMem) _ehMem = PulseEvidenceMemory.createEvidenceMemory({ backend: PulseEvidenceMemory.indexedDbBackend() });
  return _ehMem;
}

// The S1 input for one validated result. Only fields S1 allows are passed (C-2):
//   research   = the parser output of the winning attempt (window._pplxDebug[T].parsed), never the debug record
//                (it holds the raw AI text) and never item._catalysts (a lossy copy); a failed research call is
//                { _unavailable: true } (S2: not observed); no research record at all -> null (not captured).
//   assessment = action, setup, sentiment, score, catalyst direction; the AI-made fields (action, sentiment, score)
//                are null when the AI analysis failed (_aiUnavailable): the fallback values are placeholders.
//   market     = the verified price only (provider units: .TA in agorot); currency null (no producer field yet).
function _ehCaptureInput(r, dbg, capturedAt) {
  if (!r || typeof r !== 'object' || typeof r.ticker !== 'string') return null;
  var d = (dbg && typeof dbg === 'object' && Object.prototype.hasOwnProperty.call(dbg, r.ticker)) ? dbg[r.ticker] : null;
  var research = null;
  if (d && d.parsed && typeof d.parsed === 'object' && !Array.isArray(d.parsed)) research = d.parsed;
  else if (d && d.unavailable === true) research = { _unavailable: true };
  if (!research) return null;
  var ai = r._aiUnavailable !== true;
  var txt = function (v) { return typeof v === 'string' ? v : null; };
  var num = function (v) { return (typeof v === 'number' && isFinite(v)) ? v : null; };
  return {
    ticker: r.ticker,
    capturedAt: capturedAt,
    research: research,
    assessment: {
      action: ai ? txt(r.action) : null,
      technicalSetup: txt(r.technical_setup),
      sentiment: ai ? txt(r.sentiment) : null,
      sentimentScore: ai ? num(r.sentiment_score) : null,
      catalystDirection: txt(r._catalystDirection)
    },
    market: { price: num(r._verifiedPrice), currency: null }
  };
}

// Capture one finished scan. Inputs are built at once (before any wait); stores run in order on one queue.
// Resolves to { captured, unchanged, skipped, failed }; never throws, never rejects.
function _ehCaptureScan(items, dbg, capturedAt) {
  var tally = { captured: 0, unchanged: 0, skipped: 0, failed: 0 };
  if (PT_EVIDENCE_CAPTURE !== true) return Promise.resolve(tally);
  try {
    var inputs = [];
    (Array.isArray(items) ? items : []).forEach(function (r) {
      var input = null;
      try { input = _ehCaptureInput(r, dbg, capturedAt); } catch (e) { input = null; }
      if (input) inputs.push(input); else tally.skipped += 1;
    });
    if (!inputs.length) return Promise.resolve(tally);
    var mem = _ehMemory();
    var run = _ehQueue.then(function () {
      return inputs.reduce(function (p, input) {
        return p.then(function () { return mem.put(input); }).then(function (res) {
          if (res && res.stored === true) tally.captured += 1;
          else if (res && res.reason === 'UNCHANGED') tally.unchanged += 1;
          else tally.failed += 1;
        });
      }, Promise.resolve());
    }).then(function () {
      if (tally.failed) console.warn('[PT] Research history: ' + tally.failed + ' of ' + inputs.length + ' snapshot(s) not stored');
      return tally;
    }, function () {
      console.warn('[PT] Research history: capture failed');
      return tally;
    });
    _ehQueue = run;
    return run;
  } catch (e) {
    console.warn('[PT] Research history: capture failed');
    return Promise.resolve(tally);
  }
}

// Research history controls (settings panel, #ehBox): status line, Export, Clear (with confirmation).
function _ehStatusText(st) {
  if (!st || st.ok !== true) return 'Research history is not available in this browser.';
  if (!st.snapshots) return 'No research history stored yet.';
  return st.snapshots + (st.snapshots === 1 ? ' snapshot' : ' snapshots') + ' · ' +
    st.tickers + (st.tickers === 1 ? ' ticker' : ' tickers') + ' · ' +
    (st.oldestDay === st.newestDay ? st.oldestDay : st.oldestDay + ' to ' + st.newestDay);
}

function _ehRender() {
  var el = document.getElementById('ehStatus');
  if (!el) return Promise.resolve(null);
  el.textContent = 'Checking…';
  return _ehMemory().stats().then(function (st) {
    el.textContent = _ehStatusText(st);
    return st;
  });
}

function _ehExport() {
  return _ehMemory().exportJson().then(function (json) {
    if (typeof json !== 'string') { showToast('Research history export failed'); return false; }
    _ptDownload(new Blob([json], { type: 'application/json' }), 'pulse-research-history_' + _ptTimestamp() + '.json');
    return true;
  });
}

function _ehClear() {
  if (!window.confirm('Delete all research history stored on this device? This cannot be undone.')) return Promise.resolve(false);
  return _ehMemory().clear().then(function (res) {
    var ok = !!(res && res.ok === true);
    showToast(ok ? 'Research history cleared' : 'Research history could not be cleared');
    return _ehRender().then(function () { return ok; });
  });
}
// ── end evidence-capture-1 ─────────────────────────────────────────────────────────────────────────────
~~~~

#### A1.2 — E-2 the capture call in `runAnalysis` (after the final render; the OLD lines are kept at the start of NEW)

OLD (exactly once):

~~~~text
    try {
      renderResults(finalResults, dateStr);
    } catch(renderErr) {
      console.error('[PT] renderResults failed:', renderErr.message);
      showError('Error displaying results: ' + renderErr.message);
    }
~~~~

NEW:

~~~~text
    try {
      renderResults(finalResults, dateStr);
    } catch(renderErr) {
      console.error('[PT] renderResults failed:', renderErr.message);
      showError('Error displaying results: ' + renderErr.message);
    }
    // evidence-capture-1 (D-22): keep this scan's research history after the results are saved and shown.
    // Fire-and-forget: not awaited, changes no result; every failure is contained inside _ehCaptureScan.
    _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);
~~~~

#### A1.3 — E-3 the Research history box in the settings modal (after `#labsBox`; the OLD lines are kept at the start of NEW)

OLD (exactly once):

~~~~text
        <span><b>Portfolio research</b> — shows research results you already have in the Portfolio view. Starts no new research.</span></label>
    </div>
~~~~

NEW:

~~~~text
        <span><b>Portfolio research</b> — shows research results you already have in the Portfolio view. Starts no new research.</span></label>
    </div>
    <details class="labs-box" id="ehBox" ontoggle="if (this.open) _ehRender()">
      <summary class="labs-title">Research history</summary>
      <div class="labs-sub">Each finished scan saves a structured copy of its research on this device for 90 days, so later scans can show what changed. It stays in this browser and is never uploaded.</div>
      <div class="labs-sub" id="ehStatus">—</div>
      <div style="display:flex;gap:8px">
        <button class="btn-export" onclick="_ehExport()">EXPORT ↓</button>
        <button class="btn-export" onclick="_ehClear()">CLEAR</button>
      </div>
    </details>
~~~~

### §A2 `qa/evidence_capture_offline.js` (new; exact text, LF)

~~~~text
#!/usr/bin/env node
'use strict';
/*
 * qa/evidence_capture_offline.js - evidence-capture-1 (Main Control D-22; R-3; evidence-memory-1 S1 contract).
 *
 * Every finished scan stores one S1 snapshot per scanned ticker in the browser, without changing the scan. Rows are
 * derived from the brief's spec-first matrix (risk-test-design.spec-first.md), written before this suite. The REAL
 * code is extracted from index.html: the inlined S1 module and the capture section, runAnalysis, mergeResultsByTicker,
 * _isValidScanResult and parsePerplexityContext (run on the 8 live captures of qa/fixtures/research-live-2026-10-15.json).
 * Pure Node: no network, no browser, no real storage (S1's memory backend, recording / failing / hanging backends and
 * a counting indexedDB fake).
 *
 *   CP-1  isolation: the inlined module is byte-identical to services/evidence-memory.js; one new global only
 *   CP-2  privacy: raw AI text, the debug record, AI free text and holdings never reach the store (positive control)
 *   CP-3  source: the full parser output (real live captures; rating-only, guidance, contracts kept), not _catalysts
 *   CP-4  no effect on the scan: runAnalysis output identical with capture off / on / throwing / rejecting / hanging
 *   CP-5  gate: only PT_EVIDENCE_CAPTURE === true captures; the controls work in every gate state
 *   CP-6  lazy: no indexedDB.open at load or for a scan with capture off; opened on first control use
 *   CP-7  controls: status text, Export (valid S1 document, downloaded once), Clear only after confirmation
 *   CP-8  AI-failed results, unavailable research, missing / stale debug entries, hostile items
 *   CP-9  captures are serialized across back-to-back scans
 *   CP-10 scope: removing the three insertions gives the base index.html byte-for-byte; the call is not awaited
 *   CP-N1..N9 planted negatives (each mutates index.html; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const MODULE_FILE = fs.readFileSync(path.join(ROOT, 'services', 'evidence-memory.js'), 'utf8');
const LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa', 'fixtures', 'research-live-2026-10-15.json'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const S1_SHA = '378bd80a3875592f4119b8daa1a6a18816700292655477da838413a1d6b77a78';
const BASE_INDEX_SHA = '73a4042632ff923d5e2ae7d2c84168055edb7090389aed71a79107d2a6c96000'; // index.html at the base (LF), before the three insertions
const HEAD_MARK = '\n// ═══ services/evidence-memory.js — inlined (evidence-capture-1) ═══════════\n';
const END_MARK = '// ── end evidence-capture-1 ─────────────────────────────────────────────────────────────────────────────\n';
const WRAP_OPEN = 'var PulseEvidenceMemory = (function (module) {\n';
const WRAP_CLOSE = 'return module.exports;\n})({ exports: {} });\n';
const CALL_LINES = "    // evidence-capture-1 (D-22): keep this scan's research history after the results are saved and shown.\n" +
  "    // Fire-and-forget: not awaited, changes no result; every failure is contained inside _ehCaptureScan.\n" +
  "    _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);\n";
const BOX_OPEN = '    <details class="labs-box" id="ehBox"';

function between(src, a, b) {
  const i = src.indexOf(a);
  if (i === -1 || src.indexOf(a, i + 1) !== -1) throw new Error('marker not found exactly once: ' + a.slice(0, 50));
  const j = src.indexOf(b, i + a.length);
  if (j === -1) throw new Error('end marker not found: ' + b.slice(0, 50));
  return { start: i, end: j + b.length, inner: src.slice(i + a.length, j) };
}
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
function parserFrom(src) {
  const st = src.indexOf('function parsePerplexityContext(');
  const bi = src.indexOf('{', st); let d = 0, end = -1;
  for (let i = bi; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
  const ctx = { console: { log() {}, warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(st, end) + ';this.P = parsePerplexityContext;', ctx);
  return ctx.P;
}
const PARSE = parserFrom(SRC);
const parsedOf = cap => { const p = PARSE(cap.raw, []); return p[cap.ticker] || p.__raw__ || null; };

// ---------- the page sandbox ----------
// Loads the capture region (inlined module + capture section) and the scan functions from `src` into one context.
function page(src, opt) {
  const o = opt || {};
  const region = between(src, HEAD_MARK, END_MARK);
  const regionText = src.slice(region.start, region.end);
  const store = Object.create(null), writes = [], renders = [], toasts = [], downloads = [], warns = [];
  const idb = o.idb === undefined ? undefined : o.idb;
  const els = {
    cardsGrid: { innerHTML: '' }, runBtn: { disabled: false, className: '', onclick: null, innerHTML: '' },
    errorBox: { style: {} }, emptyState: null, resultsSection: { style: {} }, ehStatus: { textContent: '' }
  };
  const ctx = {
    console: { log() {}, error() {}, warn: (...a) => { warns.push(a.join(' ')); } },
    setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Number, Boolean, Error, Map, Set, Date, RegExp, isFinite, parseFloat,
    document: { getElementById: id => (Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null), querySelectorAll: () => [] },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); writes.push([k, k === 'pt_date' ? '<date>' : String(v)]); },
      removeItem: k => { delete store[k]; }
    },
    Blob: function (parts, meta) { this.parts = parts; this.type = meta && meta.type; },
    showToast: m => toasts.push(m), _ptDownload: (b, n) => downloads.push({ name: n, text: b.parts.join('') }),
    _ptTimestamp: () => '2026-10-17_10-00-00',
    setProgress() {}, hideProgress() {}, showError() {}, _hideStaleBanner() {}, cancelScan() {},
    renderResults: (r, d) => { renders.push(JSON.stringify(r)); },
    getScanSymbols: () => (o.symbols || ['AAA', 'BBB']).slice(),
    _athPrefetchScan: () => ({}),
    analyzeChunk: o.analyzeChunk || (async batch => batch.map(sym => (o.resultFor || defaultResult)(sym, ctx)))
  };
  if (idb !== undefined) ctx.indexedDB = idb;
  ctx.window = ctx;
  ctx.window.confirm = o.confirm || (() => true);
  vm.createContext(ctx);
  const prelude = 'var results = []; var _analysisRunning = false, _cancelRequested = false, _currentScanTicker = null;\n';
  vm.runInContext(prelude + regionText + '\n' + fnText(src, 'mergeResultsByTicker') + '\n' + fnText(src, '_isValidScanResult') + '\n' +
    fnText(src, 'runAnalysis') + '\nthis.__get = function () { return results; };', ctx);
  return { ctx, store, writes, renders, toasts, downloads, warns, els, regionText };
}

const TOK = { raw: 'ZQXRAWTEXT', dbg: 'ZQXDEBUGFIELD', summary: 'ZQXSUMMARY', risk: 'ZQXKEYRISK', entry: 'ZQXENTRYZONE', inval: 'ZQXINVALIDATION', hold: 'ZQXHOLDING', pos: 'ZQXSTOREDCATALYST' };
function parsedFor(sym) {
  return {
    analystActions: [{ bank: 'Mizuho', action: 'raised', ratingAction: null, rating: 'Outperform', target: 210, ptFrom: 190, ptAction: 'raised', raw: 'Mizuho raised PT to $210 from $190 (October 15)' }],
    ratingOnlyActions: [{ bank: 'Bernstein', action: 'upgraded', ratingAction: 'upgrade', rating: 'Buy', raw: 'Bernstein upgraded to Buy (October 15)' }],
    bullishCatalysts: [sym + ' won a contract ' + TOK.pos], bearishCatalysts: [], macroDrivers: [],
    earnings: null, guidance: 'raised full-year guidance', contracts: 'a $1 billion five-year contract', peerMove: null,
    revisionDirection: 'upgrading', revisionRecency: 'this week', dataFreshness: 'today', sources: []
  };
}
function defaultResult(sym, ctx) {
  ctx.window._pplxDebug[sym] = { rawText: TOK.raw + ' ' + sym, parsed: parsedFor(sym), model: TOK.dbg, errorReason: TOK.dbg, parsedFrom: 'ticker-header' };
  return {
    ticker: sym, company_name: sym + ' Corp', sentiment: 'positive', sentiment_score: 66, action: 'add_on_pullback', technical_setup: 'healthy_uptrend',
    _catalystDirection: 'bullish', _verifiedPrice: 101.5, summary: 'A long enough summary for the validator to accept it as a result. ' + TOK.summary,
    key_risk: TOK.risk, entry_zone: TOK.entry, invalidation: TOK.inval, _catalysts: { bullish: ['lossy copy'] }
  };
}
const memWith = (P, backend) => P.ctx.PulseEvidenceMemory.createEvidenceMemory({ backend: backend || P.ctx.PulseEvidenceMemory.memoryBackend() });
async function exported(P) { return P.ctx._ehMem.exportJson(); }
async function settle(p, ms) { let t; const to = new Promise(r => { t = setTimeout(() => r('TIMEOUT'), ms || 400); }); const v = await Promise.race([p, to]); clearTimeout(t); return v; }
// The run's own id and timestamp (Date.now / toISOString at the end of the scan) differ between any two runs; everything else must be equal.
const unstamp = s => s.replace(/\\?"_runId\\?":\d+/g, '"_runId":0').replace(/\\?"_timestamp\\?":\\?"[^"\\]*\\?"/g, '"_timestamp":0');
const norm = P => unstamp(JSON.stringify({ writes: P.writes, results: P.ctx.__get(), renders: P.renders }));

// ---------- rows ----------
const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };
const ok = (c, m) => { if (!c) throw new Error(m); };

row('CP-1', async src => {
  const inner = between(src, WRAP_OPEN, WRAP_CLOSE).inner;
  ok(sha(inner) === S1_SHA && inner === MODULE_FILE, 'inlined text differs from services/evidence-memory.js');
  const P = page(src);
  const block = between(src, HEAD_MARK, WRAP_CLOSE);
  const ref = new Set(Object.getOwnPropertyNames(vm.runInNewContext('this')));
  const fresh = vm.createContext({});
  vm.runInContext(src.slice(block.start, block.end), fresh);
  const added = Object.getOwnPropertyNames(vm.runInContext('this', fresh)).filter(k => !ref.has(k));
  ok(added.length === 1 && added[0] === 'PulseEvidenceMemory', 'globals added by the module block: ' + added.join(','));
  ok(typeof P.ctx.PulseEvidenceMemory.createEvidenceMemory === 'function' && typeof P.ctx.PulseEvidenceMemory.validateExport === 'function', 'exports missing');
});

row('CP-2', async src => {
  const P = page(src);
  P.store.pt_holdings = JSON.stringify({ AAA: { shares: 5, note: TOK.hold } });
  P.ctx._ehMem = memWith(P);
  await P.ctx.runAnalysis();
  await settle(P.ctx._ehQueue, 1000);
  const doc = await exported(P);
  ok(typeof doc === 'string', 'no export');
  for (const k of ['raw', 'dbg', 'summary', 'risk', 'entry', 'inval', 'hold']) ok(doc.indexOf(TOK[k]) === -1, 'token reached the store: ' + k);
  ok(doc.indexOf(TOK.pos) !== -1, 'positive control: a parsed catalyst must be stored');
  ok(JSON.parse(doc).snapshotCount === 2, 'one snapshot per scanned ticker');
});

row('CP-3', async src => {
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  const items = [], dbg = {};
  LIVE.captures.forEach((c, i) => {
    const t = c.ticker; if (dbg[t]) return;
    dbg[t] = { rawText: c.raw, parsed: parsedOf(c) };
    items.push({ ticker: t, action: 'hold_wait', technical_setup: 'healthy_uptrend', sentiment: 'neutral', sentiment_score: 50, _catalystDirection: 'mixed', _verifiedPrice: 100 + i, _catalysts: { bullish: [] } });
  });
  dbg.ZZZ = { parsed: parsedFor('ZZZ') };
  items.push({ ticker: 'ZZZ', action: 'hold_wait', sentiment: 'neutral', sentiment_score: 50, _verifiedPrice: 9, _catalysts: { bullish: [] } });
  const tally = await P.ctx._ehCaptureScan(items, dbg, new Date().toISOString());
  ok(tally.captured === items.length && tally.failed === 0, 'captured ' + JSON.stringify(tally) + ' of ' + items.length);
  const doc = JSON.parse(await exported(P));
  const z = doc.snapshots.find(s => s.ticker === 'ZZZ');
  ok(z && z.research.ratingOnlyActions.length === 1 && z.research.guidance && z.research.contracts, 'rating-only / guidance / contracts lost');
  for (const t of Object.keys(dbg).filter(k => k !== 'ZZZ')) {
    const s = doc.snapshots.find(x => x.ticker === t), p = dbg[t].parsed;
    ok(s, 'live ticker not stored ' + t);
    const want = (p.bullishCatalysts || []).filter(x => typeof x === 'string' && x.length <= 300 && !/[\n\r]/.test(x)).length;
    ok(s.research.bullish.length === Math.min(want, 10), t + ' bullish ' + s.research.bullish.length + ' vs parsed ' + want);
  }
});

row('CP-4', async src => {
  const run = async mode => {
    const P = page(src);
    if (mode === 'off') P.ctx.PT_EVIDENCE_CAPTURE = false;
    if (mode === 'memory') P.ctx._ehMem = memWith(P);
    if (mode === 'throwing') P.ctx._ehMem = { put() { throw new Error('x'); } };
    if (mode === 'rejecting') P.ctx._ehMem = { put() { return Promise.reject(new Error('x')); } };
    if (mode === 'hanging') P.ctx._ehMem = { put() { return new Promise(() => {}); } };
    if (mode === 'factory') { P.ctx._ehMem = null; P.ctx.PulseEvidenceMemory = { createEvidenceMemory() { throw new Error('x'); }, indexedDbBackend() { throw new Error('x'); } }; }
    const done = await settle(P.ctx.runAnalysis().then(() => 'DONE'), 1500);
    ok(done === 'DONE', mode + ': runAnalysis did not finish');
    await settle(P.ctx._ehQueue, 50);
    return norm(P);
  };
  const ref = await run('off');
  for (const m of ['memory', 'throwing', 'rejecting', 'hanging', 'factory']) ok(await run(m) === ref, 'scan output changed with capture ' + m);
});

row('CP-5', async src => {
  for (const [v, expect] of [[true, 2], ['true', 0], [1, 0], [false, 0], [undefined, 0]]) {
    const P = page(src);
    P.ctx._ehMem = memWith(P);
    P.ctx.PT_EVIDENCE_CAPTURE = v;
    await P.ctx.runAnalysis();
    await settle(P.ctx._ehQueue, 1000);
    const st = await P.ctx._ehMem.stats();
    ok(st.snapshots === expect, 'gate ' + String(v) + ' stored ' + st.snapshots);
  }
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  P.ctx.PT_EVIDENCE_CAPTURE = true; await P.ctx.runAnalysis(); await settle(P.ctx._ehQueue, 1000);
  P.ctx.PT_EVIDENCE_CAPTURE = false;
  ok((await P.ctx._ehRender()).snapshots === 2 && /^2 snapshots/.test(P.els.ehStatus.textContent), 'status with the gate off');
  ok(await P.ctx._ehExport() === true && P.downloads.length === 1, 'export with the gate off');
  ok(await P.ctx._ehClear() === true && (await P.ctx._ehMem.stats()).snapshots === 0, 'clear with the gate off');
});

row('CP-6', async src => {
  let opens = 0;
  const idb = { open() { opens += 1; const req = {}; setTimeout(() => { req.error = new Error('no'); if (req.onerror) req.onerror(); }, 0); return req; } };
  const P = page(src, { idb });
  ok(opens === 0, 'indexedDB opened at load');
  P.ctx.PT_EVIDENCE_CAPTURE = false;
  await P.ctx.runAnalysis();
  ok(opens === 0 && P.ctx._ehMem === null, 'store touched by a scan with capture off');
  await P.ctx._ehRender();
  ok(opens >= 1, 'first control use must open the store');
  ok(P.els.ehStatus.textContent === 'Research history is not available in this browser.', 'unavailable wording: ' + P.els.ehStatus.textContent);
});

row('CP-7', async src => {
  const P = page(src, { confirm: () => false });
  P.ctx._ehMem = memWith(P);
  await P.ctx.runAnalysis(); await settle(P.ctx._ehQueue, 1000);
  ok(await P.ctx._ehClear() === false && (await P.ctx._ehMem.stats()).snapshots === 2, 'cleared without confirmation');
  ok(await P.ctx._ehExport() === true && P.downloads.length === 1, 'export');
  const d = P.downloads[0];
  ok(d.name === 'pulse-research-history_2026-10-17_10-00-00.json' && P.ctx.PulseEvidenceMemory.validateExport(JSON.parse(d.text)), 'export not a valid S1 document');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 2, tickers: 2, oldestDay: '2026-10-16', newestDay: '2026-10-17' }) === '2 snapshots · 2 tickers · 2026-10-16 to 2026-10-17', 'status wording');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 1, tickers: 1, oldestDay: '2026-10-17', newestDay: '2026-10-17' }) === '1 snapshot · 1 ticker · 2026-10-17', 'singular wording');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 0 }) === 'No research history stored yet.', 'empty wording');
  const F = page(src, { confirm: () => true });
  const bad = () => Promise.reject(new Error('x'));
  F.ctx._ehMem = memWith(F, { kind: 'bad', get: bad, put: bad, del: bad, keys: bad });
  ok(await F.ctx._ehExport() === false && F.downloads.length === 0 && F.toasts.indexOf('Research history export failed') !== -1, 'failed export worded as success');
  ok(await F.ctx._ehClear() === false && F.toasts.indexOf('Research history could not be cleared') !== -1, 'failed clear worded as success');
  const C = page(src, { confirm: () => true });
  C.ctx._ehMem = memWith(C);
  await C.ctx.runAnalysis(); await settle(C.ctx._ehQueue, 1000);
  ok(await C.ctx._ehClear() === true && (await C.ctx._ehMem.stats()).snapshots === 0 && C.toasts.indexOf('Research history cleared') !== -1, 'confirmed clear');
});

row('CP-8', async src => {
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  const now = new Date().toISOString();
  const dbg = { AIF: { parsed: parsedFor('AIF') }, UNA: { unavailable: true, rawText: TOK.raw }, NOD: null, STALE: { parsed: parsedFor('STALE') } };
  const evil = {}; Object.defineProperty(evil, 'ticker', { get() { throw new Error('boom'); } });
  const items = [
    { ticker: 'AIF', _aiUnavailable: true, sentiment: 'neutral', sentiment_score: null, action: 'hold_wait', technical_setup: 'below_key_mas', _catalystDirection: 'bearish', _verifiedPrice: 12 },
    { ticker: 'UNA', sentiment: 'positive', sentiment_score: 70, action: 'hold_wait', _verifiedPrice: 5 },
    { ticker: 'NOD', sentiment: 'positive', sentiment_score: 70 },
    { ticker: 'MISSING', sentiment: 'positive', sentiment_score: 70 },
    null, 'AAA', [], evil, { ticker: 'bad ticker!' }
  ];
  dbg['bad ticker!'] = { parsed: parsedFor('X') };
  const tally = await P.ctx._ehCaptureScan(items, dbg, now);
  ok(tally.captured === 2 && tally.skipped === 6 && tally.failed === 1, 'tally ' + JSON.stringify(tally)); // 6 skipped: no / null debug entry, null, string, array, throwing getter; 1 refused by S1 (bad ticker)
  const doc = JSON.parse(await exported(P));
  const aif = doc.snapshots.find(s => s.ticker === 'AIF'), una = doc.snapshots.find(s => s.ticker === 'UNA');
  ok(aif && aif.assessment.action === null && aif.assessment.sentiment === null && aif.assessment.sentimentScore === null, 'AI placeholders stored');
  ok(aif.assessment.technicalSetup === 'below_key_mas' && aif.assessment.catalystDirection === 'bearish' && aif.market.price === 12, 'non-AI fields lost');
  ok(una && una.research.unavailable === true, 'unavailable research not captured');
  ok(!doc.snapshots.some(s => s.ticker === 'STALE' || s.ticker === 'NOD' || s.ticker === 'MISSING'), 'stale / missing entry captured');
  const empty = await P.ctx._ehCaptureScan([], dbg, now);
  ok(empty.captured === 0 && empty.skipped === 0, 'empty scan');
});

row('CP-9', async src => {
  const P = page(src);
  const order = [];
  const base = P.ctx.PulseEvidenceMemory.memoryBackend();
  const slow = f => function () { const a = arguments; return new Promise(r => setTimeout(r, 3)).then(() => f.apply(null, a)); };
  P.ctx._ehMem = memWith(P, { kind: 'slow', get: slow(base.get), del: slow(base.del), keys: slow(base.keys), put: slow((k, v) => { order.push(v.ticker); return base.put(k, v); }) });
  const now = new Date().toISOString(), later = new Date(Date.now() + 1000).toISOString();
  const dbg = { AAA: { parsed: parsedFor('AAA') }, BBB: { parsed: parsedFor('BBB') }, CCC: { parsed: parsedFor('CCC') }, DDD: { parsed: parsedFor('DDD') } };
  const r = t => ({ ticker: t, sentiment: 'positive', sentiment_score: 60, _verifiedPrice: 10 });
  const a = P.ctx._ehCaptureScan([r('AAA'), r('BBB')], dbg, now);
  const b = P.ctx._ehCaptureScan([r('CCC'), r('DDD')], dbg, later);
  await Promise.all([a, b]);
  ok(order.join(',') === 'AAA,BBB,CCC,DDD', 'interleaved captures: ' + order.join(','));
});

row('CP-10', async src => {
  let s = src;
  const region = between(s, HEAD_MARK, END_MARK);
  s = s.slice(0, region.start) + s.slice(region.end);
  ok(s.split(CALL_LINES).length === 2, 'capture call lines not found exactly once');
  s = s.replace(CALL_LINES, '');
  const bi = s.indexOf(BOX_OPEN), be = s.indexOf('    </details>\n', bi);
  ok(bi !== -1 && be !== -1 && s.indexOf(BOX_OPEN, bi + 1) === -1, 'history box not found exactly once');
  s = s.slice(0, bi) + s.slice(be + '    </details>\n'.length);
  ok(sha(s) === BASE_INDEX_SHA, 'index.html differs from the base outside the three insertions: ' + sha(s));
  const ra = fnText(src, 'runAnalysis');
  ok(ra.split('_ehCaptureScan(').length === 2 && !/await\s+_ehCaptureScan/.test(ra), 'capture call awaited or repeated');
  ok(ra.indexOf('_ehCaptureScan(') > ra.indexOf('renderResults(finalResults, dateStr);') && ra.indexOf('_ehCaptureScan(') < ra.indexOf('} catch (err) {'), 'capture call misplaced');
});

// ---------- planted negatives ----------
const NEG = [
  ['CP-N1 wrapper removed (top-level paste)', ['CP-1'], s => s.replace(WRAP_OPEN, '').replace(WRAP_CLOSE,
    'var PulseEvidenceMemory = { createEvidenceMemory: createEvidenceMemory, indexedDbBackend: indexedDbBackend, memoryBackend: memoryBackend, validateExport: validateExport };\n')],
  ['CP-N2 debug record passed as research', ['CP-2'], s => s.replace('research = d.parsed;', 'research = d;')],
  ['CP-N3 lossy _catalysts used as the source', ['CP-3'], s => s.replace("if (d && d.parsed && typeof d.parsed === 'object' && !Array.isArray(d.parsed)) research = d.parsed;",
    "if (d && d.parsed && typeof d.parsed === 'object' && !Array.isArray(d.parsed)) research = r._catalysts || {};")],
  ['CP-N4 capture awaited by the scan', ['CP-4', 'CP-10'], s => s.replace('    _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);', '    await _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);')],
  ['CP-N5 truthy gate', ['CP-5'], s => s.replace('if (PT_EVIDENCE_CAPTURE !== true) return', 'if (!PT_EVIDENCE_CAPTURE) return')],
  ['CP-N6 store opened at page load', ['CP-6'], s => s.replace('var _ehQueue = Promise.resolve();', 'var _ehQueue = Promise.resolve(); _ehMemory().prune();')],
  ['CP-N7 clear without confirmation', ['CP-7'], s => s.replace("if (!window.confirm('Delete all research history stored on this device? This cannot be undone.')) return Promise.resolve(false);", '')],
  ['CP-N8 AI placeholders kept', ['CP-8'], s => s.replace('var ai = r._aiUnavailable !== true;', 'var ai = true;')],
  ['CP-N9 no capture queue', ['CP-9'], s => s.replace('var run = _ehQueue.then(function () {', 'var run = Promise.resolve().then(function () {')]
];

async function runRow(id, src) {
  try { await ROWS[id](src); return null; } catch (e) { return (e && e.message) || String(e); }
}

(async () => {
  let fails = 0;
  for (const id of ORDER) {
    const err = await runRow(id, SRC);
    if (err) { fails++; console.log('  FAIL  ' + id + '  ' + err); } else console.log('  PASS  ' + id);
  }
  for (const [label, rows, mutate] of NEG) {
    const m = mutate(SRC);
    if (m === SRC) { fails++; console.log('  FAIL  negative ' + label + ': mutation did not apply'); continue; }
    const res = [];
    for (const id of rows) res.push(await runRow(id, m));
    if (res.every(Boolean)) console.log('  PASS  negative ' + label + ' -> ' + rows.join(' / ') + ' fail');
    else { fails++; console.log('  FAIL  negative ' + label + ': ' + rows.filter((r, i) => !res[i]).join(' / ') + ' still pass'); }
  }
  console.log(fails ? 'EVIDENCE CAPTURE OFFLINE: FAIL (' + fails + ')' : 'EVIDENCE CAPTURE OFFLINE: PASS (' + ORDER.length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
~~~~

### §A3 the two suite lines (Edit tool; each OLD exactly once; literal text)

#### A3.1 — pinned `runAnalysis` digest

File: `qa/ai_request_hygiene_offline.js`

OLD (exactly once):

~~~~text
  runAnalysis: '1b20f27d19618e9e43e512aa20cb8c8c032b8262c60e57c57d29be906bd2b676'
~~~~

NEW:

~~~~text
  runAnalysis: '7d5c029bd336cdfadb93a542b38e45ee715f2a70a2fd14e501f1c0a29e2e1aa7'   // evidence-capture-1: one fire-and-forget capture call
~~~~

#### A3.2 — pinned `runAnalysis` digest

File: `qa/market_daily_change_offline.js`

OLD (exactly once):

~~~~text
  runAnalysis: '1b20f27d19618e9e43e512aa20cb8c8c032b8262c60e57c57d29be906bd2b676',
~~~~

NEW:

~~~~text
  runAnalysis: '7d5c029bd336cdfadb93a542b38e45ee715f2a70a2fd14e501f1c0a29e2e1aa7',   // evidence-capture-1: one fire-and-forget capture call
~~~~

<!-- pep-lint:on -->

## §CMD Command card (one command per Bash call; Bash tool only)

    Command hygiene (three guard-sensitive patterns; a breach is a form denial or STOP-6 per AGENTS.md):
    1. One command per Bash call, exactly as listed below: no &&, ||, ;, pipes, redirects, cd, echo, loops or wrappers.
    2. The land tool's file name appears only in the exact lines of this card - never in a read-only command, a search, or a Codex prompt. Call it "the land tool"; inspect it with Read / Grep.
    3. No inline interpreter code (node -e / -p, python -c, perl -e) whose text contains "git" or "netlify", even in a string or comment. Use Read / Grep / Edit / Write or a listed command.

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/evidence-capture-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/evidence_capture_offline.js
node qa/ai_request_hygiene_offline.js
node qa/market_daily_change_offline.js
node qa/labs_panel_offline.js
node qa/ui_hygiene_offline.js
node qa/evidence_memory_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/tools/index-pins.js --check
node qa/tools/index-pins.js --update
node qa/index_pins_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/evidence-capture-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/evidence-capture-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `node qa/tools/index-pins.js --diff <base>`; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH; the post-LAND DEV scan.

<!-- land-scope:begin -->
index.html
qa/fixtures/index-pins.json
qa/ai_request_hygiene_offline.js
qa/market_daily_change_offline.js
qa/evidence_capture_offline.js
work/evidence-capture-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/evidence_capture_offline.js
node qa/ai_request_hygiene_offline.js
node qa/market_daily_change_offline.js
node qa/labs_panel_offline.js
node qa/ui_hygiene_offline.js
node qa/evidence_memory_offline.js
node qa/no_synthetic_score_offline.js
node qa/high1y_label_offline.js
node qa/pulse_analyst_view_offline.js
node qa/index_pins_offline.js
<!-- land-tests:end -->
