# Task brief: S3-M2 — Client adapter

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **S3** (PLAN-READY) · **M2** Client adapter |
| Preparation baseline | **`16543cd`** = `branch-dev` |
| Last validated | `16543cd`, 2026-09-24 |
| Branch / worktree | new `task/s3-catalyst-evidence-client`, separate worktree |
| `qa:offline` | **+1 suite** from the post-S3-M1 baseline |
| Status | **DONE / LANDED** — brief `f536cad` (reconciled `9cc815c`) · implementation **`0c99e13`** on `branch-dev`, pushed |

**Objective.** A client adapter that calls `news-catalysts-read` and returns validated catalyst
records to the UI. **Validation only — it re-derives nothing.**

---

## 1 · Landed route protocol — authoritative

**S3-M1 LANDED at `16543cd`.** The blocking dependency is cleared. **The landed route is the
authority**; the planned contract in `work/s3-catalyst-evidence-surface/brief.md` is superseded
wherever the two differ.

| Source | Weight |
|---|---|
| **`netlify/functions/lib/news-catalysts-read-core.js`** at `16543cd` | **Authoritative — the wire protocol** |
| **`work/s3-catalyst-evidence-surface/D-S3-1-reader-contract.md`** — the frozen 17+2 record contract | **Authoritative — per-record shape.** Unchanged by this amendment |
| `work/s3-catalyst-evidence-surface/brief.md` | **Superseded** where it differs from the landed code |

### 1.1 · Wire protocol — 13 server status values, 16 valid combinations

The landed route emits **13 server status values** across **16 valid HTTP + status + reason
combinations**. **The adapter validates the full combination, never `status` alone.**

| HTTP | `status` | `reason` |
|---|---|---|
| 200 | `OK` | *(absent)* |
| 200 | `NOT_AVAILABLE` | `NO_RECORD` |
| 200 | `DEGRADED` | `STORE_UNAVAILABLE` · `STORE_RECORD_INVALID` |
| 200 | `DISABLED` | `SERVER_DISABLED` |
| 400 | `INVALID_JSON` | `INVALID_JSON` |
| 400 | `INVALID_REQUEST` | `UNKNOWN_BODY_KEY` |
| 400 | `INVALID_INSTANT` | `INSTANT_INVALID` |
| 400 | `INVALID_TICKER` | `TICKER_INVALID` |
| 401 | `UNAUTHORIZED` | `UNAUTHORIZED` |
| 403 | `TICKER_NOT_ALLOWED` | `TICKER_NOT_ALLOWED` |
| 405 | `METHOD_NOT_ALLOWED` | `METHOD_NOT_ALLOWED` |
| 500 | `CONFIGURATION_MISSING` | `TOKEN_COLLISION` · `ALLOWLIST_MISSING` · `ALLOWLIST_INVALID` |
| 500 | `ERROR` | `PREFLIGHT_UNMAPPED` |

**Fail closed, using the pinned client result in §3, when:** the status is unknown · the reason is
unknown for that status · the HTTP code does not pair with the status as tabulated · the envelope
shape does not match §1.2 exactly. **A mismatched combination is never treated as the status it
claims, and the unknown status and reason are never propagated into the normalized result.**

### 1.2 · Envelope shapes — exact, and not uniform

```
OK             { status, readContractVersion, ticker, asOf, window, records, omitted }
NOT_AVAILABLE  { status, reason, ticker, asOf, window, omitted }
DEGRADED       { status, reason, ticker }
all others     { status, reason }
```

`window` is `{from, to}`; `WINDOW_DAYS = 31`. **Only `OK`, `NOT_AVAILABLE` and `DEGRADED` carry a
`ticker`** — the other ten carry `{status, reason}` and nothing more.

**Two contract versions exist and must not be confused:** `readContractVersion` =
`news-catalysts-read-v1` on the **envelope**; `contractVersion` = `news-contract-v1` on **each
record** (D-S3-1 field 19). The adapter validates **both**, at their own levels.

## 2 · Reality check at `16543cd`

| Component | State |
|---|---|
| `news-catalysts-read` route | **absent** — S3-M1 |
| `services/news-catalysts-client.js` | **absent** — this slice |
| **Adapter precedent** | `services/fund-facts-read-client.js` — **577 lines**, a full validator: `_ffrValidOkEnvelope`, `_ffrValidErrorEnvelope`, `_ffrHasExactKeys`, `_ffrForbiddenFieldsAbsent`, `_ffrResult(kind,status,reason,ticker,envelope)` |
| Its QA | `qa/fund_facts_read_client_test.js` — **44** assertions |
| Sibling adapters | `research-evidence-client.js` · `sec-evidence-store-client.js` |

**Conclusion: the pattern is mature and should be mirrored, not invented.** In particular
`_ffrHasExactKeys` and `_ffrForbiddenFieldsAbsent` are the precedent for "exactly the frozen fields,
nothing else" — which is D-S3-1's §6 conformance rule expressed in client code.

## 3 · Scope

**Request contract — as landed:**

- **`POST`** only.
- **`Authorization: Bearer <token>`**, token from `PT_NEWS_CATALYSTS_READ_TOKEN`, supplied to the
  adapter by its caller.
- Body **exactly `{ ticker, asOf }`** — any additional key is rejected server-side as
  `UNKNOWN_BODY_KEY`, so the adapter must not add one.
- `asOf` is the **injected instant**; the adapter **never reads a wall clock**.

**Token safety — absolute.** The token is used to build one `Authorization` header and is then
discarded. It is **never persisted, logged, echoed into a result, placed in `localStorage`/
`sessionStorage`/any `pt_*` key, or included in an error message or thrown value.**

**Result shape — the existing precedent, unchanged.** `_ffrResult(kind, status, reason, ticker,
envelope)` with the **same three kinds** the precedent uses:

| `kind` | Covers |
|---|---|
| `ok` | a validated `OK` response |
| `server` | **every recognized non-OK server response** |
| `client` | local / network failure, or any response failing §1.1 combination or §1.2 shape validation |

**No second semantic vocabulary is minted.** `TICKER_NOT_ALLOWED`, `DISABLED`, `DEGRADED`,
`NOT_AVAILABLE` and the rest remain distinguishable **through `status` and `reason`, preserved
verbatim** from the wire. The caller discriminates on those, not on a client-invented state.

**Pinned client invalid-response result.** Every invalid-wire-response condition normalizes to
**exactly one** result — no variants:

```
kind:   'client'
status: 'CLIENT_INVALID_RESPONSE'
reason: 'RESPONSE_INVALID'
```

`ticker` is the **requested** ticker, known locally. **The raw envelope is not propagated** — doing
so would carry the unknown status and reason through the `envelope` slot, which is exactly what this
rule exists to prevent. `CLIENT_INVALID_RESPONSE` and `RESPONSE_INVALID` are **client-side tokens and
are never emitted by the server**; they cannot collide with the 13 server statuses.

**Documented envelope-semantics extension.** The precedent's non-OK envelopes are two or three keys
(`{status, reason}`, or `{status, reason, ticker}`). **`NOT_AVAILABLE` here carries six** — it adds
`asOf`, `window` and `omitted`. The adapter therefore **validates and retains the `NOT_AVAILABLE`
envelope with its metadata intact** in the `envelope` slot, rather than reducing it to the
precedent's two-or-three-key error shape. **This is an extension of what the `envelope` slot holds
for one status — not a new top-level state.**

**Why the metadata must survive:** per S3-M1, `NOT_AVAILABLE` with `omitted > 0` means **records
existed and were rejected**, which is materially different from a clean "no catalysts"
(`omitted === 0`). Collapsing the two is a data-honesty failure, and the adapter is the second place
it can be undone.

- Validate **exactly the 19 frozen fields** per record, in persisted order; reject unknown keys.
- Validate `readContractVersion` on the envelope **and** `contractVersion` on each record.
- One offline suite.

## 4 · Out of scope

Any UI rendering (that is M3) · any state wording — **M3 binds to the DH shared mapping contract, M2
does not author one** · any re-derivation of grounding, identity, normalization or skip logic · any
write path · any `skippedItems` handling (outside D-S3-1) · any activation or gate flip · any
ticker-specific behaviour.

## 5 · Expected implementation files — **3**

```
services/news-catalysts-client.js                     NEW  adapter + validator
qa/news_catalysts_client_test.js                      NEW  offline suite (+1)
work/s3-catalyst-evidence-client/review.md            NEW  tracked task artifact
```

**`qa/run-offline.js` is NOT pre-authorized.** Suites are auto-discovered by `OFFLINE_SUITE_RE`. If
implementation proves registration is required, **STOP and return the evidence for an Owner ruling**
(§7.9).

**Suite count:** +1 from the post-S3-M1 baseline. **Exact numbers are confirmed at revalidation, not
asserted now** — S3-M1 itself moves the count to 45.

**Lane:** neither A nor B — `services/` and a new `qa/` file only. No `index.html`, no S2 file.

## 6 · QA boundary

| ID | Assertion |
|---|---|
| **CL-1** | happy path ⇒ exactly the 19 frozen fields per record, in persisted order |
| **CL-2** | a record with an **absent** key ⇒ rejected as unreadable, **never treated as null** (D-S3-1 §1) |
| **CL-3** | `contractVersion` mismatch ⇒ record rejected before any other field is interpreted |
| **CL-4** | conditional-null rules enforced: `direction` null iff `upcoming_event`; `subType` non-empty iff `other_catalyst` |
| **CL-5** | **`subType` is treated as opaque text** — no branch on its value (D-S3-1 §C-1) |
| **CL-6** | unknown response key ⇒ rejected, not ignored |
| **CL-7** | **`DEGRADED` ⇒ `kind: 'server'` with `status: 'DEGRADED'` preserved verbatim** — never `ok`, never reduced to an empty result; both reasons (`STORE_UNAVAILABLE`, `STORE_RECORD_INVALID`) covered; the three-key envelope validated **without requiring `asOf`/`window`/`omitted`** |
| **CL-8** | **`NOT_AVAILABLE` + `omitted > 0` is distinguishable from `NOT_AVAILABLE` + `omitted === 0`** — the retained envelope exposes `omitted`, `asOf` and `window` |
| **CL-9** | negative — no write, no `pt_*` key, no storage access |
| **CL-10** | negative — no `skippedItems` consumption |
| **CL-11** | **combination exhaustiveness** — all **16 valid HTTP + status + reason combinations** across the **13 server status values** in §1.1 are recognized and return `kind: 'ok'` or `kind: 'server'` with `status` and `reason` verbatim |
| **CL-12** | unknown status · known status with unknown reason · valid status with wrong HTTP code ⇒ **the pinned `client` / `CLIENT_INVALID_RESPONSE` / `RESPONSE_INVALID` result**, with **no raw status, reason or envelope propagated**. Never `ok`, never a recognized server state |
| **CL-13** | **record validation fails the whole response, closed.** `readContractVersion` is validated **on the `OK` envelope**; a mismatch ⇒ the pinned client result. If an `OK` envelope contains **any** record failing the exact 19-field shape, its `contractVersion`, or any other frozen D-S3-1 validation, **the entire response** ⇒ the pinned client result. **The adapter never drops a record, never mutates `records`, and never computes a client-side omitted count** — S3-M1 owns record omission and the authoritative `omitted` |
| **CL-14** | **token safety** — the token appears in no result, no thrown value, no log, no storage key; asserted over the adapter's extracted source **and** over every returned object |
| **CL-15** | exact-shape check per status: the four shapes in §1.2, key-for-key; a `ticker` on any of the ten `{status, reason}` responses ⇒ **the pinned client result** |

**CL-7 is load-bearing:** collapsing `DEGRADED` into emptiness is the data-honesty failure the route
was designed to prevent, and the adapter is the second place it can be undone.

**CL-1 and CL-13 are mutually exclusive fixtures.** Under CL-13 an `OK` envelope is either fully
conforming or entirely rejected — there is no partial state between them, and no path by which the
adapter could disagree with the server's `omitted` count.

## 7 · STOP conditions

1. Any file beyond the three in §5, or `review.md` absent from the implementation commit.
2. **Any S3-M1 file** — `news-catalysts-read.mjs`, `lib/news-catalysts-read-core.js`,
   `qa/news_catalysts_read_offline.js`, `work/s3-catalyst-evidence-surface/**`.
3. **Any S2 file** — provider, core, route, `qa/news_catalysts_{provider,core,replay}_offline.js`,
   `qa/fixtures/replay/**`.
4. Any `index.html` change — rendering is M3.
5. Any write path, storage access or `pt_*` key.
6. Any re-derivation of grounding, identity, normalization or skip logic.
7. Any branch on `subType` value; any field consumed outside the 19.
8. Any `DEGRADED` presented as empty or absent data.
9. **Any edit to `qa/run-offline.js`** — STOP and return evidence instead.
10. Any state wording authored here; any activation or gate change; any live call.
11. **Any token persistence, logging, echoing or storage** — the token exists only to build one
    `Authorization` header. Any appearance in a result, error, log or `pt_*` key is a STOP.
12. **Any `kind` beyond `ok` / `server` / `client`**, or any client-side renaming, grouping or
    reinterpretation of a landed `status` or `reason`. They are preserved verbatim.
13. **Any client-side record filtering, dropping, repair or omitted-count computation**, or any
    propagation of an unknown status/reason/envelope into a `CLIENT_INVALID_RESPONSE` result.

## 8 · Lifecycle / CLOSE and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Returns only the 19 frozen fields | CL-1, CL-6 | impl | Worker | none | **YES** |
| Conformance to D-S3-1 | diff against the **tracked** contract | impl | Worker | read | **YES** |
| Status vocabulary not collapsed | CL-7, CL-8 | impl | Worker | none | **YES** |
| No write path | CL-9 + diff | impl | Worker | none | **YES** |
| `qa:offline` PASS at the confirmed count | gate run | pre-LAND | Worker | none | **YES** |
| **Route interface matches the §1 planned contract** | S3-M1's landed code | **pre-impl** | **Worker, after S3-M1 lands** | read | **NO before S3-M1 lands — this is the blocking dependency** |
| Diff minimal | reviewed diff | review | Codex / Owner | review | NO — gate after CODE-READY |
| LAND | approval | LAND | Owner | LAND | NO — by design |

**Closure is SATISFIABLE.** S3-M1 landed at `16543cd`, so the route-interface row's evidence is now
possessable by the Worker, and this slice is **CODE-READY**.

The adapter's own QA needs **no live route and no seeded store** — responses are stubbed.

## 9 · Revalidation performed — 2026-09-24

**Trigger fired: S3-M1 LANDED at `16543cd`.** The five comparison points were checked against the
landed `news-catalysts-read-core.js`:

| # | Point | Result |
|---|---|---|
| 1 | status vocabulary | **DIFFERS — wider.** **13 server status values across 16 valid HTTP + status + reason combinations**, against 6 statuses in the prepared list. `INVALID_JSON`, `INVALID_REQUEST`/`UNKNOWN_BODY_KEY`, `INVALID_INSTANT`, `METHOD_NOT_ALLOWED`, `TICKER_NOT_ALLOWED`, `ERROR`/`PREFLIGHT_UNMAPPED` were absent. §1.1 replaces it |
| 2 | envelope shape | **DIFFERS.** `readContractVersion` is new; `records`/`omitted`/`window`/`asOf` confirmed; **`DEGRADED` omits `asOf`/`window`/`omitted`**, and only three statuses carry `ticker`. §1.2 records it |
| 3 | 31-partition window, missing-day semantics | **MATCHES.** `WINDOW_DAYS = 31`; `omitted` surfaces rejected records |
| 4 | request shape | **DIFFERS — more specific.** `POST` + `Authorization: Bearer` + body `{ticker, asOf}` with unknown-key rejection. §3 replaces it |
| 5 | gate / token | `PT_NEWS_CATALYSTS_READ_TOKEN`, collision-checked against six other tokens |

**Outcome: delta amendment, not a rewrite.** §1, §3, §6 and §7 updated; §2, §4, §5, §8, §10 stand.
**D-S3-1 unchanged. S3-M1 unchanged. The three-file scope is unchanged.**

**If the interface matches: promote by delta revalidation only** — confirm the five points, confirm
the suite count, and this brief stands unchanged.

**If it differs: update only the affected sections** (§1 table, §6 CL-7/CL-8, §3). **Do not rewrite
the brief**, and do not widen scope on the strength of an interface change.

**Also re-confirm at that point:** D-S3-1 unchanged (A3b has not reopened it) · the exact post-S3-M1
suite count · `qa/run-offline.js` still auto-discovering.

## 10 · Definition of done

`services/news-catalysts-client.js` validates responses strictly against D-S3-1, returns exactly the
19 frozen fields in order, surfaces the full status vocabulary without collapsing `DEGRADED`, and
performs no write; CL-1…CL-10 pass; `qa:offline` green at the confirmed count; `review.md` carries
`## Lessons`, the three-row files-changed block and the final-check line.

**Not claimed:** that any catalyst is visible to a user. **M2 is the adapter; the card is M3, and
activation remains Activation Register work.**
