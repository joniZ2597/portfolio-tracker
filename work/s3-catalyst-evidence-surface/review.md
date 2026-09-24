# review.md — S3-M1 `news-catalysts-read` (catalyst evidence surface, read route)

Evidence only; authorizes nothing. Commit, LAND and SHIP remain Owner decisions.

| | |
|---|---|
| Brief | `work/s3-catalyst-evidence-surface/brief.md` (blob `570d3cd6…`), reader contract `D-S3-1-reader-contract.md` (blob `8fb5aed1…`), both committed in `b1a603c`, unchanged by this task |
| Task baseline | `f536cad` = `branch-dev` at task start (brief base `aa62aea` + six docs-only commits), fast-forwarded to `0526458` after S2-M1 landed (see rebase section); branch `task/s3-catalyst-evidence-read`, worktree `pt-wt-s3-catalyst-evidence-read` (fresh `npm ci`) |
| Result | **Implemented, NOT committed. Suite `qa/news_catalysts_read_offline.js` PASS (20 assertions). Full `qa:offline` PASS at 45 suites after the Owner-approved FR06 edit (STOP-1 below, resolved).** |

## Post-S2-M1 rebase evidence (2026-09-24)

| | |
|---|---|
| Rebase | task branch had no commits of its own, so it was fast-forwarded from `f536cad` to `branch-dev` = `0526458` (S2-M1 landed) with the uncommitted work kept intact; no conflicts |
| Delta `f536cad` to `0526458` | `AGENTS.md` (step 12a), `news-catalysts-provider.js` (adds one skip reason and renames one, both inside `skippedItems`), replay fixtures and the S2-M1 suites and review. Nothing else |
| D-S3-1 and S3-M1 assumptions | D-S3-1 and brief blobs unchanged (`8fb5aed1…`, `570d3cd6…`). The four provider symbols this reader imports and the four vocabularies are unchanged. `skippedItems` is not persisted, exactly as D-S3-1 §3 predicts, so no persisted field moved. `qa/run-offline.js` unchanged and still auto-discovering |
| FR06 edit | still applies cleanly: list 18 entries, directory 18 function files, wording says 18 |
| QA on the rebased tree | route suite 14 of 14 · S3-M1 suite 20 of 20 · full `qa:offline` PASS at 45 suites, 1 pre-existing advisory |
| Codex | no further round run: the step-12 final check and its one scoped re-pass are already used. The Class I below was ruled REJECT at the commit boundary |

## STOP-1 raised and RESOLVED by Owner ruling

Adding `netlify/functions/news-catalysts-read.mjs` makes `qa/fund_facts_route_offline.js` **FR06** fail. FR06 is a deliberate endpoint-exposure pin over the `netlify/functions` directory listing; its own text says "intentional additions require re-baselining", and the write endpoint's task (`9d71dc1`) edited the same list to add `news-catalysts.mjs`.

- The fix is one list entry: add `'news-catalysts-read.mjs'` to `EXPECTED_FUNCTIONS`. The list holds 17 entries today and 18 after; its label still reads "14" and is already stale, so the same edit should correct the label count.
- Proven sufficient without touching the repo file: a scratchpad copy with that one entry passes `fund_facts_route_offline` 14 of 14.
- That file is outside brief §8's four-file scope, so this task did **not** edit it (brief §12.1). `qa/run-offline.js` was also not edited.
- **Owner ruling (2026-09-24):** approved exactly one additional implementation file, `qa/fund_facts_route_offline.js`, limited to adding the entry and correcting the stale count wording. Applied: entry added; the two count mentions (comment and FR06 label) changed from 14 to 18, verified against the actual list (18 entries) and directory (18 function files). Diff is 3 insertions, 2 deletions; CRLF preserved. `fund_facts_route_offline` PASS 14 of 14; full `qa:offline` PASS at 45.

## Baseline / delta revalidation (brief §14 step 4) — PASS

| Check | Evidence |
|---|---|
| `aa62aea` → `f536cad` | six commits, all docs-only under `work/*/`; no implementation surface touched |
| Brief and contract tracked | both blobs in `b1a603c` |
| Clean tree, `qa:offline` PASS at 44 | first line of qa.log, fresh worktree |
| Four §8 paths absent | all four absent at `f536cad` |
| `qa/run-offline.js` unchanged and auto-discovering | empty diff against `aa62aea`; `OFFLINE_SUITE_RE` discovery plus `run_offline_discovery_offline` shape guard — no registration edit was needed, and suite count moved 44 to 45 by discovery alone |

## Files changed
- Implementation (4): netlify/functions/news-catalysts-read.mjs, netlify/functions/lib/news-catalysts-read-core.js, qa/news_catalysts_read_offline.js, qa/fund_facts_route_offline.js
- Evidence (tracked): work/s3-catalyst-evidence-surface/brief.md, work/s3-catalyst-evidence-surface/review.md

Brief §8 counted four files including `review.md`; the Owner-approved fourth implementation file, `qa/fund_facts_route_offline.js`, is the STOP-1 ruling above.

## What was built

- `news-catalysts-read.mjs` — 11-line runtime entry mirroring `fund-facts-read.mjs`; no config export, no logic.
- `news-catalysts-read-core.js` — all logic. Chain: CORS preflight, gate, method, auth-first probe with ticker withheld, body parse, unknown-key rejection, full preflight, instant validation, store read, response.
  - **Gate:** `process.env.PT_ENABLE_NEWS_CATALYSTS_READ_SERVER !== 'true'` checked before any I/O; distinct from the write gate.
  - **Window:** D0 is the UTC date of the injected `asOf`; exactly 31 strong index reads, D0 through D0−30, computed by calendar arithmetic with no clock.
  - **Missing day:** a missing index is skipped and the loop continues. `NOT_AVAILABLE/NO_RECORD` only after all 31 attempts and no usable record.
  - **Fail-visible:** any store throw is `DEGRADED/STORE_UNAVAILABLE`. Unreadable index or item bytes, an unusable index shape, a dangling pointer, or a record filed under a key that does not name it is `DEGRADED/STORE_RECORD_INVALID`, with no `records` field.
  - **Conformance:** a parsed record failing D-S3-1 §6 is omitted and counted. Returned records are projected to exactly the 19 fields in persisted order.
  - Only the four brief §9 provider symbols are imported; the closed vocabularies are the frozen D-S3-1 values held locally.
- `news_catalysts_read_offline.js` — R-1 to R-13 plus S-1 to S-7.

## QA (see qa.log)

| Run | Result |
|---|---|
| Pre-edit baseline | `qa:offline` PASS, 44 suites, 1 pre-existing advisory |
| Tests first | 19 of 19 fail, core absent |
| Impl run 1 | 18 pass, 1 fail: R-11 counted the write core's setup writes — a test defect, fixed by reading through a fresh store |
| Impl run 3 (final) | suite ALL PASS, 20 assertions |
| Mutation pass 1 | 16 planted mutants: 15 killed, 1 equivalent (below) |
| Mutation pass 2, after fixes | 13 planted mutants: 13 killed |
| Full `qa:offline` before the FR06 edit | 45 suites; sole hard failure FR06 (STOP-1) |
| Full `qa:offline` (final, after FR06 edit) | **PASS, 45 suites**, 1 pre-existing advisory |

Equivalent mutant: dropping the explicit "all 19 keys present" loop changes nothing observable, because each of the 19 fields already has a value rule that fails on `undefined`. The loop is kept because it states the D-S3-1 rule.

## Contract checks

**D-S3-1 conformance:** 19 fields in persisted order (R-8 round-trips records written by the real write core, byte-equal); absent is not null (R-9); `contractVersion` checked first (R-9); both conditional-null rules (R-9); `subType` treated as opaque text, never switched on (C-1); `skippedItems` and envelope internals never returned (R-12); ticker-agnostic (S-6). The frozen vocabularies match the provider's today, with a tripwire that fails if either moves (S-7).

**STOP conditions 1–18:**

| STOP | Status |
|---|---|
| 1 file beyond four | raised, then **cleared by Owner ruling** — FR06 file edited within the ruling only |
| 2 any S2-M1 file | clear |
| 3 store write / index mutation | clear (R-11) |
| 4 grounding / identity / normalization / skip logic | clear; the key check compares a key's own components to the record's own fields and recomputes nothing |
| 5 `skippedItems` / `SKIP_REASONS` | clear (R-12) |
| 6 field outside the 19 / out of order | clear (R-8) |
| 7 partial record | clear (R-7) |
| 8 `NOT_AVAILABLE` before 31 partitions | clear (R-4, R-5) |
| 9 `DEGRADED` shown as `NOT_AVAILABLE` or empty | clear (R-6, R-7); see reading 4 |
| 10 wall clock | clear (R-13) |
| 11 ticker-specific branch | clear (S-6) |
| 12 write gate reused | clear (S-2) |
| 13 unbounded or non-31 window | clear (R-10) |
| 14 D-S3-1 changed | clear, untouched |
| 15 live call / Netlify / env | clear, none made |
| 16 suite count other than 45 | clear, 45 |
| 17 LAND before S2-M1 | clear, not attempted |
| 18 `qa/run-offline.js` edited | clear, untouched, discovery sufficed |

## Readings recorded (brief wording versus implementation)

1. **Read token.** Brief §1 requires a token/allowlist preflight but names no token. Following `fund-facts-read`, a distinct `PT_NEWS_CATALYSTS_READ_TOKEN` is used, checked against every other known token, over the shared `PT_NEWS_CATALYSTS_ALLOWED_TICKERS`. It must be provisioned at activation.
2. **Request shape.** Body `{ ticker, asOf }`; `asOf` is the injected instant. Brief names no field.
3. **`TICKER_NOT_ALLOWED`** returns 403, not `NOT_AVAILABLE`, because brief §3 reserves `NOT_AVAILABLE` for the completed window. This overrides the `fund-facts-read` mapping.
4. **All-omitted window.** If every stored record in the window fails conformance, the route returns `NOT_AVAILABLE/NO_RECORD` with the `omitted` count, per brief §3, §5 and R-9. Codex read this as a `DEGRADED` case; brief text specifies "omitted and counted", so it is kept. **Owner may prefer `DEGRADED` here; it is a one-branch change.**
5. **Response envelopes.** OK carries `status, readContractVersion:'news-catalysts-read-v1', ticker, asOf, window{from,to}, records, omitted`. Records are ordered newest partition first, index order within a day, first-seen wins on a repeated key.

## Codex (see codex.md)

Step 8, read-only, codex-cli 0.154.0, on the three untracked implementation files versus empty (base `f536cad`): **HOLD, 4 Class I findings.**

| # | Finding | Class | Ledger |
|---|---|---|---|
| 1 | All-omitted window returns `NOT_AVAILABLE`, not `DEGRADED` | I | **REJECT** — brief §3, §5 and R-9 specify "omitted and counted"; count is in the body; flagged as reading 4 |
| 2 | Index `fetchedAt`, `sourceTier`, `provider` not validated | I | **FIX** — now checked; R-7 cases added; 3 mutants killed |
| 3 | `Date.UTC` remaps years 0 to 99, so window partitions were wrong | I | **FIX** — parsed from ISO text; year 0099 and 2100 cases added; a window that would cross below year 0000 is rejected as an invalid instant, while windows staying inside year 0000 are read normally; 2 mutants killed |
| 4 | Key date and hash never compared with the record's own fields | I | **FIX** — mismatch is `DEGRADED/STORE_RECORD_INVALID`; 2 R-7 cases; mutant killed |
| 5 | (self-review) core imported four provider vocabularies; brief §9 names four other symbols | I | **FIX** — frozen local vocabulary, S-7 tripwire and four-import pin in S-4; 3 mutants killed |

Final check (step 12, read-only, task diff = the three implementation files plus this file; raw output in codex.md): **HOLD, 4 findings.**

| # | Finding | Class | Ledger |
|---|---|---|---|
| 6 | Index `fetchedAt` is grammar-checked but not matched to the partition date it was read from, so a misfiled index would be accepted | I | **FIX** — the UTC date of `fetchedAt` must equal the partition date, which the write core always guarantees; two misfiled R-7 cases added; 2 mutants killed. Earns a full `qa:offline` re-run and one scoped Codex re-pass |
| 7 | This file said the FR06 label goes 14 to 15; the list has 17 entries and becomes 18 | II | **FIX** — corrected in the STOP-1 section |
| 8 | "year-0000 windows rejected" overstated the guard | II, reclassified I (a claim about the implementation) | **FIX** — wording now states exactly what is rejected |
| 9 | `qa.log`, `codex.md`, `plan.md` not visible in the worktree | II | **FIX** — recorded below: they live in the session scratchpad per the Owner ruling of 2026-09-22 |

Re-run after the fixes: suite PASS (20 assertions), full `qa:offline` 45 suites with only FR06 failing. **Scoped Codex re-pass on the changed hunks only: PASS, no findings** (raw output in codex.md under the re-pass heading). No third Codex round was run and no Class I finding is unresolved.

Untracked task evidence (`plan.md`, `codex.md`, `qa.log`) is kept outside the worktree in the session scratchpad, per the Owner ruling of 2026-09-22 (worktree = implementation files plus tracked `review.md` only); the three names are gitignored either way. Codex's own sandbox therefore cannot see them.

## Not touched

`news-catalysts-provider.js` · `news-catalysts-core.js` · `news-catalysts.mjs` · `news-catalysts-preflight.js` · `evidence-contract.js` · every `qa/news_catalysts_{provider,core,replay}_offline.js` · `qa/fixtures/replay/**` · `qa/run-offline.js` · `index.html` · `BACKLOG.md` · `D-S3-1-reader-contract.md` · `brief.md` · `main`/production · Netlify · env · any live call.

## Lessons

- [rule]     A brief that adds a `netlify/functions/*` entry must list `qa/fund_facts_route_offline.js` (the FR06 exposure pin) in its implementation scope and count it in the file total; the "QA suites that read in-scope files as text" question in a brief must be answered by reading the directory-pinning suites, not by a require-sweep.
- [backlog]  `news-catalysts-preflight.js` `COLLISION_KEYS` does not list `PT_NEWS_CATALYSTS_READ_TOKEN`, so the collision check is one-directional: an identical read and write token is refused by the read route but not by the write route — pending routing
- [design]   S3-M2 and S3-M3 must treat `omitted > 0` as visible state: an all-omitted window returns `NOT_AVAILABLE` with the `omitted` count, and must not be rendered as "no catalysts" without it.
- [design]   The reader holds its own frozen copy of the D-S3-1 vocabularies with a suite tripwire against the provider; S2-M3 or any re-freeze under carve-out C-2 must update both together.
- [local]    R-11's first failure was a test defect: the observed store included the real write core's setup writes. Observed stores must be read-phase only.
- [local]    Adjacent-day fixtures near year boundaries need `Date.parse` on ISO text, never `Date.UTC(year, …)`, in tests and production alike.

Final check: 1 round, 4 findings — 1 class-I FIX (index partition date; QA re-run PASS at 45 suites with only the escalated FR06 failing, scoped Codex re-pass PASS with no findings), 2 class-II fixed, 1 class-II reclassified class-I (claim wording, covered by the same QA re-run and re-pass), self-checked; 0 unresolved class-I findings.

## Final check after the Owner-approved FR06 edit

Read-only Codex check on the complete task diff (raw output in codex.md, under its own heading): **HOLD, 1 Class I, 2 Class II.**

| # | Finding | Class | Ledger |
|---|---|---|---|
| 10 | Timestamps (index `fetchedAt`, record `retrievedAt`) were shape-checked only, so `T99:99:99Z` was accepted | I | **FIX** — both now go through the calendar-checked instant parser; three new cases (record impossible time, record impossible date, index impossible time); 2 mutants killed |
| 11 | FR06 wording still attributes the list to baseline 12 entries plus two additions | II | **DEFER** — confirmed by Owner ruling at commit approval; the FR06 edit stays limited to the entry and the numeric count; provenance wording belongs to a task that owns that file's prose |
| 12 | "recorded below" had no result below it | II | **FIX** — replaced by this section |

Re-run after the fix: suite PASS (20 assertions), full `qa:offline` PASS at 45 suites. One scoped Codex re-pass on the changed hunks (raw output in codex.md) returned **HOLD with one new Class I**, which per the step-12 contract is not applied and starts no third round:

- **Class I, REJECTED by Owner ruling at commit approval (2026-09-24):** the reader stays strict; an impossible stored timestamp remains non-conforming and fails visibly. The write-core seam is outside this task and production writes do not produce that state. Original finding: the write core validates its injected clock only by shape, so through its offline test seam it can persist an impossible timestamp such as `2026-09-24T99:99:99Z`, which the reader now correctly refuses. Production writes take the clock from a real date and cannot produce one; only an injected test clock can. The write core is out of this task's scope.
- Two Class II findings from the same pass (case count said four, summary line missing) are fixed here.

Final check: 2 rounds after the FR06 edit, 2 class-I findings — 1 FIX (timestamp validation; QA PASS at 45, mutants killed), 1 raised by the re-pass (write-core seam, above), REJECTED by Owner ruling; 1 class-II DEFER, class-II documentation findings fixed, self-checked; 0 unresolved class-I findings.

Post-rebase check: 0 Codex rounds (limits exhausted), QA re-run on `0526458` PASS at 45, self-checked; no implementation change; the one open class-I finding (write-core seam) was ruled REJECT by the Owner at commit approval.
