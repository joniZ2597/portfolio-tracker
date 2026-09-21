# Task review: news-catalysts Agent default timeout — S1.5.2 F-2

Base `71d572b` (brief-only commit `0594395`, approved at working-tree SHA256 `520bbf0e…5b389a` /
blob `321cbc91…e2e1d1f`) · worktree `pt-wt-news-catalysts-agent-api-f2`, branch
`task/news-catalysts-agent-api-f2`.

**Status: READY FOR FINALIZATION.** Implementation matches the approved brief; all completion gates
green; one Codex round, zero findings.

## Origin

Owner ruling **F-2** (2026-09-21) after S1.5.2 Pilot 2 and Pilot 2B live measurements: successful
Agent calls ran 21.9–32.9 s, the one call run at the 22 s default timed out (`PROVIDER_FAILURE`), and
one call exceeded the 35 s pilot allowance. The Sonar-era 22 s default is operationally insufficient
for the Agent transport. Ruling: raise the news-catalysts provider default to 45 000 ms, preserve the
injected override, add no retry, keep fail-closed behaviour, keep Fund Facts at 22 000, change nothing
else.

## Implementation vs. the approved brief

- `netlify/functions/lib/news-catalysts-provider.js` — one hunk: `var DEFAULT_TIMEOUT_MS = 22000;`
  becomes `var DEFAULT_TIMEOUT_MS = 45000;`, preceded by an eight-line comment recording the F-2
  ruling, the live latency basis, the §3 runtime boundary (45 s intentionally below the recorded 60 s
  synchronous Netlify ceiling; execution mode unchanged; full ceiling not consumed), that the injected
  override still wins, that no retry exists, that a timeout still fails closed, and that
  `fund-facts-provider.js` keeps its own separate default. The seam
  `timeoutMs: posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)`, `pplxPostText`, the AbortController /
  `setTimeout` mechanics and every other line are byte-for-byte unchanged (verified: neither `posInt(`
  nor `pplxPostText` nor `controller.abort` appears in the diff). The literal `22000` no longer appears
  anywhere in the provider source.
- `qa/news_catalysts_provider_offline.js` — **NP02 only**, gaining a source-scoped pin (the NP38 /
  NP27 technique, reading the provider via the suite's existing `SRC`): (a) the source declares exactly
  `var DEFAULT_TIMEOUT_MS = 45000;` as a whole line, (b) `posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS)`
  is present verbatim, (c) `22000` is absent from the provider source. The existing `timeoutMs: 25`
  hanging-fetch case (⇒ `PROVIDER_FAILURE`) is unchanged and continues to prove the timeout path
  behaviourally. Test count 39; no test added, removed, renamed, skipped or weakened.

Frozen/untouched, re-verified: **`fund-facts-provider.js` absent from the diff, its
`DEFAULT_TIMEOUT_MS = 22000` still present (grep count 1)** · `fund-facts-core.js` ·
`news-catalysts-core.js` (zero diff) · `qa/news_catalysts_core_offline.js` (zero diff) · endpoint ·
preset · request body / prompt / `REQUEST_SCHEMA` · Evidence Set · grounding · taxonomy · identity ·
persistence · Netlify execution mode (`netlify.toml` still `[build]` only; no `config` export; no
`-background` name) · env · gates · export surface **16** · 17-field item contract · **no retry** (the one
added line matching `/retry/` is the comment stating none exists). No live Perplexity call.

## Runtime boundary (brief §3) — recorded

The 45 s provider timeout is intentionally below the currently recorded 60 s synchronous Netlify
execution ceiling for the `news-catalysts` route. This task did not change the execution mode and did
not attempt to consume the full ceiling. No evidence surfaced during implementation that the route
needs a wider timeout or a runtime redesign; had it, that would have been STOP-1, not solved here. The
60 s figure is relied on as recorded in `work/news-catalysts-agent-api/brief.md` §7 and was not
re-verified against Netlify in this task.

## QA / verification evidence (raw in `qa.log`)

| Check | Result |
|---|---|
| Step-0 pre-edit baseline `npm run qa:offline` @ `0594395` | **PASS, 43 spawned suites** |
| Red run (NP02 pin added, provider unpatched) | **NP02 FAIL** on the 45000 pin; **38 pass** |
| `node qa/news_catalysts_provider_offline.js` (post-patch) | **39/39 PASS**, NP01–NP39 contiguous |
| `node qa/news_catalysts_core_offline.js` (post-patch, file unmodified) | **30/30 PASS** |
| `npm run qa:offline` (post-patch) | **PASS, 43 spawned suites** — identical to baseline |
| Implementation diff scope vs `71d572b` (excl. `work/`, `BACKLOG.md`) | **exactly 2 files** (+21 / −1) |
| Brief §6 step 9 planted negative (literal temporarily `22000` in the real source) | **NP02 FAIL only (38 pass)**; restored **byte-identical** (sha256 verified); **39/39** again |
| `grep -c 22000` provider / fund-facts `DEFAULT_TIMEOUT_MS = 22000` | **0 / 1** |
| Export surface / public item fields | **16 / 17** |
| Line endings | both files CRLF-in-working-tree / LF-in-index, unchanged convention (CR = LF count) |

## Codex review

**Round 1 (step 8)** — `codex review --uncommitted` (codex-cli 0.154.0, model gpt-5.6-sol, reasoning
high) over the complete two-file implementation diff; raw transcript verbatim in `codex.md`. Codex
independently re-ran provider, core and full offline QA inside the worktree, all PASS, and left the
tree unchanged.

| # | Finding | Class | Resolution |
|---|---|---|---|
| — | **None.** Verbatim conclusion: "The timeout change is narrowly applied, preserves the override seam, and adds the required source assertions. Provider, core, and full offline QA all pass." | — | Nothing to FIX / DEFER / REJECT |

Per the Owner's instruction for this task ("run Codex once on the complete two-file implementation
diff"), no second Codex round and no step-12 final task-diff check were run; this deviation from
`AGENTS.md` step 12 is recorded here and surfaced for the Owner at commit approval.

## Files changed
- Implementation (2): `netlify/functions/lib/news-catalysts-provider.js`, `qa/news_catalysts_provider_offline.js`
- Evidence (tracked): `work/news-catalysts-agent-api-f2/brief.md`, `work/news-catalysts-agent-api-f2/review.md`

## Lessons

- [design] A per-provider default timeout is a transport property, not a house constant. When two
         providers share a literal by value (news-catalysts and fund-facts both at 22 000), a brief
         must name which one moves and pin the other by grep, as this one did — otherwise "shared house
         convention" invites a symmetric edit. Destination: `work/catalyst-news/breakdown.md`, Gates /
         environment row: *provider timeouts are per-transport; news-catalysts Agent = 45 s, fund-facts
         SEC = 22 s; each change is its own ruling.*
- [backlog] The Agent transport's steady-state latency (21.9–32.9 s, >35 s once) leaves ~15 s of
         route budget under the recorded 60 s synchronous ceiling. If Pilot 2C or production telemetry
         shows the route regularly near that ceiling, the fix is an execution-mode decision (Background
         Function / Async Workloads), not a larger timeout — pending routing.
- [local] A behavioural default-timeout test would need a 45 s hang in an offline suite; the honest
         pin for a module-private default is source-scoped, paired with the existing injected-override
         behavioural case.

## Final status

READY FOR FINALIZATION. Implementation matches the approved brief exactly (two files, one literal plus
its comment in the provider, NP02-only QA change, count 39). Red-then-green sequence and the step-9
planted negative recorded in `qa.log`. Final check: 1 round, 0 findings; no step-12 task-diff Codex
check per Owner instruction (recorded above). Commit approval requested for the implementation diff
(two files) plus this `review.md`; LAND, push, deploy, env/gate/Netlify change and the final live
default-timeout check are each separate Owner decisions and none has been taken.
