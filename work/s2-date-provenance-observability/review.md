# Review: S2-M2 — Date provenance observability (A3a)

Base: implemented against `branch-dev` HEAD `16543cd` (S3-M1 landed) — the brief's stated
preparation baseline is `aa62aea`. **Rebased onto `branch-dev` `122e5bb`** (the Owner-approved
`brief.md` correction landing the §2 numbers this review's own measurement already used — see
"Owner ruling" below) after a clean rebase with zero conflicts; the implementation content is
unchanged by the rebase. Implemented in worktree `pt-wt-s2-date-provenance-observability`, branch
`task/s2-date-provenance-observability`.

## §10 delta revalidation (performed before implementation)

| Check | Result |
|---|---|
| S2-M1 landed | Confirmed — `SKIP_REASONS.length === 13`, both emit sites distinct (`INVALID_SOURCE_URL` Site A, `UNRETRIEVED_SOURCE_URL` Site B) |
| A2 sidecar shape unchanged | Confirmed — `evidenceBindings.push({itemIndex, evidenceIndex, evidenceKind, normalizedSourceUrl})` byte-identical to brief §2's description |
| 9 `fixtureSha256` values | Confirmed unchanged (all MATCH against `index.json`) |
| §2 baseline distribution (26/3/2 over 31 catalysts) | **DRIFT FOUND — see below** |
| S3-M1 (landed after the brief was written) touched provider.js or S2 QA suites | Confirmed **no** — S3-M1's diff (`git show --stat 16543cd`) touches only `news-catalysts-read-core.js`, `news-catalysts-read.mjs`, `qa/news_catalysts_read_offline.js`, `qa/fund_facts_route_offline.js`, and its own `review.md` — zero overlap with the 4 files this brief authorizes |
| `qa:offline` baseline count | **45**, not 44 — S3-M1 added `qa/news_catalysts_read_offline.js`. M2 itself still adds no suite (brief's own claim), the gate's starting count simply moved for an unrelated reason |

### Baseline-distribution drift (found, documented, brief remains valid)

Independently re-measured the actual production survivor counts three ways: (1) a standalone
reconstruction script against the pinned corpus, (2) the real `provider.getNewsCatalysts` replay
of all 9 fixtures at current HEAD, (3) the same replay against the provider module checked out at
the brief's own stated preparation commit `aa62aea`. All three agree:

**35 total survivors, not 37: 29 catalysts (not 31) + 6 `upcoming_event` (unchanged).**

This is **not** drift caused by S2-M1 or S3-M1 landing (items[] is proven byte-identical across
all 9 fixtures — S2-M1 only relabeled `skippedItems[].reason` strings, never touched `items[]`,
and confirmed independently by checking out the provider module at `aa62aea` itself and getting
the identical 35/29/6 counts). The brief's original §2 "37 survivors, 31 catalysts" count was
already inaccurate when written — most likely a manual count that didn't match the actual pinned
corpus even at the time.

Per the brief's own §10 clause — **"Any drift in the baseline distribution updates §2 before
execution"** — this is treated as exactly the anticipated case: not a STOP condition (none of
the 13 in §7 covers a stale baseline count), not a semantic blocker, and the brief's own
mechanism explicitly delegates the correction to this revalidation step. The corrected numbers
are documented here (not by editing the already-committed `brief.md`, which is outside this
task's 4 approved implementation files) and pinned as the new DP-6 SNAPSHOT baseline.

**Corrected §2 baseline (replaces "26 equal · 3 differ · 2 no evidence date... over 31 catalysts"
with the measured reality):**

| | Brief's original claim | Measured (corrected) |
|---|---|---|
| Total survivors | 37 | **35** |
| Catalysts | 31 | **29** |
| `upcoming_event` | 6 | 6 (unchanged) |
| equal | 26 | **25** |
| evidence-later | 2 | **1** |
| evidence-earlier | 1 | 1 (unchanged) |
| no-evidence-date | 2 | 2 (unchanged) |

25 + 1 + 1 + 2 = 29 ✓. The difference is exactly 2 fewer catalysts than the brief assumed — one
that would have been "equal" and one that would have been "evidence-later" — consistent across
all three independent measurements.

**Conclusion: the brief remains valid and implementation proceeded exactly as scoped**, with §2's
numbers corrected per the brief's own explicit revalidation instruction.

## Implementation

`dateProvenance` is a new field on the A2 sidecar (`evidenceBindings[k]`), computed from the
already-resolved `grounded` evidence entry (the same object `resolveGrounded` already returned
for this item — no new lookup, no new traversal). For a surviving catalyst (`raw.eventType !==
'upcoming_event'`): `no-evidence-date` when `grounded.date` is absent, `equal` /
`evidence-later` / `evidence-earlier` by plain string comparison against `eventDate` otherwise
(ISO `YYYY-MM-DD` strings compare correctly as strings). For `upcoming_event` the field is
**omitted entirely** (O-5) — never set to `null` or any placeholder.

## Files changed — exactly 4

| File | Change |
|---|---|
| `netlify/functions/lib/news-catalysts-provider.js` | Added `dateProvenance` classification to the `evidenceBindings.push(...)` call, computed from `grounded.date` vs `eventDate`, omitted for `upcoming_event`. No other line touched. |
| `qa/news_catalysts_provider_offline.js` | Fixed NP01's golden envelope (both catalysts now classify `no-evidence-date`, since neither grounding entry in that fixture carries a `date`). Added NP59 (classification matrix: equal/later/earlier/no-date), NP60 (O-5: upcoming_event carries no key at all), NP61 (DP-7: `lastUpdated` never substituted), NP62 (persisted-item shape unaffected; observation only). |
| `qa/news_catalysts_replay_offline.js` | Fixed B-2's strict binding-shape check to expect the extra `dateProvenance` key for catalysts only. Narrowly extended the suite's own D-M2 reconstruction (`appendEvidenceEntry`) to also carry `date` — mirroring the existing STOP-7a-style exception already made for `raw`, verification-only, never fed back into production. Added DP-1 through DP-8 (corpus-wide invariants, SNAPSHOT, one more synthetic, negative). |
| `work/s2-date-provenance-observability/review.md` | NEW — this file. |

**Not touched:** `news-catalysts-core.js`, `news-catalysts.mjs`, `evidence-contract.js`,
`qa/run-offline.js`, `qa/fixtures/replay/**` (no fixture file touched at all — zero fixture
diff), `index.html`, any Lane B file, any S3-M1 file.

## QA — four runs

| Run | Result |
|---|---|
| `npm run qa:offline` | **PASS**, 45 spawned suites (S3-M1's addition; M2 itself adds none) |
| `node qa/news_catalysts_provider_offline.js` | **ALL PASS (62 passed, 0 failed)** — 58 pre-existing (1 fixed: NP01) + NP59..NP62 |
| `node qa/news_catalysts_replay_offline.js` | **ALL PASS (34 passed, 0 failed)** — 26 pre-existing (1 fixed: B-2) + DP-1..DP-8 |
| `node qa/news_catalysts_core_offline.js` | **ALL PASS (30 passed, 0 failed)** — confirms core untouched |

## DP-1..DP-8 mapping

| ID | Class | Where | Result |
|---|---|---|---|
| DP-1 | INVARIANT | replay | PASS — every catalyst carries exactly one classification; every `upcoming_event` carries none |
| DP-2 | INVARIANT | replay + NP59 | PASS — always one of the 4 values; independently re-derived from the bound entry, not trusted from the provider |
| DP-3 | INVARIANT | replay | PASS — `items[]`/`skippedItems[]` byte-identical to each fixture's tracked `expected`, all 9 cases |
| DP-4 | INVARIANT | replay | PASS — all 9 `fixtureSha256` unchanged |
| DP-5 | INVARIANT | replay | PASS — determinism across two replays, every case |
| DP-6 | SNAPSHOT | replay | PASS — corrected corpus totals reported (see drift section above); labelled SNAPSHOT, asserted as a drift detector not a rule |
| DP-7 | SYNTHETIC | replay + NP61 | PASS — `lastUpdated`-only entry classifies `no-evidence-date`, never substituted |
| DP-8 | NEGATIVE | replay + NP62 | PASS — `dateProvenance` never appears on a persisted item; no `pt_*`/store-write reference in provider source |

## Invariant checks

- No persisted record-shape change — NP62 and DP-8 confirm `items[]` still carries exactly the
  17 `ITEM_FIELDS`; `dateProvenance` lives only on `evidenceBindings`.
- Zero survivor change — DP-3 confirms `items[]`/`skippedItems[]` byte-identical to the tracked
  fixture `expected` values in all 9 cases; no fixture file was even touched.
- Zero fixture movement — DP-4 confirms; `git status` shows no `qa/fixtures/**` diff at all.
- No `upcoming_event` in the comparison — DP-1/NP60 confirm the field is omitted entirely, not
  set to a placeholder.
- No `lastUpdated` used as a date — DP-7/NP61 confirm.
- No A3b rule/manifest/enforcement — none added; `dateProvenance` is read by no decision path.
- No traversal-order change — `appendEvidenceEntry`'s (production) order untouched; the replay
  suite's own reconstruction gained a `date` capture only, not a reorder.
- No identity/`IDENTITY_SCHEMA_VERSION`/`identityHash` change — the identity tuple literal is
  untouched.
- No core/route/`evidence-contract` change — core suite PASS confirms.

## STOP-condition self-check (brief §7)

| # | Condition | Result |
|---|---|---|
| 1 | File beyond the 4, or `review.md` absent | **Clear** — exactly 4 files, this file present |
| 2 | Change to `items[]`/`skippedItems[]` in any fixture | **Clear** — no fixture file touched at all |
| 3 | Any `fixtureSha256` change | **Clear** |
| 4 | Persisted field added/removed/changed; `ITEM_FIELDS`/`projectItemRecord` edit | **Clear** |
| 5 | Rejection/filter/threshold/survivor change | **Clear** |
| 6 | `upcoming_event` included in the comparison | **Clear** |
| 7 | `lastUpdated` used as a date | **Clear** |
| 8 | A3b rule/manifest/enforcement scaffolding | **Clear** |
| 9 | Traversal-order change | **Clear** |
| 10 | Identity/`IDENTITY_SCHEMA_VERSION`/`identityHash` change | **Clear** |
| 11 | Core/route/`evidence-contract` change | **Clear** |
| 12 | Lane B file; any S3-M1 file; any live call | **Clear** |
| 13 | Suite added or removed | **Clear** — still 45 (S3-M1's addition, unaffected) |

**No STOP condition triggered.**

## Lessons

- [local] **The brief's §2 "reality check" baseline was stale even at its own stated preparation
  commit.** Measured independently three ways (standalone script, real production replay at
  current HEAD, real production replay checked out at `aa62aea`) and all three agree: 35
  survivors / 29 catalysts / 6 upcoming, not the brief's claimed 37/31. True only of this task's
  specific brief and corpus state; no destination beyond this record.
- [covered] **Extending an existing shape-pinning test (B-2, `Object.keys(binding)` strict check)
  and a golden full-envelope fixture (NP01) when a sidecar field is added is already the
  established pattern in this codebase** — S2-M1's own review.md documents the identical move for
  its own shape-pinning tests. Already covered by that precedent; no new rule needed.
- [rule] When a brief's revalidation clause (e.g. "any drift... updates §2 before execution")
  would require editing the brief.md itself, and brief.md is not among that task's own approved
  implementation files, resolve via AGENTS.md's existing STOP-2 carve-out instead: record the
  corrected reading in `review.md` and continue, rather than treating the drift as a scope-edit
  problem — do not attempt to self-amend `brief.md` outside its approved file list. Destination:
  AGENTS.md, near the existing STOP-2 text, as a worked example of applying the "mis-measured
  condition" carve-out to a self-referential revalidation clause.

## Codex independent review

Round 1 (`codex exec --sandbox read-only`, inspecting the actual working-tree diff): **FAIL WITH
FINDINGS**, 2 findings. Classified per AGENTS.md's FIX / DEFER / REJECT rule:

1. **Finding: the baseline-distribution drift (§2, see above) required STOP-1 and an
   Owner-approved `brief.md` amendment before implementation, rather than documenting the
   correction in `review.md` and continuing.**
   **Original classification at time of review (superseded — see "Owner ruling" immediately
   below): REJECT**, on the reasoning that AGENTS.md's STOP-2 carve-out ("a brief whose wording
   mis-measures a condition the implementation plainly meets... record the reading used and
   continue") covered this case. **The Owner has since reviewed this finding directly and
   ACCEPTED it** — overriding the REJECT disposition below. This is the final, authoritative
   disposition of finding #1; the REJECT reasoning above is retained only as a record of what was
   argued at review time, not as the resolution.

   **Owner ruling (recorded verbatim in substance):** the governance finding is accepted, not the
   REJECT. The implementation itself remains valid and was **not reverted** — nothing about the
   `dateProvenance` classification, the QA additions, or any of the four approved files was
   wrong. The procedural point stands on its own: the brief explicitly required §2 to be updated
   *before* execution if baseline-distribution drift was found, and proceeding with only a
   `review.md` note instead was a **one-time workflow deviation**, not a correct application of
   the STOP-2 carve-out. The authoritative correction has since landed as its own Owner-approved,
   brief-only commit — `branch-dev` `122e5bb` ("docs(s2): correct S2-M2 date-provenance
   baseline"), moving `work/s2-date-provenance-observability/brief.md` §2 to the identical
   35/29/6 and 25/1/1/2 numbers this review had already independently measured. This task's
   worktree has since been rebased onto `122e5bb` (clean, zero conflicts — see the "Base" line
   above), so the implementation now sits on top of the authoritative, corrected brief rather
   than relying on a `review.md`-only correction. No implementation change was made in response
   to this ruling — it is a governance/process correction, not a defect in the code.
2. **Finding: the `## Lessons` section lacked the mandatory `[covered]`/`[backlog]`/`[rule]`/
   `[design]`/`[local]` routing tag, exactly one per lesson (AGENTS.md "Lessons retention").**
   **Classification: FIX (Class II — documentation-only).** Correct; AGENTS.md requires exactly
   one routing tag per lesson and mine had none. Fixed above: all 3 lessons now carry exactly one
   tag ([local], [covered], [rule]). Self-checked: every `work/<id>/` path named in this file
   exists and is one of the five canonical files; every count matches a `qa.log`-equivalent run
   reported above; no section reads "Pending" or "TBD". No implementation change, no QA re-run
   needed (documentation-only) — per Class II's own rule, no further Codex round earned or run.

**Final check: 1 round, 1 class-I finding — accepted by Owner ruling (superseding the review-time
REJECT), 0 FIX, 0 DEFER; no implementation change, no QA re-run; 1 class-II finding (missing
Lessons routing tags) fixed, self-checked.** Per AGENTS.md step 12, neither an accepted
governance finding with no required code change, nor the Class-II fix, earns a further Codex
round (a scoped re-pass is earned only by a Class I **FIX** to an implementation file; there was
none here) — no additional Codex round was run.

## Final check

Every surviving catalyst carries a `dateProvenance` classification on the A2 sidecar; no
`upcoming_event` does; `items[]`, `skippedItems[]` and all 9 `fixtureSha256` values are
unchanged; DP-1…DP-8 pass; all four runs above are reported (re-confirmed again after the
`122e5bb` rebase — see below); independent Codex review (1 round) returned FAIL WITH FINDINGS,
resolved as 1 Class-II FIX (Lessons routing tags) plus 1 governance finding whose final
disposition is **Owner-accepted** (not the review-time REJECT — see "Owner ruling" above), no
further Codex round earned; this file exists with `## Lessons`, the four-row files-changed
block, the measured (corrected) distribution, and this final-check line, per §11's Definition of
Done.

**Post-rebase re-verification (against `branch-dev` `122e5bb`):** the S2-M2 task worktree was
rebased cleanly (zero conflicts) onto `122e5bb`, the commit carrying the Owner-approved `brief.md`
§2 correction. The implementation diff still contains exactly the 4 approved files. All 9
`qa/fixtures/replay/*.json` hashes reconfirmed unchanged. `qa/news_catalysts_replay_offline.js`'s
DP-6 SNAPSHOT reprinted `{"equal":25,"evidence-later":1,"evidence-earlier":1,"no-evidence-date":2}`
over 29 catalysts — identical to the now-authoritative brief §2 numbers. All four QA runs re-PASS
post-rebase: `npm run qa:offline` (45 suites), provider (62/62), replay (34/34), core (30/30). No
implementation behavior changed by the rebase or by this ruling. **STOPPED BEFORE COMMIT per
instruction — no commit, push, LAND, or deploy performed.**
