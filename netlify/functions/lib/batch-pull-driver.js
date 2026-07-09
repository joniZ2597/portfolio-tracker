'use strict';

/*
 * netlify/functions/lib/batch-pull-driver.js
 *
 * EG-21C-1 — batch pull driver (PURE, DORMANT). Promoted VERBATIM from the
 * EG-20D-1 harness reference implementation in
 * qa/sec_evidence_pull_batch_driver_offline.js (owner decision D-C1: repoint).
 *
 * The owner-ratified batch policy (D1–D6): a batch portfolio evidence pull is
 * a CLIENT/OWNER-side sequential loop of single-ticker calls against the
 * EXISTING sec-evidence-pull endpoint — no server-side batch surface exists or
 * is added. This lib is the loop POLICY only; the transport is whatever
 * callFn the (future, separately approved) owner-run caller injects:
 *
 *   validate the WHOLE list first (strict /^[A-Z]{1,10}$/, fail-closed-loud)
 *     -> dedupe (default on) -> cap (<= 25, the server allowlist ceiling)
 *     -> sequential single-ticker calls -> per-ticker ledger entry
 *     -> STOP on any non-continue outcome; continue ONLY on the exact
 *        (status, reason) pairs 200 WRITE · 200 SKIPPED/ALREADY_SEEDED ·
 *        200 NO_EVIDENCE/NO_EVIDENCE · 200 NO_EVIDENCE/NO_CIK — never on a
 *        status family alone (D3, reason-aware).
 *
 * DORMANCY / SAFETY:
 *   - No HTTP route, no handler export, no caller anywhere in the repo; the
 *     pull route/core/orchestrator must never import this lib (pinned by the
 *     WR-series isolation scan).
 *   - Import-inert: zero require(), zero import-time work.
 *   - Reads NO env, opens no network, constructs no persistence handle. The
 *     ONLY effect is invoking the INJECTED callFn once per surviving ticker.
 *
 * Contract (frozen by qa/sec_evidence_pull_batch_driver_offline.js BD-series
 * and qa/batch_pull_wiring_offline.js WR-series):
 *   runBatchPull(tickers, callFn[, opts])
 *     callFn(ticker) -> Promise<{ statusCode, body }>
 *     -> { ok:false, reason, ledger:[] }      (reason: LIST_INVALID | LIST_TOO_LARGE)
 *      | { ok:true, complete:true, ledger }
 *      | { ok:true, complete:false, stoppedAt, stopStatus, stopReason, ledger }
 *   isContinueOutcome(entry) -> boolean       (exact approved pairs only)
 *
 *   Ledger entry: { ticker, statusCode, status, reason?, cik?, writtenKeys? }
 *   — writtenKeys is copied VERBATIM from the response body (never
 *   reconstructed), so exact-key teardown plans can always be built from the
 *   ledger alone.
 *
 * Rule constants are defined locally (never imported); equivalence with the
 * pull preflight / portfolio-sync / EG-21B extractor rule is pinned by the
 * BD11 and BTS11 drift tests.
 */

const BATCH_TICKER_RE = /^[A-Z]{1,10}$/;
const MAX_BATCH_TICKERS = 25; // == the server allowlist distinct-ticker ceiling

// The D3 continue set as exact (status, reason) pairs. WRITE is the only
// reason-less continue; SKIPPED and NO_EVIDENCE continue ONLY with their
// approved reasons — an unrecognized reason on a familiar status STOPS.
function isContinueOutcome(entry) {
  if (entry.statusCode !== 200) { return false; }
  if (entry.status === 'WRITE') { return true; }
  if (entry.status === 'SKIPPED') { return entry.reason === 'ALREADY_SEEDED'; }
  if (entry.status === 'NO_EVIDENCE') {
    return entry.reason === 'NO_EVIDENCE' || entry.reason === 'NO_CIK';
  }
  return false;
}

async function runBatchPull(tickers, callFn, opts) {
  const o = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
  const dedupe = o.dedupe !== false; // default on; disable only to test server-side dup handling

  // 1) Fail-closed-loud whole-list validation BEFORE any call (mirrors
  //    parseAllowedTickers: one bad member rejects the entire batch).
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return { ok: false, reason: 'LIST_INVALID', ledger: [] };
  }
  for (let i = 0; i < tickers.length; i++) {
    if (typeof tickers[i] !== 'string' || !BATCH_TICKER_RE.test(tickers[i])) {
      return { ok: false, reason: 'LIST_INVALID', ledger: [] };
    }
  }

  // 2) Dedupe (order-preserving), then cap at the allowlist ceiling.
  let list = tickers.slice();
  if (dedupe) {
    const seen = new Set();
    list = list.filter(function (t) {
      if (seen.has(t)) { return false; }
      seen.add(t);
      return true;
    });
  }
  if (list.length > MAX_BATCH_TICKERS) {
    return { ok: false, reason: 'LIST_TOO_LARGE', ledger: [] };
  }

  // 3) Sequential single-ticker calls. Every response lands independently, so a
  //    completed WRITE's writtenKeys can never be lost to a later failure.
  const ledger = [];
  for (let i = 0; i < list.length; i++) {
    const r = await callFn(list[i]);
    const body = r && r.body;
    const entry = { ticker: list[i], statusCode: r ? r.statusCode : null, status: body ? body.status : undefined };
    if (body && body.reason !== undefined) { entry.reason = body.reason; }
    if (body && body.cik !== undefined) { entry.cik = body.cik; }
    if (body && body.writtenKeys !== undefined) { entry.writtenKeys = body.writtenKeys; } // verbatim
    ledger.push(entry);

    // 4) D3 stop policy: continue ONLY on an exact approved (status, reason)
    //    pair. Everything else (DISABLED / DEGRADED / unrecognized reason /
    //    4xx / 5xx / WRITE-conflict on a non-200) stops the batch with the
    //    ledger intact.
    if (!isContinueOutcome(entry)) {
      return { ok: true, complete: false, stoppedAt: list[i], stopStatus: entry.status, stopReason: entry.reason, ledger: ledger };
    }
  }
  return { ok: true, complete: true, ledger: ledger };
}

module.exports = { runBatchPull, isContinueOutcome };
