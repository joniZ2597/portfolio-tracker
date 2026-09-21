# Task review: news-catalysts Perplexity Agent API migration — S1.5.2

Base `463e1c8` (brief commits `b6cbef2` initial approved, `480be62` Revision-3 core-QA-fixture-scope
amendment approved) · worktree `pt-wt-news-catalysts-agent-api`, branch `task/news-catalysts-agent-api`.

**Status: READY FOR FINALIZATION.** Both Codex round-2 findings are Owner-ruled FIX and applied;
all completion gates re-verified green after both fixes.

## Mid-task STOP-1 and the Revision-3 amendment

Immediately after implementing the transport migration, running the full targeted-suite gate
surfaced that `qa/news_catalysts_core_offline.js` — Revision 2's "must NOT move — the ENTIRE core
suite" — failed 14/30 tests. Root cause: that file's own local Sonar-shaped fixture builder
(`sonarResponse`, `twoItemFixture`) drives most of its integration tests through the REAL,
now-migrated provider; once the provider only accepted Agent-shaped envelopes, those fixtures no
longer normalized. This was a genuine STOP-1 (brief contradicted actual code; a third file became
necessary) — held without a workaround. Owner ruling: approve Revision 3, which narrows "must not
move" to every NW01–NW30 *behavioural assertion and expected outcome* (unchanged) while explicitly
permitting the *local transport fixture helper* in that one file to be updated so it keeps emitting
a shape the real provider accepts. Revision 3 (`ce1da596...`) landed as its own approved brief-only
commit `480be62` before implementation resumed, widening the implementation scope to exactly three
files.

## Implementation vs. the approved (Revision 3) brief

- `netlify/functions/lib/news-catalysts-provider.js` — `PPLX_ENDPOINT` → `'https://api.perplexity.ai/v1/agent'`;
  `PPLX_MODEL` value → `'low'` (identifier kept, D-M8); `buildRequestBody(ticker, nowIso)` — new
  `(ticker, nowIso)` signature (D-M4, a visible amendment to the S1.5 "pure function of the ticker"
  ruling), request body now `{ preset, instructions, input, tools, response_format }`; the
  `instructions` field carries the original system text plus a `nowIso.slice(0,10)` UTC date anchor
  (no `new Date()`, no ambient-clock read, no arithmetic); `input` carries the S1.5 taxonomy prompt
  **unchanged, word for word** in its single `{type:'message', role:'user', content}` entry; `tools`
  is exactly `[{type:'web_search'}]`; `response_format.json_schema` gains `name: 'newsCatalysts'`
  (exact literal, Owner-ruled) alongside the byte-unchanged `schema`; `strict` is never sent.
  `adaptAgentResponse` — new, non-exported — is the sole function with knowledge of `output[]`,
  `status`, item `.type` strings, `results`, `annotations`, and the `search_results` /
  `fetch_url_results` / `url_citation` literals: it fails closed on `status !== 'completed'`, locates
  the generated content by type (never index, via `findFirst` + an in-adapter predicate — see Codex
  round 2 below), validates every grounding-bearing field before extraction, and builds the internal
  Evidence Set in the D-M2 fixed order (search_results → fetch_url_results → url_citation,
  first-occurrence-wins). `normalizeNewsResponse` calls the adapter in place of the old
  `choices[0].message.content` + top-level `citations`/`search_results` parsing; Tier-B conditions
  2/3/4/5/7 and the entire Tier-C ladder, grounding correlation (`resolveGrounded`,
  `normalizeHttpsUrl`), identity construction and projection are byte-for-byte unchanged below the
  adapter. `findFirst`/`appendEvidenceEntry`/`validGroundingField` are fully transport-agnostic leaf
  helpers — none references any field name, Agent item-type string, or literal value; `findFirst`
  takes a caller-supplied predicate, and the `.type` comparisons live only inside `adaptAgentResponse`
  itself. No new import; requires stay at `crypto` + `./evidence-contract`.
- `qa/news_catalysts_provider_offline.js` — NP01/NP03/NP08 re-baselined for the Agent request/response
  shape; NP21 gains the nowIso-anchor-determinism assertion; NP23/NP27/NP28/NP29 updated for the new
  body shape (`input[0].content` in place of `messages[1].content`) and one doc-comment false-positive
  fixed (a comment's own literal text was tripping the `Date.now()` forbidden-surface scan); NP33–NP39
  added (status fail-closed, three-source union, lookup-by-type, unrecognised-type tolerance,
  zero-grounding NONE, endpoint literal, Evidence Set retention). `agentResponse`/`agentShell` fixture
  builders replace `sonarResponse` (renamed, and the legacy `citations`/`searchResults` two-argument
  shape is preserved by mapping them onto `url_citation`/`search_results` respectively, so every
  pre-migration fixture keeps working unedited).
- `qa/news_catalysts_core_offline.js` (Revision-3 §8a, strictly bounded) — **only** the local
  `sonarResponse(items, citations)` fixture-building helper's body changed, to emit an Agent-shaped
  envelope (`citations` → `url_citation` annotations) instead of the old Sonar shape. No other line in
  this file changed. `news-catalysts-core.js` itself: zero diff.

Frozen/untouched: `news-catalysts-core.js`, `news-catalysts-preflight.js`, `evidence-contract.js`,
`evidence-freshness.js`, `news-catalysts.mjs`, `qa/run-offline.js`, `qa/fund_facts_route_offline.js`,
`qa/instruction_layer_offline.js`, `index.html`, `services/**`, `netlify.toml`, `package.json`. No
gate, env, credential, or Netlify change. `DEFAULT_TIMEOUT_MS` unchanged at `22000`. Export surface
still exactly 16 names, unchanged. No live Perplexity call at any point.

## QA / verification evidence

| Check | Result |
|---|---|
| `node qa/news_catalysts_provider_offline.js` (after both round-2 fixes) | **39/39 PASS** (NP01–NP39 contiguous) |
| `node qa/news_catalysts_core_offline.js` (after both round-2 fixes) | **30/30 PASS** (all NW01–NW30 assertions and outcomes unchanged) |
| `npm run qa:offline` (after both round-2 fixes) | **PASS, 43 spawned suites** — identical to baseline |
| Production-core diff | `git diff -- netlify/functions/lib/news-catalysts-core.js` → **empty** |
| Implementation diff scope | exactly 3 files (`git diff --stat 463e1c8` vs. base, excl. `work/`/`BACKLOG.md`) |
| Export surface | exactly 16 names, unchanged (`getNewsCatalysts, normalizeNewsResponse, buildNewsKey, REQUEST_SCHEMA, CONTRACT_VERSION, SOURCE_TIER, PROVIDER_ID, IDENTITY_SCHEMA_VERSION, PPLX_ENDPOINT, PPLX_MODEL, CATEGORIES, EVENT_TYPES, RELEVANCE_SCOPES, DIRECTIONS, SKIP_REASONS, NEWS_KEY_RE`), re-verified by direct `Object.keys` count and by NP23 |
| `strict` in request | absent (verified by NP01) |
| `json_schema.name` | exact literal `'newsCatalysts'` (verified by NP01) |
| `DEFAULT_TIMEOUT_MS` | `22000`, unchanged |
| `CONTRACT_VERSION` / `SOURCE_TIER` / `PROVIDER_ID` / `IDENTITY_SCHEMA_VERSION` | unchanged (`news-contract-v1` / `perplexity_retrieval` / `j3-news-catalysts@job-model-v1` / `j3-identity-v2`) |
| `CATEGORIES` / `EVENT_TYPES` / `RELEVANCE_SCOPES` (taxonomy) | unchanged, re-verified directly |
| NP39 structural proof self-test | confirmed non-vacuous: deleting the `snippet` assignment from the real source made NP39 fail with the exact expected message; restoring it returned 39/39 PASS |

## Codex review

**Round 1 (step 8)** — `codex review --uncommitted` over the complete 3-file implementation diff.

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | P2 — `buildEvidenceSet` was a second function interpreting `output[]`, item `.type`, `results` and `annotations`, splitting Agent-shape knowledge across two functions instead of containing it in the single adapter seam (brief §1) | **FIX** | Folded the three-source traversal directly into `adaptAgentResponse`; removed `buildEvidenceSet` and `extractCitationFields` as standalone functions. Re-ran provider QA (39/39) and core QA (30/30) and full `qa:offline` (PASS, 43 suites) after the fix — all green. |

**Round 2 (scoped re-pass, earned by round 1's FIX)** — `codex review --uncommitted` re-run over the
same complete diff (the CLI's `--uncommitted` mode cannot be combined with a narrowing custom prompt,
so the re-pass covered the full diff rather than only the changed hunk; the outcome is equivalent).
Found **two new findings**, neither present before the round-1 fix:

| # | Finding | Class | Owner ruling | Resolution applied |
|---|---|---|---|---|
| 2 | P2 — `findByType` (a small, generically-parameterized array lookup) still reads an item's `.type` field directly, so under a maximally strict reading of brief §1 ("the only place that knows about ... item `type` strings") a future transport change would touch two functions, not one | **FIX** | Preserve the single-adapter invariant literally: no function outside `adaptAgentResponse` may directly interpret the Agent output item's `.type` field. Do not build an unnecessarily large monolithic adapter — replace `findByType` with a fully transport-agnostic, predicate-based first-match helper instead. | `findByType(list, type)` replaced with `findFirst(list, predicate)` — a helper with zero knowledge of any field name or literal value; it only calls a caller-supplied predicate. The `.type === 'message'` / `.type === 'output_text'` comparisons and the `'message'`/`'output_text'` literals now live in predicate closures defined *inside* `adaptAgentResponse` itself. No behavioral change, no new export, no scope expansion — verified by re-running NP01–NP39 (39/39 PASS, including NP35's reorder-by-type proof). |
| 3 | P2 — NP39 confirms Evidence Set entries with full 9-field metadata still resolve, and confirms none of the 6 provider-internal fields leak into the public output, but never positively inspects the *internal* entry object itself — so if `appendEvidenceEntry` silently stopped copying `id`/`title`/`date`/`lastUpdated`/`snippet`/`evidenceKind`, NP39 would still pass | **FIX, QA only** | No debug/test export — production export surface stays exactly 16. Strengthen NP39 with a private indirect structural proof, scoped specifically to `appendEvidenceEntry`'s own implementation (not a whole-file keyword scan), mechanically verifying it retains all nine Evidence Set fields (`id`, `raw`, `normalized`, `domain`, `title`, `date`, `lastUpdated`, `snippet`, `evidenceKind`). Keep the existing leak-proof that these fields never reach the public item output — acceptable because the metadata is intentionally inert in S1.5.2 and has no legitimate public surface to observe it through otherwise. | Added a source-scoped structural check to NP39: extracts `appendEvidenceEntry`'s function body by brace-depth (the same technique NP27 already uses), then asserts a specific regex match for each of the nine field assignments (`raw: checked`, `normalized: normalized`, `domain: new URL(...)`, `evidenceKind: evidenceKind`, and the four `entry.<field> = raw.<field>` conditionals plus `snippet`). **Verified the proof is not vacuous**: temporarily deleted the `snippet` assignment from the real source, confirmed NP39 failed with `appendEvidenceEntry must assign the "snippet" Evidence Set field`, then restored it and confirmed 39/39 PASS again. The existing no-leak assertions (six sentinel values checked absent from the public output) are unchanged. |

Per AGENTS.md step 12's protocol, no third Codex round was run after these round-2 Owner rulings —
the protocol stops Codex after the round-2 rulings are applied. Both fixes were re-verified against
the full completion-gate set (below) rather than re-submitted to Codex.

## Files changed
- Implementation (3): `netlify/functions/lib/news-catalysts-provider.js`,
  `qa/news_catalysts_provider_offline.js`, `qa/news_catalysts_core_offline.js`
- Evidence (tracked): `work/news-catalysts-agent-api/brief.md`, `work/news-catalysts-agent-api/review.md`

## Lessons

- [rule] A brief's own "must not move" list can be right about *outcomes* while being wrong about
         *mechanism* — Revision 2 correctly wanted zero behavioral drift in the core suite but didn't
         account for that suite owning its own copy of a wire-shape-dependent fixture builder. Before
         accepting a "this file is unaffected" claim in a transport-migration brief, grep every OTHER
         QA file for its own local fixture-construction helpers that drive the same module under
         test, not just the ones in the file already being edited.
- [rule] "The only function that knows X" is a strict, checkable invariant, not a code-quality
         aspiration — Codex caught two levels of it in successive passes (a full second function
         first, then a shared low-level helper's field access second). Read a single-responsibility
         seam requirement as literally as a contract field when applying it, and expect a strict
         Codex read to go one level deeper than the first pass fixed.

## Final status

READY FOR FINALIZATION. Implementation matches the approved (Revision 3) brief exactly, including
both Owner-ruled Codex round-2 fixes (single-adapter invariant preserved literally via `findFirst`;
NP39 strengthened with a self-verified, non-vacuous structural proof). Final check: 2 rounds
(round 1: 1 class-I FIX; round 2 scoped re-pass: 2 class-I findings, both Owner-ruled FIX and
applied), QA re-run after every code change (provider 39/39, core 30/30, `qa:offline` 43/43 — all
three re-confirmed after both round-2 fixes), no third Codex round per protocol. Export surface,
contract fields, identity fields, taxonomy vocabularies, `DEFAULT_TIMEOUT_MS`, and
`news-catalysts-core.js` all independently re-verified unchanged. Implementation diff is exactly the
three approved files. Commit approval requested for the implementation diff (three files) plus this
`review.md`; LAND is a separate Owner decision. No push, LAND, deploy, env/gate/Netlify change, or
live Perplexity call at any point in this task.
