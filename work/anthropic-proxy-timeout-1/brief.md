# Task brief: anthropic-proxy-timeout-1 — raise the Anthropic proxy timeout from 25 s to 50 s

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT rev 3, HELD** (COWORK, 2026-10-16).
- Re-pinned to `branch-dev` = `7ece529` (lane A's brief-only commit; it touches only `work/analyst-action-coverage-1/brief.md`, so every §TS blob is unchanged from `05e9fac`).
- Option B approved by the Owner.
- **Rev 2** answers the independent Codex review (`shared-reports/codex/2026-10-16_anthropic-proxy-timeout-1-brief-review.md`, preserved): the DEV gate is relabelled as a baseline-path check, AT-2 is reworded, AT-6 / AT-8 are added, and the P-5 note is corrected.
- **Rev 3** (wording only) answers the rev-2 focused re-check (`shared-reports/codex/2026-10-16_anthropic-proxy-timeout-1-rev2-recheck.md`, preserved): the long-duration proof is now stated as a **prerequisite completed before** any Haiku output-cap increase, not a check after it (Follow-up row, §4, R-1). No change to scope, files, tests or the candidate edit.
- Rev 1 is kept in `rev1/`, rev 2 in `rev2/`.
- Next: Main Control / Owner package and R11.

| | |
|---|---|
| Problem (verified) | <ul><li>`netlify/functions/anthropic-proxy.js` aborts every upstream call after **25 s** (`TIMEOUT_MS = 25000`, comment "stay under Netlify 26s function limit"). That reason is out of date: the project is on a **credit-based Personal plan** (Netlify UI), and Netlify's documented synchronous limit for functions is **60 s**.</li><li>Netlify Observability for the cycle-N six-ticker scan: Haiku calls took **14.1–23.5 s**. The 1,800-token reply took **23.5 s, 1.5 s from the abort**.</li><li>A timeout returns 504; the scan treats it as an AI error with no retry, so the ticker loses its AI analysis.</li></ul> |
| Objective | `TIMEOUT_MS` becomes **50,000** (10 s margin under the documented 60 s), with an accurate comment. Nothing else changes: request payload, `max_tokens` clamp (≤ 4,000), P-5 gate, ping path, errors, logging. **The client's Haiku output cap (1,800) is not changed in this task** |
| Source | `shared-reports/research/2026-10-16_haiku-timeout-netlify-assessment.md` (Option B); `shared-reports/research/2026-10-16_g2-haiku-output-limit.md` |
| Backlog | none (G-2 follow-up). No `BACKLOG.md` edit |
| Baseline / start (§TS) | Start at the current tip T. Valid only if both blobs match; otherwise HOLD: <ul><li>`netlify/functions/anthropic-proxy.js` = `c590d49e8b5682c1cd520cb158ad8e32345d9e53`;</li><li>`qa/p5_call2_offline.js` = `130b1b5f66f4dfed18a99b90de5818fa4ec7b4f7`.</li></ul> |
| Branch / slot / mode | `task/anthropic-proxy-timeout-1` · **Worker B** · **Manual** (server runtime behaviour) |
| qa:offline | step-0 count **+1** (`qa/anthropic_proxy_timeout_offline.js`). `qa/run-offline.js` **auto-discovers** every top-level `qa/*_offline.js` (`OFFLINE_SUITE_RE`, `discoverSuites`, `computeEffective`; `.claude/rules/qa-suites.md`: "no registration edit"). Sandbox proof at `7ece529`: a placeholder `qa/anthropic_proxy_timeout_offline.js` is included in the effective set (96 suites) with **no runner change**. The runner stays forbidden |
| Parallel with | `analyst-action-coverage-1` (Worker A): **no shared file**. One heavy run at a time |
| Follow-up (not this task) | The G-2 cap change (`max_tokens` 1,800 → 2,500 in `index.html`, lane A) has two prerequisites, both completed **before** the cap is raised: (1) this task is LANDed and its §4 baseline-path gate passes; (2) the §4 long-duration proof (> 26 s → 200 on DEV) passes. The cap change must not ship, and must not be used to produce that proof |

## §1 Files (exactly)

- `netlify/functions/anthropic-proxy.js` — **only** the `TIMEOUT_MS` line: value 25000 → 50000, and its comment → `Netlify synchronous functions run up to 60 s (credit-based plans); keep a 10 s margin`. Reference: `evidence/apt-apply.py`, `evidence/candidate.diff` (one line). LF sha256 after the edit = `6dfec2760ecd5cd928b91e1b01de77da5cecaf00698f249e10685b83bd6b926f`
- `qa/anthropic_proxy_timeout_offline.js` (new)
- `work/anthropic-proxy-timeout-1/review.md`

**Forbidden:**
- every other line of `anthropic-proxy.js` (including the ping path's 15 s timeout and the 4,000 clamp);
- `index.html` (no `max_tokens` change);
- every other `netlify/**` file;
- `netlify.toml`;
- `qa/run-offline.js`, `package*.json`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`.

## §2 QA — new suite `qa/anthropic_proxy_timeout_offline.js`

Drive the real handler in-process (as `p5_call2_offline` does). Save and restore `ANTHROPIC_API_KEY`, `PT_ENABLE_P5_CALL2_TOOL_USE`, `globalThis.fetch`, `setTimeout` and `clearTimeout`. Use a test key value only; no network.

| Row | Assertion |
|---|---|
| AT-1 | the `TIMEOUT_MS` literal is 50000 |
| AT-2 | `60000 − TIMEOUT_MS ≥ 10000`: a margin check against the **documented** 60 s limit. This is arithmetic on external documentation, **not a platform test**; the platform limit is proven only by the later long-duration gate (§4) |
| AT-3 | the outdated "26s function limit" comment is gone; the new comment names 60 s |
| AT-4 | the upstream abort timer is armed with exactly 50000 ms (captured from `setTimeout`) |
| AT-5 | when the timer fires, the response is still `504 {"error":"Upstream timeout"}` |
| AT-6 | success path unchanged: 200, the upstream JSON passed through; payload keys exactly `model / max_tokens / messages / system` with `max_tokens` and `system` as sent; **no `tools` while the P-5 gate is off** |
| AT-7 | the `max_tokens` clamp is still 4,000 |
| AT-8 | upstream error mapping unchanged: 401 / 403 → 502 "Authentication failed"; 429 → 429 "Rate limit reached"; 500 → 502 "Upstream error 500" |
| AT-N1 | planted negative on a temp copy: value restored to 25000 → AT-1 and AT-4 fail |

**Must stay green (unchanged files):**
- `p5_call2_offline` (401 asserts; drives the same handler);
- `deep_dive_v0_offline` (74);
- `fund_facts_route_offline` (pins the function file list; unchanged).

**COWORK sandbox preflight** (git-archive of `05e9fac`, Linux):
- prototype `evidence/apt-proto.js` (rev 2): **8 / 8 at candidate; 3 fail at base** (AT-1, AT-3, AT-4);
- `p5_call2` 401 and `deep_dive_v0` 74 PASS at base and candidate;
- `fund_facts_route_offline` cannot run in the sandbox (missing Netlify ESM dependency) at base or candidate, and passes on the host per earlier LANDs;
- full `run-offline`: the same 17 environment-only failing suites as at base.

## §3 Steps

| Step | Action |
|---|---|
| 0 | §TS; process check → step-0 `qa:offline`; `plan.md` (Gate Verification: N/A — existing ungated proxy path; no new execution path) |
| S1 RED | the suite; AT-1, AT-3 and AT-4 fail on the current source |
| S2 GREEN | the one-line edit; all rows + the negative + must-stay-green pass |
| 8 | Codex round one |
| 10 | process check → full `qa:offline` PASS at step 0 + 1 |
| 11–13 | `review.md` (L9), final Codex, step-13 commit, integrity |
| LAND / PUSH | usual R12 |
| **DEV gate** | see §4 |

**STOP only for:**
- a change outside §1;
- any change to a must-stay-green suite;
- a denied protected action or an integrity FAIL.

## §4 Post-deployment DEV gate — **baseline-path check only** (Owner-approved live check; not part of LAND)

- **When:** after the branch-dev deploy containing this task is Completed.
- **Run:** one Owner-approved DEV scan of **NVDA, ARM and GEV** (3 Perplexity + 3 Haiku calls, at most one retry each), following the live-scan protocol with snapshot / restore.
- **Read:** Netlify Observability (branch-dev, URL `anthropic-proxy`) for each call's duration and status.
- **What this gate proves:** the deployed proxy still serves the **normal path** (no regression). Every `anthropic-proxy` call returns 200 with no 504, durations are recorded, and there is no `max_tokens` behaviour change (the cap is still 1,800).
- **What it does NOT prove:** that requests longer than 25–26 s succeed. With the 1,800 cap, replies stay about 14–24 s, so the longer interval is not exercised. Its PASS must never be reported as proof of the 60 s platform limit.
- **Long-duration proof (separate; a prerequisite completed BEFORE any Haiku output-cap increase):**
  - **Order:** this task's deploy → this §4 baseline-path gate → the long-duration proof → only then may the G-2 cap change ship. The proof is never run after, or by means of, a raised client cap.
  - **How:** one Owner-approved, controlled DEV check against the deployed proxy (the client cap is still 1,800) must show at least one `anthropic-proxy` call **longer than 26 s returning 200** (Observability). The method and cost are an Owner decision taken when the G-2 cap task is next.
  - **If it fails** (a 502 / 504 at 26–30 s): the G-2 cap change does not start, and the timeout is reassessed.
  - This task does not raise the cap and does not depend on that proof.
- **Rollback:** revert this one-line commit.

## §5 Definition of Done

1. AT-1…AT-8 and AT-N1 pass.
2. The must-stay-green suites hold.
3. Step 10 PASS at step 0 + 1.
4. Codex: no unresolved Class I.
5. The §4 DEV gate is reported (PASS / FAIL) after deploy.

## §6 Risks

| # | Risk | Control |
|---|---|---|
| R-1 | The platform limit on this account is lower than the documented 60 s (older forum reports of 26 s concern legacy plans) | No effect while replies stay under about 24 s (cap 1,800). Proven or disproven by the §4 long-duration proof, which must pass **before** the G-2 cap change ships; a longer reply is never allowed first |
| R-2 | A hung upstream now holds the function up to 50 s instead of 25 s (compute credits) | About 0.07 extra credits per hung call (≈ $0.0006); rare |
| R-3 | **P-5 call-2 (Labs Deep Dive) has its own client timeout** `P5_CALL2_TIMEOUT_MS = 28000` in `index.html` (comment: "> proxy 25s … so a real 504 surfaces") | <ul><li>Calls of 25–28 s now succeed instead of failing.</li><li>Calls over 28 s now fail on the **client** with the existing reason `timeout` instead of `http-504`. Still fail-closed, existing vocabulary, no retry.</li><li>That `index.html` comment becomes outdated. It cannot change here (lane A file); it is recorded for the G-2 cap task. `p5_call2_offline` (mocked) is unaffected</li></ul> |

## §CMD Command card (one command per Bash call; Bash tool only)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
git rev-parse HEAD:netlify/functions/anthropic-proxy.js
node qa/guard_integrity_check.js --task task/anthropic-proxy-timeout-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/anthropic_proxy_timeout_offline.js
node qa/p5_call2_offline.js
node qa/deep_dive_v0_offline.js
node qa/fund_facts_route_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/anthropic-proxy-timeout-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/anthropic-proxy-timeout-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (prompts):** `git add <explicit §1 paths>`; the read-only process listing before each heavy run; `codex exec --sandbox read-only <prompt>`.
- **C (Owner):** R11; LAND; PUSH; the §4 DEV scan.

<!-- land-scope:begin -->
netlify/functions/anthropic-proxy.js
qa/anthropic_proxy_timeout_offline.js
work/anthropic-proxy-timeout-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/anthropic_proxy_timeout_offline.js
node qa/p5_call2_offline.js
node qa/deep_dive_v0_offline.js
<!-- land-tests:end -->
