# Task brief: evidence-memory-1 S1 — local research memory (snapshots, retention, export)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 3 — Codex review complete (READY FOR R11, 0 Class I); ready for R11 preparation** (COWORK, 2026-10-16). Built on `branch-dev` = `d5a03fe`. Rev 2 closed the six Class I findings of Codex review #1; rev 3 closed the three Class I findings and two advisories of re-check #2; the focused third check of rev 3 (one-time Owner exception) found 0 Class I and one advisory — the homoglyph residual, accepted and recorded as R-7 (all verdicts preserved in `shared-reports/codex/2026-10-16_evidence-memory-1-s1-review.md`, with Bootstrap's verification and the closure matrices). Earlier revisions: `rev1/`, `evidence/rev2.diff`; the rev-3 delta is `evidence/rev3.diff`. No further Codex rounds pending. Remaining: Main Control acceptance of residual risks R-1, R-4 and R-7 and of this hash, then the Owner's R11.

| | |
|---|---|
| Owner ruling R-3 (2026-10-16) | Local browser storage for S1 · structured research snapshots and source metadata only; no raw AI responses or full article text · default retention **90 days** · local data export · a replaceable storage interface for future server-side persistence · cross-device sync is a future goal, not S1 · no Netlify DB, cloud storage, authentication or sync infrastructure now. **Clarification (2026-10-16):** validated structured catalyst items up to 300 characters and scan labels are permitted; raw AI text must never be persisted merely by placing it in a structured field |
| Objective | A tested library `services/evidence-memory.js` that turns one ticker's scan research into a **structured snapshot**, stores it locally (IndexedDB) behind a **four-method storage contract**, keeps it for 90 days within bounded caps, and **exports** everything as one JSON document. Foundation of "What changed since the last scan" (`what-changed-1`, later) |
| Not in S1 | Wiring into `index.html` (capture after a scan, export button, clear-history action) — a later lane-A slice; canonical evidence dedup across days and the change engine (S2–S4); any server, sync, account or import path |
| Backlog | none. No `BACKLOG.md` edit |
| Depends on | nothing open. Roadmap order: `market-structure-1` (DONE) → **`evidence-memory-1`** → `journal-core-1` |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all hold; otherwise HOLD: <ul><li>`services/evidence-memory.js` and `qa/evidence_memory_offline.js` do **not** exist;</li><li>`qa/run-offline.js` = `0f57950f0615aa53c5c7b66e2f12da192aaa2015`;</li><li>`services/market-structure.js` = `a09977599326ba81c99453c7b7a805dedafa993f`;</li><li>`qa/fixtures/research-live-2026-10-15.json` = `54526e2c15414dab849bd52cb544daaff5bcd2b3` (read by EM-24);</li><li>`index.html` contains `function parsePerplexityContext(` exactly once (read by EM-24; never edited).</li></ul> |
| Branch / slot / mode | `task/evidence-memory-1-s1` · **Worker B** · **Manual** (a new persistence schema and storage contract, even though unwired) |
| qa:offline | step-0 count **+1** (`qa/evidence_memory_offline.js`; auto-discovered; the runner stays forbidden) |
| Parallel with | any lane-A task: **no shared file** (`index.html` is only read). One heavy QA run at a time |
| Skills | `pt-offline-suite` — Recommended |
| Gate verification | N/A in S1: nothing calls the module. The wiring slice must add a client gate (`=== true`) before any capture runs |

## §1 Files (exactly)

- `services/evidence-memory.js` (new) — exact text in **§A1**
- `qa/evidence_memory_offline.js` (new) — exact text in **§A2**
- `work/evidence-memory-1-s1/review.md`

**Forbidden:** editing `index.html` (EM-24 only reads it); `qa/fixtures/**`; every other file under `services/`, `qa/`, `netlify/`; `qa/run-offline.js`; `package*.json`; `.claude/**`; `AGENTS.md`; `CLAUDE.md`; `BACKLOG.md`. No dependency is added.

## §1a Consumer sweep

No existing symbol, file or stored key changes; the module is not loaded by `index.html` and nothing imports it.

| Reader | Effect | Assertion |
|---|---|---|
| `qa/run-offline.js` Phase 1 syntax check (`services/*.js`, `qa/*.js`) | parses the two new files | sandbox: 185 files parse cleanly |
| `qa/run-offline.js` Phase 2 auto-discovery | runs the new suite (≈ 10–30 s in the sandbox, load-dependent; some negatives deliberately wait out the 1 s hang guard) | sandbox: PASS; 98 → 99 suites at `d5a03fe` |
| `qa/run-offline.js` Phase 3 `checkNoTokenPersistence` (`index.html` + `services/*.js`) | scans the module | PASS |
| `qa/run-offline.js` Phase 3 `evidenceAndSyncPaths` | selects `netlify/functions/lib/*evidence*`, three named functions and `services/*research-evidence*` by name; this module (no network, no scoring, no `localStorage`) is not selected — its own EM-17 asserts the same prohibitions and more | listed (selection rule stated) |
| The new suite reads `index.html` `parsePerplexityContext` and the live-capture fixture (EM-24) | a future change of the parser's output shape fails EM-24 visibly | coupling noted |
| Future lane-A wiring, `what-changed-1`, export button | will call `put` / `latest` / `exportJson` | out of S1 |

## §2 Contracts (normative; the exact code is §A1)

### §2.1 Snapshot schema `pulse.evidence-snapshot/v1` and the privacy allowlist

One rule set, `sanitizeBody`, both **builds** a snapshot body (after the parser's field names are mapped) and **validates** a stored one: a stored body is valid only if the rule set leaves it unchanged (strict structural equality, so `NaN` / `undefined` / wrong types never pass). Every field is one of three kinds:

| Kind | Fields | Rule |
|---|---|---|
| **Closed vocabulary** (no free text possible) | `assessment.action` ∈ `hold_wait, add_on_pullback, add_on_reclaim, add_on_breakout, trim, avoid, hold` · `assessment.technicalSetup` ∈ `extended_near_ath, healthy_uptrend_near_ath, healthy_uptrend, pullback_in_uptrend, support_test, breakdown_risk, below_key_mas, unknown` · `assessment.sentiment` ∈ `positive, negative, neutral` · `assessment.catalystDirection` ∈ `bullish, bearish, mixed` · `research.revisionDirection` ∈ `upgrading, downgrading, mixed, stable` (the parser's leading word only) · `research.dataFreshness` ∈ `today, this week, this month` · analyst `action / ratingAction / targetAction` ∈ the parser's 18 past-tense verbs · analyst `rating` ∈ the parser's 22 canonical ratings | anything else → `null` |
| **Strict pattern** | `ticker` (`^[A-Z]{1,10}([.-][A-Z0-9]{1,3})?$`) · `capturedAt` (strict UTC ISO, years 2000–2099, every component range-checked, nothing normalised except ms padding) · dates (`October 14`, `Oct 2, 2026`, a real day of that month; source dates also `YYYY-MM-DD`) · numbers (finite, positive, below a ceiling; score 0–100) · `currency` (`[A-Z]{3}`) · analyst `firm` (letters, digits, `& . , ' -`, ≤ 40 chars, ≤ 6 words) · **source URL** (below) | anything else → `null` (or the source / action is dropped) |
| **Permitted free text** (R-3 clarification) | `research.bullish / bearish / macro` items, `earnings`, `guidance`, `contracts`, `peerMove` (≤ 300 chars each), source `title` (≤ 160) | one line, no control / zero-width / bidi characters; **an over-length or multi-line value is dropped and counted (`dropped`), never truncated into storage**. Provenance: S1 accepts these only from one ticker's `parsePerplexityContext` arrays / fields; a whole response passed in one field exceeds the limit and is dropped |

**Source URL:** `http` / `https` only; no credentials; host = 2+ DNS labels with a letter TLD (no IP literal, no `localhost`, no single label); port only the scheme default; path ≤ 300 chars of unreserved characters and valid percent-escapes; **every content rule reads the percent-decoded segment** (so encoding cannot hide one): no `.` / `..` segment, no bad character, no secret-looking segment (a 32+ character unbroken token, `sk_` / `pk_` / `rk_`, AWS / GitHub / Slack key prefixes, a JWT); and the **secret words** (api key / secret / token / password) are matched on the **whole decoded path with every non-alphanumeric character removed**, so no separator, encoding, casing or segment split carries one through (look-alikes such as `secretary` are dropped too — conservative, accepted); query and fragment removed. Any failure drops the whole source.

**Never stored:** raw AI responses, the analyst item text (`raw`, only its date is read), article bodies, AI free text (summary, key risk, entry zone, invalidation), holdings, keys, settings. `contentHash` is an integrity / dedup checksum (64-bit), **not authentication**: records are trusted for their structure only.

Top-level keys: `schema, id, ticker, capturedAt, day, contentHash, research, assessment, market, sources`; `id = TICKER\|capturedAt\|contentHash`. Bounds: 10 items per list, 10 actions per list, 8 sources.

### §2.2 Storage contract (replaceable backend)

```
backend = { get(key) → Promise<value|undefined>, put(key, value) → Promise, del(key) → Promise, keys() → Promise<string[]> }
```

- Keys owned: `snap:<TICKER>:<capturedAt>:<contentHash>`; any other key is ignored and never deleted (not even by `clear`).
- Shipped backends: `memoryBackend()` and `indexedDbBackend({ idb?, dbName? })` (database `pulse-evidence-memory`, object store `kv`, out-of-line keys). A database that exists without `kv` is upgraded to the next version to create it; `onversionchange` closes the connection (so other tabs can upgrade) and the next call reopens; a blocked upgrade, an open error, an open that throws, or a missing IndexedDB rejects (and is contained, §2.3). Each operation is one transaction and settles exactly once, on `complete`, `error` or `abort`. An open request settles once; a connection that arrives after it settled (success after `blocked`) has no owner and is closed at once, so every connection is either cached or closed.
- **Backend contract:** operations return promises and **never throw synchronously**; a failure is a rejected promise (that is how `createEvidenceMemory` sees backend failure).
- **Atomicity:** per call only. `put` writes the new record first and deletes evicted / replaced / expired keys afterwards, so a failed write never loses an existing record. Under concurrent writers (two tabs) caps are best effort (temporarily exceeded by at most the number of concurrent writers) and corrected by the next `put`; reads always validate, so correctness of returned data does not depend on atomicity. A future server backend implements the same four methods.

### §2.3 Memory API — `createEvidenceMemory({ backend, retentionDays = 90, now, limits })`

**No public function or method throws or rejects** — not on backend failure, clock failure, hostile input (throwing getters, proxies, cycles) or garbage from the backend. This includes the **factories**: `createEvidenceMemory` with unusable options returns an instance whose every method fails closed with the shapes below (`BACKEND_ERROR`); `indexedDbBackend` with unusable options returns a backend whose operations reject. (Backend operations may reject — §2.2 — but never throw.)

| Method | Resolves to |
|---|---|
| `put(input)` | `{ stored, reason, id?, evicted? }`, `reason ∈ STORED · REPLACED · UNCHANGED · EXPIRED · FUTURE · DAY_CAP · TOTAL_CAP · BACKEND_ERROR · CLOCK_ERROR · INVALID_INPUT · INVALID_TICKER · INVALID_CAPTURED_AT · NO_RESEARCH`. Decisions use keys only |
| `list(ticker, { sinceDay, untilDay, limit })` | live valid snapshots, oldest first; `[]` on failure |
| `latest(ticker, beforeIso?)` | newest live snapshot strictly before the time, or `null` |
| `tickers()` | live tickers; `[]` on failure |
| `stats()` | `{ ok: true, snapshots, tickers, oldestDay, newestDay, invalidSkipped, retentionDays, backend }` or `{ ok: false, reason: 'BACKEND_ERROR' }` |
| `prune()`, `clear()` | `{ ok: true, removed }` or `{ ok: false, reason: 'BACKEND_ERROR', removed: 0 }` |
| `exportAll()`, `exportJson()` | the export document / its sorted-key string, or `null` on failure |

`buildSnapshot(input)` → `{ ok: true, snapshot, dropped }` or `{ ok: false, reason }`; `validateSnapshot(s)` and `validateExport(doc)` → boolean. None throws.

### §2.4 Retention and bounds

- **Retention:** live while `capturedAt ≥ now − 90 days` (boundary kept). Older input is refused (`EXPIRED`); expired keys are deleted when seen; reads and exports never return them; `prune()` deletes them.
- **Clock:** `capturedAt` more than 24 h after `now` → `FUTURE`; a clock that throws or is not a finite number → `CLOCK_ERROR` / contained failure.
- **Unchanged:** a snapshot equal to the ticker's newest earlier snapshot is not stored (`UNCHANGED`); same ticker + same `capturedAt` with new content replaces the old record (`REPLACED`). Out-of-order arrivals and evictions can leave two equal snapshots adjacent; a later diff reads that as "no change".
- **Caps:** ≤ 10 per ticker per UTC day and ≤ 20,000 in total, newest kept. **The cap decision is taken before anything is deleted:** a refused snapshot (`DAY_CAP` / `TOTAL_CAP`) never removes the record it would have replaced.
- **Size (measured):** real live captures give 1.3–1.9 KB per snapshot → ≈ 9 MB for 30 tickers × 2 scans × 90 days; the global cap bounds the worst case at ≈ 40 MB.

### §2.5 Export format `pulse.evidence-memory-export/v1`

```
{ format: "pulse.evidence-memory-export/v1", snapshotSchema: "pulse.evidence-snapshot/v1",
  exportedAt: <UTC ISO>, retentionDays: 90, snapshotCount: <n>, snapshots: [ <v1 snapshot>, … ] }
```

`validateExport` requires exactly these six keys, a strict `exportedAt`, an integer `retentionDays ≥ 1`, `snapshotCount` equal to the array length, strictly increasing `(ticker, capturedAt, id)` order (no duplicates) and every snapshot valid under §2.1. It is the boundary a later import must reuse.

### §2.6 Future migration boundaries (not built in S1)

| Concern | Boundary set by S1 |
|---|---|
| Server persistence | implement the §2.2 contract; the snapshot format and the module stay unchanged; the atomicity statement above is the minimum a server backend must meet |
| Cross-device sync | the export document is the transfer unit; ids are deterministic, so a merge is idempotent by `id`; no device / user id, accounts or conflict rules now |
| Schema change | `schema` on every record; v1 readers skip unknown versions (counted; removed only by retention or `clear`); a v2 reader adds migrate-on-read |
| Import | must go through `validateExport` (strict); an import path is a later slice |
| Wiring | a later lane-A slice inlines the module verbatim into `index.html`, calls `put` once per ticker after the scan result is final, behind a client gate, and adds export / clear actions; it re-checks IndexedDB behaviour in a real browser on DEV |

### §2.7 What the IndexedDB fake proves, and what it cannot

| Proven offline (EM-22, EM-23) | Not provable offline — checked when the wiring slice runs on DEV |
|---|---|
| staged writes committed only on `complete`; a request error aborts the transaction and rolls back its writes; a commit-time abort; `NotFoundError` for a missing store and the upgrade path; `onblocked` **and the same request succeeding later when the blocker closes** (late connection closed; no leaked connection — the fake counts open connections); open error; open that throws (Safari-style); missing IndexedDB; `getAllKeys` returning garbage; `versionchange` → close → reopen; the same invariants on both backends | real quota sizes and browser eviction of best-effort storage (data can be cleared under storage pressure); private-browsing behaviour per browser; multi-tab timing and each browser's exact event order around `blocked` / `versionchange`; structured-clone (rather than JSON) value storage; very large stores. The module treats every one of these as a contained failure or an empty read |

## §3 QA — new suite `qa/evidence_memory_offline.js` (exact text §A2)

Pure Node; module loaded from its source string; in-memory backend plus an in-suite **transactional** IndexedDB fake; injected clock; seeded random generator (identical every run). The contract checks are written from §2 independently of the module's code.

| Row | Contract | How it is checked (independent of the module's vocabulary where it matters) |
|---|---|---|
| EM-1 | forbidden fields | raw response, prompt, article body, AI summary, key risk, entry zone, holdings, API key, token — at every level |
| EM-2 | exact v1 shape | independent spec checker; revision leading word; analyst date |
| EM-3 | tickers | 5 valid, 12 invalid |
| EM-4 | **timestamps** (finding 3) | 24 invalid (hour 24 / 25, minute 60 / 99, second 60 / 61, day 0 / 32, 30 Feb, 29 Feb 2025, month 0 / 13, years 1999 / 2100, lower-case, space, offset, 4-digit ms …); 3 valid boundaries round-trip unchanged |
| EM-5 | **URLs** (findings 1c, 4) | 8 article URLs kept exactly (incl. 2 with harmless escapes); 35 rejected: unsafe schemes, credentials, IPv4 / IPv6 literals, `localhost`, single label, bad labels, numeric TLD, 64-char label, ports 99999 / 8080 / 0, secret-looking paths (Stripe-style, GitHub, JWT, AWS, 40-char hex, `api_key=`), `..`, bad / bidi percent-escapes, over-length path, backslash, tab, and **encoded forms** (`%2e%2e`, `%2E`, `.%2E`, a 32-char token split by `%41`, encoded `sk_`, encoded `password`) |
| EM-6 | bounds | over-length, multi-line, NUL, U+2028, U+202E values dropped and counted, never truncated; list / action / source caps |
| EM-7 – EM-13 | identity, round trip, UNCHANGED / REPLACED, 90-day retention, FUTURE, caps, corrupted and foreign records | as rev 1 |
| EM-14 | **forged records** (finding 2) | 11 records re-sealed with a recomputed checksum and id (free-text key, label text, revision / freshness text, long title, secret URL, 11-item list, invented rating, string price, number as text, extra top key) all refused; 7 malformed export documents refused |
| EM-15 | export | header keys, order, determinism, validation |
| EM-16 | **no-throw matrix** (finding 6) | every public method × 9 backend failure modes (keys / get / put / del rejecting, throwing synchronously, keys not an array) and 3 clock failures resolve with their documented shapes; 4 hostile inputs (throwing getter, throwing proxy, trapping proxy, cyclic object); validators on garbage |
| EM-17 | purity | no network, DOM, cookies, web storage other than IndexedDB (inside `indexedDbBackend` only), `require`, `eval`, randomness, scoring or `pt_results` |
| EM-18 | research shapes from other code paths | unavailable / all-none / `__raw__` blocks, non-string items, prototype payload, wrong types |
| EM-19 | **data-flow canary** (finding 1) | a unique letters-only token in **every** input slot (all research fields, analyst `raw`, every action field, source URL path / title / date / extra key, every assessment field, market extras, unknown keys at three levels); the tokens that reach the snapshot must be **exactly** the permitted free-text slots |
| EM-20 | **schema conformance** (finding 2) | 400 seeded random inputs (junk strings, wrong types, NaN, bad text, vocabulary hits, unsafe URLs, bad dates): build never throws, output conforms to the independent spec checker and validates; then one random leaf of each output is mutated and the record re-sealed: the validator accepts it **only if** the independent checker says it conforms |
| EM-21 | caps / atomicity (advisory #5) | a replacement refused by a lowered day cap leaves the store byte-identical; a failed write leaves the earlier record in place |
| EM-22 | **storage invariants** | 260 (memory) and 100 (IndexedDB fake) seeded random operations: foreign key intact, caps held, every stored value valid, nothing expired visible, export valid, no stored put equal to its predecessor at insert time |
| EM-23 | **IndexedDB semantics** (finding 6) | success path; request error → abort → rollback; commit-time abort; existing database without the store (upgrade 3 → 4, other store kept); upgrade blocked by another open connection; **blocked then late success** (late connection closed, next call reopens, ≤ 1 open connection); open error; open throwing; IndexedDB absent; `getAllKeys` garbage; `versionchange` → reopen; no connection leak on reopen paths — each must settle within 1 s |
| EM-24 | **the real producer** | the 8 live research captures through the real `parsePerplexityContext`: valid, conformant, ≤ 2.6 KB, nothing dropped, every free-text item is the parser's own item, and no 40-character run of the raw response appears anywhere outside the permitted items |
| EM-25 | **export surface never throws** (re-check finding 2) | every exported function (enumerated, so future exports are covered) × 15 hostile arguments, and every method of what it returns × 2 more (332 calls): no synchronous throw, no hang; no rejection except backend operations (§2.2); an instance from unusable options returns the §2.3 failure shapes |
| EM-26 | **secret words, every spelling** (re-check finding 1) | generated: 5 words × every split point × 22 separators (raw and encoded, incl. `/` between segments) × 3 casings, plus each letter percent-encoded — 1,747 URLs, all dropped; 7 look-alike article paths kept |
| EM-27 | **every drop is counted** (re-check advisory) | one bad value per permitted free-text slot (title over-length / multi-line, 4 single fields, 3 list kinds), each alone: `dropped` rises by exactly one |
| EM-N1 … N26 | planted negatives | label allowlist loosened · revision text kept whole · truncation instead of drop · retention 30 · unchanged check removed · day cap removed · structural validation removed (checksum only) · canonical JSON instead of strict equality · `stats` not contained · clock range check removed · port check removed · secret-path check removed · TLD / IP check removed · replacement deleted before the cap decision · delete before write · abort not handled · missing-store upgrade removed · free-text slot added · rule set bypassed at build · `versionchange` not handled · URL content rules read the encoded segment · late connection not closed · factory not contained · secret words matched as typed · dropped text not counted · backend operation throws synchronously — each makes its named rows fail |

**COWORK sandbox preflight** (git archive of `d5a03fe`, Linux, node 22):
- **27 / 27 rows and 26 / 26 negatives PASS**; suite time load-dependent (≈ 10–30 s in the sandbox; main rows ≈ 1.5 s; most time is the 26 negatives, some of which wait out the 1 s hang guard by design).
- The **rev-2 module fails EM-23, EM-25, EM-26 and EM-27** under this suite (the rev-3 rows were written from §2 before the module fix was checked against them), so they detect the re-check defects and their wider class — EM-27 also finds the uncounted single fields, EM-25 the synchronous backend throws — rather than restating Codex's examples.
- The **rev-1 module fails 13 of the 24 rows** under this suite (EM-2, 4, 5, 6, 10, 14, 16, 17, 19, 20, 21, 23, 24; some only because return shapes changed), so the new checks detect the reviewed defects rather than restating rev 1's tests.
- **Held-out probe** (≈ 75 new inputs written after the suite, not in it and not from Codex: URL / timestamp / label / vocabulary / analyst / free-text edge forms, hostile containers, validator prototype tricks): one gap found and fixed by construction — URL content rules read the raw segment, so `%2e%2e` and a token split by an escape passed; they now read the decoded segment (EM-5 extended, EM-N21). Two behaviours confirmed as specified, not defects: 1–3-digit milliseconds are zero-padded (same instant); character limits count UTF-16 units.
- **Rev-3 held-out probe** (cases not in the suite): `secretary-…` dropped (accepted conservative false positive); `/a/p/i/k/e/y`, `/pass/word`, `s%65cr%65t` dropped; query-borne secrets removed with the query; null-prototype options fail closed. **Accepted limit:** a homoglyph spelling (`t%D0%BEken`, Cyrillic о) is kept — matching non-ASCII look-alikes would drop legitimate non-English article paths (e.g. Hebrew), and real credentials are still caught by the 32+ token / key-prefix rules.
- Appendix code extracted from this brief into a clean tree passes; without the module the suite fails (RED).
- Full `run-offline`: **98 → 99 suites**, the same 17 environment-only failing suites as at base; Phase 1 parses 185 files; Phase 3 scans PASS.

**Must stay green:** every existing suite unchanged; `qa:offline` count = step 0 + 1.

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (CLAUDE.md preflight: Pattern Auditing — `services/market-structure.js` export guard, `qa/market_structure_offline.js` source-loading / planted negatives; State & Boundary Isolation — no `localStorage`, DOM, scoring or scan flow touched; Gate Verification — N/A, unwired; Definition of Done — §5) |
| S1 RED | `qa/evidence_memory_offline.js` (§A2) fails: the module is absent |
| S2 GREEN | `services/evidence-memory.js` (§A1); all rows + negatives pass |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:** a change outside §1; any existing suite failing; a denied protected action or an integrity FAIL.

## §5 Definition of Done

1. EM-1 … EM-27 and EM-N1 … EM-N26 pass; `qa:offline` PASS at step 0 + 1.
2. Every public function / method resolves or returns with exactly the §2.3 shapes and never throws or rejects; an export validates under §2.5.
3. No file outside §1 changes.

## §6 Risks

| # | Risk | Control |
|---|---|---|
| R-1 | Permitted free-text items are AI-written research fields | Only parsed items ≤ 300 chars, one line, from the parser's arrays (R-3 clarification); over-length dropped, never truncated; EM-19 / EM-24 prove no other slot carries input text |
| R-2 | The IndexedDB fake is not a browser | §2.7: transactional semantics are modelled and tested; the listed browser-only behaviours are checked at wiring on DEV and are contained failures meanwhile |
| R-3 | The checksum is not cryptographic | Not used for trust (§2.1); validation is structural (EM-14, EM-20) |
| R-4 | Storage growth / browser eviction | 90-day retention, unchanged-skip, caps (≈ 9 MB typical, ≈ 40 MB worst); best-effort storage may be cleared by the browser — data loss is possible and accepted for S1 (local only, exportable) |
| R-5 | Concurrent tabs | Per-call atomicity; caps best effort under concurrency; reads validate (§2.2) |
| R-6 | Parser shape change breaks EM-24 | Intended visibility of a producer contract change; EM-24 reads `index.html` only |
| R-7 | Unicode / homoglyph spellings of the secret words in a source URL path (e.g. `t%D0%BEken` with a Cyrillic о) are **not** detected: the secret-word rule strips ASCII separators only and compares ASCII letters, so non-ASCII look-alike letters pass (residual accepted at the Rev 3 Codex check, advisory; already noted in §3's rev-3 held-out probe) | Accepted for S1. Matching non-ASCII look-alikes would also drop legitimate non-English article paths (e.g. Hebrew). Real credentials remain caught independently of spelling by the 32+ character token rule and the key-prefix / JWT rules (§2.1, EM-5); query and fragment are always removed. EM-26 covers ASCII separators, casings and percent-encoded letters only |

## §A Appendix — exact files

<!-- pep-lint:off -->
<!-- (source code to create with the Write tool, not commands) -->

### §A1 `services/evidence-memory.js` (LF)

```js
'use strict';

/**
 * services/evidence-memory.js
 *
 * evidence-memory-1 S1 (rev 2) - local research memory (Owner ruling R-3, 2026-10-16).
 *
 * Stores structured per-ticker research snapshots and source metadata in local browser storage, keeps
 * them for a retention window (default 90 days) and exports them as one JSON document.
 *
 * Privacy (R-3): only an explicit allowlist can be stored. Labels, verbs, ratings, freshness and dates
 * are closed vocabularies or strict patterns; the only free text is a parsed research item (catalyst,
 * earnings, guidance, contracts, peer move) or a source title, each a single line within a hard length
 * limit - a longer value is dropped and counted, never truncated into storage. URLs keep scheme, a
 * validated public host name and a validated path; anything else is dropped.
 *
 * One rule set: `sanitizeBody` both builds a snapshot body and validates a stored one (a stored body is
 * valid only if sanitizing it changes nothing). `contentHash` is an integrity / dedup checksum, not
 * authentication: a record is trusted for its structure, never for its hash.
 *
 * Not wired into the app. No network, no DOM, no cookies, no web storage other than the IndexedDB backend.
 * The clock is injected. Every public function and method returns or resolves; none throws or rejects.
 *
 * Storage goes through a replaceable backend contract (four async methods), so a future server backend can
 * implement the same contract. No server backend, sync, accounts or authentication here.
 */

var SNAPSHOT_SCHEMA = 'pulse.evidence-snapshot/v1';
var EXPORT_FORMAT = 'pulse.evidence-memory-export/v1';
var DAY_MS = 86400000;

// Ruled / default values. Changing DEFAULT_RETENTION_DAYS is an Owner ruling (R-3 = 90 days).
var DEFAULT_RETENTION_DAYS = 90;
var LIMITS = {
  textChars: 300,        // one parsed research item (catalyst, earnings, guidance, contracts, peer move)
  titleChars: 160,       // one source title
  firmChars: 40,         // one analyst firm name
  pathChars: 300,        // URL path
  listItems: 10,         // items kept per catalyst list
  actions: 10,           // analyst actions kept per list
  sources: 8,            // sources kept per snapshot
  perTickerPerDay: 10,   // snapshots kept per ticker per UTC day (newest kept)
  totalSnapshots: 20000, // global cap (newest kept)
  futureSkewMs: DAY_MS   // a capturedAt further in the future than this is refused
};

// ---------- closed vocabularies (the app's own contracts; anything else is dropped) ----------

var ACTIONS = ['hold_wait', 'add_on_pullback', 'add_on_reclaim', 'add_on_breakout', 'trim', 'avoid', 'hold'];
var SETUPS = ['extended_near_ath', 'healthy_uptrend_near_ath', 'healthy_uptrend', 'pullback_in_uptrend',
  'support_test', 'breakdown_risk', 'below_key_mas', 'unknown'];
var SENTIMENTS = ['positive', 'negative', 'neutral'];
var DIRECTIONS = ['bullish', 'bearish', 'mixed'];
var REVISION = ['upgrading', 'downgrading', 'mixed', 'stable'];
var FRESHNESS = ['today', 'this week', 'this month'];
var VERBS = ['raised', 'cut', 'lowered', 'trimmed', 'reduced', 'boosted', 'hiked', 'set', 'upgraded', 'downgraded',
  'reiterated', 'reaffirmed', 'maintained', 'initiated', 'started', 'launched', 'reinstated', 'resumed'];
var RATINGS = ['Strong Buy', 'Strong Sell', 'Buy', 'Outperform', 'Overweight', 'Accumulate', 'Add', 'Positive', 'Hold',
  'Neutral', 'Equal Weight', 'Market Perform', 'Sector Perform', 'Peer Perform', 'In Line', 'Market Weight', 'Sector Weight',
  'Underperform', 'Underweight', 'Reduce', 'Sell', 'Negative'];
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- primitives (pure; none throws) ----------

var TICKER_RE = /^[A-Z]{1,10}(?:[.\-][A-Z0-9]{1,3})?$/;
var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
var BAD_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;
var FIRM_RE = /^[A-Za-z0-9][A-Za-z0-9&.,' \-]{0,39}$/;
var REPORTED_DATE_RE = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? ([1-9]|[12]\d|3[01])(?:, (20\d\d))?$/;

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function inList(v, list) { return typeof v === 'string' && list.indexOf(v) !== -1 ? v : null; }

// One line of text, no control / zero-width / bidi characters, within `max`; otherwise null (never truncated).
function oneLine(v, max) {
  if (typeof v !== 'string') return null;
  var s = v.replace(/[ \t]+/g, ' ').trim();
  if (!s || s.length > max || BAD_CHARS_RE.test(s)) return null;
  return s;
}

function finiteNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

function normalizeTicker(v) {
  if (typeof v !== 'string') return null;
  var t = v.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

// Strict UTC ISO timestamp -> milliseconds, or null. Every component is range-checked; nothing is normalised.
function parseIso(v) {
  if (typeof v !== 'string') return null;
  var m = ISO_RE.exec(v);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +m[6];
  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  var ms = Date.UTC(y, mo - 1, d, h, mi, s, m[7] ? +(m[7] + '00').slice(0, 3) : 0);
  var dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

function isoOf(ms) { return new Date(ms).toISOString(); }

// A calendar date "YYYY-MM-DD" that exists, or null.
function isoDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return parseIso(v + 'T00:00:00Z') === null ? null : v;
}

// A date as reported in research text ("October 14", "Oct 2, 2026"); the day must exist in that month.
function reportedDate(v) {
  if (typeof v !== 'string') return null;
  var m = REPORTED_DATE_RE.exec(v.trim());
  if (!m) return null;
  var mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
  var y = m[3] ? +m[3] : 2024; // leap year when no year is given, so Feb 29 is allowed
  var dt = new Date(Date.UTC(y, mo - 1, +m[2]));
  return dt.getUTCMonth() === mo - 1 ? v.trim() : null;
}

// The reported date inside an analyst item, e.g. "(October 14)". Only the date leaves this function.
function dateInItem(raw) {
  if (typeof raw !== 'string') return null;
  var m = /\(([A-Za-z]{3,9}\.? \d{1,2}(?:, \d{4})?)\)/.exec(raw);
  return m ? reportedDate(m[1]) : null;
}

// Public host name only: 2+ labels, letters / digits / hyphens, a letter TLD; no IP literal, no localhost,
// no port other than the scheme default.
function cleanHost(h, scheme) {
  var m = /^([a-z0-9.\-]+)(?::(\d{1,5}))?$/.exec(h);
  if (!m) return null;
  if (m[2] !== undefined && !((scheme === 'https' && m[2] === '443') || (scheme === 'http' && m[2] === '80'))) return null;
  var host = m[1];
  if (host.length > 253) return null;
  var labels = host.split('.');
  if (labels.length < 2) return null;
  for (var i = 0; i < labels.length; i++) {
    if (!/^[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?$/.test(labels[i])) return null;
  }
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9\-]{2,59})$/.test(labels[labels.length - 1])) return null;
  return host;
}

// A path segment that may be kept: unreserved characters and valid percent-escapes only, and nothing that
// looks like a credential (a long unbroken token, a known key prefix, a JWT).
var SECRET_WORDS_RE = /apikey|secret|token|passw/;

function safeSegment(seg) {
  if (seg.length > 120) return false;
  if (!/^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*$/.test(seg)) return false;
  var dec;
  try { dec = decodeURIComponent(seg); } catch (e) { return false; }
  // Every content rule reads the decoded segment, so percent-encoding cannot hide a dot segment or split a token.
  if (BAD_CHARS_RE.test(dec) || dec === '.' || dec === '..') return false;
  if (/[A-Za-z0-9]{32,}/.test(dec)) return false;
  if (/^(?:sk|pk|rk)[_-]|^(?:AKIA|ASIA)[A-Z0-9]{12,}|^gh[pousr]_|^xox[abprs]-|^eyJ[A-Za-z0-9_\-]+\./i.test(dec)) return false;
  return true;
}

// Source URL -> "https://host/path" (http(s); lower-case scheme and host; query and fragment removed).
// Any invalid part makes the whole URL null (the source is then dropped).
function cleanUrl(v) {
  if (typeof v !== 'string' || v.length > 2048 || /\s/.test(v)) return null;
  var m = /^([A-Za-z][A-Za-z0-9+.\-]*):\/\/([^\/?#]*)([^?#]*)/.exec(v);
  if (!m) return null;
  var scheme = m[1].toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') return null;
  if (m[2].indexOf('@') !== -1) return null;
  var host = cleanHost(m[2].toLowerCase(), scheme);
  if (!host) return null;
  var path = m[3] || '/';
  if (path.length > LIMITS.pathChars || path.charAt(0) !== '/') return null;
  var segs = path.split('/').slice(1);
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] === '.' || segs[i] === '..' || (segs[i] !== '' && !safeSegment(segs[i]))) return null;
  }
  // Secret words are matched on the whole decoded path with every separator removed, so no spelling,
  // encoding or segment split ("api key", "api%2Fkey", "/api/key", "pass-word") can carry one through.
  var flat;
  try { flat = decodeURIComponent(path).toLowerCase().replace(/[^a-z0-9]/g, ''); } catch (e) { return null; }
  if (SECRET_WORDS_RE.test(flat)) return null;
  return scheme + '://' + host + path;
}

function leadToken(v, list) {
  if (typeof v !== 'string') return null;
  var s = v.toLowerCase().replace(/\[\d+\]/g, ' ').trim();
  for (var i = 0; i < list.length; i++) {
    if (s === list[i] || s.indexOf(list[i] + ' ') === 0 || s.indexOf(list[i] + '\u2014') === 0 || s.indexOf(list[i] + ' \u2014') === 0) return list[i];
  }
  return null;
}

// FNV-1a-style 64-bit checksum (two 32-bit lanes) -> 16 hex chars. Integrity / dedup only, not a security hash.
function fnv64(str) {
  var h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 ^= (h1 >>> 7); h2 = h2 >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

// Canonical JSON: own keys sorted, arrays in order.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

// Strict structural equality (types, key sets, values). Unlike canonical JSON it tells NaN, undefined and
// non-JSON values apart from null, so a stored record cannot pass by serialising like a valid one.
function same(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join('\u0000') !== kb.join('\u0000')) return false;
  for (var j = 0; j < ka.length; j++) if (!same(a[ka[j]], b[ka[j]])) return false;
  return true;
}

// ---------- the single rule set: stored-form body -> sanitized body ----------
// Used to BUILD (after mapping the parser's field names) and to VALIDATE (a stored body must be a fixed point).

function sanAction(a, withTarget) {
  if (!isObj(a)) return null;
  var firm = oneLine(a.firm, LIMITS.firmChars);
  if (!firm || !FIRM_RE.test(firm) || firm.split(' ').length > 6) return null;
  var r = {
    firm: firm,
    action: inList(a.action, VERBS),
    ratingAction: inList(a.ratingAction, VERBS),
    rating: inList(a.rating, RATINGS),
    date: reportedDate(a.date)
  };
  if (withTarget) {
    var t = finiteNum(a.target), f = finiteNum(a.targetFrom);
    r.target = (t !== null && t > 0 && t < 1e7) ? t : null;
    r.targetFrom = (f !== null && f > 0 && f < 1e7) ? f : null;
    r.targetAction = inList(a.targetAction, VERBS);
  }
  return r;
}

function sanList(arr, max, fn, counter) {
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length; i++) {
    var v = fn(arr[i]);
    if (v === null) { counter.n += 1; continue; }
    if (out.length < max) out.push(v); else counter.n += 1;
  }
  return out;
}

// A free-text value that was supplied but cannot be kept is dropped and counted, never truncated.
function keepText(v, max, c) {
  var t = oneLine(v, max);
  if (t === null && v !== null && v !== undefined && v !== '') c.n++;
  return t;
}

function sanSource(s, c) {
  if (!isObj(s)) return null;
  var url = cleanUrl(s.url);
  if (!url) return null;
  return { url: url, domain: url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), title: keepText(s.title, LIMITS.titleChars, c), date: isoDay(s.date) || reportedDate(s.date) };
}

// Returns { body, dropped } where body has exactly the v1 keys.
function sanitizeBody(b) {
  var src = isObj(b) ? b : {};
  var r = isObj(src.research) ? src.research : {};
  var a = isObj(src.assessment) ? src.assessment : {};
  var mk = isObj(src.market) ? src.market : {};
  var c = { n: 0 };
  var text = function (v) { return oneLine(v, LIMITS.textChars); };            // list items: sanList counts drops
  var scalar = function (v) { return keepText(v, LIMITS.textChars, c); };   // single fields: counted here
  var price = finiteNum(mk.price);
  var score = finiteNum(a.sentimentScore);
  var seen = {};
  var sources = sanList(src.sources, LIMITS.sources, function (s) {
    var x = sanSource(s, c);
    if (!x || seen[x.url]) return null;
    seen[x.url] = true;
    return x;
  }, c);
  var research = {
    unavailable: r.unavailable === true,
    allNone: r.allNone === true,
    analystActions: sanList(r.analystActions, LIMITS.actions, function (x) { return sanAction(x, true); }, c),
    ratingOnlyActions: sanList(r.ratingOnlyActions, LIMITS.actions, function (x) { return sanAction(x, false); }, c),
    bullish: sanList(r.bullish, LIMITS.listItems, text, c),
    bearish: sanList(r.bearish, LIMITS.listItems, text, c),
    macro: sanList(r.macro, LIMITS.listItems, text, c),
    earnings: scalar(r.earnings),
    guidance: scalar(r.guidance),
    contracts: scalar(r.contracts),
    peerMove: scalar(r.peerMove),
    revisionDirection: inList(r.revisionDirection, REVISION),
    revisionRecency: reportedDate(r.revisionRecency),
    dataFreshness: inList(r.dataFreshness, FRESHNESS)
  };
  var body = {
    research: research,
    assessment: {
      action: inList(a.action, ACTIONS),
      technicalSetup: inList(a.technicalSetup, SETUPS),
      sentiment: inList(a.sentiment, SENTIMENTS),
      sentimentScore: (score !== null && score >= 0 && score <= 100) ? score : null,
      catalystDirection: inList(a.catalystDirection, DIRECTIONS)
    },
    market: {
      price: (price !== null && price > 0 && price < 1e9) ? price : null,
      currency: (typeof mk.currency === 'string' && /^[A-Z]{3}$/.test(mk.currency)) ? mk.currency : null
    },
    sources: sources
  };
  return { body: body, dropped: c.n };
}

// Map one ticker's parsePerplexityContext result and the scan's labels into stored-form field names.
// Parser-specific text is reduced here (leading vocabulary tokens; the analyst item's date) before sanitizing.
function mapInput(input) {
  var r = isObj(input.research) ? input.research : {};
  var a = isObj(input.assessment) ? input.assessment : {};
  var mapAct = function (x) {
    return isObj(x) ? { firm: x.bank, action: x.action, ratingAction: x.ratingAction, rating: x.rating, date: dateInItem(x.raw),
      target: x.target, targetFrom: x.ptFrom, targetAction: x.ptAction } : x;
  };
  var none = function (v) { return (typeof v === 'string' && /^(?:none|n\/a|unknown)\b/i.test(v.trim())) ? null : v; };
  return {
    research: {
      unavailable: r._unavailable === true,
      allNone: r._allNone === true,
      analystActions: Array.isArray(r.analystActions) ? r.analystActions.map(mapAct) : [],
      ratingOnlyActions: Array.isArray(r.ratingOnlyActions) ? r.ratingOnlyActions.map(mapAct) : [],
      bullish: r.bullishCatalysts, bearish: r.bearishCatalysts, macro: r.macroDrivers,
      earnings: none(r.earnings), guidance: none(r.guidance), contracts: none(r.contracts), peerMove: none(r.peerMove),
      revisionDirection: leadToken(r.revisionDirection, REVISION),
      revisionRecency: typeof r.revisionRecency === 'string' ? r.revisionRecency.replace(/\[\d+\]/g, '').trim() : null,
      dataFreshness: leadToken(r.dataFreshness, FRESHNESS)
    },
    assessment: { action: a.action, technicalSetup: a.technicalSetup, sentiment: a.sentiment, sentimentScore: a.sentimentScore, catalystDirection: a.catalystDirection },
    market: input.market,
    sources: r.sources
  };
}

var TOP_KEYS = ['assessment', 'capturedAt', 'contentHash', 'day', 'id', 'market', 'research', 'schema', 'sources', 'ticker'];

function finish(ticker, ms, body) {
  var contentHash = fnv64(canon(body));
  var capturedAt = isoOf(ms);
  return {
    schema: SNAPSHOT_SCHEMA,
    id: ticker + '|' + capturedAt + '|' + contentHash,
    ticker: ticker,
    capturedAt: capturedAt,
    day: capturedAt.slice(0, 10),
    contentHash: contentHash,
    research: body.research,
    assessment: body.assessment,
    market: body.market,
    sources: body.sources
  };
}

// Build a snapshot from capture input { ticker, capturedAt, research, assessment?, market? }.
// Returns { ok: true, snapshot, dropped } or { ok: false, reason }. Never throws.
function buildSnapshot(input) {
  try {
    if (!isObj(input)) return { ok: false, reason: 'INVALID_INPUT' };
    var ticker = normalizeTicker(input.ticker);
    if (!ticker) return { ok: false, reason: 'INVALID_TICKER' };
    var ms = parseIso(input.capturedAt);
    if (ms === null) return { ok: false, reason: 'INVALID_CAPTURED_AT' };
    if (!isObj(input.research)) return { ok: false, reason: 'NO_RESEARCH' };
    var s = sanitizeBody(mapInput(input));
    return { ok: true, snapshot: finish(ticker, ms, s.body), dropped: s.dropped };
  } catch (e) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
}

// A stored record is valid only if it has exactly the v1 keys, a strict ticker / time, and a body that the
// rule set leaves unchanged, with id / day / checksum consistent. Never throws.
function validateSnapshot(s) {
  try {
    if (!isObj(s) || Object.keys(s).sort().join(',') !== TOP_KEYS.join(',') || s.schema !== SNAPSHOT_SCHEMA) return false;
    if (normalizeTicker(s.ticker) !== s.ticker) return false;
    var ms = parseIso(s.capturedAt);
    if (ms === null || isoOf(ms) !== s.capturedAt) return false;
    var body = { research: s.research, assessment: s.assessment, market: s.market, sources: s.sources };
    var san = sanitizeBody(body);
    if (san.dropped !== 0 || !same(san.body, body)) return false;
    return same(finish(s.ticker, ms, san.body), s);
  } catch (e) {
    return false;
  }
}

function keyOf(s) { return 'snap:' + s.ticker + ':' + s.capturedAt + ':' + s.contentHash; }

// Key -> { key, ticker, capturedAt, ms, day, hash } or null. Retention, caps and "unchanged" are decided from keys
// alone, so a put reads no stored values.
var KEY_RE = /^snap:([A-Z0-9.\-]{1,14}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):([0-9a-f]{16})$/;
function parseKey(k) {
  var m = typeof k === 'string' ? KEY_RE.exec(k) : null;
  if (!m || normalizeTicker(m[1]) !== m[1]) return null;
  var ms = parseIso(m[2]);
  if (ms === null || isoOf(ms) !== m[2]) return null;
  return { key: k, ticker: m[1], capturedAt: m[2], ms: ms, day: m[2].slice(0, 10), hash: m[3] };
}
function byTime(x, y) { return x.ms - y.ms || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0); }

// ---------- backends (the replaceable storage contract) ----------
// contract: get(key) -> value | undefined \u00b7 put(key, value) \u00b7 del(key) \u00b7 keys() -> string[]; all return Promises.
// Atomicity is per call only; see the brief \u00a72.2 for what this means for caps under concurrent writers.

function memoryBackend() {
  var m = {};
  // Backend contract: operations never throw synchronously; a failure is a rejected promise.
  var op = function (f) { return function (k, v) { try { return Promise.resolve(f(String(k), v)); } catch (e) { return Promise.reject(e); } }; };
  return {
    kind: 'memory',
    get: op(function (k) { return own(m, k) ? JSON.parse(m[k]) : undefined; }),
    put: op(function (k, v) { var j = JSON.stringify(v); if (typeof j !== 'string') throw new Error('UNSERIALIZABLE'); m[k] = j; }),
    del: op(function (k) { delete m[k]; }),
    keys: op(function () { return Object.keys(m); })
  };
}

// IndexedDB backend (browser). `idb` is the IndexedDB factory (injected in tests; defaults to the browser's).
// One database, one object store "kv" with out-of-line keys. A database that exists without the store is
// upgraded to the next version to create it; a blocked upgrade or open failure rejects (and is contained by
// the memory). Each operation is one transaction; it settles once, on complete, error or abort.
function indexedDbBackend(opts) {
  try { return buildIndexedDbBackend(opts); } catch (e) { return unavailableBackend(); }
}

function buildIndexedDbBackend(opts) {
  var o = opts || {};
  var idb = own(o, 'idb') ? o.idb : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  var dbName = typeof o.dbName === 'string' && o.dbName ? o.dbName : 'pulse-evidence-memory';
  var storeName = 'kv';
  var dbp = null;
  function openAt(version) {
    // Settles once. A connection that arrives after the promise has already settled (e.g. success after
    // `blocked` was reported) has no owner, so it is closed at once: every opened connection is either
    // returned to db() or closed.
    return new Promise(function (resolve, reject) {
      var settled = false;
      var req = version === undefined ? idb.open(dbName) : idb.open(dbName, version);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(storeName)) d.createObjectStore(storeName);
      };
      req.onblocked = function () { if (!settled) { settled = true; reject(new Error('INDEXEDDB_BLOCKED')); } };
      req.onsuccess = function () {
        var d = req.result;
        if (settled) { try { d.close(); } catch (e) { /* already closed */ } return; }
        settled = true; resolve(d);
      };
      req.onerror = function () { if (!settled) { settled = true; reject(req.error || new Error('INDEXEDDB_OPEN_FAILED')); } };
    });
  }
  function db() {
    if (!idb || typeof idb.open !== 'function') return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (!dbp) {
      dbp = openAt(undefined).then(function (d) {
        if (d.objectStoreNames.contains(storeName)) return d;
        var next = d.version + 1;
        d.close();
        return openAt(next);
      }).then(function (d) {
        d.onversionchange = function () { d.close(); dbp = null; };
        return d;
      });
      dbp.then(null, function () { dbp = null; });
    }
    return dbp;
  }
  function run(mode, fn) {
    // new Promise turns a synchronous throw (e.g. a hostile `idb`) into a rejection: backend ops never throw.
    return new Promise(function (r) { r(db()); }).then(function (d) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var done = function (f, v) { if (!settled) { settled = true; f(v); } };
        var tx = d.transaction(storeName, mode);
        var req = fn(tx.objectStore(storeName));
        var result;
        req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { done(resolve, result); };
        tx.onerror = function () { done(reject, tx.error || req.error || new Error('INDEXEDDB_TX_FAILED')); };
        tx.onabort = function () { done(reject, tx.error || new Error('INDEXEDDB_TX_ABORTED')); };
      });
    });
  }
  return {
    kind: 'indexeddb',
    get: function (k) { return run('readonly', function (s) { return s.get(k); }); },
    put: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }).then(function () {}); },
    del: function (k) { return run('readwrite', function (s) { return s.delete(k); }).then(function () {}); },
    keys: function () { return run('readonly', function (s) { return s.getAllKeys(); }).then(function (ks) { return Array.isArray(ks) ? ks.map(String) : []; }); }
  };
}

// ---------- the memory ----------

// Run a public operation so that it can neither throw synchronously nor reject: any failure becomes `fallback`.
function contained(fn, fallback) {
  try {
    return Promise.resolve(fn()).then(null, function () { return fallback(); });
  } catch (e) {
    return Promise.resolve(fallback());
  }
}

// A backend whose every operation rejects. Used when a factory gets unusable options, so the public
// factories never throw: the instance they return fails closed through the normal contained paths.
function unavailableBackend() {
  var fail = function () { return Promise.reject(new Error('BACKEND_UNAVAILABLE')); };
  return { kind: 'unavailable', get: fail, put: fail, del: fail, keys: fail };
}

function createEvidenceMemory(opts) {
  try { return buildMemory(opts); } catch (e) { return buildMemory({ backend: unavailableBackend() }); }
}

function buildMemory(opts) {
  var o = opts || {};
  var backend = o.backend;
  if (!backend || typeof backend.get !== 'function' || typeof backend.put !== 'function' ||
      typeof backend.del !== 'function' || typeof backend.keys !== 'function') {
    throw new Error('evidence-memory: a backend with get / put / del / keys is required');
  }
  var retentionDays = (typeof o.retentionDays === 'number' && isFinite(o.retentionDays) && o.retentionDays >= 1)
    ? Math.floor(o.retentionDays) : DEFAULT_RETENTION_DAYS;
  var clock = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
  var limits = {};
  Object.keys(LIMITS).forEach(function (k) { limits[k] = LIMITS[k]; });
  if (isObj(o.limits)) {
    ['perTickerPerDay', 'totalSnapshots'].forEach(function (k) {
      if (typeof o.limits[k] === 'number' && isFinite(o.limits[k]) && o.limits[k] >= 1) limits[k] = Math.floor(o.limits[k]);
    });
  }

  // The injected clock must give a finite number; otherwise the operation fails closed.
  function now() {
    var t = clock();
    if (typeof t !== 'number' || !isFinite(t)) throw new Error('CLOCK_ERROR');
    return t;
  }
  function cutoffMs() { return now() - retentionDays * DAY_MS; }

  // Snapshot keys, parsed and sorted oldest first. Foreign or malformed keys are ignored, never deleted.
  function snapKeys() {
    return Promise.resolve(backend.keys()).then(function (ks) {
      if (!Array.isArray(ks)) throw new Error('BACKEND_KEYS_INVALID');
      var out = [];
      ks.forEach(function (k) { var p = parseKey(k); if (p) out.push(p); });
      return out.sort(byTime);
    });
  }

  // Read values; a record is used only if it is a valid v1 snapshot that matches its key. Others are counted.
  function readValid(parsed) {
    return Promise.all(parsed.map(function (p) {
      return Promise.resolve().then(function () { return backend.get(p.key); }).then(function (v) { return { p: p, v: v }; }, function () { return { p: p, v: null }; });
    })).then(function (rows) {
      var valid = [], invalid = 0;
      rows.forEach(function (r) { if (validateSnapshot(r.v) && keyOf(r.v) === r.p.key) valid.push(r.v); else invalid += 1; });
      return { valid: valid, invalid: invalid };
    });
  }

  function delAll(keys) { return Promise.all(keys.map(function (k) { return backend.del(k); })); }

  function prune() {
    return contained(function () {
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var drop = ps.filter(function (p) { return p.ms < cut; }).map(function (p) { return p.key; });
        return delAll(drop).then(function () { return { ok: true, removed: drop.length }; });
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR', removed: 0 }; });
  }

  function put(input) {
    var built = buildSnapshot(input);
    if (!built.ok) return Promise.resolve({ stored: false, reason: built.reason });
    var s = built.snapshot;
    var t;
    try { t = now(); } catch (e) { return Promise.resolve({ stored: false, reason: 'CLOCK_ERROR', id: s.id }); }
    var ms = parseIso(s.capturedAt);
    var cut = t - retentionDays * DAY_MS;
    if (ms < cut) return Promise.resolve({ stored: false, reason: 'EXPIRED', id: s.id });
    if (ms > t + limits.futureSkewMs) return Promise.resolve({ stored: false, reason: 'FUTURE', id: s.id });
    var k = keyOf(s);
    return contained(function () {
      return snapKeys().then(function (ps) {
        var expired = ps.filter(function (p) { return p.ms < cut; }).map(function (p) { return p.key; });
        var live = ps.filter(function (p) { return p.ms >= cut; });
        var mine = live.filter(function (p) { return p.ticker === s.ticker; });
        var cleanup = function (result) { return delAll(expired).then(function () { return result; }); };
        // Same ticker and capturedAt: identical content is a no-op; different content replaces it (if stored).
        var sameTime = mine.filter(function (p) { return p.ms === ms; });
        if (sameTime.some(function (p) { return p.hash === s.contentHash; })) return cleanup({ stored: false, reason: 'UNCHANGED', id: s.id });
        var others = mine.filter(function (p) { return p.ms !== ms; });
        var prev = others.filter(function (p) { return p.ms < ms; }).pop() || null;
        if (prev && prev.hash === s.contentHash) return cleanup({ stored: false, reason: 'UNCHANGED', id: prev.ticker + '|' + prev.capturedAt + '|' + prev.hash });
        // Caps are decided before anything is deleted; a refused snapshot never removes an existing record.
        var dayList = others.filter(function (p) { return p.day === s.day; }).concat([{ key: k, ms: ms, isNew: true }]).sort(byTime);
        var dayOver = dayList.slice(0, Math.max(0, dayList.length - limits.perTickerPerDay));
        if (dayOver.some(function (p) { return p.isNew; })) return cleanup({ stored: false, reason: 'DAY_CAP', id: s.id });
        var replaced = sameTime.map(function (p) { return p.key; });
        var gone = replaced.concat(dayOver.map(function (p) { return p.key; }));
        var rest = live.filter(function (p) { return gone.indexOf(p.key) === -1; }).concat([{ key: k, ms: ms, isNew: true }]).sort(byTime);
        var totalOver = rest.slice(0, Math.max(0, rest.length - limits.totalSnapshots));
        if (totalOver.some(function (p) { return p.isNew; })) return cleanup({ stored: false, reason: 'TOTAL_CAP', id: s.id });
        gone = gone.concat(totalOver.map(function (p) { return p.key; }));
        // Write first, then delete: a failed write leaves the existing records in place.
        return Promise.resolve(backend.put(k, s)).then(function () {
          return delAll(gone.concat(expired));
        }).then(function () {
          return { stored: true, reason: replaced.length ? 'REPLACED' : 'STORED', id: s.id, evicted: dayOver.length + totalOver.length };
        });
      });
    }, function () { return { stored: false, reason: 'BACKEND_ERROR', id: s.id }; });
  }

  // Live, valid snapshots of one ticker, oldest first. Optional { sinceDay, untilDay, limit } (limit keeps the newest).
  function list(ticker, q) {
    return contained(function () {
      var tk = normalizeTicker(ticker);
      if (!tk) return [];
      var qq = isObj(q) ? q : {};
      var since = isoDay(qq.sinceDay), until = isoDay(qq.untilDay);
      var lim = (typeof qq.limit === 'number' && isFinite(qq.limit) && qq.limit >= 1) ? Math.floor(qq.limit) : null;
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var mine = ps.filter(function (p) {
          return p.ticker === tk && p.ms >= cut && (!since || p.day >= since) && (!until || p.day <= until);
        });
        if (lim !== null) mine = mine.slice(-lim);
        return readValid(mine).then(function (r) { return r.valid; });
      });
    }, function () { return []; });
  }

  // The newest live snapshot of a ticker strictly before `beforeIso` (default: now) - the "previous scan" for a later diff.
  function latest(ticker, beforeIso) {
    return contained(function () {
      var lim = beforeIso === undefined ? now() + 1 : parseIso(beforeIso);
      if (lim === null) return null;
      return list(ticker).then(function (xs) {
        var c = xs.filter(function (v) { return parseIso(v.capturedAt) < lim; });
        return c.length ? c[c.length - 1] : null;
      });
    }, function () { return null; });
  }

  function tickers() {
    return contained(function () {
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var seen = {};
        ps.forEach(function (p) { if (p.ms >= cut) seen[p.ticker] = true; });
        return Object.keys(seen).sort();
      });
    }, function () { return []; });
  }

  function liveValid() {
    var cut = cutoffMs();
    return snapKeys().then(function (ps) { return readValid(ps.filter(function (p) { return p.ms >= cut; })); });
  }

  function stats() {
    return contained(function () {
      return liveValid().then(function (r) {
        var tk = {};
        r.valid.forEach(function (v) { tk[v.ticker] = true; });
        return {
          ok: true,
          snapshots: r.valid.length,
          tickers: Object.keys(tk).length,
          oldestDay: r.valid.length ? r.valid[0].day : null,
          newestDay: r.valid.length ? r.valid[r.valid.length - 1].day : null,
          invalidSkipped: r.invalid,
          retentionDays: retentionDays,
          backend: typeof backend.kind === 'string' ? backend.kind : 'custom'
        };
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR' }; });
  }

  function sortExport(snaps) {
    return snaps.slice().sort(function (x, y) {
      return x.ticker < y.ticker ? -1 : x.ticker > y.ticker ? 1 : (x.capturedAt < y.capturedAt ? -1 : x.capturedAt > y.capturedAt ? 1 : (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    });
  }

  // Export: one JSON document of every live, valid snapshot, sorted by ticker, then capturedAt, then id; null on failure.
  function exportAll() {
    return contained(function () {
      var t = now();
      return liveValid().then(function (r) {
        var snaps = sortExport(r.valid);
        return { format: EXPORT_FORMAT, snapshotSchema: SNAPSHOT_SCHEMA, exportedAt: isoOf(t), retentionDays: retentionDays, snapshotCount: snaps.length, snapshots: snaps };
      });
    }, function () { return null; });
  }

  // The export as a string with sorted keys (equal content -> identical string); null on failure.
  function exportJson() {
    return exportAll().then(function (doc) { return doc ? canon(doc) : null; });
  }

  // Delete every snapshot (the user's "clear local research history"). Keys this module does not own are untouched.
  function clear() {
    return contained(function () {
      return snapKeys().then(function (ps) {
        return delAll(ps.map(function (p) { return p.key; })).then(function () { return { ok: true, removed: ps.length }; });
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR', removed: 0 }; });
  }

  return { put: put, list: list, latest: latest, tickers: tickers, stats: stats, prune: prune, exportAll: exportAll, exportJson: exportJson, clear: clear };
}

var EXPORT_KEYS = ['exportedAt', 'format', 'retentionDays', 'snapshotCount', 'snapshotSchema', 'snapshots'];

// An export document is valid when it has exactly the v1 header keys, consistent values, strictly increasing
// (ticker, capturedAt, id) order with no duplicates, and every snapshot valid. Never throws.
function validateExport(doc) {
  try {
    if (!isObj(doc) || Object.keys(doc).sort().join(',') !== EXPORT_KEYS.join(',')) return false;
    if (doc.format !== EXPORT_FORMAT || doc.snapshotSchema !== SNAPSHOT_SCHEMA) return false;
    var t = parseIso(doc.exportedAt);
    if (t === null || isoOf(t) !== doc.exportedAt) return false;
    if (typeof doc.retentionDays !== 'number' || !isFinite(doc.retentionDays) || doc.retentionDays < 1 || Math.floor(doc.retentionDays) !== doc.retentionDays) return false;
    if (!Array.isArray(doc.snapshots) || doc.snapshotCount !== doc.snapshots.length) return false;
    for (var i = 0; i < doc.snapshots.length; i++) {
      var s = doc.snapshots[i];
      if (!validateSnapshot(s)) return false;
      if (i > 0) {
        var p = doc.snapshots[i - 1];
        var order = p.ticker < s.ticker || (p.ticker === s.ticker && (p.capturedAt < s.capturedAt || (p.capturedAt === s.capturedAt && p.id < s.id)));
        if (!order) return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain script
// (matching services/market-structure.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SNAPSHOT_SCHEMA: SNAPSHOT_SCHEMA,
    EXPORT_FORMAT: EXPORT_FORMAT,
    DEFAULT_RETENTION_DAYS: DEFAULT_RETENTION_DAYS,
    LIMITS: LIMITS,
    VOCAB: { ACTIONS: ACTIONS, SETUPS: SETUPS, SENTIMENTS: SENTIMENTS, DIRECTIONS: DIRECTIONS, REVISION: REVISION, FRESHNESS: FRESHNESS, VERBS: VERBS, RATINGS: RATINGS },
    buildSnapshot: buildSnapshot,
    validateSnapshot: validateSnapshot,
    validateExport: validateExport,
    memoryBackend: memoryBackend,
    indexedDbBackend: indexedDbBackend,
    createEvidenceMemory: createEvidenceMemory
  };
}
```

### §A2 `qa/evidence_memory_offline.js` (LF)

```js
'use strict';

/*
 * qa/evidence_memory_offline.js
 *
 * evidence-memory-1 S1 (rev 2) - local research memory (services/evidence-memory.js).
 * Pure Node, no network, no browser, no real storage: the module is loaded from its source string with
 * new Function and run against the in-memory backend and an in-suite IndexedDB fake that models
 * transactions (staged writes, commit, abort with rollback, request errors, missing stores, blocked opens).
 * The clock is injected; random inputs come from a seeded generator, so every run is identical.
 *
 * Contract checks are written from the brief's tables, independently of the module's code:
 *   - a data-flow canary check (no input text reaches storage except through the permitted free-text slots);
 *   - an independent schema checker plus seeded fuzz and forged-mutation checks;
 *   - timestamp and URL grammar tables;
 *   - a failure matrix (every public function x every failure mode resolves, never throws or rejects);
 *   - storage invariants under seeded random operation sequences on both backends;
 *   - the real live research captures through the real parser in index.html.
 * EM-N* are planted negatives: each mutates the production source (never the test); the named rows must fail.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SRC = fs.readFileSync(path.join(ROOT, 'services', 'evidence-memory.js'), 'utf8').replace(/\r\n/g, '\n');

function load(src) {
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports;
}

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const iso = ms => new Date(ms).toISOString();
const EM_DASH = String.fromCharCode(0x2014);
const BAD_TEXT = ['a' + String.fromCharCode(0x2028) + 'b', 'a' + String.fromCharCode(0x202e) + 'b', 'a' + String.fromCharCode(0) + 'b', 'two' + String.fromCharCode(10) + 'lines'];

// ---------- seeded generator ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- the spec, written from the brief (independent of the module) ----------
const SPEC = {
  ACTIONS: ['hold_wait', 'add_on_pullback', 'add_on_reclaim', 'add_on_breakout', 'trim', 'avoid', 'hold'],
  SETUPS: ['extended_near_ath', 'healthy_uptrend_near_ath', 'healthy_uptrend', 'pullback_in_uptrend', 'support_test', 'breakdown_risk', 'below_key_mas', 'unknown'],
  SENTIMENTS: ['positive', 'negative', 'neutral'],
  DIRECTIONS: ['bullish', 'bearish', 'mixed'],
  REVISION: ['upgrading', 'downgrading', 'mixed', 'stable'],
  FRESHNESS: ['today', 'this week', 'this month'],
  VERBS: ['raised', 'cut', 'lowered', 'trimmed', 'reduced', 'boosted', 'hiked', 'set', 'upgraded', 'downgraded', 'reiterated', 'reaffirmed', 'maintained', 'initiated', 'started', 'launched', 'reinstated', 'resumed'],
  RATINGS: ['Strong Buy', 'Strong Sell', 'Buy', 'Outperform', 'Overweight', 'Accumulate', 'Add', 'Positive', 'Hold', 'Neutral', 'Equal Weight', 'Market Perform', 'Sector Perform', 'Peer Perform', 'In Line', 'Market Weight', 'Sector Weight', 'Underperform', 'Underweight', 'Reduce', 'Sell', 'Negative'],
  text: 300, title: 160, firm: 40, lists: 10, actions: 10, sources: 8
};
const nullOr = (v, f) => v === null || f(v);
const isEnum = list => v => typeof v === 'string' && list.indexOf(v) !== -1;
const hasBadChar = v => { for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return true; } return false; };
const oneLineOk = max => v => typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !hasBadChar(v) && !/[ \t]{2}/.test(v);
const dateOk = v => typeof v === 'string' && /^(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(t(ember)?)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\.? ([1-9]|[12]\d|3[01])(, 20\d\d)?$/.test(v);
const keysAre = (o, ks) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join(',') === ks.slice().sort().join(',');
const posNum = max => x => typeof x === 'number' && isFinite(x) && x > 0 && x < max;
// Independent conformance checker: returns a list of violations (empty = conforms).
function specViolations(s) {
  const v = [];
  const req = (c, msg) => { if (!c) v.push(msg); };
  req(keysAre(s, ['schema', 'id', 'ticker', 'capturedAt', 'day', 'contentHash', 'research', 'assessment', 'market', 'sources']), 'top keys');
  if (v.length) return v;
  req(s.schema === 'pulse.evidence-snapshot/v1', 'schema');
  req(typeof s.ticker === 'string' && /^[A-Z]{1,10}([.-][A-Z0-9]{1,3})?$/.test(s.ticker), 'ticker');
  req(typeof s.capturedAt === 'string' && /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s.capturedAt) && new Date(s.capturedAt).toISOString() === s.capturedAt, 'capturedAt');
  req(s.day === String(s.capturedAt).slice(0, 10), 'day');
  req(typeof s.contentHash === 'string' && /^[0-9a-f]{16}$/.test(s.contentHash) && s.id === s.ticker + '|' + s.capturedAt + '|' + s.contentHash, 'id/hash');
  const r = s.research;
  req(keysAre(r, ['unavailable', 'allNone', 'analystActions', 'ratingOnlyActions', 'bullish', 'bearish', 'macro', 'earnings', 'guidance', 'contracts', 'peerMove', 'revisionDirection', 'revisionRecency', 'dataFreshness']), 'research keys');
  if (v.length) return v;
  req(typeof r.unavailable === 'boolean' && typeof r.allNone === 'boolean', 'flags');
  ['bullish', 'bearish', 'macro'].forEach(k => req(Array.isArray(r[k]) && r[k].length <= SPEC.lists && r[k].every(oneLineOk(SPEC.text)), k));
  ['earnings', 'guidance', 'contracts', 'peerMove'].forEach(k => req(nullOr(r[k], oneLineOk(SPEC.text)), k));
  req(nullOr(r.revisionDirection, isEnum(SPEC.REVISION)), 'revisionDirection');
  req(nullOr(r.revisionRecency, dateOk), 'revisionRecency');
  req(nullOr(r.dataFreshness, isEnum(SPEC.FRESHNESS)), 'dataFreshness');
  const act = (a, withT) => keysAre(a, withT ? ['firm', 'action', 'ratingAction', 'rating', 'date', 'target', 'targetFrom', 'targetAction'] : ['firm', 'action', 'ratingAction', 'rating', 'date']) &&
    oneLineOk(SPEC.firm)(a.firm) && /^[A-Za-z0-9][A-Za-z0-9&.,' -]*$/.test(a.firm) && a.firm.split(' ').length <= 6 &&
    nullOr(a.action, isEnum(SPEC.VERBS)) && nullOr(a.ratingAction, isEnum(SPEC.VERBS)) && nullOr(a.rating, isEnum(SPEC.RATINGS)) && nullOr(a.date, dateOk) &&
    (!withT || (nullOr(a.target, posNum(1e7)) && nullOr(a.targetFrom, posNum(1e7)) && nullOr(a.targetAction, isEnum(SPEC.VERBS))));
  req(Array.isArray(r.analystActions) && r.analystActions.length <= SPEC.actions && r.analystActions.every(a => act(a, true)), 'analystActions');
  req(Array.isArray(r.ratingOnlyActions) && r.ratingOnlyActions.length <= SPEC.actions && r.ratingOnlyActions.every(a => act(a, false)), 'ratingOnlyActions');
  const a = s.assessment;
  const AK = ['action', 'technicalSetup', 'sentiment', 'sentimentScore', 'catalystDirection'];
  req(keysAre(a, AK) && nullOr(a.action, isEnum(SPEC.ACTIONS)) && nullOr(a.technicalSetup, isEnum(SPEC.SETUPS)) && nullOr(a.sentiment, isEnum(SPEC.SENTIMENTS)) &&
    nullOr(a.catalystDirection, isEnum(SPEC.DIRECTIONS)) && nullOr(a.sentimentScore, x => typeof x === 'number' && isFinite(x) && x >= 0 && x <= 100), 'assessment');
  req(keysAre(s.market, ['price', 'currency']) && nullOr(s.market.price, posNum(1e9)) && nullOr(s.market.currency, x => typeof x === 'string' && /^[A-Z]{3}$/.test(x)), 'market');
  req(Array.isArray(s.sources) && s.sources.length <= SPEC.sources && s.sources.every(x => keysAre(x, ['url', 'domain', 'title', 'date']) &&
    typeof x.url === 'string' && /^https?:\/\/[a-z0-9.-]+\/[^?#\s]*$/.test(x.url) && typeof x.domain === 'string' && x.url.indexOf('://' + x.domain + '/') !== -1 &&
    nullOr(x.title, oneLineOk(SPEC.title)) && nullOr(x.date, d => (typeof d === 'string' && /^20\d\d-\d\d-\d\d$/.test(d)) || dateOk(d))), 'sources');
  if (Array.isArray(s.sources)) req(new Set(s.sources.map(x => x && x.url)).size === s.sources.length, 'source duplicates');
  return v;
}

// The module's checksum, re-implemented here only to forge records (a checksum is not authentication).
function sealOf(x) {
  const canon = w => Array.isArray(w) ? '[' + w.map(canon).join(',') + ']' : (w && typeof w === 'object') ? '{' + Object.keys(w).sort().map(k => JSON.stringify(k) + ':' + canon(w[k])).join(',') + '}' : JSON.stringify(w === undefined ? null : w);
  let h1 = 0x811c9dc5, h2 = 0x050c5d1f; const str = canon({ research: x.research, assessment: x.assessment, market: x.market, sources: x.sources });
  for (let j = 0; j < str.length; j++) { const c = str.charCodeAt(j); h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0; h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 ^= (h1 >>> 7); h2 >>>= 0; }
  const h = ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  x.contentHash = h; x.id = x.ticker + '|' + x.capturedAt + '|' + h;
  return x;
}

// ---------- in-suite IndexedDB fake (transactions with staged writes, commit, abort + rollback) ----------
function fakeIndexedDB(opts) {
  const o = opts || {};
  const dbs = {};
  const later = typeof setImmediate === 'function' ? fn => setImmediate(fn) : fn => setTimeout(fn, 0);
  const named = (name) => { const e = new Error(name); e.name = name; return e; };
  let openHandles = [];
  let waiters = [];
  function handle(name) {
    const rec = dbs[name];
    const h = {
      closed: false, onversionchange: null,
      get version() { return rec.version; },
      objectStoreNames: { contains: n => Object.prototype.hasOwnProperty.call(rec.stores, n) },
      createObjectStore(n) { rec.stores[n] = new Map(); return {}; },
      close() {
        h.closed = true; openHandles = openHandles.filter(x => x !== h);
        if (!openHandles.length && waiters.length) waiters.splice(0).forEach(f => later(f));   // blocked opens resume
      },
      transaction(storeName, mode) {
        if (h.closed) throw named('InvalidStateError');
        if (!Object.prototype.hasOwnProperty.call(rec.stores, storeName)) throw named('NotFoundError');
        const st = rec.stores[storeName];
        const staged = new Map(st);
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        let finished = false, pending = 0;
        const abort = err => {
          if (finished) return; finished = true; tx.error = err;
          later(() => { if (tx.onerror) tx.onerror(); later(() => { if (tx.onabort) tx.onabort(); }); });
        };
        const maybeCommit = () => {
          if (finished || pending > 0) return;
          later(() => {
            if (finished || pending > 0) return;
            finished = true;
            if (o.abortCommit && o.abortCommit()) { tx.error = named('AbortError'); if (tx.onabort) tx.onabort(); return; }
            st.clear(); staged.forEach((v, k) => st.set(k, v));
            if (tx.oncomplete) tx.oncomplete();
          });
        };
        function req(fn) {
          const r = { onsuccess: null, onerror: null, result: undefined, error: null };
          pending += 1;
          later(() => {
            pending -= 1;
            if (finished) return;
            try { r.result = fn(); if (r.onsuccess) r.onsuccess(); maybeCommit(); }
            catch (e) { r.error = e; if (r.onerror) r.onerror(); abort(e); }
          });
          return r;
        }
        tx.objectStore = () => ({
          get: k => req(() => { if (o.failGet && o.failGet(k)) throw named('UnknownError'); return staged.has(k) ? JSON.parse(staged.get(k)) : undefined; }),
          put: (v, k) => req(() => {
            if (mode !== 'readwrite') throw named('ReadOnlyError');
            if (o.failPut && o.failPut(k)) throw named('QuotaExceededError');
            staged.set(k, JSON.stringify(v));
          }),
          delete: k => req(() => { if (mode !== 'readwrite') throw named('ReadOnlyError'); staged.delete(k); }),
          getAllKeys: () => req(() => (o.keysNotArray ? 'not-an-array' : Array.from(staged.keys()).sort()))
        });
        return tx;
      }
    };
    openHandles.push(h);
    return h;
  }
  return {
    opened: 0,
    dbs,
    openCount() { return openHandles.length; },
    seed(name, version, storeNames) { dbs[name] = { version, stores: {} }; storeNames.forEach(n => { dbs[name].stores[n] = new Map(); }); },
    open(name, version) {
      if (o.throwOnOpen) throw named('SecurityError');
      this.opened += 1;
      const r = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        if (o.failOpen) { r.error = named('InvalidStateError'); if (r.onerror) r.onerror(); return; }
        const exists = !!dbs[name];
        const cur = exists ? dbs[name].version : 0;
        const want = version === undefined ? Math.max(cur, 1) : version;
        if (want < cur) { r.error = named('VersionError'); if (r.onerror) r.onerror(); return; }
        if (!exists) dbs[name] = { version: 0, stores: {} };
        if (want > cur) {
          // as in IndexedDB: open connections get versionchange; any connection still open blocks the upgrade
          openHandles.slice().forEach(h => { if (h.onversionchange) h.onversionchange(); });
          const proceed = () => {
            dbs[name].version = want;
            r.result = handle(name);
            if (r.onupgradeneeded) r.onupgradeneeded();
            if (r.onsuccess) r.onsuccess();
          };
          // the request stays pending after `blocked` and succeeds once every other connection has closed
          if (openHandles.length) { if (r.onblocked) r.onblocked(); waiters.push(proceed); return; }
          proceed(); return;
        } else {
          r.result = handle(name);
        }
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    }
  };
}

// ---------- fixtures ----------
function research(over) {
  return Object.assign({
    analystActions: [{ bank: 'UBS', action: 'raised', target: 125, ptFrom: 120, ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', raw: 'UBS raised PT to $125 from $120 (October 14)' }],
    ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Wall Street Zen upgraded to Buy (October 10)' }],
    bullishCatalysts: ['UBS cited expected Q3 cloud growth of 54% (October 14)'],
    bearishCatalysts: ['Consensus targets include a low of $51'],
    macroDrivers: [],
    earnings: 'NONE', guidance: '', contracts: '', peerMove: '',
    revisionDirection: 'upgrading ' + EM_DASH + ' UBS and Morgan Stanley raised targets', revisionRecency: 'October 14', dataFreshness: 'today',
    sources: [{ url: 'https://www.reuters.com/markets/frog-ubs?utm_source=x#top', title: 'UBS lifts JFrog target', date: '2026-10-14' }],
    _allNone: false
  }, over || {});
}
function input(over) {
  return Object.assign({
    ticker: 'FROG', capturedAt: iso(T0), research: research(),
    assessment: { action: 'hold', technicalSetup: 'healthy_uptrend', sentiment: 'positive', sentimentScore: 61, catalystDirection: 'bullish' },
    market: { price: 91.96, currency: 'USD' }
  }, over || {});
}
function allStrings(v, acc) {
  acc = acc || [];
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach(x => allStrings(x, acc));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => { acc.push(k); allStrings(v[k], acc); });
  return acc;
}
function within(p, ms) {
  let timer;
  const t = new Promise(res => { timer = setTimeout(() => res('TIMEOUT'), ms); });
  return Promise.race([p, t]).then(v => { clearTimeout(timer); return v; });
}
async function ticks(n) { for (let i = 0; i < n; i++) await new Promise(res => setImmediate(res)); }
async function settles(p) {
  try { const v = await p; return { ok: true, v }; } catch (e) { return { ok: false, e }; }
}

// ---------- rows ----------
async function rows(M, src, only) {
  const R = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in R) || R[id] === true) R[id] = cond ? true : (detail || 'fail'); };
  const mk = (over) => { let t = T0; const mem = M.createEvidenceMemory(Object.assign({ backend: M.memoryBackend(), now: () => t }, over || {})); return { mem, set: v => { t = v; } }; };

  // EM-1 forbidden fields at every level never reach the snapshot (names and contents)
  if (want('EM-1')) {
    const inj = input({
      summary: 'AI summary', key_risk: 'risk', holdings: { FROG: 10 }, apiKey: 'sk-live-123',
      research: research({ rawText: 'FULL RAW PERPLEXITY RESPONSE', raw: 'raw', prompt: 'SYSTEM PROMPT', content: 'article body',
        analystActions: [{ bank: 'UBS', action: 'raised', target: 125, raw: 'UBS raised PT to $125 (October 14) FULL ITEM TEXT', response: 'x', token: 't' }],
        sources: [{ url: 'https://a.example.com/p', title: 'T', content: 'FULL ARTICLE TEXT', apiKey: 'k' }] }),
      assessment: { action: 'hold', summary: 'AI free text', entry_zone: '$80-85', invalidation: 'close < 80' },
      market: { price: 91.96, currency: 'USD', pt_holdings: '[...]' }
    });
    const b = M.buildSnapshot(inj);
    const strs = b.ok ? allStrings(b.snapshot).join(' ') : 'BUILD_FAILED';
    const leaked = ['rawText', 'summary', 'key_risk', 'holdings', 'apiKey', 'prompt', 'response', 'token', 'entry_zone', 'invalidation', 'pt_holdings', 'FULL RAW', 'SYSTEM PROMPT', 'article body', 'FULL ARTICLE', 'FULL ITEM TEXT', 'sk-live', 'AI summary', 'AI free text', 'BUILD_FAILED'].filter(t => strs.indexOf(t) !== -1);
    ok('EM-1', b.ok && leaked.length === 0, JSON.stringify(leaked));
  }
  // EM-2 exact v1 shape; parser text reduced to vocabulary (revision lead token, analyst date)
  if (want('EM-2')) {
    const s = M.buildSnapshot(input()).snapshot;
    const v = specViolations(s);
    ok('EM-2', v.length === 0 && s.research.revisionDirection === 'upgrading' && s.research.analystActions[0].date === 'October 14' &&
      s.research.analystActions[0].targetFrom === 120 && s.research.earnings === null && s.day === '2026-10-16', JSON.stringify(v));
  }
  // EM-3 tickers
  if (want('EM-3')) {
    const good = [['frog', 'FROG'], [' NVDA ', 'NVDA'], ['TEVA.TA', 'TEVA.TA'], ['brk.b', 'BRK.B'], ['BRK-B', 'BRK-B']];
    const bad = ['', '../etc', 'AAPL;DROP', 'TOOLONGTICKERX', 'A B', 'snap:FROG', 'FROG:2026', null, 42, String.fromCharCode(0xc5) + 'PL', 'AB.CDEF', '.A'];
    const g = good.every(([i, o]) => { const b = M.buildSnapshot(input({ ticker: i })); return b.ok && b.snapshot.ticker === o; });
    const x = bad.filter(i => M.buildSnapshot(input({ ticker: i })).ok);
    ok('EM-3', g && x.length === 0, 'good ' + g + ' / accepted bad ' + JSON.stringify(x));
  }
  // EM-4 (finding 3) timestamps: every invalid component rejected, nothing normalised
  if (want('EM-4')) {
    const bad = ['2026-10-16', '2026-10-16T12:00:00', '2026-10-16T12:00:00+03:00', '2026-02-30T12:00:00Z', '2025-02-29T00:00:00Z', 'yesterday', '', 1792000000000,
      '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-10-00T00:00:00Z', '2026-10-32T00:00:00Z', '2026-10-16T24:00:00Z', '2026-10-16T25:00:00Z', '2026-10-16T12:60:00Z',
      '2026-10-16T12:99:00Z', '2026-10-16T12:00:60Z', '2026-10-16T12:00:61Z', '2026-10-16t12:00:00z', '2026-10-16 12:00:00Z', '1999-12-31T23:59:59Z', '2100-01-01T00:00:00Z',
      '2026-10-16T12:00:00.1234Z', ' 2026-10-16T12:00:00Z'];
    const acc = bad.filter(v => M.buildSnapshot(input({ capturedAt: v })).ok);
    const good = [['2026-10-16T12:00:00.5Z', '2026-10-16T12:00:00.500Z'], ['2024-02-29T23:59:59.999Z', '2024-02-29T23:59:59.999Z'], ['2026-10-16T00:00:00Z', '2026-10-16T00:00:00.000Z']];
    const g = good.every(([i, o]) => { const b = M.buildSnapshot(input({ capturedAt: i })); return b.ok && b.snapshot.capturedAt === o; });
    ok('EM-4', acc.length === 0 && g, 'accepted ' + JSON.stringify(acc) + ' good ' + g);
  }
  // EM-5 (findings 1c, 4) URL grammar: unsafe hosts, ports, credentials, schemes and secret-looking paths drop the source
  if (want('EM-5')) {
    const keep = [
      ['https://www.reuters.com/markets/us/frog-shares-2026-10-14/', 'https://www.reuters.com/markets/us/frog-shares-2026-10-14/'],
      ['HTTPS://News.Example.COM/a/b?id=7&utm=1#frag', 'https://news.example.com/a/b'],
      ['https://www.example.co.uk:443/x', 'https://www.example.co.uk/x'],
      ['http://example.org', 'http://example.org/'],
      ['https://xn--bcher-kva.example/%C3%BC-news', 'https://xn--bcher-kva.example/%C3%BC-news'],
      ['https://seekingalpha.com/news/4123456-jfrog-q3-preview', 'https://seekingalpha.com/news/4123456-jfrog-q3-preview']
    ];
    const drop = ['javascript:alert(1)', 'data:text/html,hi', 'ftp://a.example.com/f', 'https://user:pass@a.example.com/p', 'https:///nohost', 'https://a b.example.com/',
      'https://127.0.0.1:99999/path', 'https://127.0.0.1/path', 'https://[::1]/x', 'https://localhost/x', 'https://example.com:8080/x', 'https://example.com:0/x',
      'https://intranet/x', 'https://-bad.example.com/x', 'https://bad_.example.com/x', 'https://example.123/x', 'https://' + 'a'.repeat(64) + '.example.com/x',
      'https://example.com/sk_live_51HxQ2abcdef', 'https://example.com/a/ghp_abcdefghijklmnopqrstu', 'https://example.com/eyJhbGciOiJIUzI1NiJ9.e30.sig',
      'https://example.com/AKIAABCDEFGHIJKLMNOP', 'https://example.com/' + 'f'.repeat(40), 'https://example.com/api_key=123', 'https://example.com/a/../b',
      'https://example.com/%zz', 'https://example.com/%E2%80%AE-spoof', 'https://example.com/' + 'a'.repeat(301), 'https://example.com\\@evil.com/x', 'https://example.com/p\tq',
      // percent-encoding must not hide a rule: encoded dot segments, a long token split by an escape, an encoded key prefix
      'https://example.com/%2e%2e/x', 'https://example.com/a/%2E/b', 'https://example.com/.%2E/x',
      'https://example.com/ABCDEF0123456789%41BCDEF0123456789AB', 'https://example.com/%73k_live_abcdef', 'https://example.com/pass%77ord'];
    keep.push(['https://example.com/q3-%2D-results', 'https://example.com/q3-%2D-results'], ['https://example.com/a%2Eb', 'https://example.com/a%2Eb']);
    const out = u => { const b = M.buildSnapshot(input({ research: research({ sources: [{ url: u, title: 't' }] }) })); return b.ok && b.snapshot.sources.length ? b.snapshot.sources[0].url : null; };
    const k = keep.filter(([u, w]) => out(u) !== w);
    const d = drop.filter(u => out(u) !== null);
    ok('EM-5', k.length === 0 && d.length === 0, 'keep-fail ' + JSON.stringify(k.map(x => [x[0], out(x[0])])) + ' drop-fail ' + JSON.stringify(d));
  }
  // EM-6 bounds: over-length or multi-line text is dropped and counted (never truncated); bad characters drop the value
  if (want('EM-6')) {
    const long = 'x'.repeat(301);
    const b = M.buildSnapshot(input({
      research: research({ bullishCatalysts: Array.from({ length: 50 }, (_, i) => 'item ' + i).concat([long]).concat(BAD_TEXT).concat(['ok item']), earnings: BAD_TEXT[2],
        analystActions: Array.from({ length: 40 }, (_, i) => ({ bank: 'Firm ' + i, target: i === 0 ? NaN : Infinity })),
        sources: Array.from({ length: 30 }, (_, i) => ({ url: 'https://s' + i + '.example.com/p', title: 't'.repeat(161) })) }),
      assessment: { sentimentScore: 140, action: 'DROP TABLE', technicalSetup: 'x<y>' },
      market: { price: -5, currency: 'usd' }
    }));
    const s = b.snapshot;
    ok('EM-6', b.ok && s.research.bullish.length === 10 && s.research.bullish.indexOf(long) === -1 && s.research.earnings === null &&
      s.research.analystActions.length === 10 && s.research.analystActions.every(a => a.target === null) &&
      s.sources.length === 8 && s.sources.every(x => x.title === null) && b.dropped >= 40 + 30 + 22 + 5 &&
      s.assessment.sentimentScore === null && s.assessment.action === null && s.assessment.technicalSetup === null && s.market.price === null && s.market.currency === null,
      JSON.stringify({ n: s && s.research.bullish.length, dropped: b.dropped }));
  }
  // EM-7 deterministic identity
  if (want('EM-7')) {
    const a = M.buildSnapshot(input()).snapshot, b = M.buildSnapshot(input()).snapshot;
    const c = M.buildSnapshot(input({ research: research({ bearishCatalysts: ['Consensus targets include a low of $52'] }) })).snapshot;
    ok('EM-7', a.id === b.id && c.contentHash !== a.contentHash && /^[0-9a-f]{16}$/.test(a.contentHash), a.id + ' ' + c.id);
  }
  // EM-8 put / list / latest
  if (want('EM-8')) {
    const { mem } = mk();
    const r1 = await mem.put(input({ capturedAt: iso(T0 - 2 * DAY) }));
    const r2 = await mem.put(input({ capturedAt: iso(T0 - DAY), research: research({ bullishCatalysts: ['new'] }) }));
    const xs = await mem.list('frog');
    const lt = await mem.latest('FROG', iso(T0 - DAY));
    const lt2 = await mem.latest('FROG');
    ok('EM-8', r1.stored && r2.stored && xs.length === 2 && xs[0].capturedAt < xs[1].capturedAt && lt && lt.capturedAt === iso(T0 - 2 * DAY) && lt2 && lt2.capturedAt === iso(T0 - DAY), JSON.stringify([r1, r2]));
  }
  // EM-9 UNCHANGED / STORED / REPLACED
  if (want('EM-9')) {
    const { mem } = mk();
    const a = await mem.put(input({ capturedAt: iso(T0 - 3600000) }));
    const b = await mem.put(input({ capturedAt: iso(T0 - 1800000) }));
    const c = await mem.put(input({ capturedAt: iso(T0 - 1800000), research: research({ guidance: 'raised FY guide' }) }));
    const d = await mem.put(input({ capturedAt: iso(T0 - 1800000), research: research({ guidance: 'cut FY guide' }) }));
    const xs = await mem.list('FROG');
    ok('EM-9', a.reason === 'STORED' && b.reason === 'UNCHANGED' && c.reason === 'STORED' && d.reason === 'REPLACED' && xs.length === 2 && xs[1].research.guidance === 'cut FY guide', JSON.stringify([a.reason, b.reason, c.reason, d.reason, xs.length]));
  }
  // EM-10 retention 90 days
  if (want('EM-10')) {
    const { mem, set } = mk();
    const edge = await mem.put(input({ capturedAt: iso(T0 - 90 * DAY) }));
    const old = await mem.put(input({ capturedAt: iso(T0 - 90 * DAY - 1000), research: research({ guidance: 'g' }) }));
    const st = await mem.stats();
    set(T0 + 1000);
    const xs = await mem.list('FROG');
    const pr = await mem.prune();
    ok('EM-10', M.DEFAULT_RETENTION_DAYS === 90 && st.ok && st.retentionDays === 90 && edge.stored && old.reason === 'EXPIRED' && xs.length === 0 && pr.ok && pr.removed === 1, JSON.stringify([edge.reason, old.reason, xs.length, pr]));
  }
  // EM-11 future skew
  if (want('EM-11')) {
    const { mem } = mk();
    const f = await mem.put(input({ capturedAt: iso(T0 + DAY + 1000) }));
    const g = await mem.put(input({ capturedAt: iso(T0 + 3600000) }));
    ok('EM-11', f.reason === 'FUTURE' && g.stored, JSON.stringify([f.reason, g.reason]));
  }
  // EM-12 caps
  if (want('EM-12')) {
    const { mem } = mk({ limits: { perTickerPerDay: 3, totalSnapshots: 5 } });
    for (let i = 0; i < 5; i++) await mem.put(input({ capturedAt: iso(T0 - 10 * 3600000 + i * 60000), research: research({ guidance: 'v' + i }) }));
    const day = await mem.list('FROG');
    const olderLate = await mem.put(input({ capturedAt: iso(T0 - 11 * 3600000), research: research({ guidance: 'older' }) }));
    await mem.put(input({ ticker: 'NVDA', capturedAt: iso(T0 - 5 * DAY) }));
    await mem.put(input({ ticker: 'ARM', capturedAt: iso(T0 - 4 * DAY) }));
    await mem.put(input({ ticker: 'GEV', capturedAt: iso(T0 - 3 * DAY) }));
    const st = await mem.stats();
    const nv = await mem.list('NVDA');
    ok('EM-12', day.map(v => v.research.guidance).join(',') === 'v2,v3,v4' && olderLate.reason === 'DAY_CAP' && st.snapshots === 5 && nv.length === 0, JSON.stringify([day.map(v => v.research.guidance), olderLate.reason, st.snapshots]));
  }
  // EM-13 corrupted / foreign records skipped and counted; foreign keys never deleted
  if (want('EM-13')) {
    const be = M.memoryBackend();
    const mem = M.createEvidenceMemory({ backend: be, now: () => T0 });
    await mem.put(input());
    const good = (await be.keys())[0];
    const v = await be.get(good);
    const tampered = JSON.parse(JSON.stringify(v)); tampered.research.bullish = ['tampered'];
    await be.put(good.replace('FROG', 'ARM'), v);
    await be.put('snap:NVDA:' + iso(T0) + ':0123456789abcdef', tampered);
    await be.put('snap:GEV:' + iso(T0) + ':fedcba9876543210', { schema: 'pulse.evidence-snapshot/v9' });
    await be.put('settings:theme', 'dark');
    await be.put('snap:bad key', 1);
    const st = await mem.stats();
    const ex = await mem.exportAll();
    await mem.clear();
    const left = await be.keys();
    ok('EM-13', st.snapshots === 1 && st.invalidSkipped === 3 && ex && ex.snapshotCount === 1 && left.indexOf('settings:theme') !== -1 && left.indexOf('snap:bad key') !== -1 && left.filter(k => /^snap:[A-Z]/.test(k)).length === 0, JSON.stringify([st, left]));
  }
  // EM-14 (finding 2) forged records with a recomputed checksum and id are refused by structure, not by hash
  if (want('EM-14')) {
    const s = M.buildSnapshot(input()).snapshot;
    const forge = fn => { const x = JSON.parse(JSON.stringify(s)); fn(x); return sealOf(x); };
    const forged = [
      forge(x => { x.research.note = 'free AI text'; }), forge(x => { x.assessment.action = 'full_ai_response_text_here'; }),
      forge(x => { x.research.revisionDirection = 'upgrading because the CEO said so'; }), forge(x => { x.research.dataFreshness = 'today, per raw AI text'; }),
      forge(x => { x.sources[0].title = 'T'.repeat(500); }), forge(x => { x.sources[0].url = 'https://example.com/sk_live_51HxQ2abcdef'; x.sources[0].domain = 'example.com'; }),
      forge(x => { x.research.bullish = Array.from({ length: 11 }, (_, i) => 'i' + i); }), forge(x => { x.research.analystActions[0].rating = 'Very Strong Buy Now'; }),
      forge(x => { x.market.price = '91.96'; }), forge(x => { x.research.earnings = 42; }), forge(x => { x.extra = 1; })
    ];
    const accepted = forged.map((x, i) => M.validateSnapshot(x) ? i : -1).filter(i => i >= 0);
    const exp = { format: 'pulse.evidence-memory-export/v1', snapshotSchema: 'pulse.evidence-snapshot/v1', exportedAt: iso(T0), retentionDays: 90, snapshotCount: 1, snapshots: [s] };
    const badDocs = [Object.assign({}, exp, { extra: 'x' }), Object.assign({}, exp, { retentionDays: 0 }), Object.assign({}, exp, { retentionDays: 90.5 }),
      Object.assign({}, exp, { exportedAt: '2026-10-16T12:99:00Z' }), Object.assign({}, exp, { snapshotCount: 2 }),
      Object.assign({}, exp, { snapshotCount: 2, snapshots: [s, s] }), Object.assign({}, exp, { snapshots: [forged[0]] })];
    const docAcc = badDocs.map((d, i) => M.validateExport(d) ? i : -1).filter(i => i >= 0);
    ok('EM-14', M.validateSnapshot(s) && accepted.length === 0 && M.validateExport(exp) && docAcc.length === 0, 'forged accepted ' + JSON.stringify(accepted) + ' docs accepted ' + JSON.stringify(docAcc));
  }
  // EM-15 export header, order, determinism, validation
  if (want('EM-15')) {
    const { mem } = mk();
    await mem.put(input({ ticker: 'NVDA', capturedAt: iso(T0 - 2 * DAY) }));
    await mem.put(input({ ticker: 'ARM', capturedAt: iso(T0 - DAY) }));
    await mem.put(input({ ticker: 'ARM', capturedAt: iso(T0 - 3 * DAY), research: research({ guidance: 'g' }) }));
    const doc = await mem.exportAll(); const j1 = await mem.exportJson(); const j2 = await mem.exportJson();
    const order = doc ? doc.snapshots.map(s => s.ticker + '@' + s.capturedAt.slice(0, 10)).join(',') : 'none';
    const bad = JSON.parse(j1); bad.snapshots[0].research.bullish = ['edited'];
    ok('EM-15', !!doc && Object.keys(doc).sort().join(',') === 'exportedAt,format,retentionDays,snapshotCount,snapshotSchema,snapshots' && doc.snapshotCount === 3 && doc.retentionDays === 90 &&
      order === 'ARM@2026-10-13,ARM@2026-10-15,NVDA@2026-10-14' && j1 === j2 && M.validateExport(JSON.parse(j1)) && !M.validateExport(bad), order);
  }
  // EM-16 (finding 6) failure matrix: every public function x every failure mode resolves with its documented shape
  if (want('EM-16')) {
    const boomA = () => Promise.reject(new Error('async'));
    const boomS = () => { throw new Error('sync'); };
    const base = () => M.memoryBackend();
    const modes = {
      keysReject: () => Object.assign(base(), { keys: boomA }), keysThrow: () => Object.assign(base(), { keys: boomS }),
      keysNotArray: () => Object.assign(base(), { keys: () => Promise.resolve('x') }), getReject: () => Object.assign(base(), { get: boomA }),
      getThrow: () => Object.assign(base(), { get: boomS }), putReject: () => Object.assign(base(), { put: boomA }), putThrow: () => Object.assign(base(), { put: boomS }),
      delReject: () => Object.assign(base(), { del: boomA }), delThrow: () => Object.assign(base(), { del: boomS })
    };
    const clocks = { clockThrows: () => { throw new Error('clock'); }, clockNaN: () => NaN, clockString: () => '2026' };
    const shapes = {
      put: v => !!v && typeof v.stored === 'boolean' && typeof v.reason === 'string',
      list: v => Array.isArray(v), latest: v => v === null || (!!v && v.schema === 'pulse.evidence-snapshot/v1'), tickers: v => Array.isArray(v),
      stats: v => !!v && (v.ok === true || (v.ok === false && v.reason === 'BACKEND_ERROR')),
      prune: v => !!v && typeof v.ok === 'boolean' && typeof v.removed === 'number', clear: v => !!v && typeof v.ok === 'boolean' && typeof v.removed === 'number',
      exportAll: v => v === null || M.validateExport(v), exportJson: v => v === null || typeof v === 'string'
    };
    const calls = mem => ({ put: () => mem.put(input()), list: () => mem.list('FROG'), latest: () => mem.latest('FROG'), tickers: () => mem.tickers(), stats: () => mem.stats(),
      prune: () => mem.prune(), clear: () => mem.clear(), exportAll: () => mem.exportAll(), exportJson: () => mem.exportJson() });
    const bad = [];
    const run = async (label, mem) => {
      const c = calls(mem);
      for (const name of Object.keys(c)) {
        let res;
        try { res = await settles(c[name]()); } catch (e) { res = { ok: false, e }; }
        if (!res.ok || !shapes[name](res.v)) bad.push(label + '.' + name);
      }
    };
    for (const [label, mkb] of Object.entries(modes)) {
      const be = mkb();
      await run(label, M.createEvidenceMemory({ backend: be, now: () => T0 }));
    }
    for (const [label, clk] of Object.entries(clocks)) await run(label, M.createEvidenceMemory({ backend: M.memoryBackend(), now: clk }));
    const evil = [
      Object.defineProperty({}, 'ticker', { get() { throw new Error('getter'); } }),
      new Proxy({}, { get() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); } }),
      input({ research: new Proxy(research(), { get(t, k) { if (k === 'bullishCatalysts') throw new Error('trap'); return t[k]; } }) }),
      (() => { const x = input(); x.research.self = x.research; x.research.bullishCatalysts = [x]; return x; })()
    ];
    const { mem } = mk();
    for (let i = 0; i < evil.length; i++) {
      let r; try { r = await settles(mem.put(evil[i])); } catch (e) { r = { ok: false }; }
      if (!r.ok || !shapes.put(r.v)) bad.push('evil' + i);
      let b; try { b = M.buildSnapshot(evil[i]); } catch (e) { b = null; }
      if (!b || typeof b.ok !== 'boolean') bad.push('build' + i);
    }
    for (const x of [undefined, null, 5, 'x', [], new Proxy({}, { ownKeys() { throw new Error('p'); } })]) {
      try { if (typeof M.validateSnapshot(x) !== 'boolean' || typeof M.validateExport(x) !== 'boolean') bad.push('validate'); } catch (e) { bad.push('validate-throw'); }
    }
    ok('EM-16', bad.length === 0, JSON.stringify(bad));
  }
  // EM-17 purity
  if (want('EM-17')) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const banned = /\bfetch\s*\(|XMLHttpRequest|\blocalStorage\b|\bsessionStorage\b|document\.|\bwindow\b|navigator\.|document\.cookie|\brequire\s*\(|import\s*\(|\borchestrate\b|\banalyzeChunk\b|pt_results|Math\.random|\beval\s*\(|new\s+Function/;
    const idbUses = (code.match(/\bindexedDB\b/g) || []).length;
    const bs = code.indexOf('function indexedDbBackend('), be = code.indexOf('function contained(');
    const inside = bs !== -1 && be !== -1 ? (code.slice(bs, be).match(/\bindexedDB\b/g) || []).length : -1;
    let standalone = true; try { load(src); } catch (e) { standalone = false; }
    ok('EM-17', !banned.test(code) && idbUses === inside && idbUses > 0 && standalone, 'banned ' + (code.match(banned) || [''])[0] + ' idb ' + idbUses + '/' + inside);
  }
  // EM-18 research shapes from other code paths
  if (want('EM-18')) {
    const { mem } = mk();
    const cases = [
      input({ research: { _unavailable: true, _error: 'Perplexity: upstream error', analystActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] } }),
      input({ research: { _allNone: true, analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [], earnings: 'NONE' } }),
      input({ research: { rawText: 'no ticker headers in this prose', analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], _allNone: true } }),
      input({ research: research({ bullishCatalysts: [42, null, { a: 1 }, ['x'], 'real item'], analystActions: [null, 'UBS', { bank: '' }, { bank: 'Citi', target: '125' }] }) }),
      input({ research: JSON.parse('{"__proto__":{"polluted":true},"bullishCatalysts":["x"]}') }),
      input({ research: [] }), input({ research: 'string' }), input({ assessment: 'x', market: 7 })
    ];
    const results = [];
    for (let i = 0; i < cases.length; i++) results.push(await mem.put(Object.assign({}, cases[i], { capturedAt: iso(T0 - (i + 1) * 3600000) })));
    const xs = await mem.list('FROG');
    ok('EM-18', ({}).polluted !== true && results[5].reason === 'NO_RESEARCH' && results[6].reason === 'NO_RESEARCH' && xs.every(M.validateSnapshot) &&
      xs.some(s => s.research.bullish.indexOf('real item') !== -1) && xs.some(s => s.research.analystActions.some(a => a.firm === 'Citi' && a.target === null)) &&
      xs.some(s => s.research.unavailable) && xs.some(s => s.research.allNone), JSON.stringify(results.map(r => r.reason)));
  }
  // EM-19 (finding 1) data-flow canary: a unique token in every input slot survives only in the permitted free-text slots
  if (want('EM-19')) {
    let n = 0; const where = {};
    const letters = k => { let o = ''; do { o = String.fromCharCode(97 + (k % 26)) + o; k = Math.floor(k / 26); } while (k > 0); return o; };
    const tag = p => { const t = 'zqx' + letters(n++) + 'qz'; where[t] = p; return t; };
    const inp = {
      ticker: 'FROG', capturedAt: iso(T0), [tag('extraTop')]: tag('extraTopVal'),
      research: {
        analystActions: [{ bank: tag('firm'), action: tag('action'), ratingAction: tag('ratingAction'), rating: tag('rating'), ptAction: tag('ptAction'), raw: tag('raw') + ' (October 14)', target: 5, ptFrom: 4, extra: tag('actExtra') }],
        ratingOnlyActions: [{ bank: tag('firm2'), action: tag('roAction'), ratingAction: tag('roRatingAction'), rating: tag('roRating'), raw: tag('roRaw') }],
        bullishCatalysts: [tag('bullish')], bearishCatalysts: [tag('bearish')], macroDrivers: [tag('macro')],
        earnings: tag('earnings'), guidance: tag('guidance'), contracts: tag('contracts'), peerMove: tag('peerMove'),
        revisionDirection: 'upgrading ' + tag('revisionDirectionTail'), revisionRecency: 'October 14 ' + tag('revisionRecencyTail'), dataFreshness: 'today ' + tag('freshTail'),
        rawText: tag('rawText'), sources: [{ url: 'https://news.example.com/' + tag('urlPath'), title: tag('title'), date: tag('srcDate'), body: tag('srcBody') }],
        [tag('extraResearch')]: tag('extraResearchVal')
      },
      assessment: { action: tag('assessAction'), technicalSetup: tag('setup'), sentiment: tag('sentiment'), catalystDirection: tag('direction'), summary: tag('summary'), sentimentScore: 50 },
      market: { price: 10, currency: 'USD', note: tag('marketNote') }
    };
    const b = M.buildSnapshot(inp);
    const hay = b.ok ? allStrings(b.snapshot).join(' | ') : '';
    const survived = Object.keys(where).filter(t => hay.indexOf(t) !== -1).map(t => where[t]).sort();
    const PERMITTED = ['bearish', 'bullish', 'contracts', 'earnings', 'firm', 'firm2', 'guidance', 'macro', 'peerMove', 'title', 'urlPath'].sort();
    const leaks = survived.filter(p => PERMITTED.indexOf(p) === -1);
    ok('EM-19', b.ok && leaks.length === 0 && survived.join(',') === PERMITTED.join(','), 'leaks ' + JSON.stringify(leaks) + ' survived ' + JSON.stringify(survived));
  }
  // EM-20 (finding 2) independent schema conformance under seeded fuzz; re-sealed mutations are accepted only when they conform
  if (want('EM-20')) {
    const R0 = rng(20261016);
    const pick = a => a[Math.floor(R0() * a.length)];
    const gens = [
      () => 'x'.repeat(Math.floor(R0() * 400)), () => pick(SPEC.ACTIONS), () => pick(SPEC.RATINGS), () => pick(SPEC.VERBS), () => 'October ' + Math.floor(R0() * 40),
      () => pick(BAD_TEXT), () => ' padded ', () => 42, () => NaN, () => null, () => undefined, () => ({ x: 1 }), () => ['y'], () => true,
      () => 'https://' + pick(['a.example.com', '10.0.0.1', 'localhost', 'b.example.org:8443', 'c.example.net']) + '/' + pick(['p', 'sk_live_abcdef', '..', '%41', 'q?x=1']),
      () => '2026-' + String(Math.floor(R0() * 14)).padStart(2, '0') + '-' + String(Math.floor(R0() * 33)).padStart(2, '0'), () => pick(SPEC.SETUPS), () => 'upgrading ' + EM_DASH + ' why',
      () => pick(SPEC.FRESHNESS), () => pick(SPEC.REVISION), () => Math.floor(R0() * 300)
    ];
    const junk = () => pick(gens)();
    let built = 0, threw = 0, mutations = 0, mutRejectedButConform = 0;
    const nonConform = [], mutAccepted = [];
    for (let i = 0; i < 400; i++) {
      const act = () => ({ bank: R0() < 0.5 ? pick(['UBS', 'J.P. Morgan', 'Keefe, Bruyette & Woods']) : junk(), action: junk(), ratingAction: junk(), rating: junk(), ptAction: junk(), raw: junk(), target: junk(), ptFrom: junk() });
      const inp = {
        ticker: R0() < 0.9 ? pick(['FROG', 'NVDA', 'TEVA.TA']) : junk(), capturedAt: R0() < 0.9 ? iso(T0 - Math.floor(R0() * 50) * 3600000) : junk(),
        research: R0() < 0.95 ? {
          analystActions: Array.from({ length: Math.floor(R0() * 14) }, act), ratingOnlyActions: Array.from({ length: Math.floor(R0() * 3) }, act),
          bullishCatalysts: Array.from({ length: Math.floor(R0() * 14) }, junk), bearishCatalysts: [junk()], macroDrivers: R0() < 0.5 ? junk() : [junk()],
          earnings: junk(), guidance: junk(), contracts: junk(), peerMove: junk(), revisionDirection: junk(), revisionRecency: junk(), dataFreshness: junk(),
          sources: Array.from({ length: Math.floor(R0() * 12) }, () => ({ url: junk(), title: junk(), date: junk() })), _allNone: junk(), _unavailable: junk()
        } : junk(),
        assessment: { action: junk(), technicalSetup: junk(), sentiment: junk(), sentimentScore: R0() < 0.5 ? Math.floor(R0() * 200) - 50 : junk(), catalystDirection: junk() },
        market: { price: R0() < 0.5 ? R0() * 500 : junk(), currency: pick(['USD', 'ILS', 'usd', 'US', junk()]) }
      };
      let b; try { b = M.buildSnapshot(inp); } catch (e) { threw += 1; continue; }
      if (!b || !b.ok) continue;
      built += 1;
      const v = specViolations(b.snapshot);
      if (v.length || !M.validateSnapshot(b.snapshot)) nonConform.push(v.join('|') || 'validator rejected its own output');
      const x = JSON.parse(JSON.stringify(b.snapshot));
      const paths = [];
      (function walk(o, p) { if (Array.isArray(o)) o.forEach((y, j) => walk(y, p.concat(j))); else if (o && typeof o === 'object') Object.keys(o).forEach(k => walk(o[k], p.concat(k))); else paths.push(p); })(
        { research: x.research, assessment: x.assessment, market: x.market, sources: x.sources }, []);
      if (!paths.length) continue;
      const p = pick(paths);
      let o = x; for (let j = 0; j < p.length - 1; j++) o = o[p[j]];
      const nv = junk();
      if (nv === undefined) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = nv;
      sealOf(x);
      mutations += 1;
      const conforms = specViolations(x).length === 0;
      const accepted = M.validateSnapshot(x);
      if (accepted && !conforms) mutAccepted.push(p.join('.') + '=' + JSON.stringify(nv));
      if (!accepted && conforms) mutRejectedButConform += 1;
    }
    ok('EM-20', threw === 0 && built > 150 && nonConform.length === 0 && mutAccepted.length === 0 && mutations > 150,
      JSON.stringify({ threw, built, nonConform: nonConform.slice(0, 3), mutAccepted: mutAccepted.slice(0, 5), mutations, mutRejectedButConform }));
  }
  // EM-21 (finding 5 hardening) a refused or failed replacement never deletes the record it would have replaced
  if (want('EM-21')) {
    const be = M.memoryBackend();
    const big = M.createEvidenceMemory({ backend: be, now: () => T0, limits: { perTickerPerDay: 5 } });
    for (let i = 0; i < 4; i++) await big.put(input({ capturedAt: iso(T0 - 5 * 3600000 + i * 60000), research: research({ guidance: 'v' + i }) }));
    const small = M.createEvidenceMemory({ backend: be, now: () => T0, limits: { perTickerPerDay: 2 } });
    const before = (await be.keys()).sort();
    const r = await small.put(input({ capturedAt: iso(T0 - 5 * 3600000), research: research({ guidance: 'replacement of the oldest' }) }));
    const after = (await be.keys()).sort();
    const quotaBe = M.memoryBackend();
    const qm = M.createEvidenceMemory({ backend: quotaBe, now: () => T0 });
    await qm.put(input({ capturedAt: iso(T0 - 3600000) }));
    const keep = (await quotaBe.keys()).slice();
    quotaBe.put = () => Promise.reject(new Error('QuotaExceededError'));
    const q = await qm.put(input({ capturedAt: iso(T0 - 3600000), research: research({ guidance: 'new content same time' }) }));
    const keep2 = await quotaBe.keys();
    ok('EM-21', r.reason === 'DAY_CAP' && JSON.stringify(before) === JSON.stringify(after) && q.reason === 'BACKEND_ERROR' && JSON.stringify(keep) === JSON.stringify(keep2), JSON.stringify([r.reason, before.length, after.length, q.reason]));
  }
  // EM-22 storage invariants under seeded random operation sequences (memory backend and the IndexedDB fake).
  // "Unchanged" is checked where it is defined: a stored put never equals the ticker's newest earlier snapshot at insert time.
  {
    const fails = [];
    const out = await within((async () => {
    for (const kind of ['memory', 'idb']) {
      const R1 = rng(kind === 'memory' ? 7 : 11);
      let t = T0;
      const be = kind === 'memory' ? M.memoryBackend() : M.indexedDbBackend({ idb: fakeIndexedDB(), dbName: 'inv' });
      await be.put('settings:keep', 1);
      const mem = M.createEvidenceMemory({ backend: be, now: () => t, limits: { perTickerPerDay: 3, totalSnapshots: 25 } });
      const tick = ['FROG', 'NVDA', 'ARM', 'GEV'];
      const steps = kind === 'memory' ? 260 : 100;
      for (let i = 0; i < steps; i++) {
        const op = R1();
        if (op < 0.75) {
          const one = input({ ticker: tick[Math.floor(R1() * 4)], capturedAt: iso(t - Math.floor(R1() * 100) * 3600000 - Math.floor(R1() * 3) * 60000), research: research({ guidance: 'g' + Math.floor(R1() * 4) }) });
          const b = M.buildSnapshot(one);
          const prevList = b.ok ? (await mem.list(one.ticker)).filter(v => v.capturedAt < b.snapshot.capturedAt) : [];
          const res = await mem.put(one);
          if (res.stored && prevList.length && prevList[prevList.length - 1].contentHash === b.snapshot.contentHash) fails.push(kind + ' stored an unchanged snapshot @' + i);
        } else if (op < 0.9) t += Math.floor(R1() * 5) * DAY;
        else if (op < 0.98) await mem.prune();
        else await mem.list('FROG');
        if (i % 20 === 19 || i === 0) {
          const keys = await be.keys();
          const snaps = keys.filter(k => k.indexOf('snap:') === 0);
          const vals = await Promise.all(snaps.map(k => be.get(k)));
          const cut = t - 90 * DAY;
          const perDay = {};
          vals.forEach(v => { const key = v.ticker + v.day; perDay[key] = (perDay[key] || 0) + 1; });
          const exp = await mem.exportAll();
          const listed = (await Promise.all(tick.map(x => mem.list(x)))).reduce((a, b) => a.concat(b), []);
          if (keys.indexOf('settings:keep') === -1) fails.push(kind + ' foreign key lost @' + i);
          if (snaps.length > 25) fails.push(kind + ' total cap @' + i);
          if (Object.values(perDay).some(c => c > 3)) fails.push(kind + ' day cap @' + i);
          if (!vals.every(M.validateSnapshot)) fails.push(kind + ' invalid stored @' + i);
          if (listed.some(v => Date.parse(v.capturedAt) < cut)) fails.push(kind + ' expired visible @' + i);
          if (!exp || !M.validateExport(exp)) fails.push(kind + ' export invalid @' + i);
        }
      }
    }
    })(), 20000);
    if (out === 'TIMEOUT') fails.push('TIMEOUT');
    ok('EM-22', fails.length === 0, JSON.stringify(fails.slice(0, 5)));
  }
  // EM-23 (finding 6) IndexedDB backend against the transactional fake (each scenario must settle within 1 s)
  if (want('EM-23')) {
    const r = {};
    const sc = async (name, fn) => { const v = await within(fn(), 1000); r[name] = v === true; };
    await sc('path', async () => { const idb = fakeIndexedDB(); let t = T0;
      const mem = M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb, dbName: 'qa' }), now: () => t, limits: { perTickerPerDay: 2 } });
      const a = await mem.put(input({ capturedAt: iso(T0 - 3 * 3600000) })); const b = await mem.put(input({ capturedAt: iso(T0 - 2 * 3600000) }));
      const c = await mem.put(input({ capturedAt: iso(T0 - 1 * 3600000), research: research({ guidance: 'x' }) })); const d = await mem.put(input({ capturedAt: iso(T0 - 30 * 60000), research: research({ guidance: 'y' }) }));
      const xs = await mem.list('FROG'); const doc = await mem.exportAll(); t = T0 + 91 * DAY; const pr = await mem.prune(); const st = await mem.stats();
      return a.stored && b.reason === 'UNCHANGED' && c.stored && d.stored && xs.length === 2 && M.validateExport(doc) && pr.removed === 2 && st.snapshots === 0; });
    await sc('requestErrorRollback', async () => { let fail = false; const idb = fakeIndexedDB({ failPut: () => fail });
      const be = M.indexedDbBackend({ idb, dbName: 'rb' }); const mem = M.createEvidenceMemory({ backend: be, now: () => T0 });
      await mem.put(input({ capturedAt: iso(T0 - 3600000) })); const k1 = (await be.keys()).slice(); fail = true;
      const e = await mem.put(input({ capturedAt: iso(T0 - 1800000), research: research({ guidance: 'z' }) })); const k2 = await be.keys();
      return e.reason === 'BACKEND_ERROR' && JSON.stringify(k1) === JSON.stringify(k2); });
    await sc('commitAbort', async () => { let ab = false; const idb = fakeIndexedDB({ abortCommit: () => ab }); const be = M.indexedDbBackend({ idb, dbName: 'ab' });
      const mem = M.createEvidenceMemory({ backend: be, now: () => T0 }); await mem.put(input({ capturedAt: iso(T0 - 3600000) })); ab = true;
      const e = await mem.put(input({ capturedAt: iso(T0 - 1800000), research: research({ guidance: 'w' }) })); ab = false; const st = await mem.stats();
      return e.reason === 'BACKEND_ERROR' && st.snapshots === 1; });
    await sc('missingStore', async () => { const idb = fakeIndexedDB(); idb.seed('legacy', 3, ['other']); const mem = M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb, dbName: 'legacy' }), now: () => T0 });
      const e = await mem.put(input()); return e.stored && idb.dbs.legacy.version === 4 && Object.prototype.hasOwnProperty.call(idb.dbs.legacy.stores, 'other'); });
    await sc('blockedUpgrade', async () => { const idb = fakeIndexedDB(); idb.seed('blk', 1, ['other']);
      const hold = idb.open('blk'); await new Promise(res => { hold.onsuccess = res; });            // another tab keeps the old version open and ignores versionchange
      const mem = M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb, dbName: 'blk' }), now: () => T0 });
      const e = await mem.put(input()); return e.reason === 'BACKEND_ERROR'; });
    // the blocked request later succeeds when the other tab closes: that connection has no owner and must be closed;
    // the next operation reopens normally. Invariant: every connection the module opens is cached (<= 1) or closed.
    await sc('blockedThenLateSuccess', async () => { const idb = fakeIndexedDB(); idb.seed('late', 1, ['other']);
      const hold = idb.open('late'); await new Promise(res => { hold.onsuccess = res; });
      const mem = M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb, dbName: 'late' }), now: () => T0 });
      const e = await mem.put(input());
      hold.result.close(); await ticks(8);
      const afterLate = idb.openCount(), upgraded = idb.dbs.late.version === 2;
      const e2 = await mem.put(input());
      return e.reason === 'BACKEND_ERROR' && upgraded && afterLate === 0 && e2.stored === true && idb.openCount() === 1; });
    await sc('noLeakOnReopenPaths', async () => { const idb = fakeIndexedDB(); idb.seed('lk', 2, ['other']);
      const mem = M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb, dbName: 'lk' }), now: () => T0 });
      await mem.put(input()); await mem.list('FROG'); await mem.stats(); return idb.openCount() === 1; });
    await sc('openFailures', async () => { const e1 = await M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb: fakeIndexedDB({ failOpen: true }) }), now: () => T0 }).put(input());
      const e2 = await M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb: fakeIndexedDB({ throwOnOpen: true }) }), now: () => T0 }).put(input());
      const e3 = await M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb: null }), now: () => T0 }).put(input());
      const g = await M.createEvidenceMemory({ backend: M.indexedDbBackend({ idb: fakeIndexedDB({ keysNotArray: true }) }), now: () => T0 }).tickers();
      return e1.reason === 'BACKEND_ERROR' && e2.reason === 'BACKEND_ERROR' && e3.reason === 'BACKEND_ERROR' && Array.isArray(g) && g.length === 0; });
    await sc('versionchangeReopen', async () => { const idb = fakeIndexedDB(); const old = M.indexedDbBackend({ idb, dbName: 'vc' }); await old.put('k', 1);
      const v0 = idb.dbs.vc.version;
      await new Promise(res => { const q = idb.open('vc', v0 + 1); q.onsuccess = () => { q.result.close(); res(); }; q.onerror = res; });
      const k = await settles(old.keys()); return k.ok && Array.isArray(k.v) && k.v.indexOf('k') !== -1; });
    const failed = Object.keys(r).filter(k => r[k] !== true);
    ok('EM-23', failed.length === 0, JSON.stringify(failed));
  }
  // EM-24 the real producer: live research captures through the real parser in index.html (skipped only if either file is absent)
  if (want('EM-24')) {
    const ix = path.join(ROOT, 'index.html'), fxp = path.join(ROOT, 'qa', 'fixtures', 'research-live-2026-10-15.json');
    if (fs.existsSync(ix) && fs.existsSync(fxp)) {
      const c = fs.readFileSync(ix, 'utf8').replace(/\r\n/g, '\n');
      const st = c.indexOf('function parsePerplexityContext('); const bi = c.indexOf('{', st); let d = 0, end = -1;
      for (let i = bi; i < c.length; i++) { if (c[i] === '{') d++; else if (c[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
      const ctx = { console: { log() {}, warn() {} } }; vm.createContext(ctx); vm.runInContext(c.slice(st, end) + ';this.P=parsePerplexityContext', ctx);
      const fx = JSON.parse(fs.readFileSync(fxp, 'utf8')); const caps = fx.captures || fx;
      const bad = [];
      for (const cap of caps) {
        const p = ctx.P(cap.raw, [{ url: 'https://www.example.com/a?x=1', title: 't', date: '2026-10-14' }])[cap.ticker];
        const b = M.buildSnapshot({ ticker: cap.ticker, capturedAt: '2026-10-15T20:00:00Z', research: p, assessment: { action: 'hold' }, market: { price: 1, currency: 'USD' } });
        if (!b.ok || !M.validateSnapshot(b.snapshot) || specViolations(b.snapshot).length) { bad.push(cap.key + ' invalid'); continue; }
        const j = JSON.stringify(b.snapshot);
        if (j.length > 2600) bad.push(cap.key + ' size ' + j.length);
        if (b.dropped !== 0) bad.push(cap.key + ' dropped ' + b.dropped);
        // permitted free-text items must be the parser's own items; nothing else may carry 40+ chars of the raw response
        const s = b.snapshot, R = s.research;
        const items = [].concat(R.bullish, R.bearish, R.macro, [R.earnings, R.guidance, R.contracts, R.peerMove].filter(x => x !== null));
        const parserItems = [].concat(p.bullishCatalysts || [], p.bearishCatalysts || [], p.macroDrivers || [], [p.earnings, p.guidance, p.contracts, p.peerMove]);
        if (items.some(x => parserItems.indexOf(x) === -1)) bad.push(cap.key + ' item not from the parser');
        const rest = JSON.stringify(Object.assign({}, s, { research: Object.assign({}, R, { bullish: [], bearish: [], macro: [], earnings: null, guidance: null, contracts: null, peerMove: null }) }));
        for (let k = 0; k + 40 <= cap.raw.length; k += 20) { if (rest.indexOf(cap.raw.slice(k, k + 40)) !== -1) { bad.push(cap.key + ' raw text outside permitted items'); break; } }
      }
      ok('EM-24', caps.length >= 8 && bad.length === 0, JSON.stringify(bad));
    } else ok('EM-24', true);
  }
  // EM-25 (rev-2 finding 2) the export surface: every exported function, called with hostile arguments, neither throws
  // nor rejects; objects it returns are probed one level deep (backend operations may reject - that is the section 2.2
  // failure signal - but never throw). The export list is enumerated, so a new export is covered automatically.
  if (want('EM-25')) {
    const boom = () => { throw new Error('boom'); };
    const hostile = new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom, getPrototypeOf: boom });
    const badGetters = () => { const o = {}; ['backend', 'idb', 'now', 'limits', 'retentionDays', 'dbName'].forEach(k => Object.defineProperty(o, k, { get: boom, enumerable: true })); return o; };
    const args = [undefined, null, 0, NaN, 'x', [], {}, hostile, badGetters(), { backend: hostile }, { backend: { get: 1 } }, { backend: { get: boom, put: boom, del: boom, keys: boom } },
      { backend: M.memoryBackend(), now: 'x', limits: hostile, retentionDays: -1 }, { idb: hostile }, { idb: { open: boom } }];
    const bad = [];
    const probe = async (label, f, a, mayReject) => {
      let out;
      try { out = f(a); } catch (e) { bad.push(label + ' threw'); return undefined; }
      if (out && typeof out.then === 'function') {
        const r = await settles(within(out, 1000));
        if (r.ok && r.v === 'TIMEOUT') bad.push(label + ' hung'); else if (!r.ok && !mayReject) bad.push(label + ' rejected');
        return undefined;
      }
      return out;
    };
    let calls = 0;
    for (const name of Object.keys(M).filter(k => typeof M[k] === 'function')) {
      const isBackendFactory = /Backend$/.test(name);
      for (let i = 0; i < args.length; i++) {
        calls++;
        const out = await probe(name + '#' + i, M[name], args[i], false);
        if (out && typeof out === 'object') {
          for (const m of Object.keys(out).filter(k => typeof out[k] === 'function')) {
            calls += 2;
            await probe(name + '#' + i + '.' + m, a => out[m](a), undefined, isBackendFactory);
            await probe(name + '#' + i + '.' + m + '(hostile)', a => out[m](a, a), hostile, isBackendFactory);
          }
        }
      }
    }
    // a memory built from unusable options fails closed with the documented section 2.3 shapes
    let shapes = false;
    try {
      const inert = M.createEvidenceMemory(badGetters());
      const p = await inert.put(input()), st = await inert.stats(), cl = await inert.clear(), ls = await inert.list('FROG'), ex = await inert.exportJson();
      shapes = p.stored === false && p.reason === 'BACKEND_ERROR' && st.ok === false && st.reason === 'BACKEND_ERROR' && cl.ok === false && cl.removed === 0 && Array.isArray(ls) && ls.length === 0 && ex === null;
    } catch (e) { shapes = false; }
    ok('EM-25', calls > 300 && bad.length === 0 && shapes, JSON.stringify({ calls, bad: bad.slice(0, 8), shapes }));
  }
  // EM-26 (rev-2 finding 1) the secret-word rule holds for every spelling: each word split at every position, joined by
  // every separator class (raw and percent-encoded, including "/" between segments), in three casings, and with
  // percent-encoded letters - generated, not listed. Benign look-alike paths must be kept.
  if (want('EM-26')) {
    const words = ['apikey', 'secret', 'token', 'password', 'passwd'];
    const seps = ['', ' ', '%20', '+', '%2B', '-', '%2D', '_', '%5F', '.', '%2E', '~', '%7E', '/', '%2F', ';', ':', '@', '!', "'", '%27', '%09'];
    const casings = [x => x, x => x.toUpperCase(), x => x.charAt(0).toUpperCase() + x.slice(1)];
    const out = u => { const b = M.buildSnapshot(input({ research: research({ sources: [{ url: u, title: 't' }] }) })); return b.ok && b.snapshot.sources.length ? b.snapshot.sources[0].url : null; };
    const leaked = []; let n = 0;
    for (const w of words) for (let cut = 1; cut < w.length; cut++) for (const sep of seps) for (const cs of casings) {
      const u = 'https://news.example.com/markets/' + cs(w.slice(0, cut)) + sep + cs(w.slice(cut)) + '-reset';
      n++; if (out(u) !== null) leaked.push(u);
    }
    for (const w of words) for (let i = 0; i < w.length; i++) {
      const enc = w.slice(0, i) + '%' + w.charCodeAt(i).toString(16).toUpperCase() + w.slice(i + 1);
      n++; if (out('https://news.example.com/a/' + enc) !== null) leaked.push(enc);
    }
    const keep = ['/markets/key-takeaways-from-q3', '/capital-markets-day', '/rapid-ai-adoption', '/pass-through-costs-rise', '/tokyo-open', '/api-earnings-preview', '/press/keynote'];
    const lost = keep.filter(pth => out('https://news.example.com' + pth) !== 'https://news.example.com' + pth);
    ok('EM-26', n > 1500 && leaked.length === 0 && lost.length === 0, JSON.stringify({ n, leaked: leaked.slice(0, 5), lost }));
  }
  // EM-27 (rev-2 advisory) every supplied free-text value that is not kept is counted in `dropped`: one bad value per
  // permitted free-text slot, each alone, must raise `dropped` by exactly one.
  if (want('EM-27')) {
    const long = 'x'.repeat(301);
    const cases = [
      ['title over-length', { sources: [{ url: 'https://a.example.com/p', title: 't'.repeat(161) }] }],
      ['title multi-line', { sources: [{ url: 'https://a.example.com/p', title: BAD_TEXT[3] }] }],
      ['earnings', { earnings: long }], ['guidance', { guidance: BAD_TEXT[1] }], ['contracts', { contracts: BAD_TEXT[0] }], ['peerMove', { peerMove: long }],
      ['bullish item', { bullishCatalysts: [long] }], ['bearish item', { bearishCatalysts: [BAD_TEXT[3]] }], ['macro item', { macroDrivers: [long] }]
    ];
    const base = M.buildSnapshot(input({ research: research({ sources: [{ url: 'https://a.example.com/p', title: 'ok' }] }) })).dropped;
    const wrong = cases.filter(([, over]) => {
      const r0 = Object.assign({ sources: [{ url: 'https://a.example.com/p', title: 'ok' }] }, over);
      const b = M.buildSnapshot(input({ research: research(r0) }));
      return !b.ok || b.dropped !== base + 1;
    }).map(c => c[0]);
    ok('EM-27', base === 0 && wrong.length === 0, JSON.stringify({ base, wrong }));
  }
  return R;
}

// ---------- planted negatives: each mutates the production source; the named rows must fail ----------
const NEG = [
  ['EM-N1 label allowlist removed', '      action: inList(a.action, ACTIONS),', "      action: (typeof a.action === 'string' && /^[a-z_]+$/.test(a.action)) ? a.action : null,", ['EM-14', 'EM-19', 'EM-20']],
  ['EM-N2 revision text kept whole', '      revisionDirection: leadToken(r.revisionDirection, REVISION),', '      revisionDirection: r.revisionDirection,', ['EM-2']],
  ['EM-N3 over-length text truncated instead of dropped', '  if (!s || s.length > max || BAD_CHARS_RE.test(s)) return null;', '  if (!s || BAD_CHARS_RE.test(s)) return null;\n  if (s.length > max) s = s.slice(0, max);', ['EM-6']],
  ['EM-N4 retention default changed to 30', 'var DEFAULT_RETENTION_DAYS = 90;', 'var DEFAULT_RETENTION_DAYS = 30;', ['EM-10', 'EM-15']],
  ['EM-N5 unchanged check removed', '        if (prev && prev.hash === s.contentHash) return cleanup(', '        if (false) return cleanup(', ['EM-9', 'EM-22', 'EM-23']],
  ['EM-N6 day cap removed', '        var dayOver = dayList.slice(0, Math.max(0, dayList.length - limits.perTickerPerDay));', '        var dayOver = [];', ['EM-12', 'EM-22']],
  ['EM-N7 structural validation removed (checksum only)', '    if (san.dropped !== 0 || !same(san.body, body)) return false;\n    return same(finish(s.ticker, ms, san.body), s);', '    return canon(finish(s.ticker, ms, body)) === canon(s);', ['EM-14', 'EM-20']],
  ['EM-N20 canonical JSON instead of strict equality', '    if (san.dropped !== 0 || !same(san.body, body)) return false;\n    return same(finish(s.ticker, ms, san.body), s);', '    if (san.dropped !== 0 || canon(san.body) !== canon(body)) return false;\n    return canon(finish(s.ticker, ms, san.body)) === canon(s);', ['EM-20']],
  ['EM-N8 stats not contained', '  function stats() {\n    return contained(function () {', '  function stats() {\n    return (function (f) { return f(); })(function () {', ['EM-16']],
  ['EM-N9 clock range check removed', '  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;', '  if (mo < 1 || mo > 12 || d < 1 || h > 24) return null;', ['EM-4']],
  ['EM-N10 port check removed', "  if (m[2] !== undefined && !((scheme === 'https' && m[2] === '443') || (scheme === 'http' && m[2] === '80'))) return null;", '', ['EM-5']],
  ['EM-N11 secret-path check removed', '  if (/[A-Za-z0-9]{32,}/.test(dec)) return false;', '  return true;', ['EM-5']],
  ['EM-N21 content rules read the encoded segment', "  if (BAD_CHARS_RE.test(dec) || dec === '.' || dec === '..') return false;\n  if (/[A-Za-z0-9]{32,}/.test(dec)) return false;", '  if (BAD_CHARS_RE.test(dec)) return false;\n  if (/[A-Za-z0-9]{32,}/.test(seg)) return false;', ['EM-5']],
  ['EM-N22 late connection after blocked not closed', "        if (settled) { try { d.close(); } catch (e) { /* already closed */ } return; }", '        if (settled) return;', ['EM-23']],
  ['EM-N23 factory construction not contained', '  try { return buildMemory(opts); } catch (e) { return buildMemory({ backend: unavailableBackend() }); }', '  return buildMemory(opts);', ['EM-25']],
  ['EM-N24 secret words matched as typed, not separator-free', '  if (SECRET_WORDS_RE.test(flat)) return null;', "  if (/api[_-]?key|secret|token|passw/i.test(decodeURIComponent(path))) return null;", ['EM-26']],
  ['EM-N25 dropped free text not counted', "  if (t === null && v !== null && v !== undefined && v !== '') c.n++;", '', ['EM-27']],
  ['EM-N26 backend operation may throw synchronously', '    return new Promise(function (r) { r(db()); }).then(function (d) {', '    return db().then(function (d) {', ['EM-25']],
  ['EM-N12 TLD / IP-literal check removed', "  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9\\-]{2,59})$/.test(labels[labels.length - 1])) return null;", '', ['EM-5']],
  ['EM-N13 replacement deleted before the cap decision', '        var replaced = sameTime.map(function (p) { return p.key; });', '        var replaced = sameTime.map(function (p) { return p.key; }); replaced.forEach(function (rk) { backend.del(rk); });', ['EM-21']],
  ['EM-N14 delete before write', '        return Promise.resolve(backend.put(k, s)).then(function () {\n          return delAll(gone.concat(expired));\n        })', '        return delAll(gone.concat(expired)).then(function () {\n          return backend.put(k, s);\n        })', ['EM-21']],
  ['EM-N15 IndexedDB abort not handled', "        tx.onabort = function () { done(reject, tx.error || new Error('INDEXEDDB_TX_ABORTED')); };", '', ['EM-23']],
  ['EM-N16 missing-store upgrade removed', '        if (d.objectStoreNames.contains(storeName)) return d;', '        return d;', ['EM-23']],
  ['EM-N17 free-text slot added to the body', '    dataFreshness: inList(r.dataFreshness, FRESHNESS)\n  };', '    dataFreshness: inList(r.dataFreshness, FRESHNESS),\n    note: oneLine(r.note, 300)\n  };', ['EM-2', 'EM-20']],
  ['EM-N18 rule set bypassed at build time', '    var s = sanitizeBody(mapInput(input));', '    var mi = mapInput(input); var s = { body: { research: mi.research, assessment: mi.assessment, market: mi.market || {}, sources: mi.sources || [] }, dropped: 0 };', ['EM-1', 'EM-19']],
  ['EM-N19 versionchange not handled', '        d.onversionchange = function () { d.close(); dbp = null; };', '', ['EM-23']]
];

(async () => {
  const main = await rows(load(SRC), SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, a, b, want] of NEG) {
    if (SRC.split(a).length !== 2) { fails++; console.log('  FAIL  ' + name + ': anchor not found exactly once'); continue; }
    let r;
    try { const ms = SRC.replace(a, b); r = await rows(load(ms), ms, want); } catch (e) { r = {}; want.forEach(w => { r[w] = 'threw'; }); }
    const caught = want.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + want.join(', ') + ' fail' + (caught ? '' : '  (' + want.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'EVIDENCE MEMORY OFFLINE: FAIL (' + fails + ')' : 'EVIDENCE MEMORY OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
```
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
node qa/guard_integrity_check.js --task task/evidence-memory-1-s1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/evidence_memory_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/evidence-memory-1-s1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/evidence-memory-1-s1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
services/evidence-memory.js
qa/evidence_memory_offline.js
work/evidence-memory-1-s1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/evidence_memory_offline.js
<!-- land-tests:end -->
