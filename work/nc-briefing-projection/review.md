# Review: NC-M1 — Briefing projection

Base: `df89141` = branch-dev (brief prep baseline `0c99e13`; revalidated — `index.html`,
`qa/run-offline.js`, `qa/vis_score_caliper_offline.js`, `qa/eod_packet_v0_offline.js` byte-identical
across `0c99e13..df89141`).

## Summary

Added `_eodPacketToBriefing` (a pure sibling of `_eodPacketToMarkdown`), the
`NOTEBOOK_BRIEFING_PROMPT` frozen/versioned constant, and the `NC_BRIEFING_VOCAB` single
wording-mapping table to `index.html`, plus one additional `_ptDownload` export action in
`_eodExportPacket`. The projector transports `limitations[]`, per-holding `research.coverage`,
`eod.weight`, `eod.market` (stale/unavailable), and `portfolio.needsAttention` verbatim from the
existing packet — no new computation. Added NB-1..NB-8 assertions plus supporting
structural/planted-negative/STOP-8 checks to the existing `qa/eod_packet_v0_offline.js` suite —
no new suite file, no new `qa:offline` entry.

## Files changed

- Implementation (2): index.html, qa/eod_packet_v0_offline.js
- Evidence (tracked): work/nc-briefing-projection/brief.md, work/nc-briefing-projection/review.md

## QA results

- Targeted `qa/eod_packet_v0_offline.js` (standalone, recorded verbatim at the tail of
  `work/nc-briefing-projection/qa.log`): **PASS, 114 asserts** (73 before this task).
- Full `npm run qa:offline` (recorded verbatim in `work/nc-briefing-projection/qa.log`):
  **PASS, 46 suites** (unchanged count, matches brief). One pre-existing advisory warning
  (smart-quote char, currently reported at `index.html:10166` — the line number shifts as this
  task's own additions move it down; the underlying character is unrelated to and predates this
  task), present before this task started.
- `qa/vis_score_caliper_offline.js`: PASS — no caliper pin movement (EOD functions are not in
  `PROTECTED_FN_HASHES`, as the brief anticipated).

## Codex review — FIX / DEFER / REJECT ledger

**Round 1 (step 8, implementation-diff review):** 4 findings, all FIX, all resolved:

1. **FIX** — STOP-8 violation: a holding with no `pt_eod_cache` entry at all
   (`market.present !== true`) rendered nothing, only the `eodStale` case was covered.
   Resolved: added `NC_BRIEFING_VOCAB.marketUnavailable` and an `else if (!m || m.present !== true)`
   branch in `_eodPacketToBriefing`.
2. **FIX** — NB-4's markdown-unchanged assertion was tautological (same in-memory function
   called twice on the same input is trivially identical regardless of whether the file
   changed). Resolved: pinned a SHA-256 hash of the extracted `_eodPacketToMarkdown` source,
   computed once before this task's edits.
3. **FIX** — NB-3 was a whole-document substring scan; since AAA and BBB share the coverage
   value `researched` in the fixture, a dropped line on one holding could hide behind the
   other's surviving line. Resolved: added a `holdingSection()` helper and scoped the check to
   each holding's own `### SYMBOL` section, plus a planted negative proving the old shape would
   have missed it.
4. **FIX** — the "single mapping table" (STOP-9) guard only counted two property-name
   references, which a hardcoded duplicate string would still pass. Resolved: the guard now
   extracts the actual prose out of `NC_BRIEFING_VOCAB` and asserts none of those literal
   phrases is also hardcoded inside `_eodPacketToBriefing`'s own source, plus a planted
   negative proving a duplicate would be caught.

No DEFER, no REJECT in round 1.

**Scoped re-pass (round 1 follow-up):** 1 class-I finding — the NB-4 baseline hash was
computed over the raw CRLF-terminated extracted source, so it would mismatch on an LF
checkout (`core.autocrlf=false`, e.g. Linux CI). FIX: normalized `\r\n` → `\n` before hashing
and re-pinned to the normalized digest; targeted + full QA re-run (PASS, no count change); a
further scoped re-pass on the corrected hunk returned PASS, no findings.

**Final check (step 12, against the complete task diff including this file):** 3 findings —
1 class-I, 2 class-II:

1. **FIX (class I):** `_eodPacketToBriefing` silently omitted `packet.portfolio.needsAttention`
   — an existing, already-authored degraded-state channel that `_eodPacketToMarkdown` already
   renders (its own "Needs Attention" block). This is a STOP-8 violation. Resolved: added a
   `## Needs Attention (N)` block to `_eodPacketToBriefing`, transporting each entry's
   `severity` / `title` / `detail` verbatim, rendered only when the array is non-empty (no
   invented section on the healthy path). QA re-run (targeted 114 asserts, full 46 suites,
   both PASS); one scoped Codex re-pass on this hunk performed (see below).
2. **FIX (class II):** this file's evidence claim ("111 asserts") was not backed by a literal
   recorded run. Resolved: the targeted suite's raw output is now captured at the tail of
   `work/nc-briefing-projection/qa.log`, and the count above (114, reflecting the
   `needsAttention` fix) is drawn from it.
3. **FIX (class II):** this file cited the smart-quote advisory at a stale line number.
   Resolved: corrected to the line `qa.log` currently reports (`10166`), with a note that this
   number shifts as this task's own additions move it and the underlying pre-existing character
   is unrelated to this task.

`Final check: 1 round, 1 class-I finding — 1 FIX, 0 DEFER, 0 REJECT, 0 unresolved, QA re-run + scoped Codex re-pass performed — plus 2 class-II findings fixed in the same round, self-checked (paths exist, counts match qa.log, no Pending/TBD).`

## Lessons

- [local] The NB-4 "markdown output unchanged" requirement is best proven by a pinned hash of
  the *extracted* function source (normalized to `\n`) computed before the task's edits, not
  by calling the same in-memory function twice — the latter is trivially true regardless of
  whether the file changed and caught no regression.
- [local] When two fixture holdings happen to share the same enum value (e.g. both `researched`),
  a whole-document substring scan for that value is not load-bearing — it must be scoped to
  each entity's own rendered section.
- [covered] The "single mapping table" convention for authored-but-not-computed wording (brief
  §3 State wording rule / STOP-9) is enforceable in offline QA by extracting the actual prose
  strings from the table's own source and asserting they never also appear literally inside the
  consumer function's source — already demonstrated here for `NC_BRIEFING_VOCAB` /
  `_eodPacketToBriefing`; no new destination needed.
- [local] When a new projector is a "sibling" of an existing one over the same packet shape
  (brief Ruling #1), every top-level degraded-state field the existing sibling already renders
  (here, `portfolio.needsAttention`, which `_eodPacketToMarkdown` already surfaces) needs an
  explicit presence/absence check against the new sibling before Codex review, not just the
  fields named in the QA boundary — the QA boundary (NB-1..NB-8) named limitations, coverage,
  and weight but not needsAttention, and the gap was caught only by the final Codex check.

## Definition of done — status

- `_eodPacketToBriefing` exists and is pure — **YES** (NB-1, EOD_SCANS).
- `NOTEBOOK_BRIEFING_PROMPT` exists once, version-tagged — **YES** (NB-5).
- One export action emits the briefing — **YES** (export-wiring checks; `_eodExportPacket` now
  performs exactly 3 `_ptDownload` calls, the existing 2 byte-unchanged).
- `_eodPacketToMarkdown` output byte-unchanged — **YES** (NB-4, pinned hash).
- NB-1..NB-8 pass — **YES**.
- `qa:offline` green at its then-current count — **YES**, 46 suites.
- This file carries `## Lessons`, the files-changed block, and the final-check line — **YES**.

**Not claimed:** that any media was produced, or that any Notebook API call was made. M1
produces a document and a static prompt constant only; the bridge is M3.
