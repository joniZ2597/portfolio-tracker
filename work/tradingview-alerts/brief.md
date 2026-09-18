# Task brief: TradingView alert ingestion (v1 pilot)

This brief has operational effect only when the Owner has approved these exact contents and
the brief-only commit records them unchanged. Only then may implementation begin, per
AGENTS.md "Task folder convention".

## Scope (v1 only)

TradingView alert → HTTPS webhook → parse JSON → validate shared secret from request body →
validate payload → normalize into an internal event → persist the minimal event → return
promptly (TradingView cancels requests that take longer than 3 seconds to respond).

This is ingestion-only. It proves secure, reliable TradingView → Pulse ingestion and nothing
downstream of that.

## Exact files expected to change (locked, no alternatives)

- `netlify/functions/lib/tradingview-webhook-preflight.js` (new) — pure, dependency-injected
  gate/token/payload-validation module, same shape as
  `netlify/functions/lib/news-catalysts-preflight.js`: no `process.env` reads, no network, no
  persistence handle; caller reads env once at the boundary and injects it. Owns validation of
  its own env configuration entirely — does not reference or extend any other domain's
  preflight lib or token list.
- `netlify/functions/tradingview-webhook.js` (new, plain CommonJS `.js` — matching
  `news-catalysts-preflight.js` and `portfolio-sync.js`, the two files this pilot directly
  mirrors, not the `.mjs` "modern-runtime" style used elsewhere) — the endpoint: gate, parse,
  delegate to the preflight lib, persist, respond.
- `qa/tradingview_webhook_preflight_offline.js` (new) — offline QA, auto-discovered by
  `qa/run-offline.js` (matches `OFFLINE_SUITE_RE`), no registration edit needed.
- **No `package.json` change.** `qa:offline` auto-discovers the new suite; no convenience script
  is necessary, and the smaller diff is preferred.
- **No existing file's behavior changes.** `netlify/functions/lib/news-catalysts-preflight.js`
  (including its `COLLISION_KEYS` array) is not touched. No scoring, Actionable Take,
  recommendations, normal scan, or persistence path outside the new store is touched.

## Auth decision (v1, locked for this brief)

- TradingView's official webhook documentation provides no supported mechanism for
  user-configurable custom HTTP headers, and documents no HMAC/signature mechanism (verified
  2026-09-18 against TradingView's own "How to configure webhook alerts" and "Webhook
  authentication" support pages — see footnote). The existing repo-wide
  `Authorization: Bearer <token>` pattern cannot be reused as-is.
- **v1 mechanism:** TradingView's alert message is templated as JSON containing a `secret`
  field. The handler parses the body and compares that field against
  `PT_TRADINGVIEW_WEBHOOK_TOKEN` using the same fixed-vocabulary, `===`-comparison style as
  `news-catalysts-preflight.js`'s token check — as a self-contained pattern match, not a shared
  or extended dependency on that file.
- **Fail closed on missing server configuration:** `PT_TRADINGVIEW_WEBHOOK_TOKEN` must exist and
  be non-empty at request time. If absent or empty, the request is rejected before any storage
  write — the request's `secret` value must never be able to "authenticate" against an absent
  or empty server-side token.
- The secret is **not** placed in the webhook URL and the handler does **not** depend on any
  custom header.
- IP allowlisting is explicitly **not** part of v1 (TradingView's published IP list is not
  guaranteed stable; deferred, not adopted as a gate).
- TradingView's SSL client-certificate / mTLS identification mechanism is explicitly **not**
  part of v1 (unverified feasibility inside Netlify's Functions runtime; a possible future
  research item, not this pilot).

## Security requirements

The handler rejects, before any storage write, in this order:

1. `PT_ENABLE_TRADINGVIEW_WEBHOOK_SERVER !== 'true'` → server-disabled gate.
2. Method not `POST` → method-not-allowed.
3. Server token misconfigured (`PT_TRADINGVIEW_WEBHOOK_TOKEN` absent/empty) → server-config
   error, rejected regardless of what the request supplies.
4. Body cannot be parsed as the expected JSON shape → malformed-request.
5. `secret` field missing from the request body → unauthorized.
6. `secret` field present but does not match the configured server token → unauthorized.
7. Required event fields fail validation (see Normalized event below) → invalid-payload.

Fixed, non-oracle failure vocabulary throughout (mirrors existing preflight libs — a single
collapsed reason per failure class, no information leakage beyond the class).

The shared secret is never logged and never persisted. After authentication succeeds, the
`secret` field is stripped before the event is normalized or stored — it must not appear in the
normalized event, in `qa.log`, or in any log line.

## v1 product boundary — this pilot must NOT

- Change portfolio holdings.
- Change scores.
- Change ratings/recommendations/Actionable Take.
- Trigger research/news analysis.
- Mutate any existing `pt_*` client state or any existing Blob store's existing keys/namespace.
- Deploy to production (stays on `branch-dev` / task branch; any DEV branch-deploy for live
  testing is a separate, explicit, later Netlify-write approval — not assumed or authorized by
  this brief).
- Introduce IP enforcement.
- Introduce mTLS/client-certificate verification.
- Introduce any broader alert-processing pipeline beyond "receive, validate, normalize, store."

## Normalized event schema (locked shape for v1)

```json
{
  "provider": "tradingview",
  "eventVersion": 1,
  "symbol": "<string, required, from alert payload>",
  "alertType": "<string, required — e.g. the alert condition/action label TradingView sends>",
  "sourceTimestamp": "<string ISO-8601 or null — only if TradingView supplies one in the payload>",
  "receivedAt": "<string ISO-8601, generated by Pulse at receipt time, always present>",
  "price": "<number or null — only if supplied by the alert payload>",
  "receiptId": "<string, crypto.randomUUID(), generated fresh and independently for every
    accepted delivery>"
}
```

No field carries the shared secret or any other credential. `receiptId` is generated with
Node's `crypto.randomUUID()` independently for every accepted delivery — it is **not** derived
from `receivedAt` or any payload field — and is used **only** as the Blob storage record key. It
provides storage-record uniqueness, **not** deduplication or idempotency. **v1 does not promise
dedupe/idempotency** — TradingView does not supply stable per-alert identity material in the
base payload, so retry/duplicate detection is deferred to a later task once a stable
source-identity contract exists.

## Storage: locked design

- Blob store name: **`tradingview-events-store`** (new, dedicated — does not reuse or write into
  any existing store's namespace).
- Write pattern: single `store.setJSON(receiptId, normalizedEvent)` call, matching the
  `portfolio-sync.js` precedent (no pre/post read-verify sequence, unlike the heavier
  `sec-evidence-store-writer-core.js` pattern, which is unnecessary for this pilot's
  correctness needs).
- No downstream network calls (no scoring trigger, no research call, no outbound HTTP) occur
  anywhere in the request path.

## 3-second constraint — evidence model

- Offline/local QA verifies the handler's own logic has no unnecessary downstream calls and
  keeps local processing minimal (parse → validate → single write → respond, no loops, no
  retries in the request path) — that is what targeted QA and a local timed run can actually
  prove.
- It **cannot** prove real end-to-end latency including actual Netlify Blob persistence over
  the network. That can only be measured in an explicitly approved DEV branch-deploy / live
  canary, which is its own separate Netlify-write approval boundary — not assumed or authorized
  by this brief.
- No production deployment is authorized by this brief under any circumstance.

## Testing (targeted offline QA, `qa/tradingview_webhook_preflight_offline.js`)

Coverage required before requesting review:

1. Server gate disabled → rejected before any parse/storage attempt.
2. Server token misconfigured (`PT_TRADINGVIEW_WEBHOOK_TOKEN` absent or empty) → rejected before
   storage, regardless of what secret the request supplies.
3. Malformed JSON body → rejected, no storage write attempted.
4. Missing `secret` field → rejected.
5. Wrong/invalid `secret` value (against a properly configured server token) → rejected.
6. Valid request (correct secret + valid payload, properly configured server token) → accepted.
7. Secret never appears in the persisted/normalized event or in any log output (asserted
   directly, not just implied).
8. Missing/invalid required payload fields (`symbol`, `alertType`) → rejected, distinct from
   the auth-failure cases.
9. Normalized event shape matches the schema above exactly (no extra fields, no secret, no
   dedupe claim embedded in field naming/semantics); `receiptId` present and independent of
   `receivedAt`.
10. Simulated storage failure: the injected write throws/fails →
    - the handler does not return success;
    - the error response does not leak storage internals;
    - no second/alternate write is attempted;
    - only the dedicated `tradingview-events-store` adapter is invoked (not any existing store).
    (Offline QA proves this handler-level behavior only — it does not and cannot prove Netlify
    Blob's own internal atomicity or the absence of partial writes on Netlify's side.)
11. No mutation of any existing portfolio/product state, `pt_*` key, or other store's namespace
    — asserted by checking only `tradingview-events-store` is touched.

`npm run qa:offline` must remain green with this suite auto-included (no baseline/denylist edit
expected, since `qa/run-offline.js` auto-discovers `*_offline.js` files).

## Footnote — TradingView auth research (read-only, completed 2026-09-18)

Verified against TradingView's own support pages: no supported custom-header mechanism, no
documented HMAC/signing, 3-second response timeout, ports 80/443 only, a documented
(non-guaranteed-stable) IP list, and an optional SSL client-certificate identification mechanism
whose Netlify Functions feasibility is unverified. Full findings already returned to the Owner in
conversation; not restated here in full to keep this brief scoped to the task itself.
