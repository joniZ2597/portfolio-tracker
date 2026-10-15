# Review — anthropic-proxy-timeout-1

## Result
The Anthropic proxy's upstream abort timer is raised from 25 s to 50 s: the `TIMEOUT_MS` line in `netlify/functions/anthropic-proxy.js` is `50000`, with the comment `Netlify synchronous functions run up to 60 s (credit-based plans); keep a 10 s margin`. It is the only change to that file (one line; LF sha256 after the edit = `6dfec276…926f`, the value the brief pins). The ping path's 15 s timeout, the 4,000 `max_tokens` clamp, the P-5 gate, the error mapping and the logging are untouched. `index.html` is untouched, so the client's Haiku output cap stays 1,800. The new suite `qa/anthropic_proxy_timeout_offline.js` drives the real handler in-process with counterfeit `fetch` / `setTimeout` / `clearTimeout`.

## QA
- Step 0 baseline: `qa:offline` PASS, 95 suites (HEAD `e5a16a4`, node v24.14.0), after a read-only process check showed no other heavy run. Baseline blobs matched the brief: `anthropic-proxy.js` `c590d49e…`, `p5_call2_offline.js` `130b1b5f…`.
- RED (S1): against the unmodified source the new suite gave 6 failing rows: AT-1, AT-3 (both rows) and AT-4, as the brief predicts, plus two AT-N1 setup rows that need a 50000 source ("mutation applied" and the unmutated-control row; the mutation is a no-op on a source that is already 25000). AT-2 passes on the old source (60000 − 25000 ≥ 10000), as do the rows that pin unchanged behaviour.
- GREEN (S2): `qa/anthropic_proxy_timeout_offline.js` PASS, 23 asserts, 0 failures.
- Must-stay-green, unchanged files, all PASS: `p5_call2_offline` 401 asserts, `deep_dive_v0_offline` 74, `fund_facts_route_offline` 14.
- Step 10: full `qa:offline` PASS, 96 suites (= step 0 + 1), 0 FAIL, the same 1 pre-existing advisory warning (raw in `qa.log`).
- Planted negative AT-N1: on a temp copy of the production source the literal is restored to 25000; AT-1 and AT-4 both fail, and the unmutated control passes both.
- Post-resync (base `6f23f58`, tip `5863a25`): full `qa:offline` PASS, 97 suites (the resync brought in Worker A's `analyst-action-coverage-1` suite; this task's +1 is unchanged), 0 FAIL, the same 1 pre-existing advisory warning; the three land-tests (`anthropic_proxy_timeout` 23, `p5_call2` 401, `deep_dive_v0` 74) PASS. The 96-suite result above was the pre-resync run (raw in `qa.log`).

LAND-EVIDENCE: qa-offline=PASS 97; targeted=PASS; codex-classI-unresolved=0

## Reading used (wording, not a STOP)
- AT-2 is arithmetic on the documented 60 s limit, not a platform test (as the brief states); the platform limit is proven only by the later §4 long-duration DEV check, which this task neither runs nor depends on.
- AT-3 is asserted as two rows (the old "26s function limit" text is absent; the new comment names `60 s`).
- AT-4 also asserts the handler arms exactly one timer on the success path.
- AT-5 fires the captured timer against a fetch that rejects with `AbortError` on the real `AbortSignal`.
- The working-tree copy of the brief is CRLF (`core.autocrlf=true`); the committed blob (`4af32041…`) is what the task record's `briefSha256` covers, and it is unchanged.

## Form denial
Form denial: PowerShell process listing in a Worker slot (R2, nothing ran) -> reissued as the Bash `wmic process where "name='node.exe'"` form from AGENTS.md. Also, an intermediate raw QA capture was first written as `work/anthropic-proxy-timeout-1/qa-step0.raw`; it was folded into `qa.log` and deleted before any commit, so the five-file set was never left extended.

## Codex
- Round one (step 8): raw output in `work/anthropic-proxy-timeout-1/codex.md`. Verdict PASS: no Class I and no Class II findings. It confirmed the diff is exactly the one `TIMEOUT_MS` line, every brief row has a real assertion against the real handler, the planted negative mutates the production source copy, the suite is offline and restores everything it replaces, and no forbidden file changed.
- Final check (step 12, raw in `codex.md` under `## Final check`): no Class I findings. One Class II finding: the RED description named the wrong AT-N1 rows (the "AT-1 / AT-4 fail" rows would pass on a 25000 source; the rows that fail are the "mutation applied" and "control" setup rows). **FIXED** in the QA section above; the claim changed is a RED-record description, not a DoD tick, count or classification. Final check: 1 round, 1 class-II finding fixed, self-checked (every `work/<id>/` path named is one of the five canonical files; counts match `qa.log`; no Pending / TBD); no implementation change, no QA re-run.

## Files changed
- Implementation (2): netlify/functions/anthropic-proxy.js, qa/anthropic_proxy_timeout_offline.js
- Evidence (tracked): work/anthropic-proxy-timeout-1/brief.md, work/anthropic-proxy-timeout-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none (G-2 follow-up).
- Action taken: none. No `BACKLOG.md` edit; the finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- No live or DEV check: no Anthropic or Perplexity call, no deploy, no canary, no env change. The brief's §4 baseline-path DEV gate and the long-duration proof run only after LAND, push and deploy, and only with the Owner's approval. This task does not prove that a request longer than 26 s succeeds on Netlify.

## Lessons

- [covered] Hand-off for the G-2 cap change: the `index.html` comment at `P5_CALL2_TIMEOUT_MS = 28000` ("> proxy 25s … so a real 504 surfaces") is now outdated; the brief already records it (R-3) for the G-2 cap task, which owns `index.html` — already covered by brief §6 R-3.
- [local] A raw QA capture belongs in `qa.log` from the start; do not write it to any other name in `work/<id>/` (the set is closed).
