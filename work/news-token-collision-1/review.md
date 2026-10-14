# Review — news-token-collision-1

## Result
The news-catalysts write preflight now refuses a write token equal to `PT_NEWS_CATALYSTS_READ_TOKEN`. In `netlify/functions/lib/news-catalysts-preflight.js` the literal `COLLISION_KEYS` array gained `'PT_NEWS_CATALYSTS_READ_TOKEN'` as its first entry, so the existing loop (`isNonEmptyString(other) && other === token` -> `TOKEN_COLLISION`) closes the one-directional gap; the check still runs after the `SERVER_DISABLED` gate and the `UNAUTHORIZED` token check and before the allowlist and membership checks. No other behaviour changed: no new logic, no new export, `news-catalysts-read-core.js` and `qa/news_catalysts_preflight_offline.js` untouched. The write core (`news-catalysts-core.js`) reaches the check only through `evaluateNewsCatalystsPreflight`, so the whole write path is covered.

## QA
- Step 0 baseline: `qa:offline` PASS, 91 suites (HEAD `84d6c7e`, node v24.14.0), run after Worker A's heavy run had exited.
- Targeted: `qa/news_token_collision_offline.js` PASS 6/6 (TC-1, TC-2, TC-3, TC-4, TC-5, TC-N1); `news_catalysts_preflight_offline` PASS 21/21 (unchanged file); `news_catalysts_core_offline` PASS 30/30; `news_catalysts_read_offline` PASS 20/20.
- Step 10: full `qa:offline` PASS, 92 suites (= step 0 + 1), 0 FAIL, the same 1 pre-existing advisory warning.
- Planted negative: TC-N1 removes the new key from a temp copy of the production source (anchor occurs exactly once) and shows the TC-1 check then fails because the request is let through (`{ ok: true, ticker: 'AAPL' }`), while the five original collisions still hold.

- Post-resync (base `28beb5f`, tip `4592fce`): full `qa:offline` PASS, 93 suites (the resync brought in one more suite from `branch-dev`; this task's +1 is unchanged), 0 FAIL; targeted 6/6, 21/21, 30/30, 20/20. The 92-suite result above was the pre-resync run (raw in `qa.log`).

LAND-EVIDENCE: qa-offline=PASS 93; targeted=PASS; codex-classI-unresolved=0

## RED record (S1)
Against the unmodified source the new suite gave 3 passed / 3 failed: TC-1 failed with `{ ok: true, ticker: 'AAPL' }` instead of `TOKEN_COLLISION`; TC-4 failed on its collision-beats-allowlist row (got `ALLOWLIST_INVALID`); TC-N1 failed its anchor assertion (`0 !== 1`). TC-2, TC-3 and TC-5 passed on the old source, as they pin unchanged behaviour. After the change all six pass. Raw output in `qa.log`.

## Reading used (wording, not a STOP)
- The brief names "the comment that says 'five tokens'". The same block has two more count claims about the same list ("exactly the five domain tokens below", "no sixth member"); leaving them would leave a stale statement beside a six-entry list, so all three were updated together (`six tokens`, `six tokens`, `no seventh member`). Comments only, same file, same block.
- TC-1 also asserts, from the source text, that the read token is the **first** entry of `COLLISION_KEYS` (the brief's §1 states first entry); TC-4 adds rows for a missing write token (`UNAUTHORIZED`, not a collision) and for collision-before-allowlist/membership, covering the brief's order requirement.
- `news-catalysts-read-core.js` exports only `handler` and helpers, not `evaluateReadPreflight`, so TC-5 drives `handler` under a save/restore of `process.env` with a poisoned store, as `news_catalysts_read_offline` does.
- Line endings: the working-tree files in this area are CRLF, so the source edit was made byte-exactly (CRLF preserved, each anchor matched exactly once) and the new suite is CRLF.

## Form denial
Form denial: a compound Bash call (grep + sed + ls + a PowerShell process listing in one command) -> reissued as separate single-purpose calls; the PowerShell tool is denied in Worker slots (R2), so the heavy-run process check used the Bash `wmic process where "name='node.exe'"` form. (Nothing ran in either case.)

## Codex
- Round one (step 8): raw output and classification in `work/news-token-collision-1/codex.md`. Verdict FAIL on one point only.
  - **REJECT** (Class I as labelled by Codex) — TC-N1 "did not execute": `fs.mkdtempSync(os.tmpdir())` raised `EPERM` inside Codex's read-only sandbox. Environmental, not a defect: the suite passes 6/6 under `qa:offline` and directly with normal permissions, the RED run executed TC-N1's anchor assertion, and `mkdtempSync(os.tmpdir())` is the established temp-copy pattern in 26 `qa/*_offline.js` suites. The brief requires a temp copy for the planted negative.
  - Codex affirmed: scope (tracked diff = the preflight only; the untracked suite is the allowed file), collision correctness and order, absent/empty/non-string handling, substantive TC-1…TC-5 assertions with no orphans, no stale "five" count.

- Final check (step 12, raw in `codex.md` under `## Final check`): PASS, no Class I findings. One Class II note — it flagged `review.md` as untracked in the "Evidence (tracked)" row. **REJECT**: `review.md` is untracked only until the step-13 commit, which adds it in the same commit; the row uses the fixed two-row shape AGENTS.md prescribes.
  Final check: 1 round, 0 class-I findings, 1 class-II finding rejected with reason; no implementation change, no QA re-run.

## Files changed
- Implementation (2): netlify/functions/lib/news-catalysts-preflight.js, qa/news_token_collision_offline.js
- Evidence (tracked): work/news-token-collision-1/brief.md, work/news-token-collision-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none (pending-routing lesson; recorded at the next product BACKLOG refresh).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- No live or DEV check: the write endpoint is dormant and the change is a pure-module list entry; no deploy, canary or env change was part of this task.

## Lessons

- [backlog] The token-separation check was one-directional (read route refused read==write; write preflight did not list the read token) — fixed here for the news-catalysts pair only; the other write/read preflight pairs (fund-facts) were not audited for the same one-directional pattern — pending routing
- [local] Codex's read-only sandbox cannot write to `os.tmpdir()`, so a suite whose planted negative uses `mkdtempSync(os.tmpdir())` reports `EPERM` inside Codex and looks like a FAIL there although it passes in the normal environment; the finding is rejected as environmental, with the passing run as evidence.
