'use strict';

/*
 * netlify/functions/lib/evidence-pull-orchestrator.js
 *
 * Real Portfolio Evidence Pull — Slice 2C product orchestrator (DORMANT).
 *
 * Single, canonical composition of the evidence-pull path that was proven twice
 * as inline test code (Phase 1 pullAndPersist, Slice 2B pullAndPersistLive). It
 * promotes that logic to reviewed product code WITHOUT wiring it to any
 * invocation surface:
 *
 *   readRecord(cikKey) strong pre-read   -> un-seeded-only skip (create-only)
 *     -> getEvidenceWithCik              -> explicit { cik, items } (Slice 2A seam)
 *     -> writer core handler(event)      -> STORE_WRITE (store via event._testStore)
 *
 * DORMANCY / SAFETY (this module owns none of these guards; it only composes):
 *   - No HTTP route, no handler export, no caller anywhere -> not invocable in
 *     production. Dormancy is structural, not a flag this module reads.
 *   - Import-inert: requiring this module performs ZERO I/O (no network, no blob,
 *     no store op). Each top-level require (provider, writer core, store) is a
 *     pure module body; the writer's lazy blob-store require fires only inside
 *     its acquisition helper, and only when NO event._testStore is present.
 *   - Reads no runtime environment variables of its own, constructs no live blob
 *     handle, and opens no network of its own. Every runtime dependency is
 *     INJECTED via deps / providerOptions.
 *   - Inherited fail-closed guards it does not own:
 *       * provider: throws SEC_USER_AGENT_MISSING before any SEC request when
 *         providerOptions.env lacks SEC_USER_AGENT.
 *       * writer core: PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER must equal the
 *         string 'true' AND a matching Bearer write token, else DISABLED with
 *         zero store mutation; plus its own create-only onlyIfNew / 409 rules.
 *
 * Live wiring (real network / env / store / token) is intentionally deferred to
 * a separately approved Slice 2D caller. Filing-only; the numeric multi-item
 * fixture remains deferred.
 */

const { getEvidenceWithCik } = require('./evidence-provider-sec10q-live');
const { handler: writerHandler } = require('./sec-evidence-store-writer-core');
const { cikKey, readRecord } = require('./evidence-store');

const CATEGORIES = ['sec10q'];
const STRONG = { consistency: 'strong' };

// pullAndPersistTicker pulls sec10q evidence for one ticker and persists it via
// the SEC evidence-store writer core, honoring create-only / un-seeded-only.
//
// deps (all injected — the module owns no I/O of its own):
//   { store, token, providerOptions }
//     store           - the evidence store. In tests: an in-memory store passed
//                       both to the strong pre-read and to the writer as
//                       event._testStore. Never a live blob handle here.
//     token           - the write token placed in the Authorization header; must
//                       match the writer's PT_SEC_EVIDENCE_STORE_WRITE_TOKEN.
//     providerOptions - forwarded verbatim to getEvidenceWithCik (carries the
//                       injected fetch impl + env{ SEC_USER_AGENT } + spacing).
//
// Returns one of:
//   { ticker, action: 'SKIPPED_ALREADY_SEEDED' }
//   { ticker, action: 'NO_CIK' }
//   { ticker, action: 'NO_EVIDENCE' }
//   { ticker, action: 'WRITE', cik, itemCount, statusCode, body }
async function pullAndPersistTicker(ticker, deps) {
  const d = isObject(deps) ? deps : {};
  const store = d.store;
  const token = d.token;
  const providerOptions = isObject(d.providerOptions) ? d.providerOptions : {};

  // 1) Create-only / un-seeded-only: strong pre-read BEFORE any provider request.
  //    An already-seeded CIK mapping is a no-op skip (no pull, no write).
  const pre = await readRecord(store, cikKey(ticker), STRONG);
  if (pre.state === 'OK') {
    return { ticker, action: 'SKIPPED_ALREADY_SEEDED' };
  }

  // 2) Pull live sec10q evidence + the explicit CIK from the same invocation
  //    (Slice 2A seam). A missing SEC_USER_AGENT fail-closes here (throws).
  const pulled = await getEvidenceWithCik({ ticker, categories: CATEGORIES }, providerOptions);
  const cik = pulled && pulled.cik;
  const items = pulled && pulled.items;
  if (!cik) {
    return { ticker, action: 'NO_CIK' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ticker, action: 'NO_EVIDENCE' };
  }

  // 3) Persist through the writer core in-process. The store is injected via
  //    event._testStore; the writer's own gate / token / create-only rules apply.
  const event = {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: JSON.stringify({ ticker, cik, evidenceItems: items }),
    _testStore: store
  };
  const r = await writerHandler(event);
  return {
    ticker,
    action: 'WRITE',
    cik,
    itemCount: items.length,
    statusCode: r.statusCode,
    body: JSON.parse(r.body)
  };
}

// pullAndPersistPortfolio runs pullAndPersistTicker over a list of tickers in
// order, sharing the same injected deps. Returns the per-ticker result array.
async function pullAndPersistPortfolio(tickers, deps) {
  const list = Array.isArray(tickers) ? tickers : [];
  const results = [];
  for (let i = 0; i < list.length; i++) {
    results.push(await pullAndPersistTicker(list[i], deps));
  }
  return results;
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

module.exports = { pullAndPersistTicker, pullAndPersistPortfolio };
