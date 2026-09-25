# Review — S2 hub-page measurement

## Result
Measurement complete; HM-1..HM-6 hold. Codex implementation review: **PASS, 0 findings** (raw in `codex.md`).
Review: standard Codex (not the fallback). An earlier attempt failed with `401 Unauthorized` (0.154.0); after
read-only diagnostics, a later fixed probe ("Reply with the single word OK", 2026-09-25T23:44:42Z UTC) succeeded, so
the Owner-approved fallback precondition (two probes failing with the same class) was not met and was not used.

## Measured
- 35 survivors over 9 cases: 35 article-specific; root/generic-leaf/hub-listing/other 0.
- 7 hub-class URLs, all `nvidianews.nvidia.com/news/latest` `search_results` entries (p3-NVDA ×3, p4-2312Z-NVDA ×4); none a candidate, survivor or skip.
- H1 and H2: 0 survivors dropped; no `expected.*` or `fixtureSha256` change in any of 9 cases. Synthetic control showed both predicates live.
- HM-3: baseline scratch replay byte-identical 9/9; fixture SHA-256 = `index.json` 9/9.
- HM-6: `qa:offline` PASS, 47 suites before and after (`qa.log`).
- HM-5: only `work/s2-hub-page-measurement/` paths differ; scratch harness outside repo, deleted.

## Findings ledger
| Source | Finding | Class | Disposition |
|---|---|---|---|
| Codex implementation review | none | — | PASS |
| Claude subagent pre-review (not Codex, supplementary) | "scratch deleted" claim true only after cleanup | II | FIXED — scratch deleted |
| Claude subagent pre-review | did not re-run scratch replay / QA | — | REJECT: informational; both recorded in `qa.log` / `measurement.md` |

## Files changed
- Implementation (0): none
- Evidence (tracked): work/s2-hub-page-measurement/brief.md, work/s2-hub-page-measurement/review.md, work/s2-hub-page-measurement/measurement.md

## Lessons
- [local] Codex 0.154.0 returned 401 for a period while `codex login status` showed ChatGPT login; it recovered without credential changes. Cause not identified.
- [backlog] Intermittent Codex 401 with ChatGPT login: root cause unidentified — pending routing

## Final check
Final check: 1 round, 0 findings; no implementation change, no QA re-run. (Raw output in `codex.md` under `## Final check`.)
