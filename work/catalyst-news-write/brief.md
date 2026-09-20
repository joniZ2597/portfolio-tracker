# Task brief: catalyst news evidence pipeline — S1 write path

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged. Only then may implementation begin, per `AGENTS.md`
"Task folder convention".

## Baseline

| | |
|---|---|
| Base commit | **`20b4b31`** = `origin/branch-dev` |
| `origin/main` | `fbec2c1` |
| `npm run qa:offline` | PASS, 42 effective suites (11 denylisted) |
| Owner rulings applied | **D1** fetch-date index partition, one fetch per ticker per day, second same-day fetch skips · **D5** manual/Owner-triggered writes only |

> **Concurrency notice — read before starting.** `fix-benchmark-self-comparison` is in flight in
> the main working tree: its brief is committed locally at `dcf6d11` (unpushed) and `index.html`
> carries uncommitted changes. **This task must run in its own `git worktree` branched from
> `20b4b31`**, not from `dcf6d11` and not in the main tree. The two scopes are disjoint
> (`netlify/functions/**` vs `index.html`), but sharing a tree would put the other task's
> uncommitted `index.html` into this task's diff and make its Definition of Done unmeasurable.

## Objective

Make the already-built, dormant J3 news-catalysts provider reachable as a **gated, token-bearing,
manually-invoked** server capability that persists structured catalyst evidence. Write path only.

**Dormant by construction.** With the gate off, the endpoint does no body parse, no preflight, no
store access and no provider I/O. Activation is a separate Owner-gated step and is **not** in this
task.

## Implementation scope — three new files, no existing file changed

```
netlify/functions/lib/news-catalysts-core.js      new
netlify/functions/news-catalysts.mjs              new
qa/news_catalysts_core_offline.js                 new
```

**No `package.json` change** — `qa/run-offline.js` auto-discovers any `qa/*_offline.js`; a
convenience `test:` script is not worth the diff. *(Same reasoning as the TradingView pilot.)*

**Explicitly out of scope:** `index.html` · `services/**` · any client code · any read route ·
`qa/run-offline.js` · `netlify.toml` · `CLAUDE.md` · `AGENTS.md` · `BACKLOG.md` ·
`lib/news-catalysts-provider.js` and `lib/news-catalysts-preflight.js` (**both are frozen for this
task — not one byte**) · **GrokBot integration of any kind, per Owner ruling.**

**No ASK-tier file is in scope**, so no brief-listing entry is required and no MANUAL posture
prompt is expected.

## Pre-approval compatibility sweep

| Check | Result |
|---|---|
| QA suites that read in-scope files **as text** | **`qa/news_catalysts_provider_offline.js` NP23** and **`qa/news_catalysts_preflight_offline.js` NC40** run static forbidden-surface scans — but **each targets only its own module** (path-overridable via `NEWS_CATALYSTS_PROVIDER_PATH` / `NEWS_CATALYSTS_PREFLIGHT_PATH`). Neither reads the new core. **No assertion moves.** |
| `NC40` export-set regex | Freezes `module.exports = { evaluateNewsCatalystsPreflight, parseAllowedTickers }`. This task adds no export to the preflight, so it holds. |
| `NP17` key-format pin | `buildNewsKey` vs `NEWS_KEY_RE` — **unchanged**. Verified the new index key `fundstore:v1:news-index:AAPL:2026-09-20` does **not** match `NEWS_KEY_RE` (tested: `false`), so the two namespaces cannot collide. |
| `require()` / import dependency | The new core imports the provider and preflight read-only; neither is modified. |
| Fingerprint pairing rule | Not triggered — `CLAUDE.md` untouched. |
| Expected suite-count delta | **+1** (42 → 43), from the one new auto-discovered file. |

## Contract

### Storage — `fund-facts-store`, namespace `fundstore:v1`

This is **not a new store**. `buildNewsKey` already emits `fundstore:v1:news:…`, and `fundstore:v1`
is `fund-facts-store`'s namespace (`fund-facts-core.js:71-72`). A separate news store would
contradict the QA-pinned key format.

```
item    fundstore:v1:news:<TICKER>:<eventDate>:<identityHash>        (existing, from buildNewsKey)
index   fundstore:v1:news-index:<TICKER>:<fetchDate YYYY-MM-DD>      (new, this task)
```

**Index record value:**

```json
{ "ticker": "...", "fetchedAt": "...", "sourceTier": "perplexity_retrieval",
  "contractVersion": "fund-contract-v1", "provider": "j3-news-catalysts@job-model-v1",
  "keys": ["fundstore:v1:news:..."] }
```

`fetchDate` is the UTC calendar date of `fetchedAt`, derived from the **injected** clock. No
`Date.now()` anywhere in the core.

### The projection step — load-bearing, easy to miss

`evidence-freshness.validRecord` requires `ticker`, `sourceTier`, `contractVersion` and `provider`
on **every** stored record. The provider item carries `ticker` and `provider` but **not**
`sourceTier` or `contractVersion` — those live on the envelope. `NP18` already proves J7 returns
`CONTRACT_INVALID` without them.

> **Each stored item record = the provider item plus `sourceTier` and `contractVersion` copied
> from the envelope.** A stored record missing either is a defect that only surfaces at read time.
> This has a planted negative (see QA).

### Write order — pointer-last, mirroring `fund-facts-core.js`

```
1  pre-read the index key (strong consistency)
     present → 200 { status:'SKIPPED', reason:'ALREADY_SEEDED', ticker }   zero provider I/O
2  provider call
3  every item record, create-only, { onlyIfNew: true }, inspect .modified
4  index record LAST, create-only
```

`writtenKeys` records **only** keys whose `set` returned `modified === true`.

### Response envelopes — reuse the existing vocabulary, add none

| Condition | Response |
|---|---|
| gate off | `200 { status:'DISABLED', reason:'SERVER_DISABLED' }` |
| `OPTIONS` | `204`, `cors()` headers, **no body** |
| not `POST` | `405 METHOD_NOT_ALLOWED` |
| preflight failure | map the six existing reasons (`SERVER_DISABLED`, `UNAUTHORIZED`, `TOKEN_COLLISION`, `ALLOWLIST_MISSING`, `ALLOWLIST_INVALID`, `TICKER_NOT_ALLOWED`) — **with a `default:` case returning `500 ERROR / PREFLIGHT_UNMAPPED`**, matching the write-side precedent, not the read-side omission |
| index already present | `200 SKIPPED / ALREADY_SEEDED` |
| provider `{ok:false}` | `502 ERROR / PROVIDER_FAILURE` |
| provider returns zero items | `200 { status:'NONE', ticker, fetchedAt }` — **no index written**, so the day stays open |
| success | `200 { status:'WRITE', ticker, fetchedAt, writtenKeys:[…] }` |
| store failures | `DEGRADED` with `STORE_UNAVAILABLE` / `STORE_CONFLICT` / `STORE_WRITE_UNCERTAIN`, including the D-E ambiguous-index reconciliation: a thrown or malformed index `set` is resolved by one strong `get` before choosing between `STORE_WRITE_UNCERTAIN` and `STORE_UNAVAILABLE` |

### Environment — all four names already exist

| Var | Role | Source |
|---|---|---|
| `PT_ENABLE_NEWS_CATALYSTS_SERVER` | gate, strict `=== 'true'` | `news-catalysts-preflight.js` |
| `PT_NEWS_CATALYSTS_TOKEN` | inbound Bearer token | `news-catalysts-preflight.js` |
| `PT_NEWS_CATALYSTS_ALLOWED_TICKERS` | allowlist | `news-catalysts-preflight.js` |
| `PERPLEXITY_API_KEY` | upstream key, read once at the boundary and **injected** as `options.apiKey` | already used by `netlify/functions/perplexity-proxy.js` |

**This task sets no environment variable and requires none to be set.** Gate-off is the expected
state at LAND.

### D5 — manual invocation only

`POST` with a valid Bearer token is the **only** trigger. **No `export const config`, no schedule,
no cron, no client caller, no background ingestion.** Routing is base-name-derived
(`/.netlify/functions/news-catalysts`), consistent with every other function in this repo.

### Conventions followed / deliberately overridden

**Followed:** `acquireStore(event)` with the `event._testStore` seam · ambient `getStore` with **no**
`connectLambda` (QA-enforced for `.mjs` cores) · `.mjs` wrapper carrying the `import '@netlify/blobs'`
bundling pin and `withLambda(core.handler)` · `res()`/`cors()` helper shape · OPTIONS-before-gate
ordering · auth-first probe with the ticker withheld · create-only + `modified` inspection ·
pointer-last · `STORE_NAME` duplicated as a local literal (precedent: `fund-facts-read-core.js:6`).

**Overridden:** `fund-facts-read-core.js`'s `mapPreflightFailure` has **no `default:` case** and can
return `undefined`. **This task does not copy that.** A `default:` returning `500 ERROR /
PREFLIGHT_UNMAPPED` is required.

## QA plan — one new auto-discovered suite

**Positive:** full write cycle against `event._testStore` — items then index, `writtenKeys` exact,
envelope key set exact.

**Planted negatives — mutation applied to the production source or its fixture inputs, never to the
test:**

1. **Projection omitted** — strip `sourceTier`/`contractVersion` from a stored record; feeding it to
   `evaluateEvidenceFreshness` must yield `CONTRACT_INVALID`. *(Reuses the NP18 mechanism.)*
2. **Index written before items** — must fail the ordering assertion.
3. **Second same-day fetch** — must return `SKIPPED / ALREADY_SEEDED` with **zero** provider calls,
   not `STORE_CONFLICT`.
4. **Zero-item run writes no index** — the day must remain open.

**Dormancy scan, NC30 style:** gate off ⇒ zero network, zero store, zero filesystem calls.

**Static forbidden-surface scan, NP23 style, over the new core:** no `Date.now(`, no bare `fetch(`,
no DOM, no scoring symbols, no `pt_` localStorage key.

## Validation

1. `node qa/news_catalysts_core_offline.js` → PASS.
2. `npm run qa:offline` → PASS at **43** effective suites (42 + 1). Any other count is a finding.
3. `node qa/news_catalysts_provider_offline.js` and `node qa/news_catalysts_preflight_offline.js`
   → PASS, unchanged — proves the two frozen modules were not touched.
4. Implementation diff = **exactly three files**, all new:
   `git diff --stat 20b4b31...HEAD -- . ':(exclude)work/' ':(exclude)BACKLOG.md'`
5. `grep -c "process.env" netlify/functions/lib/news-catalysts-core.js` → env is read at the
   boundary only; the provider still receives `apiKey`/`nowIso`/`fetchImpl` by injection.

## STOP conditions

The five standing conditions, plus these instances:

1. Any file outside the three.
2. **Any edit to `news-catalysts-provider.js` or `news-catalysts-preflight.js`** — if the core cannot
   be built without changing either, the contract cannot be satisfied as written (STOP-2), and the
   specific incompatibility is the finding.
3. Any need for `store.list()` or prefix enumeration — **no such capability exists in this repo**; a
   design that needs it is outside the approved contract.
4. Any need to set an environment variable, deploy, or make a live Perplexity call.
5. Suite count ≠ 43 after the change.

## Definition of done

Three new files, no existing file modified. `qa:offline` PASS at 43 suites. Both frozen J3 suites
still PASS. The endpoint is dormant with the gate off, and with the gate on is invokable only by a
`POST` carrying a valid Bearer token. `review.md` carries a `## Lessons` section, the two-row
"Files changed" block and the final-check line.
