# Task review: news-catalysts Agent API `fetch_url_results` correction — S1.5.2 F-1

Base `2e3ca40` (brief-only commit `abcc861`, approved at working-tree SHA256
`f748d1e9…f855dc` / blob `6f611918…80bc7`) · worktree `pt-wt-news-catalysts-agent-api-f1`, branch
`task/news-catalysts-agent-api-f1`.

**Status: READY FOR FINALIZATION.** Implementation matches the approved brief; all completion gates
green; one Codex round, zero findings.

## Origin

S1.5.2 Pilot 2 (read-only live pilot, 2026-09-21) finding **F-1**: the live Agent API and the official
reference both carry `fetch_url_results` grounding under `contents: [{ url, title, snippet }]`, while
`adaptAgentResponse` read `results[]` on that item type — so the ruled D-M2 source 2 never contributed an
Evidence Set entry and its condition-6 pre-check passed vacuously. Fail-closed (a candidate grounded only
through a fetched page skipped `INVALID_SOURCE_URL`); no leak; no item lost in Pilot 2. Owner-ruled
PATCH-READY → narrow corrective task.

## Implementation vs. the approved brief

- `netlify/functions/lib/news-catalysts-provider.js` — three hunks, **all inside `adaptAgentResponse`**:
  (1) the condition-6 pre-check now tests `outItem.results` for `search_results` and `outItem.contents`
  for `fetch_url_results`, as two separate predicates — `results` is no longer read on a
  `fetch_url_results` item in any form; (2) the D-M2 source-2 traversal iterates `item.contents` and
  appends each entry via the existing `appendEvidenceEntry(evidenceSet, entry, 'fetch_url_result')`;
  (3) the traversal-order comment says `contents[]` for source 2 and records that a contents entry
  carries `url / title / snippet` only and is handed to `appendEvidenceEntry` verbatim (absent fields
  omitted, nothing fabricated). D-M2 order (search_results → fetch_url_results → url_citation) and
  first-occurrence-wins are unchanged. `appendEvidenceEntry`, `resolveGrounded`, `normalizeHttpsUrl`,
  `findFirst`, `validGroundingField`, the ladder, identity construction and projection are
  byte-for-byte unchanged. The single-adapter invariant holds: `contents` is read in exactly one
  function.
- `qa/news_catalysts_provider_offline.js` — four tests changed, none added/removed/renamed/skipped:
  **NP03** gains one condition-6 case (`fetch_url_results.contents: 42` ⇒ Tier B); **NP08** both
  hand-built fixtures use `contents[]`; **NP34** fixtures use `contents[]`, the fetch_url_results-alone
  case positively proves a URL available only through `contents[]` grounds its item (and pins the
  persisted `sourceUrl` to the entry's own raw text), and a **planted negative** proves the same URL
  offered only under `results[]` on a `fetch_url_results` item does not ground — `ok:true`, zero items,
  `[{reason:'INVALID_SOURCE_URL'}]`; **NP39** gains a `fetch_url_result` fixture carrying `url`,
  `title`, `snippet` and no `id`/`date`/`last_updated` — the item resolves, sentinel title/snippet
  and the `evidenceKind`/`fetch_url_result` literals are absent from the public output, and the item
  has exactly the 17 fields in `ITEM_FIELD_ORDER`. NP39 also gains source-scoped structural checks
  (same brace-depth technique as its existing proof): each optional `appendEvidenceEntry` field is
  copied only behind its `raw.<field> !== undefined` guard, and `adaptAgentResponse` reads
  `Array.isArray(item.contents)` on `fetch_url_results`, passes `item.contents[j]` verbatim as a
  `fetch_url_result`, and never reads `.results` on that type. The `agentResponse`/`agentShell`
  helpers are unchanged.

**Reading recorded (not a STOP).** Brief §2's NP39 row lists the behavioural fixture and says the
*existing* structural proof is unchanged (it is). The Owner ruling additionally requires NP39 to verify
*no fabrication*, which has no public observable — the Evidence Set is internal by design. The guard
and adapter structural checks above are the honest mechanical proof of that requirement; they add to
NP39 without changing any existing assertion. Surfaced here for the Owner at commit approval.

Frozen/untouched, re-verified: `news-catalysts-core.js` (zero diff) · `qa/news_catalysts_core_offline.js`
(zero diff — no core fixture references this shape) · `DEFAULT_TIMEOUT_MS = 22000` · prompt · `PPLX_MODEL`
`'low'` · `PPLX_ENDPOINT` · `REQUEST_SCHEMA` · `json_schema.name` · taxonomy vocabularies · identity tuple ·
`IDENTITY_SCHEMA_VERSION` · `buildNewsKey` · `NEWS_KEY_RE` · `CONTRACT_VERSION` · `SOURCE_TIER` · `PROVIDER_ID` ·
export surface **16** · 17-field item contract · persistence · gates · env · Netlify. No live Perplexity call.

## QA / verification evidence (raw in `qa.log`)

| Check | Result |
|---|---|
| Step-0 pre-edit baseline `npm run qa:offline` @ `abcc861` | **PASS, 43 spawned suites** |
| Red run (QA edited, adapter unpatched) | **NP03, NP08, NP34, NP39 FAIL; 35 pass** — every changed test fails before the fix |
| `node qa/news_catalysts_provider_offline.js` (post-patch) | **39/39 PASS**, NP01–NP39 contiguous |
| `node qa/news_catalysts_core_offline.js` (post-patch, file unmodified) | **30/30 PASS** |
| `npm run qa:offline` (post-patch) | **PASS, 43 spawned suites** — identical to baseline |
| Implementation diff scope `git diff --stat 2e3ca40 -- . ':(exclude)work/' ':(exclude)BACKLOG.md'` | **exactly 2 files** (+99 / −22) |
| Brief §5 step 9 planted negative (source-2 branch temporarily reverted to `results[]` in the real source) | **NP08, NP34, NP39 FAIL (36 pass)**; restored **byte-identical** (sha256 verified); **39/39** again |
| Export surface | **16**, same names, same order |
| `DEFAULT_TIMEOUT_MS` | `22000`, unchanged |
| Line endings | both files CRLF-in-working-tree / LF-in-index, unchanged convention (CR count = LF count) |

## Codex review

**Round 1 (step 8)** — `codex review --uncommitted` (codex-cli 0.154.0, model gpt-5.6-sol, reasoning
high) over the complete two-file implementation diff; raw transcript verbatim in `codex.md`. Codex
independently re-ran the provider suite, the core suite and the full 43-suite `qa:offline` inside the
worktree, all PASS, and left the tree unchanged.

| # | Finding | Class | Resolution |
|---|---|---|---|
| — | **None.** Verbatim conclusion: "The adapter now consistently validates and traverses `fetch_url_results.contents`, preserves grounding precedence, and ignores the obsolete `results` field as required. Targeted provider/core tests and the full 43-suite offline QA pass." | — | Nothing to FIX / DEFER / REJECT |

Per the Owner's instruction for this task ("run Codex once on the complete two-file implementation
diff"), no second Codex round and no step-12 final task-diff check were run; this deviation from
`AGENTS.md` step 12 is recorded here and surfaced for the Owner at commit approval.

## Files changed
- Implementation (2): `netlify/functions/lib/news-catalysts-provider.js`, `qa/news_catalysts_provider_offline.js`
- Evidence (tracked): `work/news-catalysts-agent-api-f1/brief.md`, `work/news-catalysts-agent-api-f1/review.md`

## Lessons

- [rule] A transport-migration brief that names an upstream field for one source ("`search_results` →
         its `results[]`") and leaves the field unnamed for a sibling source invites the Worker to
         assume symmetry. Before approving such a brief, require every grounding-bearing source to
         name its field explicitly, sourced from the vendor reference or a live capture — not inferred
         from a sibling.
- [rule] An offline fixture suite can be fully green against a shape the live API never emits. When a
         provider's wire shape is migrated, run one read-only live capture (or cite the vendor
         reference verbatim) for every `output[]` item type the adapter consumes, and pin at least one
         fixture per type to that captured shape, before the migration is called complete.
- [local] The `fetch_url_results` contents entry has no `id`, `date` or `last_updated`; any future
         Evidence Set rule that needs a source date must treat fetch-derived grounding as
         "date unknown", exactly as the S1.5.1 PREP already says of citation-only grounding.

## Final status

READY FOR FINALIZATION. Implementation matches the approved brief exactly (two files, adapter-only
production change, four QA tests changed, count 39). Red-then-green sequence and the step-9 planted
negative both recorded in `qa.log`. Final check: 1 round, 0 findings; no step-12 task-diff Codex check
per Owner instruction (recorded above). Commit approval requested for the implementation diff (two
files) plus this `review.md`; LAND, push, deploy, env/gate/Netlify change and Pilot 2B are each
separate Owner decisions and none has been taken.
