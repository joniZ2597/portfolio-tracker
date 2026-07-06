'use strict';

/*
 * netlify/functions/lib/evidence-pull-preflight.js
 *
 * Real Portfolio Evidence Pull — Slice 2E preflight + allowlist (PURE, DORMANT).
 *
 * Fail-closed gate/token/config validator + sweep-resistant ticker allowlist for
 * the (still-deferred) evidence-pull endpoint. PURE and dependency-injected: it
 * reads NO variables from the runtime environment, opens no network, constructs
 * no persistence handle, and imports no module (zero module-imports). Every input
 * is injected; the future endpoint (Slice 2F) reads the runtime environment once
 * at the boundary and passes the values in, proceeding only on an { ok: true }
 * result — BEFORE any persistence, network, SEC, or downstream-write call. No
 * HTTP route, no request entrypoint, no caller: dormancy is structural.
 *
 * Contract (frozen by qa/evidence_pull_preflight_offline.js):
 *   evaluatePullPreflight({ env, authorization, ticker })
 *     -> { ok: true, ticker }            (exact key set)
 *      | { ok: false, reason }           (exact key set; reason in fixed vocab)
 *   parseAllowedTickers(raw)
 *     -> { ok: true, tickers: Set<string> }
 *      | { ok: false, reason }
 *
 * Fixed failure vocabulary (first failure wins; gates-before-token order):
 *   PULL_SERVER_DISABLED, WRITER_SERVER_DISABLED, UNAUTHORIZED,
 *   WRITER_TOKEN_MISSING, TOKEN_COLLISION, SEC_USER_AGENT_MISSING,
 *   ALLOWLIST_MISSING, ALLOWLIST_INVALID, TICKER_INVALID, TICKER_NOT_ALLOWED.
 */

// Strict, non-normalized ticker rule — identical to the downstream write-path
// validation rule. Defined locally (that rule is not exported); equivalence is
// pinned by the PF-DRIFT offline test, not by importing the production file.
const TICKER_RE = /^[A-Z]{1,10}$/;

const MAX_ALLOWED_TICKERS = 25;   // distinct-ticker cap = the sweep ceiling
const MAX_RAW_TOKENS = 100;       // pre-dedupe token-count guard
const MAX_RAW_CHARS = 2048;       // pathological-string guard

// evaluatePullPreflight validates, in fail-closed order, every gate/token/config
// prerequisite for a single-ticker pull. Only { ok: true } may permit the caller
// to touch persistence, contact SEC, or invoke the downstream write. It mutates
// none of its inputs.
function evaluatePullPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;

  // 1) Pull server gate (strict string 'true').
  if (env.PT_ENABLE_SEC_EVIDENCE_PULL_SERVER !== 'true') {
    return fail('PULL_SERVER_DISABLED');
  }

  // 2) Writer server gate (strict) — the pull hands off to the downstream write
  //    path, so an off write-gate makes the whole op inert; fail closed early.
  if (env.PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER !== 'true') {
    return fail('WRITER_SERVER_DISABLED');
  }

  // 3) Inbound pull token: present (non-empty) AND an exact, untrimmed Bearer
  //    match. Missing and mismatch collapse to one reason (no auth oracle).
  const pullToken = env.PT_SEC_EVIDENCE_PULL_TOKEN;
  if (!isNonEmptyString(pullToken) || authorization !== 'Bearer ' + pullToken) {
    return fail('UNAUTHORIZED');
  }

  // 4) Write token present (non-empty) — required for the in-process handoff.
  const writeToken = env.PT_SEC_EVIDENCE_STORE_WRITE_TOKEN;
  if (!isNonEmptyString(writeToken)) {
    return fail('WRITER_TOKEN_MISSING');
  }

  // 5) The two tokens must be distinct — a shared secret collapses the separation
  //    between the inbound caller and the internal write handoff (blocker #4).
  if (pullToken === writeToken) {
    return fail('TOKEN_COLLISION');
  }

  // 6) SEC identity — present only if non-empty after trim (the SEC fetch path
  //    also fail-closes on this, but we reject up front, before any I/O).
  const ua = env.SEC_USER_AGENT;
  if (typeof ua !== 'string' || ua.trim() === '') {
    return fail('SEC_USER_AGENT_MISSING');
  }

  // 7) Server-side allowlist — the sweep bound.
  const allow = parseAllowedTickers(env.PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  // 8) Request ticker — strict, NON-normalized (it flows straight into the
  //    downstream write path, which is strict). Lowercase/padded is TICKER_INVALID.
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) {
    return fail('TICKER_INVALID');
  }

  // 9) Membership — the ticker must be explicitly allowlisted.
  if (!allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  return { ok: true, ticker: ticker };
}

// parseAllowedTickers parses PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS into a deduped
// Set of validated uppercase tickers. Fail-closed-loud: any malformed entry or a
// size/length overflow rejects the WHOLE list (never a silent partial drop).
//   absent (undefined/null) / blank / zero-token   -> ALLOWLIST_MISSING
//   non-string / over-length / bad entry / overflow -> ALLOWLIST_INVALID
function parseAllowedTickers(raw) {
  if (raw === undefined || raw === null) {
    return fail('ALLOWLIST_MISSING');
  }
  if (typeof raw !== 'string') {
    return fail('ALLOWLIST_INVALID');
  }
  if (raw.length > MAX_RAW_CHARS) {
    return fail('ALLOWLIST_INVALID');
  }
  if (raw.trim() === '') {
    return fail('ALLOWLIST_MISSING');
  }

  const rawTokens = raw.split(/[\s,]+/).filter(function (t) { return t !== ''; });
  if (rawTokens.length === 0) {
    return fail('ALLOWLIST_MISSING'); // e.g. a delimiter-only string: no tickers
  }
  // Raw count is measured BEFORE deduplication.
  if (rawTokens.length > MAX_RAW_TOKENS) {
    return fail('ALLOWLIST_INVALID');
  }

  const tickers = new Set();
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i].toUpperCase();
    if (!TICKER_RE.test(t)) {
      return fail('ALLOWLIST_INVALID');
    }
    tickers.add(t);
  }
  if (tickers.size > MAX_ALLOWED_TICKERS) {
    return fail('ALLOWLIST_INVALID');
  }

  return { ok: true, tickers: tickers };
}

function fail(reason) {
  return { ok: false, reason: reason };
}
function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v !== '';
}

module.exports = { evaluatePullPreflight, parseAllowedTickers };
