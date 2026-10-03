# Review: tech-snapshot-price-cache — a technical snapshot is never reused for a different price (Entry 32)

## Result

I1–I8 are implemented as written in the amended brief (`9f22b59`). `_techCache` now holds a price-independent
`base` (reused 15 min per symbol + benchmark) and a price-dependent `snap` stored with `refInput`; a snapshot is derived
on every call and is never served for another price. `orchestrate()` receives the scan's own snapshot instead of reading
the global cache; the Technical Setup panel and Deep Dive read through `_techSnapFor` at the price they display; the panel's
Setup and assessment are classified from the same snapshot whose distances it renders; scan-time Setup, Score row and
score dial are marked "from scan" / "Scan setup" only when the displayed price differs from the scan price.
`renderMainPanel` changed in exactly nine lines (I7a–I7i). B1 and B2 are applied to `BACKLOG.md` (step 10a, effect `close`).

## Files changed

- Implementation (6): index.html, qa/tech_snapshot_cache_offline.js, qa/deep_dive_v0_offline.js, qa/vis_score_caliper_offline.js, qa/ts1_default_exposure_offline.js, BACKLOG.md
- Evidence (tracked): work/tech-snapshot-price-cache/brief.md, work/tech-snapshot-price-cache/review.md

The brief's "exactly 7" files are these six plus `review.md`; `brief.md` was committed earlier (`cedd4df`, amended in `9f22b59`) and is not changed by this task.

## QA

| Run | Result |
|---|---|
| Step 0 baseline, before any edit (HEAD `cedd4df`, base `24fabf0`) | `npm run qa:offline` PASS, 54 suites |
| Tests first: `node qa/tech_snapshot_cache_offline.js` on the unmodified `index.html` | FAIL as intended (40 of 96 asserts; engine groups could not extract the new helpers; TC-9/10/11/13 red) |
| `node qa/tech_snapshot_cache_offline.js` | PASS, 319 asserts, 36 planted negatives all rejected |
| `node qa/deep_dive_v0_offline.js` | PASS, 74 asserts |
| `node qa/vis_score_caliper_offline.js` | PASS, 307 asserts |
| `node qa/ts1_default_exposure_offline.js` | PASS, 45 asserts |
| `node qa/ui_hygiene_offline.js` | PASS |
| Step 10 full `npm run qa:offline` (no other full run active) | PASS, 55 suites, 0 FAIL = baseline 54 + 1 |

The only advisory is the pre-existing smart-quote warning (`index.html`, line 10437 at baseline, now 10497 because of
inserted lines). Raw output for every run is in `qa.log`. The full run at the final commit is reported in the step-13
report as LAND evidence.

## Review-time proofs (from `git diff 24fabf0`)

- **TC-10 / pins.** The suite proves by textual revert that removing I7a–I7c and restoring I7d–I7i yields the base
  `renderMainPanel` (LF-normalised `a8c13d283ad90e4c132e6d68a5570682b39d5c127d1dd5a4ce18795178ab838f`, CRLF form = the old
  caliper pin), and that applying the I7 table to the base reproduces the task function byte for byte.
  - Old caliper pin: `d11b09a989f19ee1fa09770ac135e8f00ce518558b25cc7bce3ee23cf1b174ac`
  - New caliper pin (CRLF form): `a219c9508c69da079ac838d06aadeb97da44957c86a20ff03ca199f868e11aed`
  - Old TS1 TX-3 pin (LF-normalised): `a8c13d283ad90e4c132e6d68a5570682b39d5c127d1dd5a4ce18795178ab838f`
  - New TS1 TX-3 pin (LF-normalised): `978f40e5325c229637b1ffb0ba6f2accbe69cb604f07728781e499e78791b9d4`
- **TC-11.** `qa/vis_score_caliper_offline.js` differs from the base in one line: the `renderMainPanel` hash value. The
  other nine function pins and the protected CSS hash are byte-equal to the base (asserted by the new suite) and the
  caliper suite passes.
- **TC-13 (amendment).** `qa/ts1_default_exposure_offline.js` differs from the base in one line: `BASE_HASHES.renderMainPanel`.
  The other TX-3 pins (`runTechScoreV1` `f36bc4eb…`, `_ts1FillRow` `17c8863a…`, `_ts1RowText` `6df1e835…`), every assertion and every
  negative case are unchanged (asserted by the new suite; `git diff --numstat` shows 1 / 1). The TS1 region, `_ts1FillRow`
  and `_initTsCard` are byte-equal to the base.
- **`qa/deep_dive_v0_offline.js`.** One-line diff: `'_techSnapFor'` and `'_techRefInput'` appended to `FNS`; no assertion changed.
- `qa/run-offline.js` is unedited. `index.html` and `BACKLOG.md` keep CRLF (0 bare LF after every edit).

## Codex

Step 8 reviewed the real implementation diff (tracked diff against `24fabf0` plus the full contents of the untracked
suite). Raw output is in `codex.md`. Verdict: PASS, no findings, so there is nothing to classify FIX, DEFER or REJECT.

My own fresh-context review (step 7, recorded in `plan.md`) changed the tests before Codex ran: the render-harness
fixtures were made to use the production extended-hours shape, and three planted negatives that were first not rejected
(dial number, dial rating, "second snapshot") were fixed by checking the dial against the real `_ptScoreDial` /
`_ptScoreText` output instead of a base render built from the same mutated source.

Final check (step 12, on the complete task diff including `BACKLOG.md` and this file): no Class I and no Class II findings.

Final check: 1 rounds, 0 class-II findings fixed, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation

- Backlog row in the brief: Entry 32, effect `close`. `BACKLOG.md` is in the file set and in `land-scope`.
- Action taken: `closed`.
- Entry 32 did not exist at the baseline. B1 inserted `### 32 · Technical snapshot reuses a stale price — **DONE**` after entry 22's
  `*Evidence:*` line (before: absent; after: present, status DONE). B2 inserted one line in DONE / HISTORY directly after entry 11:
  ``**32** Technical snapshot reuses a stale price — `work/tech-snapshot-price-cache/` ·``.
- No snapshot, count or other-entry edit (`git diff --numstat -- BACKLOG.md`: 14 added, 0 removed).
- The new BACKLOG text matches the diff, the QA results above and the work being landed: price-dependent values are derived from the
  price in use, the panel Setup follows the snapshot it shows, and scan-time Setup and Score are marked when the prices differ.

## Definition of Done

- I1–I8 (I7a–I7i) exact: yes (TC-10 exact-transform proof).
- TC-1…TC-15 and negatives PASS: yes, 319 asserts.
- Existing suites PASS: yes.
- Full `qa:offline` = baseline + 1: yes, 55 against 54.
- `review.md` with `## Backlog reconciliation` and the pin proofs: yes.
- Codex: no unresolved Class I finding.
- LANDed, pushed, cleaned and the post-push DEV check: not yet; LAND and push are Owner-gated, and the DEV check needs a separate Owner OK (live scan APIs).

## Lessons

- [rule] A pin-based "unmodified" claim must be checked against every suite that pins the touched function, not only the one named in the brief: here `qa/ts1_default_exposure_offline.js` (TX-3) pinned `renderMainPanel` too and forced a brief amendment. Before approving a brief that edits a pinned function, grep `qa/` for the function name together with a 64-hex literal.
- [rule] A planted negative must be checked against an independent expectation. A "base render" built from the same mutated source cancels out any mutation common to both sides; compare against the real helper output instead.
- [backlog] `qa/pt_land_offline.js` accounts for about 22 minutes of every full run, which makes QA gating slow — pending routing
- [local] The guard denied an inline interpreter script fed through a heredoc (R1) and the PowerShell tool (R2); both were ruled non-invalidating by the Owner and the work continued with Edit/Write and read-only Bash.
- [local] `index.html`, `BACKLOG.md` and the caliper suite are CRLF in the working tree while Git stores LF; the new suite normalises to LF and derives CRLF-form hashes, so it does not depend on the checkout's line endings.

LAND-EVIDENCE: qa-offline=PASS 55; targeted=PASS; codex-classI-unresolved=0
