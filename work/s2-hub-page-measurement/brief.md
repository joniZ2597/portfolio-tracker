# Task brief: S2 — `/news/latest`-class hub source pages · measurement

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 4** (ACTIVE ARC S2) · slice candidate "`/news/latest`-class hub source pages" (added 2026-09-25) · Track: News / Catalysts |
| Preparation baseline | **`20a81e2`** = `branch-dev` = `origin/branch-dev` |
| Last validated | `20a81e2`, 2026-09-26 |
| Branch / slot | new `task/s2-hub-page-measurement`, bound to Worker slot **`pt-wt-worker-b`** (no new worktree path) |
| `qa:offline` | **no change** — no suite added, no assertion changed (effective count **47** at `20a81e2`) |
| Lane | **neither** — no `index.html`, no product or QA file |
| Status | **CODE-READY on Owner approval of these exact contents** |

**Objective.** Measure, over the pinned replay corpus, how often a listing/hub page is accepted as a
catalyst's source, and what a candidate rule **would** change. **Measurement only. It changes no rule.**

---

## 1 · Standing rulings carried in (not reopened)

| Ruling | Source |
|---|---|
| **First step is measurement only; no filtering-rule change before that measurement; any rule then needs its own Owner approval** | BACKLOG entry 4 slice candidate (Owner, 2026-09-25) |
| Does not block the S2 sequence (`A3b* → A7a → A4*/A7b*`) and does not reopen any closed task | same |
| A5 / Rule S (`810586d`) and S1.5.1 H-B DR-20 (`GENERIC_SOURCE_PATH_RE`) stand unchanged | landed |

## 2 · Reality check at `20a81e2`

| Item | Anchor | State |
|---|---|---|
| Generic-path rule | `netlify/functions/lib/news-catalysts-provider.js:87` `GENERIC_SOURCE_PATH_RE = /^\/(news\|press-release\|press-releases\|investors\|investor-relations\|newsroom\|media)\/?$/i` | rejects a generic leaf **only when nothing follows it** |
| Rule S | `:93` `INDEX_DOC_LEAF_RE` strips only `index`/`default` document leaves; applied at `:668-669` | `/news/latest` is **not** rejected |
| Corpus | `qa/fixtures/replay/` — 9 cases (`p3` ×3, `p4-2307` ×3, `p4-2312` ×3; FROG/MRNA/NVDA); each fixture holds `input.rawResponseBody` and `expected.{items, skippedItems, attribution}`; `index.json` pins each `fixtureSha256` | the string `nvidianews.nvidia.com/news/latest` occurs in `p3-…-NVDA` and `p4-…2312Z-NVDA` (whether as a **survivor** `sourceUrl` is the first thing to measure) |
| Replay harness | `qa/news_catalysts_replay_offline.js` (R-9 pins fixture bytes to `fixtureSha256`; items/skippedItems compared byte-for-byte) | the Worker may **import/run** it and the provider read-only |

## 3 · Scope — the measurement

For **every** case in the corpus, record:

1. **Survivor source inventory** — every `expected.items[].sourceUrl`: host, normalized path, and a
   path class: `root` · `generic-leaf` (matches `:87` after `:93` stripping) · **`hub-listing`** (a
   generic segment from `:87` followed by exactly one listing leaf — see H1) · `article-specific` ·
   `other`. Counts per case and corpus totals.
2. **Occurrence inventory** — where `/news/latest`-class URLs appear **outside** survivors
   (raw evidence, citations, skipped items), with the skip reason where one exists.
3. **Candidate-rule impact, as hypotheses only** — replay the corpus with each hypothetical predicate
   added to the generic-path check **in a scratch copy outside the repository**, and report which
   survivors each would drop, per case:
   - **H1 (narrow):** `/^\/(news|press-release|press-releases|investors|investor-relations|newsroom|media)\/(latest|all|archive|recent)\/?$/i`
   - **H2 (broad):** H1 plus a trailing pagination/query form (`/page/<n>`, `?page=`)

   For each: survivors dropped (ticker, `eventType`, `sourceUrl`), and whether that case's
   `expected.items` — and therefore its `fixtureSha256` — would have to change.
4. **Attribution cross-check** — for any dropped survivor, whether another evidence URL in the same
   case supports the same event (i.e. would the catalyst be lost, or only its hub source).

**Deliverable: one tracked measurement artifact** (§5). It states numbers and per-case findings. It
**does not** recommend H1, H2 or any rule, rank them, or call any survivor wrong.

## 4 · Out of scope — hard boundaries

- **Any change** to `news-catalysts-provider.js`, any regex, any fixture, `index.json`, or any QA file —
  not even a comment.
- Any live provider/Perplexity call, network access, credential or canary.
- Any new fixture or corpus capture.
- A6 duplicate handling, A3b/A4 date enforcement, A7 materiality.
- The scratch replay copy lives **outside the repository** and is deleted after use (`CLAUDE.md`
  "Temporary harness files"); only its **results** enter the artifact.

> **The temptation this slice must resist:** having measured H1/H2, it is natural to propose one.
> **That proposal is a separate, Owner-approved rule slice.** A measurement that arrives with a rule
> attached has pre-empted the decision it exists to inform.

## 5 · Expected implementation files — **2**

```
work/s2-hub-page-measurement/measurement.md   NEW  the tracked measurement (the deliverable)
work/s2-hub-page-measurement/review.md        NEW  tracked task artifact
```

**No product file. No QA file. Suite count unchanged.**
**QA suites that read in-scope files as text:** none — no `qa/*.js` reads `work/s2-hub-page-measurement/`.

## 6 · QA boundary

No QA changes. Correctness is completeness and reproducibility of the measurement:

| ID | Check |
|---|---|
| **HM-1** | every one of the 9 cases appears; per-case survivor counts equal `expected.items.length` exactly |
| **HM-2** | every survivor `sourceUrl` is classified into exactly one path class; class totals sum to the survivor total |
| **HM-3** | the baseline replay (no hypothesis) reproduces every case's `expected.items`/`skippedItems` byte-for-byte — proving the scratch harness equals the tracked one before H1/H2 are applied |
| **HM-4** | H1/H2 results list every dropped survivor with case, `eventType` and `sourceUrl`, and state per case whether `fixtureSha256` would change |
| **HM-5** | **no file outside `work/s2-hub-page-measurement/` differs** — `git diff` over the rest of the tree is empty, and no scratch file remains in the repository |
| **HM-6** | `npm run qa:offline` green before and after at the **same** suite count (47 at `20a81e2`; this task adds none — if a parallel task lands a suite first, the count is the then-current one, unchanged by this task) |

**HM-3 and HM-5 are load-bearing:** the first proves the hypothesis results are trustworthy, the
second that the measurement stayed read-only.

## 7 · STOP conditions

1. Any file beyond the two in §5.
2. **Any product, fixture or QA file modified** — HM-5 must hold.
3. HM-3 fails (scratch replay does not reproduce the tracked corpus) — measure nothing on top of it.
4. Any rule recommendation, ranking or preference recorded in the artifact.
5. Any live/network call.
6. Any A3b/A4/A6/A7 work.

## 8 · Lifecycle / CLOSE

| closeCondition | Evidence | Actor | Possessable before CLOSE? |
|---|---|---|---|
| Inventory complete | HM-1, HM-2 | Worker | **YES** |
| Hypothesis impact trustworthy | HM-3, HM-4 | Worker | **YES** |
| Stayed read-only | HM-5, HM-6 | Worker | **YES** |
| No decision embedded | review of the artifact text | Codex (Worker-launched) / Owner | NO — gate after CODE-READY |
| LAND | approval | Owner | NO — by design |

**SATISFIABLE offline**, same day.

## 9 · Definition of done

`measurement.md` inventories every survivor source by path class, records every `/news/latest`-class
occurrence, and reports H1/H2 impact per case including `fixtureSha256` consequence; HM-1…HM-6 pass;
no file outside the task folder differs; `review.md` carries `## Lessons`, the files-changed block and
the final-check line.

**Not claimed:** that any rule should change. **This slice measures; a later slice decides.**
