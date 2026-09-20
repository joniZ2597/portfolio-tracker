# Task review: catalyst news evidence pipeline — S1 write path

Base `20b4b31` · brief commits `5e6ea4c` (approved) and `2f67f67` (Owner-approved FR06 scope amendment) ·
worktree `pt-wt-catalyst-news-write`, branch `task/catalyst-news-write`.

## Implementation vs. brief

Implementation matches the amended brief (`work/catalyst-news-write/brief.md`) exactly:

- `netlify/functions/lib/news-catalysts-core.js` (new) — gated, token-bearing, POST-only write core:
  OPTIONS → gate → method → auth-first probe → body → full preflight → strong index pre-read (D1, UTC
  fetch-date partition) → frozen J3 provider over injected fetch/clock/key → write-relevant provider
  contract validation → item records (create-only) → index record LAST (create-only) → D-E reconciliation.
- `netlify/functions/news-catalysts.mjs` (new) — `withLambda(core.handler)` wrapper, side-effect
  `@netlify/blobs` bundling pin, no config export (D5: a manual POST is the only trigger).
- `qa/news_catalysts_core_offline.js` (new) — NW01–NW27 (28 assertions incl. NW09b), auto-discovered.
- `qa/fund_facts_route_offline.js` — one added line (`'news-catalysts.mjs'` in `EXPECTED_FUNCTIONS`),
  per the approved amendment; nothing else in the file changed (byte-audited LF, `+1 -0`).

Frozen modules `news-catalysts-provider.js` and `news-catalysts-preflight.js`: zero diff vs base.
No `index.html`, `services/**`, `package.json`, `netlify.toml`, `qa/run-offline.js`, `BACKLOG.md` change.
No environment variable set; gate off at LAND; no scheduler, cron, client caller, or GrokBot surface.

## QA / verification evidence (`work/catalyst-news-write/qa.log`)

| Check | Result |
|---|---|
| Pre-edit baseline `npm run qa:offline` | PASS, 42 spawned suites |
| Tests-first run (core absent) | 27 assertions FAIL, 0 pass (as intended) |
| `node qa/news_catalysts_core_offline.js` (final) | **28/28 PASS** |
| `node qa/fund_facts_route_offline.js` | **14/14 PASS** (FR06 re-baselined) |
| `node qa/news_catalysts_provider_offline.js` (frozen) | 23/23 PASS, unchanged |
| `node qa/news_catalysts_preflight_offline.js` (frozen) | 21/21 PASS, unchanged |
| `npm run qa:offline` (final) | **PASS, 43 spawned suites** (42 + 1) |
| Advisory warnings | 1, pre-existing at baseline (`index.html` smart quote, unrelated) |
| Validation 4 — `git diff --stat 20b4b31 -- . ':(exclude)work/' ':(exclude)BACKLOG.md'` | 1 tracked file, +1 −0; three untracked in-scope files |
| Validation 5 — `grep -c "process.env"` in the core | 5 (gate, two `env: process.env` preflight hand-offs, `PERPLEXITY_API_KEY`, one comment); NW25 pins the dotted names to exactly the gate + upstream key |

Planted negatives (all mutation-on-fixture, never on the test): 1 projection omitted → J7 `CONTRACT_INVALID`
(NW14) · 2 index-before-items rejected by the ordering assertion (NW15) · 3 second same-day fetch →
`SKIPPED/ALREADY_SEEDED`, provider reached once (NW09b) · 4 zero-item run writes no index, day stays open
(NW12) · 5 malformed-success from an injected provider → 502, zero writes (NW27, from Codex round 1).

## Reading decisions (brief wording open; intent met)

| # | Reading |
|---|---|
| R1 | Missing `PERPLEXITY_API_KEY` → provider throws before I/O → `502 PROVIDER_FAILURE` (precedent: every provider throw), no new vocabulary. |
| R2 | Item `set` `modified:false` = normal day-to-day overlap: omitted from `writtenKeys`, run continues, index still written. `STORE_CONFLICT` reserved for the index race. |
| R3 | Index `keys` = every item key of the fetch (the day's evidence pointer); response `writtenKeys` = only `modified === true` keys (teardown provenance). |
| R4 | Item-stage set throw/malformed → `STORE_UNAVAILABLE`, bare when nothing created, else `{ ticker, writtenKeys }`; no index attempted. |
| R5 | Non-conforming injected clock → `502 PROVIDER_FAILURE` before any read (same domain the provider's own `CLOCK_NOT_INJECTED` would produce). |
| R6 | Provider `null` (unreachable post-allowlist) → `502 PROVIDER_FAILURE`. |
| R7 | Preflight → HTTP: write-side precedent (`401` / `500 CONFIGURATION_MISSING` / `403`) plus the brief-required `default:` → `500 ERROR/PREFLIGHT_UNMAPPED`. The news preflight has no `TICKER_INVALID`; the auth-first probe defers `TICKER_NOT_ALLOWED`. |
| R8 | `NONE` envelope is exactly `{ status, ticker, fetchedAt }` (brief wins over the fund-facts `reason:'NONE'` shape). |

Owner rulings during implementation (2026-09-20): keep `HASH_RE` (defensive boundary before
`buildNewsKey`); validation is order-insensitive and semantic only; persisted record constructed from
`ITEM_FIELDS`; reordered valid items accepted; unknown extra fields accepted but never persisted; no
`evidence-contract` import (`direction` = non-empty string); `skippedItems`/`writtenKeys` intentionally
unvalidated; eventDate pinned by grammar only.

## Codex review (`work/catalyst-news-write/codex.md`, raw)

| Round | Finding | Class | Resolution |
|---|---|---|---|
| 1 | BLOCKING — `validateProviderResult` accepted items with missing fields from an injected/drifted provider; a skeleton item could be persisted as WRITE | **FIX** | Semantic, order-insensitive validation of every write-relevant field; record constructed from `ITEM_FIELDS`; NW27 added. Confirmed resolved by round 2. |
| 2 | BLOCKING — a well-formed but incorrect `identityHash` from a drifted provider is not recomputed against the provider's normative identity tuple (`'0'.repeat(64)` would be written under a false identity) | **DEFER** (Owner-ruled 2026-09-20) | See threat model below. |

**Round-2 DEFER — threat model and reason (Owner ruling).** S1 may trust the frozen news-catalysts
provider for normative `identityHash` computation. The provider's existing NP15 coverage pins the
byte-exact identity tuple and hash, so the real provider cannot emit a well-formed wrong hash. Production
does not inject an alternate provider implementation: the `_testProviderOptions.providerImpl` seam is
test-only, event-only, and consulted only after preflight passes. Provider inspection found no exported
hash or identity helper (`sha256Hex` and `normalizeHttpsUrl` are module-private; the tuple is built
inline). Recomputing the hash in the core would require `require('crypto')` (a fourth dependency) and a
duplicate of the provider's normative eight-key tuple, creating a second source of truth. Exporting a
canonical helper from the provider modifies a frozen module, which is outside the approved S1 scope and
triggers STOP-2. The core keeps its 64-hex syntax check (`HASH_RE`) as the defensive boundary before
`buildNewsKey`. Destination-ready future design item under Lessons `[design]`.

- BLOCKING (open): NONE inside the approved contract; 1 DEFER recorded above.
- NON-BLOCKING: NONE.

## Deviations

None from the amended implementation scope. Frozen modules untouched. Suite count 43 as required.

## Files changed
- Implementation (4): netlify/functions/lib/news-catalysts-core.js, netlify/functions/news-catalysts.mjs, qa/news_catalysts_core_offline.js, qa/fund_facts_route_offline.js
- Evidence (tracked): work/catalyst-news-write/brief.md, work/catalyst-news-write/review.md

## Lessons

- [design]   Identity verification for the news write path (Codex round-2 DEFER). Destination-ready text for
             `work/<capability>/breakdown.md`: "Export a canonical `computeIdentityHash(item)` / identity
             verification helper from `news-catalysts-provider.js` (frozen in S1), then have the write core
             reuse that helper to verify `identityHash` rather than duplicate the normative identity tuple.
             Until then only the frozen provider reaches production and NP15 pins its hash; the core's
             `HASH_RE` syntax check is the defensive boundary."
- [rule]     A brief's pre-approval compatibility sweep must include directory-enumeration pins, not only
             suites that read in-scope files as text. Destination-ready text for `AGENTS.md` "Task brief
             convention": "**QA suites that enumerate a directory the task adds a file to:** `<list or
             none>` (e.g. `qa/fund_facts_route_offline.js` FR06 pins the exact `netlify/functions/` file
             set; any new function file requires its one-line re-baseline to be in scope)."
- [rule]     Byte-audit the CR count of every existing file an edit tool touched before commit; the Edit
             tool rewrote `qa/fund_facts_route_offline.js` from LF to CRLF once in this task. Destination-ready
             text for `AGENTS.md` "Worker execution contract", step 13: "Before requesting commit approval,
             for each modified existing file compare the CR-byte count of the working copy against HEAD
             (`git show HEAD:<path>`); if they differ, normalize the working copy to HEAD's convention and
             re-check that `git diff --stat` shows only the intended lines. An autocrlf notice on an
             LF-at-HEAD file is not churn; a changed CR count is."
- [backlog]  FR06's test label in `qa/fund_facts_route_offline.js` still says "14 pinned entries" while the
             pin now holds 17 — stale label text, behavior correct — pending routing
- [covered]  A new `qa/*_offline.js` is auto-discovered (+1 suite) with no `package.json` change — already
             covered by `qa/run-offline.js` W1 discovery comments and the TradingView pilot brief.
- [local]    `git diff --no-index` exits 1 when files differ; never chain it with `&&` when building a
             review bundle.

## Final status

Final check: 1 round, 1 Class II finding fixed, self-checked; no implementation change, no QA re-run.

READY FOR FINALIZATION — commit approval requested for the task diff (four implementation files +
`work/catalyst-news-write/review.md`); LAND is a separate Owner decision.
