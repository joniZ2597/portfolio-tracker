# Task brief: evidence-memory-1 S2 — change engine v1 ("What changed" engine on S1 snapshots)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 2 — Codex review complete (READY FOR R11, 0 Class I); ready for the Owner's R11** (COWORK, 2026-10-17). Base `0903940` (`evidence-memory-1` S1 landed: `services/evidence-memory.js`); the current committed tip `c3d5439` adds only `work/ai-request-hygiene-1/brief.md`, so every §TS pin is unchanged there. Main Control rulings applied: **D-19** (S2 = change engine, next lane-B feature), **D-20** (3 % price, 5 % target, all rating / action changes, ≤ 7 shown; boundary + negative tests), **D-21** (separate source records kept; no duplicate user-visible events), **D-23** (setup / sentiment / direction materiality; boundary + negative tests), **D-25** (provisional placement for the later surface: top of Ticker Detail + a small marker in Scan Results; the UI is a separate task). Prepared from `evidence-memory-1-s2.BREAKDOWN.md` (D2) under the Risk & Test Design practice (§RT). **Rev 2** closes the one Class I of Codex review #1 (verdict preserved in `shared-reports/codex/2026-10-17_evidence-memory-1-s2-review.md`, NOT READY): analyst handling is **independent of input order** and **never collapses distinct evidence** (rules in §2: event vs evidence, prior state as sets, re-reports; EC-15, EC-16; EC-N15…N20), and the same root cause in catalyst representatives is fixed too. The two advisories are stated as rules with a row each (EC-17 currency, EC-18 one entry per event). Rev 1: `rev1/`; delta `evidence/rev2.diff`. **Codex re-check #2 of 2:** READY FOR R11, 0 Class I, no advisories (`shared-reports/codex/2026-10-17_evidence-memory-1-s2-review.md`, "Rev 2 — verdict"); no further Codex rounds pending. **Remaining:** the Owner's R11.

| | |
|---|---|
| Objective | A pure library `services/evidence-changes.js`: `createChangeEngine(memoryModule).diffSnapshots(prev, next)` returns the material changes between two S1 snapshots of one ticker — ordered, one entry per real-world event, at most 7 shown — and counts what it suppressed. Nothing is shown when only noise changed |
| Not in S2 | rendering (`what-changed-1`, lane A, W4); capture (`evidence-capture-1`, lane A, W2); canonical cross-day evidence and provenance (S3); any storage, network or `index.html` change |
| Backlog | none. No `BACKLOG.md` edit (D-16 refresh is deferred, separate) |
| Depends on | S1 (landed `0903940`): consumes S1 snapshots and reuses S1 `validateSnapshot` through injection |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all hold; otherwise HOLD: <ul><li>`services/evidence-changes.js` and `qa/evidence_changes_offline.js` do **not** exist;</li><li>`services/evidence-memory.js` = blob `c74d64040c99936d7aee03f945818cab41da90ef` (sha256 `378bd80a3875592f4119b8daa1a6a18816700292655477da838413a1d6b77a78`; loaded by the suite);</li><li>`qa/fixtures/research-live-2026-10-15.json` = `54526e2c15414dab849bd52cb544daaff5bcd2b3` (EC-1);</li><li>`qa/run-offline.js` = `0f57950f0615aa53c5c7b66e2f12da192aaa2015`;</li><li>`index.html` contains `function parsePerplexityContext(` exactly once (read by EC-1; never edited).</li></ul> |
| Branch / slot / mode | `task/evidence-memory-1-s2` · **Worker B** · **Manual** (new product semantics) |
| qa:offline | step-0 count **+1** (`qa/evidence_changes_offline.js`; 99 → 100 at `0903940`; auto-discovered; the runner stays forbidden) |
| Parallel with | lane A (`index.html`): no shared file. One heavy QA run at a time |
| Skills | `pt-offline-suite` — Recommended |
| Gate verification | N/A in S2: nothing calls the module. The lane-A slice that renders it adds its own client gate |

## §1 Files (exactly)

- `services/evidence-changes.js` (new) — exact text **§A1**
- `qa/evidence_changes_offline.js` (new) — exact text **§A2**
- `work/evidence-memory-1-s2/review.md`

**Forbidden:** `services/evidence-memory.js` (S1, frozen by hash), `index.html` (EC-1 only reads it), `qa/fixtures/**`, every other file under `services/`, `qa/`, `netlify/`; `qa/run-offline.js`; `package*.json`; `.claude/**`; `AGENTS.md`; `CLAUDE.md`; `BACKLOG.md`. No dependency is added.

## §1a Consumer sweep

No existing symbol, file or stored key changes; nothing imports the module yet.

| Reader | Effect | Assertion |
|---|---|---|
| `qa/run-offline.js` Phase 1 (syntax of `services/*.js`, `qa/*.js`) | parses the two new files | sandbox: 187 files parse |
| `qa/run-offline.js` Phase 2 auto-discovery | runs the new suite (≈ 0.3 s) | sandbox PASS; 99 → 100 suites |
| `qa/run-offline.js` Phase 3 `checkNoTokenPersistence` (`index.html` + `services/*`) | scans the module | PASS |
| `qa/run-offline.js` Phase 3 `evidenceAndSyncPaths` (selects `services/*research-evidence*` and named functions) | not selected; EC-13 asserts no network / storage / DOM / clock | listed |
| S1 `services/evidence-memory.js` | read-only dependency: injected, never imported by path; its `validateSnapshot` gates every input | EC-10 |
| The suite reads `index.html` `parsePerplexityContext` and the live-capture fixture (EC-1) | a parser output change shows up in EC-1 | coupling noted |
| Future: `evidence-capture-1` (W2 A) supplies snapshots; `what-changed-1` (W4 A) renders `shown`, `groups` and `suppressed.overflow` at the top of Ticker Detail and a marker in Scan Results when `groups > 0` (D-25, provisional) | out of S2 | — |

## §2 Contract (normative; exact code §A1)

`createChangeEngine(memoryModule) → { diffSnapshots(prev, next) }`. `memoryModule` must provide `validateSnapshot` (S1); otherwise every call returns `NO_VALIDATOR`. **No function throws**, whatever it is given (including a hostile module, proxies, getters, cycles).

`diffSnapshots(prev, next) → { ok, reason, changes, shown, suppressed, groups }`

| Item | Rule | From |
|---|---|---|
| Inputs | `prev === null` → `{ ok: true, reason: 'FIRST_SNAPSHOT' }`, no changes. Otherwise both must pass S1 `validateSnapshot`, have the same ticker and `prev.capturedAt < next.capturedAt`; else `ok: false` with `INVALID_PREV`, `INVALID_NEXT`, `TICKER_MISMATCH`, `NOT_LATER`; an internal failure → `INTERNAL` | S1; no "everything is new" on the first scan |
| Change | exactly `{ kind, groupKey, from, to, magnitude, material, date }`. `from` / `to` / `date` are values copied from the snapshots (or `null`); `magnitude` a % rounded to 6 decimals or `null`; `groupKey` = 2-letter prefix + `:` + 16-hex hash — **no text is created** | S1 privacy |
| Kinds | `rating_change`, `target_change`, `analyst_new`, `ai_action_change`, `catalyst_new`, `catalyst_gone`, `setup_change`, `sentiment_change`, `direction_change`, `price_move`, `source_new` | — |
| Analyst: event vs evidence | **event identity** = firm (case-insensitive) + action verb + date — the `groupKey`, one shown entry per event. **Evidence key** = every field of the item (firm, verb, rating verb, rating, date, target, target-from, target verb): items that differ in any field are **distinct evidence and are never collapsed**; only exact duplicates are one. An item is new when its evidence key is not in `prev` | D-21 (Codex #1, rev 2) |
| Analyst: prior state | per firm, the **set** of its earlier targets and the **set** of its earlier ratings in `prev` (never "the last one in the list") | rev 2 |
| Analyst: change rules (each new item gives one change) | `rating_change` (material) if the event is new and the verb is `upgraded` / `downgraded`, or if its rating is known and is **not among** the firm's earlier ratings (`from` = the earlier rating when there is exactly one, else `null`); else `analyst_new` material if the event is new and has an initiation verb (`initiated`, `started`, `launched`, `reinstated`, `resumed`); else `target_change` if the target moved from its base — **material iff ≥ 5 %**; else `analyst_new`, not material (a reiteration). **Base:** `targetFrom` for a new event; otherwise (a **re-report** of an event already in `prev`, or no `targetFrom`) the firm's **nearest earlier target** (ties: the lower). A re-reported upgrade is therefore not shown again | D-20 |
| Price | `price_move` when both prices are valid, the currency is the same and the price differs; **material iff \|Δ\| ≥ 3 %** (computed as a % rounded to 6 decimals, so 3 % in float is 3 %). **Currency:** an unknown currency on **both** sides is the same unlabelled series (compared); unknown on one side and known on the other is not compared (advisory #3) | D-20 |
| AI action label | `ai_action_change`, always material | D-20 |
| Setup / sentiment / direction | `setup_change` material only when crossing between constructive (`extended_near_ath`, `healthy_uptrend_near_ath`, `healthy_uptrend`, `pullback_in_uptrend`) and damaged (`support_test`, `breakdown_risk`, `below_key_mas`); `sentiment_change` only positive ↔ negative; `direction_change` only bullish ↔ bearish; otherwise recorded, not material | D-23 |
| Unknown is not a change | `null`, missing or `unknown` on either side → no change for that field; research `unavailable` on either side → no research changes (analyst, catalysts, sources) | S1 null semantics |
| Catalysts (`bullish`, `bearish`, `macro`, `earnings`, `guidance`, `contracts`, `peerMove`) | identity = text with calendar dates masked (`October 14`, `Oct 14, 2026`, `Sept 14`, ISO), case / punctuation / currency signs / thousands separators ignored, **numbers kept**. New identity → `catalyst_new` (material); vanished identity → `catalyst_gone` (not material) | D-21 |
| Sources | a new domain → `source_new` (not material) | D-21: records kept separately, counted |
| One event, one entry (D-21) | changes sharing a `groupKey` are one event: **`shown` and `groups` carry one entry per event; `changes` is the full audit list** and may hold several entries of one event (e.g. two reports of one analyst event, or a catalyst line joined to it) (advisory #2). A catalyst line that names a firm with a new analyst change, in analyst wording (target, upgrade, initiation, rating, …), joins the group of that firm's **most significant** new analyst change (material first, then display order); duplicate catalyst lines with the same identity are one, represented by the **smallest** text | D-21 |
| `shown`, `groups`, `suppressed` | material changes sorted by class (analyst / rating / target → AI action → catalysts → price → other), then \|magnitude\| descending, then `groupKey`; one entry per `groupKey`; `groups` = number of distinct material groups; `shown` = the first **7**; `suppressed` = counts of non-material changes by kind plus `overflow` = `groups − 7` (≥ 0) | D-20 |
| Determinism | identical inputs → identical output; **the order of items in any input list does not matter** — every choice is a function of the set of items (evidence-key processing order, set-based prior state, smallest-text representatives, and a total order with a value tie-break; the first two mechanisms and the tie-break each suffice alone) | Codex #1, rev 2 |

## §3 QA — new suite `qa/evidence_changes_offline.js` (exact text §A2)

Pure Node. Snapshots are built and validated by the **real S1 module**; the real `parsePerplexityContext` builds the live-capture snapshots. The suite was written from §2 / §RT before the module (RED recorded).

| Row | Checks |
|---|---|
| EC-1 | no noise: `diff(s, later s)`; re-ordered lists; reworded dates; changed titles; **the 8 live captures** each against itself a day later → `shown` empty |
| EC-2 | price: 102.999 / 103 / 103.001 / 97 / 97.001 / 70 → 72.1 / 33.33 → 34.3299 (exactly 3 %) / 34.3298 / 250 ± 7.5 / 1.5 → 1.545; other currency and missing price → no change; `from`, `to`, `magnitude` |
| EC-3 | target: 5.00 / 4.99 / −5.00 / −4.99 % within one item; across snapshots for the same firm in another case (`ubs` vs `UBS`); another firm's target is not a change |
| EC-4 | rating-only upgrade, downgrade, initiation; the same firm's rating changed with "maintained"; reiteration suppressed and counted |
| EC-5 | AI action `hold → trim`; `null` on either side; unchanged |
| EC-6 | D-23: 9 setup pairs (4 crossing, 3 within a group, 2 with `unknown`), 4 sentiment pairs, 4 direction pairs |
| EC-7 | research unavailable on either side; first snapshot; all-null assessment |
| EC-8 | reworded date = same event; different figures / quarters = different events; structured analyst action + matching catalyst line = one entry; two events of one firm = two; duplicate lines = one |
| EC-9 | 13 material groups → 7 shown in class order, `overflow` 6, deterministic, permutation-independent, AI action before catalysts |
| EC-10 | forged S1 record (extra key) as prev / next; reversed and equal times; ticker mismatch; missing / `null` module; `undefined` inputs |
| EC-11 | canary tokens: every output string is an input value or a fixed label; group keys are hashes; exact change fields |
| EC-12 | proxies, throwing getters, cycles, primitives, arrays; a throwing validator; a hostile module; a permissive validator with hostile data → `INTERNAL`, never a throw |
| EC-13 | module source: no network, DOM, `window`, storage, `require`, `eval`, `new Function`, clock, timers, randomness, `process`; dual export guard present |
| EC-14 | `catalyst_gone`, `source_new` and a 1 % price move are counted in `suppressed`, never shown |
| EC-15 | **order independence:** 5 scenarios (same event with two targets of equal \|move\|; several earlier targets; several earlier ratings; duplicate catalyst lines in other wording; the EC-9 scenario) × every list of both snapshots reversed, rotated and seeded-shuffled → byte-identical results |
| EC-16 | **distinct evidence:** same event, targets 126 and 140 → two `target_change` kept, one shown (140); exact duplicates → one; nearest earlier target (133 → base 130, not material; 137 → material; 114 → base 120; 125 → base 120, 4.166667 %); re-reported event 125 → 132 material, → 130 not; re-reported upgrade not shown; a rating among the earlier ratings is not a change, a new one is (`from` `null` with two earlier ratings, `Buy` with one) |
| EC-17 | currency: unknown on both sides compared; unknown vs `USD` either way not compared |
| EC-18 | a joined event: two material `changes`, one `groupKey`, `groups` 1, one `shown` |
| EC-N1…N20 | price threshold 2.5 · no rounding · target threshold 4 · case-sensitive firm · unknown counts as change · every setup change material · dates not masked · numbers masked · analyst line not joined · no cap · class order changed · inputs not validated · not contained · catalyst gone material · **earlier target = last in list (rev 1)** · **evidence key without target / rating (rev 1)** · **duplicate catalyst line: first seen kept** · **no ordering guarantee** · **re-reported upgrade shown again** · **unknown currency on both sides not compared** — each makes its named rows fail |

**COWORK sandbox preflight** (git archive of the committed tip `c3d5439` = `0903940` + one `work/` file; Linux, node 22; appendices extracted from this brief):
- Suite RED without the module; **18 / 18 rows and 20 / 20 negatives PASS** with it (≈ 0.3 s). The **rev-1 module fails EC-15 and EC-16** under this suite (order-dependent output; a second same-event target lost; wrong prior target).
- Full `run-offline`: **99 → 100 suites**, the **same 17** environment-only failures as the pristine tip; Phase 3 PASS.

## §RT Risk & Test Design (spec-first)

**Task type:** storage-derived logic + parser-like text identity + financial thresholds + (future) UI noise. Spec-first matrix: `evidence-memory-1-s2.BREAKDOWN.md` §3 (written before any code); the suite above implements it; the module was written after the suite.

| Requirement | Failure mode | Test | Expected |
|---|---|---|---|
| No noise on unchanged evidence | re-ordering, re-dating, re-capture, live parser output | EC-1, EC-N7 | nothing shown |
| D-20 price | off-by-one at 3 %; float error at the boundary; currency mix | EC-2, EC-N1, EC-N2 | material from exactly 3 % |
| D-20 target | off-by-one at 5 %; firm matching | EC-3, EC-N3, EC-N4 | material from exactly 5 %, per firm |
| D-20 ratings / action | rating-only upgrade missed; reiteration shown | EC-4, EC-5 | material / suppressed |
| D-23 | any state change shown; poles confused | EC-6, EC-N6 | crossings / pole flips only |
| Unknown ≠ change | AI failure shown as "removed" | EC-5, EC-7, EC-N5 | no change |
| D-21 identity | one event twice; two events merged; numbers ignored | EC-8, EC-N8, EC-N9 | one entry per event |
| D-20 cap / order | more than 7; wrong order; nondeterminism | EC-9, EC-N10, EC-N11 | 7, ordered, stable |
| Inputs | forged / invalid records accepted | EC-10, EC-N12 | rejected with reason |
| Privacy | new text produced | EC-11 | input values and labels only |
| Never throws | hostile inputs; permissive validator | EC-12, EC-N13 | `ok: false` |
| Informational kinds | shown as news | EC-14, EC-N14 | counted only |
| Order independence (rev 2) | output depends on list order (duplicates, prior state, representatives, ties) | EC-15, EC-N15, EC-N16, EC-N17, EC-N18 | byte-identical under every permutation |
| Distinct evidence (rev 2) | same-event items collapsed; corrected target missed; re-reported upgrade repeated; wrong base | EC-16, EC-N15, EC-N16, EC-N19 | both kept, one shown; nearest earlier base |
| Currency / one entry (advisories) | null currency mishandled; "one entry" misread | EC-17, EC-18, EC-N20 | stated rules hold |

**Self-review findings (before Codex):** all were in the **suite**, none in the module: (1) EC-9 first expected 12 material groups, the scenario holds 13; (2) EC-2's "below 3 %" case 33.33 → 34.3299 is exactly 3 % (33.33 × 0.03 = 0.9999) — kept as an exact-boundary case, and 34.3298 added below it; (3) EC-8's two-event check counted an unrelated fixture catalyst; (4) EC-7 used the snapshot field name instead of S1's input flag `_unavailable`; (5) EC-12 could not detect a missing outer `try` because S1 validation runs first — a permissive-validator case was added so EC-N13 has a target.

**Rev 2 root cause:** "deterministic" was stated but only one input order was ever tested; three choices (first of equal identities, last earlier target / rating, first duplicate catalyst text) were sequence-dependent and the identity ignored target and rating. Rev 2 makes every choice a function of the item set and tests the property with permutations (EC-15) rather than with Codex's single example. A planted negative removing only the tie-break was **not** caught at first — the evidence-key processing order alone keeps the output deterministic — so EC-N18 removes both mechanisms (the defect class EC-15 must detect).

**Rev 2 held-out probe** (not in the suite): the same event in the target list and the rating-only list → one shown entry, two audit changes; a firm's catalyst line joins its material event, not its reiteration; earlier targets 110 / 130 and a new 120 → base 110 (tie: lower); a re-report that adds a rating the firm never had → rating change.

**Held-out probe (rev 1)** (not in the suite): multi-word firms (`BofA Securities`, `Morgan Stanley & Co.`) join their catalyst lines; a firm named without analyst wording stays separate; `$1,234` = `1234`; `Sept 14` = `September 14`; 33.33 → 34.9965 (exactly 5 %) is material; −90 % (split-like) is a price move.

**Accepted limits (listed, untested by design):**
- numeric dates (`10/14`) are not masked — a line re-dated from `October 14` to `10/14` shows once as new (the parser emits month-name dates; masking `n/n` would also merge real fractions);
- paraphrased descriptions of one event by different sources stay two entries until S3 canonical evidence (D-21: records are kept; exact-identity and analyst-joined events are one);
- a stock split shows as a large price move (S1 snapshots carry no split data).

## §4 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (CLAUDE.md preflight: Pattern Auditing — `services/evidence-memory.js` dual export guard and contained public API; `qa/evidence_memory_offline.js` source loading and planted negatives. State & Boundary Isolation — no `localStorage`, DOM, scoring or scan flow. Gate Verification — N/A, unwired. Definition of Done — §5) |
| S1 RED | `qa/evidence_changes_offline.js` (§A2) fails: the module is absent |
| S2 GREEN | `services/evidence-changes.js` (§A1); all rows + negatives pass |
| 8 | Codex round one (diff review) |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:** a change outside §1; any existing suite failing; a denied protected action or an integrity FAIL.

## §5 Definition of Done

1. EC-1…EC-18 and EC-N1…EC-N20 pass; `qa:offline` PASS at step 0 + 1.
2. `diffSnapshots` returns exactly the §2 shapes and never throws; thresholds 3 % / 5 % / 7 and the D-23 rules hold at their boundaries; the result does not depend on the order of items in any input list.
3. No file outside §1 changes; S1 unchanged.

## §6 Risks

| # | Risk | Control |
|---|---|---|
| R-1 | Paraphrased duplicates reach the later UI | Exact identity + analyst joining now; S3 canonical evidence later; D-21 records kept |
| R-2 | Thresholds feel wrong in use | D-20 / D-23 are initial defaults; exported as `THRESHOLDS`; a change is one constant plus its boundary tests |
| R-3 | S1 schema changes | S2 validates through S1 and fails closed (`INVALID_*`) |
| R-4 | Parser output changes | EC-1 runs the real parser on the live captures |

## §A Appendix — exact files

<!-- pep-lint:off -->
<!-- (source code to create with the Write tool, not commands) -->

### §A1 `services/evidence-changes.js` (LF)

```js
'use strict';
// services/evidence-changes.js - evidence-memory-1 S2: change engine v1 (Main Control D-19, D-20, D-21, D-23).
//
// diffSnapshots(prev, next) compares two S1 snapshots of one ticker and returns the material changes - ordered, one
// entry per real-world event, at most 7 shown - and counts what it suppressed. Pure: no network, DOM, storage, clock
// or randomness. Values in the output are copied from the snapshots or are fixed labels; group keys are hashes.
// The S1 module is injected (createChangeEngine(memoryModule)) so its validator is reused without a path import:
// Node tests pass the loaded S1 module, the browser later passes its inlined namespace.

var PRICE_PCT = 3;            // D-20: a price move is material from 3 % (inclusive)
var TARGET_PCT = 5;           // D-20: a price-target move is material from 5 % (inclusive)
var MAX_SHOWN = 7;            // D-20: at most 7 shown
// D-20 order: analyst / rating / target -> AI action -> catalysts -> price -> other
var CLASS = { analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 };
var OTHER_CLASS = 5;
// D-23: a setup change is material only when it crosses between these two groups
var SETUP_GROUP = {
  extended_near_ath: 'constructive', healthy_uptrend_near_ath: 'constructive', healthy_uptrend: 'constructive',
  pullback_in_uptrend: 'constructive', support_test: 'damaged', breakdown_risk: 'damaged', below_key_mas: 'damaged'
};
// D-23: sentiment and catalyst direction are material only when they flip between the two poles
var POLE = { positive: 1, negative: -1, bullish: 1, bearish: -1 };
var RATING_VERBS = ['upgraded', 'downgraded'];
var INITIATION_VERBS = ['initiated', 'started', 'launched', 'reinstated', 'resumed'];
var ANALYST_WORDS = /\b(?:price target|target|pt|upgrades?|upgraded|downgrades?|downgraded|initiat[a-z]*|rating|reiterat[a-z]*|overweight|underweight|outperform|underperform)\b/;
var MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
var DATE_RE = new RegExp('\\b(?:' + MONTH_WORDS + ')\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b', 'g');
var CATALYST_LISTS = ['bullish', 'bearish', 'macro'];
var CATALYST_FIELDS = ['earnings', 'guidance', 'contracts', 'peerMove'];

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function known(v) { return v !== null && v !== undefined && v !== 'unknown'; }
function num(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
function pct(a, b) { return round6((b - a) / a * 100); }
function firmKey(f) { return String(f).toLowerCase(); }

// 64-bit FNV-1a style hash (two 32-bit lanes), 16 hex characters: group keys never carry text
function hash16(str) {
  var h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 ^= (h1 >>> 7); h2 >>>= 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
function key(prefix, s) { return prefix + ':' + hash16(s); }

// Identity of a catalyst text (D-21): calendar dates masked (a reworded date is the same event); numbers kept (a
// different figure or quarter is a different event); case, currency signs, thousands separators and punctuation ignored.
function fingerprint(text) {
  var t = String(text).toLowerCase();
  t = t.replace(DATE_RE, ' ');
  t = t.replace(/[$\u20ac\u00a3\u20aa]/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2');
  return t.replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeValid(validate, s) { try { return validate(s) === true; } catch (e) { return false; } }

function fail(reason) { return { ok: false, reason: reason, changes: [], shown: [], suppressed: { overflow: 0 }, groups: 0 }; }

function classOf(kind) { return own(CLASS, kind) ? CLASS[kind] : OTHER_CLASS; }
function byOrder(a, b) {
  var ca = classOf(a.kind), cb = classOf(b.kind);
  if (ca !== cb) return ca - cb;
  var ma = a.magnitude === null ? -1 : Math.abs(a.magnitude), mb = b.magnitude === null ? -1 : Math.abs(b.magnitude);
  if (ma !== mb) return mb - ma;
  if (a.groupKey !== b.groupKey) return a.groupKey < b.groupKey ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  // total order: equal-ranked changes are ordered by their values, never by input order
  return tieKey(a) < tieKey(b) ? -1 : (tieKey(a) > tieKey(b) ? 1 : 0);
}
function tieKey(c) { return JSON.stringify([c.from, c.to, c.date, c.material]); }

function result(reason, changes) {
  changes.sort(byOrder);
  var suppressed = { overflow: 0 }, seen = {}, groupsList = [];
  for (var i = 0; i < changes.length; i++) {
    var c = changes[i];
    if (!c.material) { suppressed[c.kind] = (suppressed[c.kind] || 0) + 1; continue; }
    if (own(seen, c.groupKey)) continue;          // one entry per real-world event (D-21)
    seen[c.groupKey] = true;
    groupsList.push(c);
  }
  suppressed.overflow = Math.max(0, groupsList.length - MAX_SHOWN);
  return { ok: true, reason: reason, changes: changes, shown: groupsList.slice(0, MAX_SHOWN), suppressed: suppressed, groups: groupsList.length };
}

function analystItems(r) {
  var out = [];
  [r.analystActions, r.ratingOnlyActions].forEach(function (list) {
    if (Array.isArray(list)) list.forEach(function (a) { if (isObj(a) && typeof a.firm === 'string') out.push(a); });
  });
  return out;
}
// Event identity (one real-world event, D-21): firm + verb + date. It is the group key.
function analystIdentity(a) { return firmKey(a.firm) + '|' + (a.action || '') + '|' + (a.date || ''); }
// Evidence key: every field of the item. Items that differ in any field are distinct evidence (never collapsed);
// only exact duplicates are one item.
function evidenceKey(a) {
  return [firmKey(a.firm), a.action, a.ratingAction, a.rating, a.date, a.target, a.targetFrom, a.targetAction]
    .map(function (v) { return v === null || v === undefined ? '' : String(v); }).join('|');
}
// The earlier target nearest to x (ties: the lower one). Depends only on the set of earlier targets, not their order.
function nearest(list, x) {
  var best = null;
  for (var i = 0; i < list.length; i++) {
    var v = list[i], d = Math.abs(v - x), bd = best === null ? Infinity : Math.abs(best - x);
    if (d < bd || (d === bd && v < best)) best = v;
  }
  return best;
}

function catalystTexts(r) {
  var out = [];
  CATALYST_LISTS.forEach(function (k) { if (Array.isArray(r[k])) r[k].forEach(function (t) { if (typeof t === 'string') out.push(t); }); });
  CATALYST_FIELDS.forEach(function (k) { if (typeof r[k] === 'string') out.push(r[k]); });
  return out;
}

// A catalyst line that names a firm with a new analyst change, in analyst wording, is the same event (D-21).
function analystGroupFor(text, analystFirms) {
  var t = String(text).toLowerCase();
  if (!ANALYST_WORDS.test(t)) return null;
  var firms = Object.keys(analystFirms).sort();
  for (var i = 0; i < firms.length; i++) {
    var f = firms[i];
    if (f.length >= 3 && (' ' + t.replace(/[^a-z0-9&.' -]+/g, ' ') + ' ').indexOf(' ' + f + ' ') !== -1) return analystFirms[f];
  }
  return null;
}

function compare(prev, next) {
  var changes = [];
  function mk(kind, groupKey, from, to, magnitude, material, date) {
    return { kind: kind, groupKey: groupKey, from: from, to: to, magnitude: magnitude, material: material === true, date: date };
  }
  function add(kind, groupKey, from, to, magnitude, material, date) { changes.push(mk(kind, groupKey, from, to, magnitude, material, date)); }
  var pr = prev.research, nr = next.research;
  var researchKnown = !pr.unavailable && !nr.unavailable;   // unknown is not a change

  if (researchKnown) {
    // analyst actions and rating-only actions
    var prevItems = analystItems(pr), nextItems = analystItems(nr);
    // prior state per firm = the SET of its earlier targets and ratings (order-independent)
    var prevEvidence = {}, prevEvents = {}, priorTargets = {}, priorRatings = {};
    prevItems.forEach(function (a) {
      var fk = firmKey(a.firm);
      prevEvidence[evidenceKey(a)] = true;
      prevEvents[analystIdentity(a)] = true;
      if (num(a.target)) { priorTargets[fk] = priorTargets[fk] || []; if (priorTargets[fk].indexOf(a.target) === -1) priorTargets[fk].push(a.target); }
      if (known(a.rating)) { priorRatings[fk] = priorRatings[fk] || []; if (priorRatings[fk].indexOf(a.rating) === -1) priorRatings[fk].push(a.rating); }
    });
    var doneEvidence = {}, analystOf = [];
    nextItems.slice().sort(function (a, b) { var x = evidenceKey(a), y = evidenceKey(b); return x < y ? -1 : (x > y ? 1 : 0); }).forEach(function (a) {
      var ek = evidenceKey(a);
      if (own(prevEvidence, ek) || own(doneEvidence, ek)) return;     // seen before, or an exact duplicate
      doneEvidence[ek] = true;
      var id = analystIdentity(a), g = key('an', id), fk = firmKey(a.firm);
      var eventKnown = own(prevEvents, id);                            // a re-report of an event already seen
      var ratings = own(priorRatings, fk) ? priorRatings[fk] : [];
      var targets = own(priorTargets, fk) ? priorTargets[fk] : [];
      var verbRating = !eventKnown && (RATING_VERBS.indexOf(a.action) !== -1 || RATING_VERBS.indexOf(a.ratingAction) !== -1);
      var ratingMoved = verbRating || (known(a.rating) && ratings.length > 0 && ratings.indexOf(a.rating) === -1);
      var initiation = !eventKnown && (INITIATION_VERBS.indexOf(a.action) !== -1 || INITIATION_VERBS.indexOf(a.ratingAction) !== -1);
      var base = (!eventKnown && num(a.targetFrom)) ? a.targetFrom : (num(a.target) ? nearest(targets, a.target) : null);
      var before = ratings.length === 1 ? ratings[0] : null;
      var c;
      if (ratingMoved) c = mk('rating_change', g, before, known(a.rating) ? a.rating : null, null, true, a.date || null);
      else if (initiation) c = mk('analyst_new', g, null, known(a.rating) ? a.rating : null, null, true, a.date || null);
      else if (num(a.target) && base !== null && a.target !== base) {
        var m = pct(base, a.target);
        c = mk('target_change', g, base, a.target, m, Math.abs(m) >= TARGET_PCT, a.date || null);
      } else c = mk('analyst_new', g, null, known(a.rating) ? a.rating : null, null, false, a.date || null);
      changes.push(c);
      analystOf.push({ firm: fk, change: c });
    });
    // a firm's catalyst lines join the group of its most significant new analyst change (material first, then the
    // display order) - a function of the changes, not of input order
    var analystFirms = {};
    analystOf.slice().sort(function (x, y) { if (x.change.material !== y.change.material) return x.change.material ? -1 : 1; return byOrder(x.change, y.change); })
      .forEach(function (o) { if (!own(analystFirms, o.firm)) analystFirms[o.firm] = o.change.groupKey; });

    // catalysts: new and gone, by identity
    var prevFp = {}, nextFp = {};
    catalystTexts(pr).forEach(function (t) { var f = fingerprint(t); if (f && (!own(prevFp, f) || t < prevFp[f])) prevFp[f] = t; });
    // one representative per identity: the smallest text, so the output does not depend on which duplicate came first
    catalystTexts(nr).forEach(function (t) { var f = fingerprint(t); if (f && (!own(nextFp, f) || t < nextFp[f])) nextFp[f] = t; });
    Object.keys(nextFp).sort().forEach(function (f) {
      if (own(prevFp, f)) return;
      var text = nextFp[f];
      var joined = analystGroupFor(text, analystFirms);
      add('catalyst_new', joined || key('ct', f), null, text, null, true, null);
    });
    Object.keys(prevFp).sort().forEach(function (f) {
      if (own(nextFp, f)) return;
      var g = key('ct', f), x = prevFp[f];
      add('catalyst_gone', g, x, null, null, false, null);
    });

    // sources: a new domain is informational
    var prevDom = {};
    (Array.isArray(prev.sources) ? prev.sources : []).forEach(function (s) { if (isObj(s) && typeof s.domain === 'string') prevDom[s.domain] = true; });
    var doneDom = {};
    (Array.isArray(next.sources) ? next.sources : []).forEach(function (s) {
      if (!isObj(s) || typeof s.domain !== 'string' || own(prevDom, s.domain) || own(doneDom, s.domain)) return;
      doneDom[s.domain] = true;
      add('source_new', key('so', s.domain), null, s.domain, null, false, null);
    });
  }

  // assessment
  var pa = isObj(prev.assessment) ? prev.assessment : {}, na = isObj(next.assessment) ? next.assessment : {};
  var a = pa.action, b = na.action;
  if (known(a) && known(b) && a !== b) add('ai_action_change', key('ai', a + '>' + b), a, b, null, true, null);
  a = pa.technicalSetup; b = na.technicalSetup;
  if (known(a) && known(b) && a !== b) {
    var rule = { material: SETUP_GROUP[a] !== SETUP_GROUP[b] };
    add('setup_change', key('su', a + '>' + b), a, b, null, rule.material, null);
  }
  a = pa.sentiment; b = na.sentiment;
  if (known(a) && known(b) && a !== b) add('sentiment_change', key('se', a + '>' + b), a, b, null, (POLE[a] || 0) * (POLE[b] || 0) === -1, null);
  a = pa.catalystDirection; b = na.catalystDirection;
  if (known(a) && known(b) && a !== b) add('direction_change', key('di', a + '>' + b), a, b, null, (POLE[a] || 0) * (POLE[b] || 0) === -1, null);

  // price (same currency only)
  var pm = isObj(prev.market) ? prev.market : {}, nm = isObj(next.market) ? next.market : {};
  if (num(pm.price) && num(nm.price) && (pm.currency || null) === (nm.currency || null) && pm.price !== nm.price) {
    var mv = pct(pm.price, nm.price);
    add('price_move', key('px', 'price'), pm.price, nm.price, mv, Math.abs(mv) >= PRICE_PCT, null);
  }
  return changes;
}

function createChangeEngine(mem) {
  var validate = null;
  try { validate = (mem && typeof mem.validateSnapshot === 'function') ? mem.validateSnapshot : null; } catch (e) { validate = null; }
  function diff(validate, prev, next) {
    if (prev === null) return safeValid(validate, next) ? result('FIRST_SNAPSHOT', []) : fail('INVALID_NEXT');
    if (!safeValid(validate, prev)) return fail('INVALID_PREV');
    if (!safeValid(validate, next)) return fail('INVALID_NEXT');
    if (prev.ticker !== next.ticker) return fail('TICKER_MISMATCH');
    if (!(prev.capturedAt < next.capturedAt)) return fail('NOT_LATER');
    return result(null, compare(prev, next));
  }
  function diffSnapshots(prev, next) {
    if (!validate) return fail('NO_VALIDATOR');
    try { return diff(validate, prev, next); } catch (e) { return fail('INTERNAL'); }
  }
  return { diffSnapshots: diffSnapshots };
}

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain script
// (matching services/evidence-memory.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    THRESHOLDS: { pricePct: PRICE_PCT, targetPct: TARGET_PCT, maxShown: MAX_SHOWN },
    createChangeEngine: createChangeEngine
  };
}
```

### §A2 `qa/evidence_changes_offline.js` (LF)

```js
#!/usr/bin/env node
'use strict';
/*
 * qa/evidence_changes_offline.js - evidence-memory-1 S2: change engine v1 (Main Control D-19, D-20, D-21, D-23).
 *
 * Written from the brief's contract (section 2) and Risk & Test Design (section RT) BEFORE the module existed.
 * Snapshots are built with the real S1 module (services/evidence-memory.js), so every input is a valid S1 record
 * unless a row forges one on purpose. Pure Node: no network, no browser, no storage.
 *
 *   EC-1  no noise: diff(s, s) and re-ordered / re-dated / re-captured copies show nothing (incl. the 8 live captures)
 *   EC-2  D-20 price move: material from exactly 3 % (rounded to 6 decimals); missing price or other currency: nothing
 *   EC-3  D-20 target move: material from exactly 5 %, per firm (case-insensitive), within one item or across snapshots
 *   EC-4  ratings: upgrade / downgrade / initiation / cross-snapshot rating change material; reiteration suppressed
 *   EC-5  AI action label change material; a missing value on either side is no change
 *   EC-6  D-23 setup (group crossing only), sentiment (positive <-> negative only), direction (bullish <-> bearish only)
 *   EC-7  unknown is not a change: unavailable research, null fields, first snapshot
 *   EC-8  D-21 identity: one shown entry per event; analyst text in a catalyst list joins the analyst entry; dates
 *         masked, numbers kept; two different events stay two
 *   EC-9  cap 7 and class order (analyst -> AI action -> catalysts -> price -> other); overflow counted; deterministic
 *   EC-10 inputs: forged / invalid snapshots, wrong order, equal times, ticker mismatch, missing validator
 *   EC-11 privacy: every output string is an input value or a fixed label; group keys are hashes
 *   EC-12 never throws on hostile input
 *   EC-13 purity: no network, DOM, storage, clock, randomness, require or eval in the module
 *   EC-14 informational kinds (catalyst gone, new source domain, sub-threshold moves) are counted, never shown
 *   EC-15 order independence (rev 2): every list of both snapshots reversed, rotated and shuffled (seeded) gives a
 *         byte-identical result - same-event items with different targets, several earlier targets / ratings, duplicate
 *         catalyst lines in different wording, ties in magnitude, the EC-9 scenario
 *   EC-16 distinct analyst evidence (rev 2): same-event items with different targets are both kept (one shown entry);
 *         the nearest earlier target is the base; a re-reported event compares with its earlier report and does not
 *         repeat its rating change; a rating already among the firm's earlier ratings is not a change
 *   EC-17 unknown currency on both sides is the same series; unknown vs a known currency is not compared (advisory)
 *   EC-18 shown / groups carry one entry per event; changes is the full audit list (advisory)
 *   EC-N1..N20 planted negatives (each mutates the module source; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const S1_SRC = fs.readFileSync(path.join(ROOT, 'services', 'evidence-memory.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'services', 'evidence-changes.js'), 'utf8');
function load(src) { const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); return m.exports; }
const S1 = load(S1_SRC);

const T0 = Date.UTC(2026, 9, 16, 20, 0, 0);
const HOUR = 3600000, DAY = 86400000;
const iso = ms => new Date(ms).toISOString();

// ---- fixtures (S1 input shape; built and validated by S1) ----
function research(over) {
  return Object.assign({
    analystActions: [{ bank: 'UBS', action: 'raised', target: 125, ptFrom: 120, ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', raw: 'UBS raised PT to $125 from $120 (October 14)' }],
    ratingOnlyActions: [],
    bullishCatalysts: ['Cloud revenue grew 54% in Q3 (October 14)'],
    bearishCatalysts: ['Consensus targets include a low of $51'],
    macroDrivers: [],
    earnings: 'NONE', guidance: '', contracts: '', peerMove: '',
    revisionDirection: 'upgrading', revisionRecency: 'October 14', dataFreshness: 'today',
    sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 'UBS lifts target', date: '2026-10-14' }],
    _allNone: false
  }, over || {});
}
function input(over) {
  return Object.assign({
    ticker: 'FROG', capturedAt: iso(T0),
    research: research(),
    assessment: { action: 'hold', technicalSetup: 'healthy_uptrend', sentiment: 'positive', sentimentScore: 61, catalystDirection: 'bullish' },
    market: { price: 100, currency: 'USD' }
  }, over || {});
}
function snap(over) {
  const b = S1.buildSnapshot(input(over));
  if (!b.ok) throw new Error('fixture invalid: ' + b.reason);
  return b.snapshot;
}
const later = (over, hours) => snap(Object.assign({ capturedAt: iso(T0 + (hours || 24) * HOUR) }, over || {}));
const assess = o => Object.assign({ action: 'hold', technicalSetup: 'healthy_uptrend', sentiment: 'positive', sentimentScore: 61, catalystDirection: 'bullish' }, o);
const kinds = r => r.shown.map(c => c.kind);
const has = (r, kind) => r.changes.some(c => c.kind === kind && c.material);
const shownHas = (r, kind) => r.shown.some(c => c.kind === kind);
function allStrings(v, acc) {
  acc = acc || [];
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach(x => allStrings(x, acc));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => allStrings(v[k], acc));
  return acc;
}

async function rows(M, src, only) {
  const R = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in R) || R[id] === true) R[id] = cond ? true : (detail || 'fail'); };
  const guard = (id, fn) => { try { fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };
  const E = M.createChangeEngine(S1);
  const D = (a, b) => E.diffSnapshots(a, b);

  if (want('EC-1')) guard('EC-1', () => {
    const a = snap();
    const self = D(a, later());
    ok('EC-1', self.ok && self.shown.length === 0 && self.changes.every(c => !c.material), JSON.stringify(self.shown));
    // re-ordered lists, re-ordered sources, reworded dates in catalyst text, other title: nothing material
    const b = later({ research: research({
      bullishCatalysts: ['Cloud revenue grew 54% in Q3 (Oct 14)'],
      bearishCatalysts: ['Consensus targets include a low of $51.'],
      sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 'Another headline', date: '2026-10-14' }] }) });
    const r = D(a, b);
    ok('EC-1', r.ok && r.shown.length === 0, 'reworded: ' + JSON.stringify(r.shown));
    const c1 = snap({ research: research({ bullishCatalysts: ['A first item', 'B second item', 'C third item'] }) });
    const c2 = later({ research: research({ bullishCatalysts: ['C third item', 'A first item', 'B second item'] }) });
    ok('EC-1', D(c1, c2).shown.length === 0, 'order');
    // the 8 live captures, each against itself one day later
    const ix = path.join(ROOT, 'index.html'), fxp = path.join(ROOT, 'qa', 'fixtures', 'research-live-2026-10-15.json');
    if (fs.existsSync(ix) && fs.existsSync(fxp)) {
      const t = fs.readFileSync(ix, 'utf8').replace(/\r\n/g, '\n');
      const st = t.indexOf('function parsePerplexityContext('); const bi = t.indexOf('{', st); let d = 0, end = -1;
      for (let i = bi; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
      const ctx = { console: { log() {}, warn() {} } }; vm.createContext(ctx); vm.runInContext(t.slice(st, end) + ';this.P=parsePerplexityContext', ctx);
      const fx = JSON.parse(fs.readFileSync(fxp, 'utf8')); const caps = fx.captures || fx; let n = 0;
      for (const cap of caps) {
        const p = ctx.P(cap.raw, [])[cap.ticker];
        const mk = ms => S1.buildSnapshot({ ticker: cap.ticker, capturedAt: iso(ms), research: p, assessment: assess({}), market: { price: 50, currency: 'USD' } });
        const x = mk(T0), y = mk(T0 + DAY);
        if (!x.ok || !y.ok) continue;
        n++;
        const rr = D(x.snapshot, y.snapshot);
        if (!(rr.ok && rr.shown.length === 0)) ok('EC-1', false, cap.key + ': ' + JSON.stringify(rr.shown));
      }
      ok('EC-1', n >= 8, 'live captures ' + n);
    }
  });

  if (want('EC-2')) guard('EC-2', () => {
    const px = (a, b, ca, cb) => D(snap({ market: { price: a, currency: ca || 'USD' } }), later({ market: { price: b, currency: cb || 'USD' } }));
    const cases = [[100, 102.999, false], [100, 103, true], [100, 103.001, true], [100, 97, true], [100, 97.001, false],
      [70, 72.1, true], [33.33, 34.3299, true], [33.33, 34.3298, false], [250, 257.5, true], [250, 242.5, true], [1.5, 1.545, true]];
    const bad = cases.filter(([a, b, m]) => has(px(a, b), 'price_move') !== m).map(c => c.join('->'));
    ok('EC-2', bad.length === 0, JSON.stringify(bad));
    ok('EC-2', !px(100, 110, 'USD', 'ILS').changes.some(c => c.kind === 'price_move'), 'currency mismatch');
    const noPrice = D(snap({ market: { currency: 'USD' } }), later({ market: { price: 110, currency: 'USD' } }));
    ok('EC-2', !noPrice.changes.some(c => c.kind === 'price_move'), 'missing price');
    const m = px(100, 103).changes.find(c => c.kind === 'price_move');
    ok('EC-2', m && m.from === 100 && m.to === 103 && m.magnitude === 3, JSON.stringify(m));
  });

  if (want('EC-3')) guard('EC-3', () => {
    const act = (o) => Object.assign({ bank: 'UBS', action: 'raised', ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', raw: 'UBS (October 15)' }, o);
    const one = o => D(snap({ research: research({ analystActions: [] }) }), later({ research: research({ analystActions: [act(o)] }) }));
    const within = [[100, 105, true], [100, 104.99, false], [100, 95, true], [100, 95.01, false], [120, 126, true]];
    const bad = within.filter(([f, t, m]) => has(one({ ptFrom: f, target: t }), 'target_change') !== m).map(c => c.join('->'));
    ok('EC-3', bad.length === 0, 'within ' + JSON.stringify(bad));
    // across snapshots: same firm (case-insensitive), no targetFrom in the new item
    const prevS = snap({ research: research({ analystActions: [act({ target: 120, ptFrom: undefined, raw: 'UBS (October 14)' })] }) });
    const cross = t => D(prevS, later({ research: research({ analystActions: [act({ bank: 'ubs', target: t, ptFrom: undefined, raw: 'ubs (October 16)' })] }) }));
    ok('EC-3', has(cross(126), 'target_change') && !has(cross(125.9), 'target_change') && has(cross(114), 'target_change'), 'cross');
    // a different firm's target is not a change for UBS
    const other = D(prevS, later({ research: research({ analystActions: [act({ target: 120, ptFrom: undefined, raw: 'UBS (October 14)' }), act({ bank: 'Jefferies', target: 200, ptFrom: undefined, raw: 'Jefferies (October 16)' })] }) }));
    ok('EC-3', !has(other, 'target_change'), 'other firm');
  });

  if (want('EC-4')) guard('EC-4', () => {
    const ro = o => Object.assign({ bank: 'Wall Street Zen', raw: 'Wall Street Zen (October 15)' }, o);
    const add = list => D(snap({ research: research({ ratingOnlyActions: [] }) }), later({ research: research({ ratingOnlyActions: list }) }));
    ok('EC-4', has(add([ro({ action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy' })]), 'rating_change'), 'upgrade');
    ok('EC-4', has(add([ro({ action: 'downgraded', ratingAction: 'downgraded', rating: 'Hold' })]), 'rating_change'), 'downgrade');
    const ini = add([ro({ bank: 'Mizuho', action: 'initiated', ratingAction: 'initiated', rating: 'Outperform', raw: 'Mizuho (October 15)' })]);
    ok('EC-4', ini.shown.some(c => c.kind === 'analyst_new' && c.material), 'initiation ' + JSON.stringify(ini.shown));
    // the same firm with a different rating across snapshots, verb "maintained": a rating change
    const p = snap({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Buy', raw: 'Wall Street Zen (October 10)' })] }) });
    const n = later({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Hold' })] }) });
    ok('EC-4', has(D(p, n), 'rating_change'), 'cross-snapshot rating');
    // reiteration: same rating, no target -> suppressed and counted
    const rei = D(p, later({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Buy', raw: 'Wall Street Zen (October 10)' }), ro({ action: 'reiterated', rating: 'Buy' })] }) }));
    ok('EC-4', rei.shown.length === 0 && (rei.suppressed.analyst_new || 0) >= 1, 'reiteration ' + JSON.stringify(rei));
  });

  if (want('EC-5')) guard('EC-5', () => {
    const a = (x, y) => D(snap({ assessment: assess({ action: x }) }), later({ assessment: assess({ action: y }) }));
    const r = a('hold', 'trim');
    const c = r.shown.find(k => k.kind === 'ai_action_change');
    ok('EC-5', c && c.from === 'hold' && c.to === 'trim' && c.material, JSON.stringify(r.shown));
    ok('EC-5', !a('hold', null).changes.some(k => k.kind === 'ai_action_change') && !a(null, 'trim').changes.some(k => k.kind === 'ai_action_change'), 'null side');
    ok('EC-5', a('hold', 'hold').shown.length === 0, 'same');
  });

  if (want('EC-6')) guard('EC-6', () => {
    const st = (x, y) => has(D(snap({ assessment: assess({ technicalSetup: x }) }), later({ assessment: assess({ technicalSetup: y }) })), 'setup_change');
    const setups = [['healthy_uptrend', 'breakdown_risk', true], ['extended_near_ath', 'below_key_mas', true], ['support_test', 'healthy_uptrend_near_ath', true],
      ['pullback_in_uptrend', 'support_test', true], ['healthy_uptrend', 'pullback_in_uptrend', false], ['support_test', 'below_key_mas', false],
      ['extended_near_ath', 'healthy_uptrend', false], ['unknown', 'breakdown_risk', false], ['healthy_uptrend', 'unknown', false]];
    const se = (x, y) => has(D(snap({ assessment: assess({ sentiment: x }) }), later({ assessment: assess({ sentiment: y }) })), 'sentiment_change');
    const sents = [['positive', 'negative', true], ['negative', 'positive', true], ['positive', 'neutral', false], ['neutral', 'negative', false]];
    const di = (x, y) => has(D(snap({ assessment: assess({ catalystDirection: x }) }), later({ assessment: assess({ catalystDirection: y }) })), 'direction_change');
    const dirs = [['bullish', 'bearish', true], ['bearish', 'bullish', true], ['bullish', 'mixed', false], ['mixed', 'bearish', false]];
    const bad = [].concat(setups.filter(([a, b, m]) => st(a, b) !== m).map(c => 'setup ' + c.join('->')),
      sents.filter(([a, b, m]) => se(a, b) !== m).map(c => 'sent ' + c.join('->')), dirs.filter(([a, b, m]) => di(a, b) !== m).map(c => 'dir ' + c.join('->')));
    ok('EC-6', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-7')) guard('EC-7', () => {
    const a = snap();
    const un = later({ research: research({ _unavailable: true, analystActions: [], bullishCatalysts: [], bearishCatalysts: [] }) });
    const r1 = D(a, un), r2 = D(un, later({}, 48));
    const resKinds = ['analyst_new', 'rating_change', 'target_change', 'catalyst_new', 'catalyst_gone', 'source_new'];
    ok('EC-7', r1.ok && r2.ok && !r1.changes.some(c => resKinds.includes(c.kind)) && !r2.changes.some(c => resKinds.includes(c.kind)), 'unavailable');
    const f = D(null, a);
    ok('EC-7', f.ok === true && f.reason === 'FIRST_SNAPSHOT' && f.shown.length === 0 && f.changes.length === 0, JSON.stringify(f));
    const nul = D(snap({ assessment: {} }), later({ assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }) }));
    ok('EC-7', !nul.changes.some(c => ['ai_action_change', 'setup_change', 'sentiment_change', 'direction_change'].includes(c.kind)), 'null assessment');
  });

  if (want('EC-8')) guard('EC-8', () => {
    // a reworded date only: same event
    const p = snap({ research: research({ bullishCatalysts: ['Signed a cloud contract with the Army (October 14)'] }) });
    const n = later({ research: research({ bullishCatalysts: ['Signed a cloud contract with the Army (Oct 14, 2026)'] }) });
    ok('EC-8', !has(D(p, n), 'catalyst_new'), 'date reworded');
    // numbers are kept: a different quarter / figure is a different event
    const q = D(snap({ research: research({ bullishCatalysts: ['Revenue grew 20% in Q3'] }) }), later({ research: research({ bullishCatalysts: ['Revenue grew 25% in Q4'] }) }));
    ok('EC-8', has(q, 'catalyst_new'), 'numbers kept');
    // the same analyst event as a structured action and as catalyst text: one shown entry
    const base = snap({ research: research({ analystActions: [], bullishCatalysts: [] }) });
    const both = later({ research: research({ analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Jefferies (October 15)' }],
      bullishCatalysts: ['Jefferies raised its price target to $230 (October 15)'] }) });
    const r = D(base, both);
    const groups = new Set(r.shown.map(c => c.groupKey));
    ok('EC-8', r.shown.length === 1 && groups.size === 1 && r.shown[0].kind === 'target_change' && r.groups === 1, 'merged ' + JSON.stringify(r.shown));
    // two different events from the same firm (different dates): two entries
    const two = later({ research: research({ ratingOnlyActions: [
      { bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 12)' },
      { bank: 'Mizuho', action: 'downgraded', ratingAction: 'downgraded', rating: 'Hold', raw: 'Mizuho (October 15)' }] }) });
    const r2 = D(base, two);
    const rc = r2.shown.filter(c => c.kind === 'rating_change');
    ok('EC-8', rc.length === 2 && new Set(rc.map(c => c.groupKey)).size === 2, 'two events ' + JSON.stringify(r2.shown));
    // the same item listed twice in one snapshot is one entry
    const dup = D(base, later({ research: research({ analystActions: [], bullishCatalysts: ['New AI chip launched (October 15)', 'New AI chip launched (Oct 15)'] }) }));
    ok('EC-8', dup.shown.filter(c => c.kind === 'catalyst_new').length === 1, 'duplicate line');
  });

  if (want('EC-9')) guard('EC-9', () => {
    const p = snap({ research: research({ analystActions: [], bullishCatalysts: [], bearishCatalysts: [] }), assessment: assess({}), market: { price: 100, currency: 'USD' } });
    const big = later({
      research: research({
        analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', raw: 'Jefferies (October 15)' }],
        ratingOnlyActions: [{ bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' },
          { bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' }],
        bullishCatalysts: ['Won a defense contract', 'Opened a new factory', 'Launched a new product line'],
        bearishCatalysts: ['Lost a major customer', 'Faces a patent lawsuit'] }),
      assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }),
      market: { price: 90, currency: 'USD' } });
    const r = D(p, big);
    const mat = r.changes.filter(c => c.material);
    const classOf = k => ({ analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 })[k] || 5;
    const cls = r.shown.map(c => classOf(c.kind));
    const sorted = cls.every((c, i) => i === 0 || cls[i - 1] <= c);
    ok('EC-9', r.shown.length === 7 && sorted && r.groups === mat.length && r.suppressed.overflow === r.groups - 7 && r.groups === 13, JSON.stringify({ n: r.shown.length, cls, groups: r.groups, over: r.suppressed.overflow }));
    ok('EC-9', JSON.stringify(D(p, big)) === JSON.stringify(r), 'deterministic');
    // permuting the input lists does not change the result
    const big2 = later({
      research: research({
        analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', raw: 'Jefferies (October 15)' }],
        ratingOnlyActions: [{ bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' },
          { bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' }],
        bullishCatalysts: ['Launched a new product line', 'Won a defense contract', 'Opened a new factory'],
        bearishCatalysts: ['Faces a patent lawsuit', 'Lost a major customer'] }),
      assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }),
      market: { price: 90, currency: 'USD' } });
    ok('EC-9', JSON.stringify(D(p, big2).shown) === JSON.stringify(r.shown), 'permutation');
    // within the analyst class the larger magnitude comes first; a catalyst never precedes the AI action
    const ai = r.shown.findIndex(c => c.kind === 'ai_action_change'), cat = r.shown.findIndex(c => c.kind === 'catalyst_new');
    ok('EC-9', ai !== -1 && (cat === -1 || cat > ai), 'ai before catalysts');
  });

  if (want('EC-10')) guard('EC-10', () => {
    const a = snap(), b = later();
    const forged = JSON.parse(JSON.stringify(b)); forged.research.note = 'x';
    const r1 = D(a, forged), r2 = D(forged, b), r3 = D(b, a), r4 = D(a, JSON.parse(JSON.stringify(a)));
    const toad = S1.buildSnapshot(input({ ticker: 'TOAD', capturedAt: iso(T0 + DAY) })).snapshot;
    const r5 = D(a, toad);
    const noV = M.createChangeEngine({}).diffSnapshots(a, b);
    const nul = M.createChangeEngine(null).diffSnapshots(a, b);
    const empty = r => r.shown.length === 0 && r.changes.length === 0;
    ok('EC-10', !r1.ok && r1.reason === 'INVALID_NEXT' && empty(r1) && !r2.ok && r2.reason === 'INVALID_PREV' && !r3.ok && r3.reason === 'NOT_LATER' &&
      !r4.ok && r4.reason === 'NOT_LATER' && !r5.ok && r5.reason === 'TICKER_MISMATCH' && !noV.ok && noV.reason === 'NO_VALIDATOR' && !nul.ok && nul.reason === 'NO_VALIDATOR',
      JSON.stringify([r1.reason, r2.reason, r3.reason, r4.reason, r5.reason, noV.reason, nul.reason]));
    ok('EC-10', !D(undefined, b).ok && !D(a, undefined).ok && D(undefined, b).reason === 'INVALID_PREV', 'undefined');
  });

  if (want('EC-11')) guard('EC-11', () => {
    const p = snap({ research: research({ analystActions: [], bullishCatalysts: ['Kestrelquux item one'] }) });
    const n = later({ research: research({
      analystActions: [{ bank: 'Zorblat Capital', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Zorblat Capital (October 15)' }],
      bullishCatalysts: ['Plinkety canary event happened'], bearishCatalysts: ['Wobblefrost risk appeared'],
      sources: [{ url: 'https://news.quibbleton.com/a', title: 'Grommitz title', date: '2026-10-15' }] }),
      assessment: assess({ action: 'trim' }) });
    const r = D(p, n);
    const inputs = new Set(allStrings([p, n]));
    const fixed = new Set(['analyst_new', 'rating_change', 'target_change', 'catalyst_new', 'catalyst_gone', 'ai_action_change', 'setup_change',
      'sentiment_change', 'direction_change', 'price_move', 'source_new', 'FIRST_SNAPSHOT']);
    const strs = allStrings(r).filter(s => !/^(an|ra|ct|ai|px|su|se|di|so):[0-9a-f]{16}$/.test(s));
    const foreign = strs.filter(s => !inputs.has(s) && !fixed.has(s));
    const keysOk = r.changes.every(c => /^(an|ra|ct|ai|px|su|se|di|so):[0-9a-f]{16}$/.test(c.groupKey));
    ok('EC-11', foreign.length === 0 && keysOk, JSON.stringify({ foreign, keysOk }));
    const fields = r.changes.every(c => Object.keys(c).sort().join(',') === 'date,from,groupKey,kind,magnitude,material,to');
    ok('EC-11', fields, 'change fields ' + JSON.stringify(r.changes[0]));
  });

  if (want('EC-12')) guard('EC-12', () => {
    const boom = () => { throw new Error('hostile'); };
    const prox = new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom });
    const getter = (() => { const o = JSON.parse(JSON.stringify(snap())); Object.defineProperty(o, 'research', { get: boom, enumerable: true }); return o; })();
    const cyc = (() => { const o = JSON.parse(JSON.stringify(later())); o.self = o; return o; })();
    const a = snap();
    const bad = [];
    for (const [x, y, l] of [[prox, a, 'proxy prev'], [a, prox, 'proxy next'], [getter, a, 'getter'], [a, cyc, 'cycle'], [1, 'x', 'prims'], [[], {}, 'arrays']]) {
      try { const r = D(x, y); if (!r || r.ok !== false || !Array.isArray(r.shown)) bad.push(l + ' shape'); } catch (e) { bad.push(l + ' threw'); }
    }
    const throwingS1 = { validateSnapshot: boom };
    try { const r = M.createChangeEngine(throwingS1).diffSnapshots(a, later()); if (r.ok !== false) bad.push('validator throws'); } catch (e) { bad.push('validator threw out'); }
    try { M.createChangeEngine(prox); } catch (e) { bad.push('factory threw'); }
    // contained even when the injected validator lets hostile data through (defence in depth: the engine itself never throws)
    try { const r = M.createChangeEngine({ validateSnapshot: () => true }).diffSnapshots(prox, getter); if (r.ok !== false || r.reason !== 'INTERNAL') bad.push('permissive validator: ' + r.reason); } catch (e) { bad.push('permissive validator threw'); }
    ok('EC-12', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-13')) guard('EC-13', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bdocument\b/, /\bwindow\b/, /localStorage|sessionStorage|indexedDB/, /\brequire\s*\(/, /\beval\s*\(/,
      /new Function/, /Math\.random/, /Date\.now|new Date\s*\(/, /\bsetTimeout\b|\bsetInterval\b/, /process\./];
    const hits = banned.filter(re => re.test(code)).map(String);
    ok('EC-13', hits.length === 0 && /typeof module !== 'undefined' && module\.exports/.test(src), JSON.stringify(hits));
  });

  if (want('EC-14')) guard('EC-14', () => {
    const p = snap({ research: research({ bullishCatalysts: ['Old event that went away'] }) });
    const n = later({ research: research({ bullishCatalysts: [], sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 't', date: '2026-10-14' }, { url: 'https://www.ft.com/content/frog', title: 't2', date: '2026-10-15' }] }),
      market: { price: 101, currency: 'USD' } });
    const r = D(p, n);
    ok('EC-14', r.shown.length === 0 && r.suppressed.catalyst_gone === 1 && r.suppressed.source_new === 1 && r.suppressed.price_move === 1 &&
      r.changes.filter(c => c.kind === 'catalyst_gone' || c.kind === 'source_new').every(c => c.material === false), JSON.stringify(r));
  });

  // ---- rev 2 rows ----
  const aa = (bank, o) => Object.assign({ bank: bank, action: 'raised', ptAction: 'raised', rating: 'Buy', ratingAction: 'maintained', raw: bank + ' (October 15)' }, o);
  const withLists = (r, perm) => {
    const out = Object.assign({}, r);
    ['analystActions', 'ratingOnlyActions', 'bullishCatalysts', 'bearishCatalysts', 'macroDrivers', 'sources'].forEach(k => { if (Array.isArray(r[k])) out[k] = perm(r[k].slice()); });
    return out;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const PERMS = [a => a, a => a.reverse(), a => a.length ? a.slice(1).concat(a.slice(0, 1)) : a].concat(Array.from({ length: 8 }, () => a => shuffle(a)));
  // each scenario: [label, prev research over, next research over, prev assessment, next assessment, prev price, next price]
  const SCEN = [
    ['same event, two targets, equal |move|', { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' })] },
      { analystActions: [aa('UBS', { target: 126 }), aa('UBS', { target: 114 }), aa('Jefferies', { target: 230, ptFrom: 200 })] }],
    ['several earlier targets', { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' })] },
      { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' }), aa('UBS', { target: 133 })] }],
    ['several earlier ratings', { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Buy', raw: 'WSZ (October 1)' }, { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 5)' }] },
      { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }, { bank: 'Baird', action: 'upgraded', rating: 'Buy', raw: 'Baird (October 15)' }] }],
    ['duplicate catalyst lines, other wording', { bullishCatalysts: [] },
      { bullishCatalysts: ['New AI chip launched (Oct 15)', 'New AI chip launched (October 15)', 'Signed a deal'], bearishCatalysts: ['Signed a deal.'] }],
    ['EC-9 scenario', { analystActions: [], bullishCatalysts: [], bearishCatalysts: [] },
      { analystActions: [aa('Jefferies', { target: 230, ptFrom: 200 })],
        ratingOnlyActions: [{ bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' }, { bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' }],
        bullishCatalysts: ['Won a defense contract', 'Opened a new factory', 'Launched a new product line'], bearishCatalysts: ['Lost a major customer', 'Faces a patent lawsuit'] }]
  ];

  if (want('EC-15')) guard('EC-15', () => {
    const bad = [];
    for (const [label, po, no] of SCEN) {
      let ref = null;
      for (let i = 0; i < PERMS.length; i++) for (let j = 0; j < PERMS.length; j += 3) {
        const p = snap({ research: research(withLists(Object.assign({ analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] }, po), PERMS[j])) });
        const n = later({ research: research(withLists(Object.assign({ analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] }, no), PERMS[i])) });
        const out = JSON.stringify(D(p, n));
        if (ref === null) ref = out; else if (out !== ref) { bad.push(label + ' perm ' + i + '/' + j); break; }
      }
    }
    ok('EC-15', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-16')) guard('EC-16', () => {
    const base = { analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] };
    const R = (po, no) => D(snap({ research: research(Object.assign({}, base, po)) }), later({ research: research(Object.assign({}, base, no)) }));
    const tc = r => r.changes.filter(c => c.kind === 'target_change');
    const bad = [];
    // same event, two different targets: both kept as evidence, one shown entry (the larger move)
    const r1 = R({ analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' })] }, { analystActions: [aa('UBS', { target: 126 }), aa('UBS', { target: 140 })] });
    if (!(tc(r1).length === 2 && tc(r1).every(c => c.material) && new Set(tc(r1).map(c => c.groupKey)).size === 1 && r1.groups === 1 && r1.shown.length === 1 && r1.shown[0].to === 140 && r1.shown[0].from === 120)) bad.push('two targets ' + JSON.stringify(r1.changes));
    // exact duplicates are one item
    const r1b = R({}, { analystActions: [aa('UBS', { target: 140, ptFrom: 120 }), aa('UBS', { target: 140, ptFrom: 120 })] });
    if (tc(r1b).length !== 1) bad.push('exact duplicate');
    // several earlier targets: the nearest one is the base
    const prev2 = { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' })] };
    const near = t => tc(R(prev2, { analystActions: prev2.analystActions.concat([aa('UBS', { target: t })]) }))[0];
    const n133 = near(133), n137 = near(137), n114 = near(114), n125 = near(125);
    if (!(n133 && n133.from === 130 && n133.material === false && n137 && n137.from === 130 && n137.material === true && n114 && n114.from === 120 && n114.material === true && n125 && n125.from === 120 && n125.magnitude === 4.166667))
      bad.push('nearest ' + JSON.stringify([n133, n137, n114, n125]));
    // a re-reported event (same firm, verb and date) with a corrected target compares with its earlier report
    const prev3 = { analystActions: [aa('UBS', { target: 125, ptFrom: 120, raw: 'UBS (October 14)' })] };
    const c132 = tc(R(prev3, { analystActions: [aa('UBS', { target: 132, ptFrom: 120, raw: 'UBS (October 14)' })] }))[0];
    const c130 = tc(R(prev3, { analystActions: [aa('UBS', { target: 130, ptFrom: 120, raw: 'UBS (October 14)' })] }))[0];
    if (!(c132 && c132.from === 125 && c132.to === 132 && c132.material === true && c130 && c130.from === 125 && c130.material === false)) bad.push('re-report ' + JSON.stringify([c132, c130]));
    // a re-reported upgrade is not shown again; a rating already among the earlier ratings is not a change
    const up = R({ analystActions: [aa('Jefferies', { action: 'upgraded', ratingAction: 'upgraded', target: 200, raw: 'Jefferies (October 14)' })] },
      { analystActions: [aa('Jefferies', { action: 'upgraded', ratingAction: 'upgraded', target: 205, raw: 'Jefferies (October 14)' })] });
    if (up.changes.some(c => c.kind === 'rating_change') || up.shown.length !== 0) bad.push('re-reported upgrade ' + JSON.stringify(up.shown));
    const two = { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Buy', raw: 'WSZ (October 1)' }, { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 5)' }] };
    const keepHold = R(two, { ratingOnlyActions: two.ratingOnlyActions.concat([{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }]) });
    const toSell = R(two, { ratingOnlyActions: two.ratingOnlyActions.concat([{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Sell', raw: 'WSZ (October 15)' }]) });
    const rs = toSell.changes.find(c => c.kind === 'rating_change');
    if (keepHold.changes.some(c => c.kind === 'rating_change') || !(rs && rs.material && rs.from === null && rs.to === 'Sell')) bad.push('earlier ratings ' + JSON.stringify([keepHold.changes, rs]));
    const one = R({ ratingOnlyActions: [two.ratingOnlyActions[0]] }, { ratingOnlyActions: [two.ratingOnlyActions[0], { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }] });
    const r1r = one.changes.find(c => c.kind === 'rating_change');
    if (!(r1r && r1r.from === 'Buy' && r1r.to === 'Hold')) bad.push('single earlier rating ' + JSON.stringify(r1r));
    ok('EC-16', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-17')) guard('EC-17', () => {
    const px = (ca, cb) => D(snap({ market: ca === undefined ? { price: 100 } : { price: 100, currency: ca } }), later({ market: cb === undefined ? { price: 110 } : { price: 110, currency: cb } }));
    const both = px(undefined, undefined), mixed1 = px(undefined, 'USD'), mixed2 = px('USD', undefined);
    ok('EC-17', has(both, 'price_move') && !mixed1.changes.some(c => c.kind === 'price_move') && !mixed2.changes.some(c => c.kind === 'price_move'), 'currency');
  });

  if (want('EC-18')) guard('EC-18', () => {
    const base = snap({ research: research({ analystActions: [], bullishCatalysts: [] }) });
    const both = later({ research: research({ analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Jefferies (October 15)' }],
      bullishCatalysts: ['Jefferies raised its price target to $230 (October 15)'] }) });
    const r = D(base, both);
    const g = r.changes.filter(c => c.material).map(c => c.groupKey);
    ok('EC-18', r.changes.filter(c => c.material).length === 2 && new Set(g).size === 1 && r.groups === 1 && r.shown.length === 1, JSON.stringify(r.changes));
  });
  return R;
}

// ---- planted negatives: each mutates services/evidence-changes.js; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 70)); return s.replace(a, b); };
const NEG = [
  ['EC-N1 price threshold lowered', rep('var PRICE_PCT = 3;', 'var PRICE_PCT = 2.5;'), ['EC-2']],
  ['EC-N2 percentage not rounded before the comparison', rep('function pct(a, b) { return round6((b - a) / a * 100); }', 'function pct(a, b) { return (b - a) / a * 100; }'), ['EC-2']],
  ['EC-N3 target threshold lowered', rep('var TARGET_PCT = 5;', 'var TARGET_PCT = 4;'), ['EC-3']],
  ['EC-N4 firm matched case-sensitively', rep("function firmKey(f) { return String(f).toLowerCase(); }", 'function firmKey(f) { return String(f); }'), ['EC-3']],
  ['EC-N5 a missing value counts as a change', rep('function known(v) { return v !== null && v !== undefined && v !== \'unknown\'; }', 'function known(v) { return true; }'), ['EC-5', 'EC-6', 'EC-7']],
  ['EC-N6 every setup change material', rep('material: SETUP_GROUP[a] !== SETUP_GROUP[b]', 'material: true'), ['EC-6']],
  ['EC-N7 dates not masked in the identity', rep("  t = t.replace(DATE_RE, ' ');\n", ''), ['EC-1', 'EC-8']],
  ['EC-N8 numbers masked in the identity', rep("  t = t.replace(DATE_RE, ' ');\n", "  t = t.replace(DATE_RE, ' ').replace(/[0-9]+/g, '#');\n"), ['EC-8']],
  ['EC-N9 analyst text in a catalyst list not joined to the analyst entry', rep('    var joined = analystGroupFor(text, analystFirms);\n', '    var joined = null;\n'), ['EC-8']],
  ['EC-N10 no display cap', rep('var MAX_SHOWN = 7;', 'var MAX_SHOWN = 99;'), ['EC-9']],
  ['EC-N11 class order changed', rep('var CLASS = { analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 };',
    'var CLASS = { analyst_new: 3, rating_change: 3, target_change: 3, ai_action_change: 2, catalyst_new: 1, price_move: 4 };'), ['EC-9']],
  ['EC-N12 inputs not validated', rep('    if (!safeValid(validate, prev)) return fail(\'INVALID_PREV\');\n    if (!safeValid(validate, next)) return fail(\'INVALID_NEXT\');\n', ''), ['EC-10']],
  ['EC-N13 not contained', rep('    try { return diff(validate, prev, next); } catch (e) { return fail(\'INTERNAL\'); }', '    return diff(validate, prev, next);'), ['EC-12']],
  ['EC-N14 catalyst gone shown as material', rep("add('catalyst_gone', g, x, null, null, false, null);", "add('catalyst_gone', g, x, null, null, true, null);"), ['EC-14']],
  ['EC-N15 earlier target = last in list order (rev 1)', rep('function nearest(list, x) {\n', 'function nearest(list, x) {\n  if (list.length) return list[list.length - 1];\n'), ['EC-15', 'EC-16']],
  ['EC-N16 evidence key without target / rating (rev 1)', rep('function evidenceKey(a) {\n', 'function evidenceKey(a) {\n  return analystIdentity(a);\n'), ['EC-15', 'EC-16']],
  ['EC-N17 duplicate catalyst line: first seen kept', rep('if (f && (!own(nextFp, f) || t < nextFp[f])) nextFp[f] = t;', 'if (f && !own(nextFp, f)) nextFp[f] = t;'), ['EC-15']],
  // two independent mechanisms make the output order-independent (evidence-key processing order and the total-order
  // tie-break); either alone suffices, so this negative removes both
  ['EC-N18 no ordering guarantee', s => rep('nextItems.slice().sort(function (a, b) { var x = evidenceKey(a), y = evidenceKey(b); return x < y ? -1 : (x > y ? 1 : 0); }).forEach(', 'nextItems.forEach(')(
    rep('  return tieKey(a) < tieKey(b) ? -1 : (tieKey(a) > tieKey(b) ? 1 : 0);\n', '  return 0;\n')(s)), ['EC-15']],
  ['EC-N19 re-reported upgrade shown again', rep('var verbRating = !eventKnown && (', 'var verbRating = ('), ['EC-16']],
  ['EC-N20 unknown currency on both sides not compared', rep('(pm.currency || null) === (nm.currency || null)', '!!pm.currency && pm.currency === nm.currency'), ['EC-17']]
];

(async () => {
  const main = await rows(load(SRC), SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, mutate, wantFail] of NEG) {
    let r;
    try { const ms = mutate(SRC); r = await rows(load(ms), ms, wantFail); } catch (e) { fails++; console.log('  FAIL  ' + name + ': ' + e.message); continue; }
    const caught = wantFail.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + wantFail.join(', ') + ' fail' + (caught ? '' : '  (' + wantFail.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'EVIDENCE CHANGES OFFLINE: FAIL (' + fails + ')' : 'EVIDENCE CHANGES OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
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
node qa/guard_integrity_check.js --task task/evidence-memory-1-s2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/evidence_changes_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/evidence-memory-1-s2 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/evidence-memory-1-s2
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
services/evidence-changes.js
qa/evidence_changes_offline.js
work/evidence-memory-1-s2/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/evidence_changes_offline.js
<!-- land-tests:end -->
