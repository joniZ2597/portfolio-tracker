# Review — r1b2-ath-auto (R-1 B2-auto: automatic, server-derived ATH)

Branch `task/r1b2-ath-auto`, baseline `312c34b` (brief commit; ATH files byte-identical to `e7bbbbb`). Mode Manual. Server-only: no `index.html`, operator tool, prompts, scoring or client code touched.

## 1. What changed (15 files)

- `ath-record.js` — `ath:v2` schema (`validateRecordV2`, exact 15 keys), `classifyBar`/`deriveAuto` (D-A3 rule, strict boundaries, no count cap), `applyRecentBars`, `applySplits`, `checkSplitConsistency`, `completeSplitRederive`, `upgradeV1`, `buildOperatorRecord`, `parseStoredRecord`, `projectPublic`. All v1 exports unchanged (`classifyVerification` etc.), so `tools/ath-verify-owner.js` and `ath_owner_tool_offline` pass unmodified.
- `ath-yahoo.js` (new) — the only module with a network call; injectable fetch; 12 s abort; exchange-day conversion; ILA for `.TA`; `FETCH_FAILED` / `BODY_INVALID` / `UNSUPPORTED`.
- `ath-ensure-core.js` + `ath-ensure.mjs` (new) — public ticker-only route, gate `PT_ENABLE_ATH_ENSURE_SERVER === 'true'`, decision table, 6 h / 24 h cooldowns, 300/h budget counter, get/set only.
- `ath-read-core.js` — public read, `ath-read-v2` projection, `public, max-age=60`, one `get`.
- `ath-preflight.js` — read and ensure sides are gate + ticker only; write side behaviour unchanged.
- `ath-write-core.js` — writes v2 `operator` records; rules unchanged.
- Suites: `ath_auto` (new, 44), `ath_ensure` (new, 31), `ath_record` 34, `ath_read` 22, `ath_write` 40, `ath_isolation` 22, `fund_facts_route` 14 (FR06 +1 route).
- `BACKLOG.md` — Entry 34 text only (automatic maintenance landed; B4 remains).

## 2. Readings recorded (Owner accepted readings 1–6 on 2026-10-08)

1. Cooldowns are measured from `lastCheckedAt`, so a no-change check writes the advanced check clock; no-fetch paths never write (E-10 reading).
2. An operator `unresolved` record carries no value to protect and is re-derived to `auto` after 24 h.
3. v2 drops `tradingViewSymbol`, `verifiedBy`, `pending` (not in the §2.1 key set).
4. `splitCheckedThrough` is the day before the check so a same-day split is seen; splits listed in an auto record's `splitsSeen` never re-trigger (F-22).
5. Auto evidence carries a `reason` key (null when verified).
6. A failed fetch with no record stores an unresolved `auto` record so the 24 h cooldown applies.
7. A material suspect bar in the recent bars keeps the stored value un-raised (conservative) and flags `SUSPECT_MATERIAL`.

## 3. Pin ledger

| Pin | Old | New | Revert proof |
|---|---|---|---|
| FR06 `EXPECTED_FUNCTIONS` | 20-entry list (as at HEAD) | + `ath-ensure.mjs` | the HEAD suite against the tree with the new route FAILS FR06; the edited suite PASSES. Only the one added line differs (diff of EOL-normalised files). |

No sha256 pin was touched (`ath_isolation` AR-7i pins unchanged and passing).

## 4. Tests-first record

The pure functions and route were written before the suites (deviation from AGENTS step 3, raised to the Owner). RED was recovered afterwards on an isolated snapshot of `312c34b`: `ath_auto` and `ath_ensure` do not load; `ath_record` 10 fail, `ath_read` 18 fail, `ath_write` 3 fail, `ath_isolation` 8 fail, FR06 fails. Every planted negative mutates production source with a unique anchor and a positive control, and is killed.

## 5. QA

- Step-0 baseline (isolated git-backed clone of `312c34b`): PASS, 68 suites. An earlier run on a plain `git archive` extract failed 3–4 suites with "not a git repository"; it is environmental and excluded.
- Final full `qa:offline` on the working tree: PASS, 70 suites, 0 failures (see `qa.log`).

## 6. Backlog reconciliation (step 10a)

Brief Backlog row: Entry 34 `partial`. Finished effect: partial (automatic maintenance done; B4 wiring remains). `BACKLOG.md` Entry 34 text updated accordingly; no other entry, count or table touched.

## 7. Self-review against the brief

- No client-supplied value reaches a record (ensure accepts exactly `{ticker}`; read has no write path; write path unchanged and protected).
- Network only in `ath-yahoo.js` (AR-7c); Yahoo only; no 1Y High in the ATH path.
- Responses expose neither evidence, refresh state, timestamps (beyond `verifiedAt`) nor allowlist contents (E-8, AR-3j).
- No `list`/`delete` in ensure or read (E-7, AR-3g). No live action, no push, no LAND.

## 8. Codex

Step 8 (implementation diff, before QA): PASS, no Class I or II findings (`codex.md`).

## 9. Final check

Final check: 1 round, 1 class-II finding fixed (per-suite counts added to qa.log), self-checked; no implementation change, no QA re-run. Codex also noted the untracked .claude/settings.local.json: a pre-existing (dated 2026-10-06) file that `git check-ignore` confirms is gitignored, outside the task diff and never staged (REJECT; not part of the 15 files + review.md).
