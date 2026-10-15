# Task brief: fund-facts-token-collision-1 — the fund-facts write path refuses a token equal to the read token

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT, HELD** (COWORK, 2026-10-15). Swept at `branch-dev` = `origin/branch-dev` = `5be9c6a`. Needs Codex brief review and Owner decision FD-1 before R11. Same pattern as `news-token-collision-1` (landed).

| | |
|---|---|
| Problem (verified at `5be9c6a`) | The token separation is **one-directional**: <ul><li>the read preflight (`fund-facts-read-preflight.js`) refuses a read token equal to `PT_FUND_FACTS_TOKEN`;</li><li>the write preflight (`fund-facts-preflight.js` `COLLISION_KEYS`) lists only the two SEC tokens.</li></ul> With equal read and write tokens, reads are refused but writes pass (sandbox: base → `{ok:true}`). Source: Codex cycle-2 review item 3, confirmed in the COWORK adjudication (advisory B-2) |
| Objective | The write preflight returns `TOKEN_COLLISION` when its token equals a non-empty `PT_FUND_FACTS_READ_TOKEN`, in the same position (after gate and auth). Every other outcome is unchanged |
| Exposure today | Latent: the fund-facts server is gated off until the SEC activation decision (BACKLOG 17 / 18). This closes the gap **before** activation |
| Backlog | none. No `BACKLOG.md` edit |
| Baseline / start (§TS) | Start at the current tip T. Valid only if all three blobs match; otherwise HOLD: <ul><li>`netlify/functions/lib/fund-facts-preflight.js` = `bf21a4518189c3a7136a24ee54762553e1963217`;</li><li>`qa/ath_isolation_offline.js` = `f173889b2f41d0f01e6541e5630ab61c509cda33`;</li><li>`qa/fund_facts_preflight_offline.js` = `4162acf2f04df3dd673a60542f4ccf018d32115f`.</li></ul> |
| Branch / slot | `task/fund-facts-token-collision-1`, **Worker B** |
| Mode | **Manual** (server security check) |
| qa:offline | step-0 count **+1** (`qa/fund_facts_token_collision_offline.js`) |
| Parallel with | `research-ai-context-1` (Worker A): **no shared file**. One heavy run at a time |

## §1 Files (exactly)

- `netlify/functions/lib/fund-facts-preflight.js` — **only** `COLLISION_KEYS` (add `'PT_FUND_FACTS_READ_TOKEN'` first) and the three comments that say "exactly the two" (→ three, naming the read token). Reference: `evidence/ffc-apply.py`, `evidence/candidate.diff`
- `qa/ath_isolation_offline.js` — **only** the `BASELINE_PINS` value for `fund-facts-preflight.js` → `d915f63f5b9d9ca67c71b4dd2cd3584f71b48828a0c941aa105a478c4ce5d765` (LF sha256 of the edited file). This is an expected TB-10-class pin delta (AR-7i goes RED without it)
- `qa/fund_facts_token_collision_offline.js` (new)
- `work/fund-facts-token-collision-1/review.md`

**Forbidden:**
- `fund-facts-read-preflight.js` (already correct), and every other `netlify/**` file;
- `qa/fund_facts_preflight_offline.js` (must pass unchanged, including its row that a token equal to `PT_OWNER_TOKEN` is **not** a write-side collision);
- `index.html`, `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 QA — new suite `qa/fund_facts_token_collision_offline.js`

Pure, in-process `require` of both preflights.

| Row | Assertion |
|---|---|
| FC-1 | write token == `PT_FUND_FACTS_READ_TOKEN` (non-empty) → `TOKEN_COLLISION` |
| FC-2 | read token absent / empty / different → `{ ok: true, ticker }` as today |
| FC-3 | the existing two SEC-token collisions still return `TOKEN_COLLISION` |
| FC-4 | order unchanged: gate off → `FUND_FACTS_SERVER_DISABLED`; bad auth → `UNAUTHORIZED` (both with equal tokens set) |
| FC-5 | `PT_OWNER_TOKEN` equal → still `{ ok: true }` (write-side spec unchanged) |
| FC-6 | the read side is unchanged: a read token equal to `PT_FUND_FACTS_TOKEN` → `TOKEN_COLLISION` |
| FC-N1 | planted negative on a temp copy: the new key removed → FC-1 fails |

**Must stay green:**
- `fund_facts_preflight_offline` 23 / 23 (unchanged file);
- `fund_facts_core_offline` 30;
- `fund_facts_read_offline` 39;
- `ath_isolation_offline` 23 (after the one pin update).

**COWORK sandbox preflight** (git-archive of `5be9c6a`, Linux):
- base `{ok:true}` → candidate `TOKEN_COLLISION`;
- the four suites above pass;
- without the pin update, AR-7i fails as expected;
- the full `run-offline` failing-suite set equals base (17 environment-only).

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` |
| S1 RED | write the suite; FC-1 fails on the current source; record |
| S2 GREEN | the key + comments; the ath pin; all rows + the negative + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9 line), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |

**STOP only for:**
- a change outside §1;
- any change to `fund_facts_preflight_offline` expectations;
- a denied protected action or an integrity FAIL.

## §4 Definition of Done

1. FC-1…FC-6 and FC-N1 pass.
2. The must-stay-green suites hold.
3. Step 10 PASS at step 0 + 1.
4. Codex: no unresolved Class I.

## §5 Owner decision

- **FD-1:** amend the write-side collision set (spec §2.1 said "exactly the two") to add `PT_FUND_FACTS_READ_TOKEN`. **Recommended: yes**, mirroring `news-token-collision-1`.
- **Out of scope:** `PT_OWNER_TOKEN` stays allowed on the write side, as the existing suite pins it.

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:netlify/functions/lib/fund-facts-preflight.js
node qa/guard_integrity_check.js --task task/fund-facts-token-collision-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/fund_facts_token_collision_offline.js
node qa/fund_facts_preflight_offline.js
node qa/fund_facts_core_offline.js
node qa/fund_facts_read_offline.js
node qa/ath_isolation_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/fund-facts-token-collision-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/fund-facts-token-collision-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH.

<!-- land-scope:begin -->
netlify/functions/lib/fund-facts-preflight.js
qa/ath_isolation_offline.js
qa/fund_facts_token_collision_offline.js
work/fund-facts-token-collision-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/fund_facts_token_collision_offline.js
node qa/fund_facts_preflight_offline.js
node qa/ath_isolation_offline.js
<!-- land-tests:end -->
