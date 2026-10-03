# Review — Entry 7 closure census

Read-only verification task (no brief gate — not an implementation task per `AGENTS.md`/`CLAUDE.md`).
Base: `task/dh-fx-aged-current` @ `e27ce1c` = `branch-dev` = `origin/branch-dev` (identical, verified).

## Result

**Entry 7 is NOT ready to close.** One leftover gap found (G-1, census §3): the `_eodBuildPacket`
`fx` limitation line (`index.html:3025-3030`) bypasses `DH_DISPLAY`/`_dhLabel` and, for every FX
state except missing/stale-invalid, prints the raw internal state code (e.g. `fresh.`,
`aged-but-valid.`) directly into the export and briefing text. This is reproducible today via the
pinned fixture at `qa/eod_packet_v0_offline.js:1185` (`"FX: rate 3, USD/ILS, as of …, fresh."`) —
re-ran `node qa/eod_packet_v0_offline.js` → `PASS (191 asserts)`, confirming the leak is live
production behaviour, not stale documentation.

All 20 other census rows (UI chip/qualifier/badge/banner sites, export/briefing readiness lines,
the pre-export warning, and both Needs-Attention/completeness-reason FX sites) PASS: every word
traces to `DH_DISPLAY` via `_dhLabel`/`_dhFxAgedLabel`/`DH_DISPLAY.surface`, or (for the two
Needs-Attention sites) is a hand-matched literal identical to the table and hash-pinned by the
DH-M4a QA suite. The retired pre-M4a/M4b literals (`' (aged)'`, `'FX rate unavailable'`, `'USD
holdings excluded — FX unavailable'`) occur 0 times file-wide.

One pre-existing, out-of-scope item is disclosed for completeness (I-1, census §4): the
ResearchView result badge's `'Stale'` literal (`index.html:10329`) is text-identical to
`DH_DISPLAY.state['stale']` by coincidence, not by construction — it was already catalogued as a
separate "local" vocabulary in the pre-DH-M1 census (`work/dh-vocabulary-census/census.md`) and
was never claimed by any DH-M1…M4b ruling or by BACKLOG Entry 7's committed scope. Not a
regression, not counted against closure.

## Requirement → evidence

| Task instruction | Evidence |
|---|---|
| Census across UI, export, briefing, pre-export warning, Needs Attention, other | Census §2 (20 PASS rows) + §3 (1 gap) + §4 (2 informational, out-of-scope) cover all five named surfaces plus the API-status and BACKLOG-staleness checks |
| Compare every string against current `DH_DISPLAY` and approved rulings | §1 method step 1-2 (read the table + enumerate every `_dhLabel`/`_dhFxAgedLabel`/`DH_DISPLAY.*` call site) then walked each of the five surfaces end to end (step 3) and grepped for any site that renders a freshness/availability word without using them (step 4) |
| Each row: wording, source, from-mapping?, PASS/gap, evidence | Every row in census §2/§3/§4 carries all five |
| Do not change product code | `git status --short --branch` (above and at close): only `work/dh-entry7-closure-census/` is untracked; no tracked file modified |
| Do not modify BACKLOG yet | `BACKLOG.md` untouched; proposed line is in census §5 only, not applied |
| Real gap found → record precisely and STOP, don't fix | G-1 recorded with exact lines (`:3025-3030`), exact current text, exact reproducible fixture reference; no edit made to `index.html` or any `qa/*.js` |
| Census totals reproducible | §2 is exactly 20 rows (every `_dhLabel`/`_dhFxAgedLabel`/`DH_DISPLAY.*` call site + the 2 hand-matched FX sites); re-running the grep in §1 step 2 against the current file reproduces the same 20 call sites plus `_eodReadinessLines`' internal uses, all tabulated |
| Every row has a function/anchor | Yes — every census row names a function and an `index.html:<line>` anchor |
| No unexplained wording remains | §4 explicitly accounts for the two wording families that fall outside `DH_DISPLAY`'s scope (ResearchView, API status) with a stated reason each; §3 accounts for the one family inside scope that still fails |
| Full QA only if needed to verify a discovered issue | One suite re-run only (`node qa/eod_packet_v0_offline.js`), to confirm G-1's cited fixture is live; no edit, no full `npm run qa:offline` run (not needed — nothing changed) |

## Files changed

- Implementation: none.
- New (2, this task): `work/dh-entry7-closure-census/census.md`, `work/dh-entry7-closure-census/review.md`.

## Answers to the four closing questions

1. **Can Entry 7 be closed?** No — one leftover gap (G-1) remains open.
2. **Exact leftovers:** `_eodBuildPacket`'s `fx` limitation text (`index.html:3025-3030`) — independently
   hand-authored instead of routed through `DH_DISPLAY`/`_dhLabel`; for fresh/current/aged-but-valid FX
   it prints the raw internal state code untranslated into the visible export/briefing text.
3. **Proposed BACKLOG line:** census §5 — not applied; records DH-M3/M4a/M4b as landed and narrows
   "what remains" to G-1 alone.
4. **Is a new product slice required?** A small Manual-mode slice to route `_eodBuildPacket`'s `fx`
   limitation line through `_dhLabel`/`DH_DISPLAY` (mirroring how `_eodReadinessLines` already does
   it for the readiness `FX:` line) would close G-1. Not implemented here per task scope (STOP on
   gap discovery); needs its own brief and Owner approval.
