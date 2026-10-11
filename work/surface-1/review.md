# surface-1 — review (partial close at Slice 1, brief section L)

Task `task/surface-1`. Slice 1 (P2a classifier) is complete. Slice 2 (22b Labs) stopped and was archived and removed. Slice 3 (Entry 30) was not started. The program closes at the last passed slice under the brief's section L (pre-authorised, M-4) and the partial-close procedure that executes it; the brief is not amended.

## Files changed
- Implementation (4): index.html, qa/asset_type_offline.js, qa/fixtures/index-pins.json, BACKLOG.md
- Evidence (tracked): work/surface-1/brief.md, work/surface-1/review.md

The brief's land scope also lists `qa/labs_panel_offline.js` and `qa/dh_ui_vocabulary_offline.js`; both belong to the unfinished slices and are not in this diff. `BACKLOG.md` is edited for entry 12's status text only.

## Rulings carried by this task
- SR-1: close surface-1 at the completed Slice 1 checkpoint under section L.
- LB-R1: the Deep Dive / TX-5 (Labs) contract conflict is addressed in a separate follow-on task; the Labs and TX correction is deferred to `surface-1b`.
- SR-2: prioritise `surface-1b` before `ai-output-2`.
- PC-5: early Second-LAND resync approved after a verified archive and restore.
- The brief's rulings 12-A, 12-B, 12-C, 12-F, 12-G and the P2a / P2b split are implemented as written; 12-D stays deferred.

## Implementation (Slice 1, P2a)
- C1: `ptAssetType`, `PT_KNOWN_ETF_SYMBOLS`, `PT_KNOWN_ETF_PATTERN` and `PT_ETF_FUNDAMENTALS_NA_TEXT` inserted immediately after the closing brace of `TICKER_DEFAULTS`, character for character as the brief quotes them.
- C2: the `_isETF` line is deleted and `_selectCats` uses `ptAssetType(sym) === 'ETF'`.
- C3: `_runCRResearchCard` shows the not-applicable text for an ETF and makes no network call.
- C4: `_runFundFactsCard` clears the token field, shows the not-applicable text and makes no read call for an ETF.
- Both card guards are `typeof`-guarded, following the S6-B hook pattern.
- `renderMainPanel`, `_crFetchForScan`, the scan and prefetch paths, `computeTechnicalSnapshot`, the `TICKER_DEFAULTS` values, the prompt, storage and scoring are untouched (AT-10 pins the three byte-equal surfaces).
- UNKNOWN behaves as STOCK and is never ETF (12-F).

### Readings used (recorded, no scope change)
- **C1 comment vs AT-7.** The brief's mandated C1 comment says "the former _isETF regex", while AT-7 says `_isETF` "no longer occurs in `index.html`". The comment is kept character for character (quoted brief text is binding). AT-7 counts occurrences of `_isETF` outside `//` comment lines, so it asserts that no code occurrence remains. Codex reviewed and accepted this reading.
- **Slice 2 test comment (archived work only).** The same kind of reading was used in the archived Slice 2 suite for the L3 comment ("no fetch"); that suite is not in this diff.

## QA
- Pre-edit baseline (Step 0, base 5718d5f): `npm run qa:offline` PASS, 78 suites, 0 FAIL, 1 advisory warning, exit 0 (first line of `qa.log`).
- Slice 1 RED then GREEN: `qa/asset_type_offline.js` failed on every row before the change (observed in the session), then passed with 23 assertions (AT-1 to AT-10 plus 13 planted negatives; the GREEN output is in `qa.log`). Each negative mutates an in-memory copy of the production source and the named row then fails; a mutation that does not apply is itself a failure.
- Planted negatives: seed missing TAN; `XL[A-Z]` dropped (two rows); UNKNOWN returned as ETF; invalid enum value; defaults not STOCK; clock call in the classifier; `_isETF` left in place; N/A path still fetching (Capital Returns); N/A path still reading (Fund Facts); token not cleared; `typeof` guard removed; `TICKER_DEFAULTS` edited.
- Pin map (`index-pins --diff` against the original base 5718d5f): `functions.ptAssetType` added; `functions._runCRResearchCard`, `functions._runFundFactsCard` and the remainder changed; the file digest changed. Nothing else, as the brief's S1.4 states. `--check` is OK (376 functions, 25 regions) at the resynced tip.
- Coupled suites, run unmodified: `fund_facts_read_client_test`, `fund_facts_panel_offline`, `ts1_default_exposure_offline`, `deep_dive_v0_offline`, `dh_ui_vocabulary_offline` all PASS.
- Resync (PC-5): the task branch was replayed onto `branch-dev` `be9f56a`; the recorded base advanced from 5718d5f to be9f56a and the tip became `593129643cbdb101ce6126dab21a5cf27ad2a700`. The Slice 1 patch-id is `228cf015cedab0dcb15c90209f6b82e9a1cf1c8c`, identical to the archived original.
- PC-6 targeted run at the resynced tip: 16 suites plus `index-pins --check`, all exit 0.
- PC-7 (step 10), one full `npm run qa:offline` at the resynced tip: PASS, 79 suites (78 at the base plus `qa/asset_type_offline.js`), 0 FAIL, exit 0, one advisory warning (the existing smart-quote warning). The E1 digest gate ran its normal validation and skipped only its pinned heavy rows; `news_catalysts_replay_offline` ran and passed. The verbatim lines are in `qa.log`.

## Unfinished slices
- **Slice 2 (22b Labs): stopped.** The brief's L3 setter assigns `window[flag] = (on === true);`. The existing `ts1_default_exposure_offline.js` row TX-2 rejects any live computed-key `window[...] =` assignment anywhere in `index.html`, so that suite failed on that one row (TX-2) when L1 to L4 were applied verbatim. The brief's coupling note named TX-5 and missed TX-2. Slice 2's own suite (`qa/labs_panel_offline.js`) passed in full, with all its planted negatives caught. Under the brief's S2.7 the existing suite is never weakened, so the slice stopped.
- **Slice 3 (Entry 30): not started** (its entry condition, a committed Slice 2 checkpoint, was never met).
- Entries 22 and 30 stay open and move to `surface-1b`.
- Archive of the Slice 2 work and evidence, outside the repository: `C:\Users\Owner\Documents\Project\pt-work-artifacts\surface-1-s2\20261011T112905Z\`. It holds the modified `index.html`, `qa/labs_panel_offline.js`, snapshots of `plan.md`, `qa.log` and `codex.md`, `s2-index.diff`, `s1-checkpoint-9c40c49.patch` and `s1-patch-id.txt`. `ARCHIVE-INVENTORY.txt` sha256: `7b4b093a37f38c70aa4feb0c71d19024dd8929ff39c58191550af49ba5f21d28`. Every copy was re-hashed against its source before the working tree was restored with a scoped `git restore` of `index.html` and a plain delete of the archived untracked file (no hard reset, clean or stash).

## Fresh-context self-review
Re-read the brief's section S1 and the complete implementation diff against the requirement map. C1 to C4 match the quoted text exactly, in the named functions and at the named sites. No other function, storage key, scoring path or prompt changed. The only change from this pass was the reading recorded above, which was already in place; no further edit was needed.

## Codex (step 8, read-only, real diff plus the untracked suite; raw output in `codex.md`)
Slice 1 diff reviewed against 5718d5f: "PASS - no findings". Codex accepted the C1 comment / AT-7 reading. FIX 0, DEFER 0, REJECT 0.

### Final check (step 12, raw output in `codex.md` under `## Final check`)
The final check ran on the complete task diff, including this file and the `BACKLOG.md` reconciliation. It returned three class-II findings and no class-I finding.
- Fixed: the summary line was missing from this section (added below). Review.md also now matches `qa.log` on every count: the targeted `asset_type` run was appended to `qa.log`, and counts that `qa.log` does not show were reworded.
- Rejected, with reason: "`review.md` is described as tracked but is untracked" and "Files changed omits `work/surface-1/review.md`". The fixed two-row Files-changed shape lists `work/surface-1/review.md` on its Evidence row, and it is tracked by the step-13 commit, which this task has not made yet.

Final check: 1 round, 1 class-II finding fixed, 2 rejected, self-checked; no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: entry 12 `partial` (S1 landed, P2b remains); entry 22 `close` and entry 30 `close` were scheduled for the slices that did not run.
- Action taken: `updated` for entry 12 only.
- Entry 12 before: `*Master:* COVERED BY surface-1 S1 (P2a) — partial; P2b ... belongs to the future surface-2 Master.` After: `*Master:* surface-1 S1 (P2a) — partial: P2a landed (work/surface-1/ ...); P2b ... remains for the future surface-2 Master.` The heading is unchanged and no DONE line is added.
- Entries 22 and 30: not edited; they stay open and move to `surface-1b`.
- The new text matches the diff (the classifier, TAN / ITA / KRE recognised, the two cards say "not applicable"), the QA result (79 suites PASS) and the work being landed.

## Lessons
- [rule] A coupling sweep must read each coupled suite's checker (its regexes), not only grep identifier names. TX-2 of `ts1_default_exposure_offline.js` bans any live `window[...] =` assignment, which an identifier grep for the gate names cannot see. Destination-ready text for the `pt-offline-suite` coupling sweep: "For every added or changed statement, run the statement text itself through each suite that scans `index.html` as text, using that suite's own checker functions, and list the suite rows that read the changed area."
- [backlog] `surface-1b`: Labs switches (22b) need a setter form TX-2 and TX-5 accept, or an Owner-approved suite change; then Entry 30 — pending routing
- [local] The AT-7 reading (non-comment occurrences) follows from the brief's mandated C1 comment; true of this task only.
- [covered] Quoted brief text is exact, so the comment was kept verbatim — already covered by the standing feedback rule on brief-quoted text.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 79; targeted=PASS; codex-classI-unresolved=0
