# Review — DH-M0a Vocabulary census

Task branch `task/dh-vocabulary-census` · base `7d0cc37` · brief `work/dh-vocabulary-census/brief.md` (unmodified, tracked).

**Result: PASS (census delivered; C-1…C-5 hold; Codex round 1 HOLD → 5 findings FIXed; final check HOLD → 1 Class I FIXed + 3 Class II fixed; scoped re-pass PASS).**

## Summary

One new census deliverable, `work/dh-vocabulary-census/census.md` (plus this `review.md`): the measured inventory DH-M0b will
rule from. It attributes all **294** occurrences of the 11 census terms in `index.html` (261
matching lines) to line, enclosing symbol, data family, owning authority and visibility class (§5);
inventories J7, the `PF_*` / freshness constants, the EOD-packet-local terms, the NC briefing
table (its own vocabulary, not double-counted) and the S3 read envelope with its client adapter
(§4); adds term × family / visibility / authority / form cross-tabs (§3) and a cross-site listing
of the surface forms used for the same subject (§6). It recommends nothing and calls no term wrong.

## Requirement → evidence

| Brief item | Evidence |
|---|---|
| Base identity (§9) | `git diff --stat e2bdfd2 HEAD --` the five measured files is empty; worktree clean, brief tracked and unmodified at start |
| C-1 both units per term | independent `grep -c` / `grep -o \| wc -l` recount logged in `qa.log`; census §2 equals it and Amendment 2 (b) exactly (`unavailable` 87/93 · `Unavailable` 27/28 · `STALE` 27/28 · `Stale` 37/40 · `MISSING` 10/11 · `Missing` 36/46 · `FAILED` 8/8 · `Failed` 16/16 · `DEGRADED` 16/16 · `insufficient` 7/7 · `not covered` 1/1); §5 has 261 rows summing to 294 |
| C-2 `PF_*` / freshness constants + units | census §4.2: the nine Amendment 2 (d) constants plus every other age / TTL / window constant of the 28-match top-level sweep (20 tabulated, 8 named as omitted with reason) |
| C-3 J7 tokens | census §4.1: 5 item states, 7 reasons, 6 `DEGRADED_NOTES`, window table |
| C-4 EOD-local + NC briefing | census §4.3 and §4.4; NC occurrences attributed once in §5 under authority `NC briefing table` |
| C-5 read-only | `git status --short` = `?? work/dh-vocabulary-census/census.md` only (plus `review.md` after it is written); `git diff 7d0cc37 --` and `git diff --cached` empty; no product or QA file touched |
| §7 STOP 4 / 7 (no recommendation, nothing "wrong") | grep of `census.md` for judgement words returns only the two disclaimer sentences; Codex round 1 and final check found no leakage |
| Parallel-task revalidation (§9) | `branch-dev` = `7d0cc37`; the five measured files identical to `e2bdfd2`; `index.html` recount on `branch-dev` (both units) equals the census values — no census-term count changed |

## QA

- Pre-edit baseline (AGENTS step 0): `npm ci`, then `npm run qa:offline` — exit 0, `OFFLINE VALIDATION: PASS`, 14 phases, 1 advisory warning (pre-existing smart-quote note at `index.html:10166`); first line of `qa.log`.
- Post-edit: full `npm run qa:offline` again after the round-1 FIXes — exit 0, `OFFLINE VALIDATION: PASS`, same 14 phases, same 773 phase-line assertions, same single advisory warning. No suite added or changed; effective suite count unchanged (46 per brief).
- No `qa/*.js` reads `work/dh-vocabulary-census/` (brief §5, re-confirmed at start).

## Codex

Independent read-only `codex exec --sandbox read-only` on the real deliverable; raw output in `codex.md` (untracked). Round 1 verdict **HOLD**, 5 findings; Codex confirmed all C-1 counts, 261 rows / 294 occurrences, no decision leakage and no out-of-folder diff.

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | Six `unavailable` occurrences at `index.html:2416,2454,2455,2458,2459` (weight reason) tagged `market/EOD` | **FIX** | re-tagged `portfolio/reporting`; §3.1 recomputed (`unavailable` market/EOD 16→10, portfolio 14→20) |
| 2 | NC table / consumer sites `2929,2930,2980,2981,2983` (`marketStale`, `marketUnavailable`, `eodStale`) tagged `portfolio/reporting` | **FIX** | re-tagged `market/EOD` (weight sites `2924-2927`, `2974` stay portfolio/reporting) |
| 3 | `index.html:2940` (`NOTEBOOK_BRIEFING_PROMPT`) marked `B`, but `:2933-2936` says the constant is never read or sent in this phase | **FIX** | marked `M` with the comment cited in the row |
| 4 | §4.2 said "every other constant found" though the sweep also returns timeout constants / field lists | **FIX** | wording now states the 28-match sweep, 20 tabulated, the 8 omitted matches named with reason |
| 5 | §1 said "The 5 non-`index.html` files" (there are 4) | **FIX** | corrected to 4 |

DEFER: none. REJECT: none.

**Final check (AGENTS step 12)** — Codex on the complete task diff (`census.md` + `review.md`), raw text appended to `codex.md` under `## Final check`. It re-verified the five round-1 fixes, all C-1 pairs, all 261 rows / 294 occurrences, every cross-tab total, 37 fresh rows, QA/evidence claims, decision leakage and scope, and returned HOLD on four documentation/format items:

| # | Finding | Class | Resolution |
|---|---|---|---|
| F-1 | `census.md` §5 rows `12008`, `12013`: unescaped pipe characters inside the "(HARD / WEAK / STALE / NONE)" note broke the 9-column table | **I** — FIX | pipes escaped in those two cells (nothing else in `census.md` changed); full `npm run qa:offline` re-run PASS (logged); one scoped Codex re-pass on the changed hunks → **PASS**, no findings |
| F-2 | `review.md` had no final-check line | II | line added below |
| F-3 | `review.md` said "six §4.6 local vocabularies" (table has ten) | II | corrected to ten |
| F-4 | `review.md` said "One new tracked artifact" (two files) | II | reworded |

DEFER: none. REJECT: none. Unresolved Class I: none.

## Fresh-context self-review

Re-read the brief and the whole census against §3 / §6 / §7: no product or QA file touched, no new
term, no recommendation, no "wrong" claim; the ten §4.6 local vocabularies are recorded under
`local: …` without ranking. One residual judgement is disclosed in the census itself (§7 last
bullet): family / authority / visibility are the Worker's per-site reading; the counts do not
depend on them.

## Discrepancies with the brief (recorded, none blocks)

- Brief Amendment 2 (c) places the `NOTEBOOK_BRIEFING_PROMPT` "unavailable" occurrence at `:2937`; that line is the constant's definition, the occurrence is on `:2940`. Census uses `:2940`.
- Brief §3 item 3 names seven data families and item 4 five authorities; the measurement found sites that fit neither list (scan-results banner, AI-analysis prompts and flags, API connection badge → family `other (not in §3 list)`; ten locally-defined vocabularies (census §4.6) → authority label `local: …`). Recorded as a fact, not resolved (§1 and §4.6 of the census).

## Lessons

- [local] Attributing family/visibility by line-range rules mis-tagged mixed-subject ranges (weight vs market at `:2414-2459`, `:2924-2983`); Codex caught both. For this kind of census, split ranges at subject boundaries and let an independent reader sample rows across every range before the deliverable is called done.
- [design] DH-M0b input, destination-ready for `work/dh/breakdown.md`: "The authority list J7 / `PF_*` / EOD-packet-local / S3 read envelope / NC briefing table is not the full set of places a state term is defined in `index.html`. `work/dh-vocabulary-census/census.md` §4.6 records ten further locally-defined vocabularies (ResearchView status, FX state, live-price / market failure, SEC-store client, fund-facts read client, fund-facts factor display, catalyst verdict incl. EDGAR verification, needs-attention ids, scan-results banner, cloud-sync). M0b's ownership table must decide for each whether it is inside or outside the shared contract."
- [covered] Matching-line counts (`grep -c`) differ from per-occurrence counts (`grep -o`) — already covered by brief Amendment 2 (a) and C-1.

## Files changed

- Implementation (2): work/dh-vocabulary-census/census.md, work/dh-vocabulary-census/review.md   (= brief §5's two files)
- Evidence (tracked): work/dh-vocabulary-census/brief.md, work/dh-vocabulary-census/review.md

Final check: 2 rounds (final check + 1 scoped re-pass), 1 class-I finding — 1 FIX, 0 DEFER, 0 REJECT, 0 unresolved; QA/re-pass performed where required; 3 class-II findings fixed, self-checked.
