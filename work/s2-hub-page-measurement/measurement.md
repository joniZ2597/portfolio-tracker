# S2 hub-page measurement — `/news/latest`-class source pages

Measurement only (brief `work/s2-hub-page-measurement/brief.md`). No rule, fixture, provider or QA file
was changed. This document states numbers and per-case findings; it recommends and ranks nothing.

| | |
|---|---|
| Measured at | `9a916d6` (provider, corpus and harness content identical to `20a81e2` for the files read) |
| Corpus | `qa/fixtures/replay/` — 9 cases, `index.json` `corpusId` `s2-a1-evidence-replay-corpus` |
| Provider read | `netlify/functions/lib/news-catalysts-provider.js` (`GENERIC_SOURCE_PATH_RE` `:87`, `INDEX_DOC_LEAF_RE` `:93`, check `:668-669`) |
| Method | Scratch copy outside the repository (provider + `evidence-contract.js` copied byte-identical; H1/H2 variants differ from the copy only by the added predicate at the `:669` check). Offline, `global.fetch` throws, no network. Scratch deleted after use; only results are recorded here. |

## 1 · Survivor source inventory (brief §3.1)

**Classes** (applied to the survivor's `normalizedSourceUrl` pathname after `INDEX_DOC_LEAF_RE`
stripping): `root` = `''`/`/`; `generic-leaf` = matches `GENERIC_SOURCE_PATH_RE`; `hub-listing` = a
`GENERIC_SOURCE_PATH_RE` segment followed by exactly one of `latest|all|archive|recent` (the H1
shape); `article-specific` = any other non-empty path; `other` = none of the above. Classes are
tested in that order, so each URL has exactly one class.

| Case | Survivors (`expected.items.length`) | root | generic-leaf | hub-listing | article-specific | other | Survivor hosts | With query string |
|---|---|---|---|---|---|---|---|---|
| `p3-20260921T2045Z-NVDA` | 4 | 0 | 0 | 0 | 4 | 0 | www.sec.gov ×1; nvidianews.nvidia.com ×3 | 0 |
| `p3-20260921T2045Z-FROG` | 7 | 0 | 0 | 0 | 7 | 0 | investors.jfrog.com ×7 | 0 |
| `p3-20260921T2045Z-MRNA` | 4 | 0 | 0 | 0 | 4 | 0 | www.nasdaq.com ×1; www.sec.gov ×1; finance.yahoo.com ×2 | 0 |
| `p4-20260921T2307Z-NVDA` | 8 | 0 | 0 | 0 | 8 | 0 | investor.nvidia.com ×7; www.sec.gov ×1 | 0 |
| `p4-20260921T2307Z-FROG` | 3 | 0 | 0 | 0 | 3 | 0 | investors.jfrog.com ×3 | 0 |
| `p4-20260921T2307Z-MRNA` | 2 | 0 | 0 | 0 | 2 | 0 | www.fda.gov ×1; investingnews.com ×1 | 0 |
| `p4-20260921T2312Z-NVDA` | 5 | 0 | 0 | 0 | 5 | 0 | www.sec.gov ×1; nvidianews.nvidia.com ×4 | 0 |
| `p4-20260921T2312Z-FROG` | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| `p4-20260921T2312Z-MRNA` | 2 | 0 | 0 | 0 | 2 | 0 | www.modernatx.com ×1; www.sec.gov ×1 | 0 |
| **Corpus total** | **35** | **0** | **0** | **0** | **35** | **0** | 9 distinct hosts | **0** |

Class totals sum to 35 = survivor total. Corpus host counts: investors.jfrog.com 10 ·
nvidianews.nvidia.com 7 · investor.nvidia.com 7 · www.sec.gov 5 · finance.yahoo.com 2 ·
www.nasdaq.com 1 · www.fda.gov 1 · investingnews.com 1 · www.modernatx.com 1.

Related fact (not a survivor class): 17 of the 35 survivors have a `/default.aspx` document leaf
(investors.jfrog.com and investor.nvidia.com); after Rule S stripping every one has a non-generic
remaining path.

**Finding:** in this corpus **0 of 35** accepted survivor `sourceUrl`s are `root`, `generic-leaf` or
`hub-listing`.

## 2 · Occurrence inventory (brief §3.2)

Every URL in each case's raw response (`search_results`, `fetch_url_results`, `url_citation`
annotations) and every raw candidate `sourceUrl` was tested against the hub shapes (H1 path, H2
`/page/<n>` path, H2 `page=` query). Substring `/news/latest` was also counted in the raw body.

| Case | Evidence entries (total) | Raw candidates | Substring `/news/latest` in raw body | Hub-class URLs in evidence | Hub-class URLs as a candidate `sourceUrl` |
|---|---|---|---|---|---|
| `p3-20260921T2045Z-NVDA` | 47 | 7 | 3 | 3 (`search_result`) | 0 |
| `p4-20260921T2312Z-NVDA` | 60 | 6 | 4 | 4 (`search_result`) | 0 |
| the other 7 cases | 24–75 each | — | 0 | 0 | 0 |

Detail of the 7 occurrences (all `search_results` entries; none in `fetch_url_results`, none in
`url_citation`, none in any candidate, none in any survivor, none in any skipped item):

| Case | Evidence URL |
|---|---|
| `p3-20260921T2045Z-NVDA` | `https://nvidianews.nvidia.com/news/latest` ×3 |
| `p4-20260921T2312Z-NVDA` | `https://nvidianews.nvidia.com/news/latest` ×3 |
| `p4-20260921T2312Z-NVDA` | `https://nvidianews.nvidia.com/news/latest?bcsi-ac-cde40c890bd19f3d=…&page=10` ×1 (path is the H1 shape; the URL also carries a `page=` query) |

Skip reasons in the corpus, for context (none concern a hub-class URL):

| Case | Skipped candidate `sourceUrl` | Reason |
|---|---|---|
| `p3-20260921T2045Z-NVDA` | `nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2027`; `…/news/aws-and-nvidia-to-deliver-2-million-additional-gpus-…`; `…/news/nvidia-and-mediatek-deepen-long-standing-partnership-…` | `UNRETRIEVED_SOURCE_URL` ×3 |
| `p4-20260921T2312Z-NVDA` | `nvidianews.nvidia.com/news/nvidia-and-palantir-bring-sovereign-ai-to-critical-supply-chains` | `UNRETRIEVED_SOURCE_URL` ×1 |
| `p4-20260921T2312Z-FROG` | `investors.jfrog.com/news/default.aspx` ×5 | `GENERIC_SOURCE_URL` ×5 (existing generic-path rule after Rule S stripping) |

## 3 · Candidate-rule impact — hypotheses only (brief §3.3)

Predicates added to the existing generic-path check in the scratch copy only (`||` after
`GENERIC_SOURCE_PATH_RE.test(groundedPath)`); `SEG` = `news|press-release|press-releases|investors|investor-relations|newsroom|media`.

- **H1:** `/^\/(SEG)\/(latest|all|archive|recent)\/?$/i` on the path.
- **H2:** H1, plus `/^\/(SEG)(\/(latest|all|archive|recent))?\/page\/\d+\/?$/i` on the path, plus
  a `page=` query (`/[?&]page=/i` on the normalized URL's query) when the path is a bare `SEG` or
  `SEG/(latest|all|archive|recent)`. (The brief's "trailing pagination/query form" was
  instantiated this way; the exact predicate is recorded so the result is reproducible.)

Baseline first (HM-3): replay of all 9 cases through the unmodified scratch copy reproduces
`expected.items` and `expected.skippedItems` byte-for-byte (`JSON.stringify` equal) in **9/9**
cases, and each fixture file's SHA-256 equals its `index.json` `fixtureSha256` in **9/9**.

| Case | H1 survivors dropped | H1: `expected.*` / `fixtureSha256` would change? | H2 survivors dropped | H2: `expected.*` / `fixtureSha256` would change? |
|---|---|---|---|---|
| `p3-20260921T2045Z-NVDA` | 0 | no | 0 | no |
| `p3-20260921T2045Z-FROG` | 0 | no | 0 | no |
| `p3-20260921T2045Z-MRNA` | 0 | no | 0 | no |
| `p4-20260921T2307Z-NVDA` | 0 | no | 0 | no |
| `p4-20260921T2307Z-FROG` | 0 | no | 0 | no |
| `p4-20260921T2307Z-MRNA` | 0 | no | 0 | no |
| `p4-20260921T2312Z-NVDA` | 0 | no | 0 | no |
| `p4-20260921T2312Z-FROG` | 0 | no | 0 | no |
| `p4-20260921T2312Z-MRNA` | 0 | no | 0 | no |
| **Total** | **0** | **0 of 9 cases** | **0** | **0 of 9 cases** |

For every case, under both H1 and H2, replayed `items` and `skippedItems` are byte-identical to the
baseline (no survivor dropped, no new skip reason). Consequently no `expected.items`,
`expected.skippedItems` or `expected.attribution` would change, and no `fixtureSha256` would change,
under either hypothesis on this corpus.

**Mechanism control (scratch, synthetic, not part of the corpus).** So that "0 dropped" cannot be
an artefact of an inert patch, one synthetic envelope with ten grounded candidate URLs on host
`ex.test` was replayed through all three scratch variants. Survivors by variant:

| URL path (+query) | baseline | H1 | H2 |
|---|---|---|---|
| `/news/latest` | kept | dropped | dropped |
| `/news/all/` | kept | dropped | dropped |
| `/news/archive` | kept | dropped | dropped |
| `/news/recent` | kept | dropped | dropped |
| `/news/latest/page/2` | kept | kept | dropped |
| `/news/page/3` | kept | kept | dropped |
| `/news/latest?page=10` | kept | dropped | dropped |
| `/news?page=2` | dropped (existing rule) | dropped | dropped |
| `/news/q3-results` | kept | kept | kept |
| `/news/latest-results-2026` | kept | kept | kept |

## 4 · Attribution cross-check (brief §3.4)

No survivor is dropped by H1 or H2 in any case, so there is no dropped survivor to cross-check;
the question of whether another evidence URL supports the same event does not arise on this corpus.
Nothing in the corpus was lost or changed under either hypothesis.

## 5 · Completeness checks (HM-1 … HM-5)

| ID | Result |
|---|---|
| HM-1 | all 9 cases present; per-case survivor counts equal `expected.items.length` (4·7·4·8·3·2·5·0·2 = 35) |
| HM-2 | every survivor classified into exactly one class; class totals 0+0+0+35+0 = 35 |
| HM-3 | baseline scratch replay byte-identical to `expected.items`/`skippedItems` in 9/9 cases; fixture SHA-256 matches `index.json` 9/9 |
| HM-4 | H1/H2 dropped-survivor lists are empty for all 9 cases; per-case `fixtureSha256` consequence stated in §3 (none) |
| HM-5 | `git status` / `git diff` show only `work/s2-hub-page-measurement/` paths (see `review.md`); scratch harness lived outside the repository and was deleted |

## 6 · Scope of the measurement

Nine replay cases, three tickers (NVDA, FROG, MRNA), two capture runs. The 7 hub-class evidence
URLs are all `nvidianews.nvidia.com/news/latest` and occur in the two NVDA cases that also contain
`nvidianews.nvidia.com` survivors. The results describe this pinned corpus only.
