# Task brief: news-token-collision-1 — the news-catalysts write path refuses a token equal to the read token

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-14). Swept at `branch-dev` = `origin/branch-dev` = `9c4bff4`. Placed only on the Owner's R11 approval of this exact hash, after independent Codex review.

| | |
|---|---|
| Problem (verified in code at `9c4bff4`) | The token-separation check is **one-directional**: <ul><li>the read route (`news-catalysts-read-core.js`) refuses a read token equal to the **write** token `PT_NEWS_CATALYSTS_TOKEN`;</li><li>the write path (`news-catalysts-preflight.js` `COLLISION_KEYS`, five keys) does **not** list `PT_NEWS_CATALYSTS_READ_TOKEN`.</li></ul> If both are set to the same value, reads are refused, but a holder of that value can still **write**. Source: the `[backlog]` lesson in `work/s3-catalyst-evidence-surface/review.md` |
| Objective | The write preflight returns `TOKEN_COLLISION` when its token equals `PT_NEWS_CATALYSTS_READ_TOKEN` (non-empty), before any persistence, provider or write. Every other behaviour is unchanged |
| Backlog | **none** (pending-routing lesson; recorded at the next product BACKLOG refresh). No `BACKLOG.md` edit |
| Baseline / start (§TS) | Start at the current tip T. Valid only if `netlify/functions/lib/news-catalysts-preflight.js` is blob `6345db9c00844e16e61c9a7788f44069950eadd3` and `qa/news_catalysts_preflight_offline.js` is blob `b80632d9facd2cf4b4365b7a25d5bc69ca123761`; otherwise HOLD |
| Branch / slot | `task/news-token-collision-1`, **Worker B** |
| Mode | **Manual** (server security check) |
| qa:offline | step-0 count **+1** (`qa/news_token_collision_offline.js`) |
| Parallel with | `research-parser-hygiene-1` (Worker A): **no shared file**. One heavy run at a time |

## §1 Files (exactly)

- `netlify/functions/lib/news-catalysts-preflight.js` — **only** the `COLLISION_KEYS` array (add `'PT_NEWS_CATALYSTS_READ_TOKEN'` as the first entry) and the comment that says "five tokens" (→ "six tokens")
- `qa/news_token_collision_offline.js` (new)
- `work/news-token-collision-1/review.md`

**Forbidden:**
- `news-catalysts-read-core.js` (already correct);
- any other `netlify/**` file, and no new function file;
- `qa/news_catalysts_preflight_offline.js` (must pass unchanged: NC06 iterates its own five-key list);
- `index.html`, `services/**`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 QA — new suite `qa/news_token_collision_offline.js`

Pure, in-process: `require` the preflight module, the same way `news_catalysts_preflight_offline` does.

| Row | Assertion |
|---|---|
| TC-1 | write token == `PT_NEWS_CATALYSTS_READ_TOKEN` (non-empty) → `TOKEN_COLLISION` |
| TC-2 | read token empty / absent / different → no collision; the request proceeds as today |
| TC-3 | the existing five collisions still return `TOKEN_COLLISION` |
| TC-4 | order unchanged: a disabled gate and an unauthorized request still return their earlier reasons first |
| TC-5 | the read side is unchanged: `news-catalysts-read-core` still refuses a read token equal to the write token |
| TC-N1 | planted negative on a temp copy (anchor exactly once): the new key removed → TC-1 fails |

**Must stay green:**
- `node qa/news_catalysts_preflight_offline.js` (21 / 21, unchanged file);
- `qa/news_catalysts_core_offline.js` and `qa/news_catalysts_read_offline.js` at their step-0 results.

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | write the suite; TC-1 fails on the current source; record |
| S2 GREEN | add the key and fix the comment; all rows + the negative + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1;
- a needed change to the read side;
- a denied protected action or an integrity FAIL.

## §4 Definition of Done

1. TC-1…TC-5 and TC-N1 pass.
2. The must-stay-green suites hold.
3. Step 10 PASS at step 0 + 1.
4. Codex: no unresolved Class I.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:netlify/functions/lib/news-catalysts-preflight.js
node qa/guard_integrity_check.js --task task/news-token-collision-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/news_token_collision_offline.js
node qa/news_catalysts_preflight_offline.js
node qa/news_catalysts_core_offline.js
node qa/news_catalysts_read_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/news-token-collision-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/news-token-collision-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
netlify/functions/lib/news-catalysts-preflight.js
qa/news_token_collision_offline.js
work/news-token-collision-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/news_token_collision_offline.js
node qa/news_catalysts_preflight_offline.js
<!-- land-tests:end -->
