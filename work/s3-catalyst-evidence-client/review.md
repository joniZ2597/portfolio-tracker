# review.md — S3-M2 `news-catalysts-client` (catalyst evidence surface, client adapter)

Evidence only; authorizes nothing. Commit, LAND and SHIP remain Owner decisions.

| | |
|---|---|
| Brief | `work/s3-catalyst-evidence-client/brief.md`, committed in `9cc815c`, unchanged by this task |
| Task baseline | base / merge-base `28c25434edb1aeda0344accf296066ed57bce2ad` = `branch-dev` after the post-S2-M2 rebase (task started at `9cc815c`); task commit before amendment `f6cddc7`; branch `task/s3-catalyst-evidence-client`, worktree `pt-wt-s3-catalyst-evidence-client` (fresh `npm ci`) |
| Authorities used | wire protocol: `netlify/functions/lib/news-catalysts-read-core.js` at `16543cd`; per-record shape: `D-S3-1-reader-contract.md`; adapter precedent: `services/fund-facts-read-client.js` |
| Result | **Implemented, NOT committed. Suite `qa/news_catalysts_client_test.js` PASS (22 tests, 1240 assertions). Full `qa:offline` PASS at 46 suites (baseline 45, +1 by auto-discovery).** |

## Files changed
- Implementation (2): services/news-catalysts-client.js, qa/news_catalysts_client_test.js
- Evidence (tracked): work/s3-catalyst-evidence-client/brief.md, work/s3-catalyst-evidence-client/review.md

Brief §5 lists three files including `review.md`; the two above are its implementation files. `qa/run-offline.js`, `index.html`, every S3-M1 file and every S2 file are untouched, and no registration was needed.

## What was built

- `services/news-catalysts-client.js` — `normalizeNewsCatalystsReadResponse(httpStatus, rawBodyText, requestedTicker, requestedAsOf)` (pure, never throws) and `requestNewsCatalystsRead({ticker, asOf, token, fetchImpl?, timeoutMs?, endpoint?})` (single-shot POST, never rejects). Structure mirrors the fund-facts precedent: exact-ordered-key helper, five-key result, executor with its own timer.
  - **Combinations:** two tables, `HTTP_BY_STATUS` (13 statuses) and `ERROR_REASONS` (12 non-OK statuses), span the 16 valid HTTP + status + reason combinations. Unknown status, unknown reason or wrong HTTP return the one pinned client result with `ticker` = requested and `envelope: null`; nothing from the wire is carried in.
  - **Shapes:** OK 7 keys, NOT_AVAILABLE 6, DEGRADED 3, ten others 2, each key-for-key in server literal order.
  - **Results:** `ok` (validated OK, envelope returned unchanged), `server` (every recognized non-OK, status/reason verbatim; NOT_AVAILABLE keeps its six-key envelope, the rest `envelope: null`), `client`. No fourth kind and no invented state word.
  - **Records:** exactly the 19 fields in persisted order, `contractVersion` checked first, constants, closed vocabularies, both conditional-null rules; `subType` is opaque. Any invalid record fails the whole response; nothing is dropped, repaired or counted; `omitted` is the server's value.
  - **Versions:** `readContractVersion` (`news-catalysts-read-v1`) on the envelope and `contractVersion` (`news-contract-v1`) per record are checked separately.
  - **Token and clock:** the token appears on one line building the `Authorization` header; no clock is read, `asOf` is injected.

## Requirement to test (plan.md map, condensed)

| Brief item | Test |
|---|---|
| CL-1 … CL-15 | `CL-1` … `CL-15` in `qa/news_catalysts_client_test.js`, one test each, named as the brief names them |
| §3 request contract (POST, Bearer, body exactly `{ticker, asOf}`, injected asOf) | RQ-1, RQ-2, RQ-4 |
| §3 result shape, three kinds, no second vocabulary | RQ-7 |
| §1.1 combination validation, §1.2 shapes, request correlation | CL-11, CL-12, CL-15, RQ-6 |
| Executor failure modes (precedent behaviour) | RQ-3, RQ-5 |

## Readings recorded where the brief is silent (Owner sees these at commit approval)

1. **`OK.records` must be non-empty.** The landed route returns `NOT_AVAILABLE` when nothing usable exists and never `OK` with zero records; an empty `OK` would be the empty success the route was built to prevent, so it fails closed as the pinned client result.
2. **Correlation.** `envelope.ticker`, every `record.ticker` and `envelope.asOf` must equal what was requested; the brief says `ticker` is "the requested ticker, known locally" and D-S3-1 field 1 says the same for records.
3. **Window.** `window` must be exactly `{from, to}` with `to` = the UTC date of `asOf` and `from` = 30 days earlier (`WINDOW_DAYS = 31`), by pure calendar arithmetic. This validates the echo; it re-derives nothing the adapter returns.
4. **Local `asOf` validation.** A malformed injected `asOf` returns `CLIENT_INVALID_INPUT` / `ASOF_INVALID` with zero fetch, next to the precedent's `TICKER_INVALID` and `TOKEN_INVALID`. It is a client-side token that no server status can collide with.
5. **Default timeout 30000 ms** (precedent 12000): the route makes up to 31 index reads plus one read per listed item.
6. **`omitted`** must be a non-negative integer; the adapter only validates it and never computes one.

## QA (see qa.log)

- Tests written first and run red (module absent), then green.
- Targeted: `qa/news_catalysts_client_test.js` 22 passed, 0 failed, 1240 assertions.
- Regression: `qa/fund_facts_read_client_test.js` 37 passed (precedent, untouched); `qa/news_catalysts_read_offline.js` 20 of 20 (S3-M1, untouched).
- Full `npm run qa:offline`: PASS, 46 suites, 1 pre-existing advisory. Not re-run after Codex because Codex changed nothing.
- Mutation checks (each reverted, file re-verified identical): removing the HTTP pairing, the `readContractVersion` check, whole-response record validation, the `NOT_AVAILABLE` envelope, the `DEGRADED` ticker rule, adding the token to the body, allowing an empty `OK`, and reading a field before `contractVersion` each fail at least one test. One variant survived and is equivalent: moving `contractVersion` after the key-shape check, which reads no field values.

## Codex

- Step 8, implementation diff (two new untracked files, contents supplied via the worktree): **NO FINDINGS, VERDICT: PASS.** Raw output in `codex.md`.

| # | Finding | Class | Disposition |
|---|---|---|---|
| — | none | — | no FIX, DEFER or REJECT to record |

- Step 12, final check on the task diff (implementation + this file): 1 finding, **Class II** — `review.md` lacked the `Final check:` summary line. **FIX** (line added below); no implementation change. Raw output in `codex.md` under `## Final check`.

Final check: 1 round, 1 class-II finding fixed, self-checked; no implementation change, no QA re-run.

## Lessons

- [local] A table-driven fixture builder must accept every parameter the table varies: `bodyFor` ignored the reason for `NOT_AVAILABLE`, so the first "unknown reason" case sent a valid body and only failed because the assertion was strict.
- [covered] Static scans over adapter source must strip comments and exempt `typeof x.subType` — covered by the scan design in `qa/news_catalysts_client_test.js` (`SERVICE_CODE`, the `scan` alias in CL-5).
- [backlog] S3-M3 must bind its state wording to the DH shared mapping for all 13 server statuses and the client-side `CLIENT_*` tokens, including `CLIENT_INVALID_INPUT`/`ASOF_INVALID` — pending routing
- [local] The brief's per-status `ticker` rule (ticker only on OK, NOT_AVAILABLE, DEGRADED) is stricter than the fund-facts precedent, which allows an optional echo; the brief won.
