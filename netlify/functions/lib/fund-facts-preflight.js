'use strict';

/*
 * netlify/functions/lib/fund-facts-preflight.js
 *
 * EG-25C-1 · C1-S2 — J1 SEC Financial Facts preflight + allowlist (PURE, DORMANT).
 *
 * Fail-closed gate/token/config validator + sweep-resistant ticker allowlist for
 * the (still-deferred) fund-facts endpoint (C1-S3/C1-S4). PURE and
 * dependency-injected: it reads NO variable from the runtime environment, opens
 * no network, constructs no persistence handle, and imports no module (zero
 * module-imports). Every input is injected; the future endpoint reads the runtime
 * environment once at the boundary and passes the values in, proceeding only on
 * an { ok: true } result — BEFORE any persistence, network, SEC, or write call.
 * No HTTP route, no request entrypoint, no caller: dormancy is structural.
 *
 * Deliberate divergence from the Slice 2E precedent (evidence-pull-preflight.js):
 * fund-facts WRITES IN-PROCESS behind a SINGLE gate (spec §2.3), so there is
 * exactly ONE server gate and ONE inbound token — the pull precedent's second
 * gate (WRITER_SERVER_DISABLED) and separate write-token check
 * (WRITER_TOKEN_MISSING) do NOT apply here. Instead, the single fund-facts token
 * is checked for COLLISION against exactly the two other domain tokens named in
 * COLLISION_KEYS — PT_SEC_EVIDENCE_PULL_TOKEN and PT_SEC_EVIDENCE_STORE_WRITE_TOKEN —
 * so a shared secret can never cross domains.
 *
 * Contract (frozen by qa/fund_facts_preflight_offline.js):
 *   evaluateFundFactsPreflight({ env, authorization, ticker })
 *     -> { ok: true, ticker }            (exact key set)
 *      | { ok: false, reason }           (exact key set; reason in fixed vocab)
 *   parseAllowedTickers(raw)
 *     -> { ok: true, tickers: Set<string> }
 *      | { ok: false, reason }
 *
 * Fixed failure vocabulary (first failure wins; spec §2.1 order):
 *   FUND_FACTS_SERVER_DISABLED, UNAUTHORIZED, TOKEN_COLLISION,
 *   SEC_USER_AGENT_MISSING, ALLOWLIST_MISSING, ALLOWLIST_INVALID,
 *   TICKER_INVALID, TICKER_NOT_ALLOWED.
 */

// Strict, non-normalized ticker rule — the local validation rule for this slice.
// C1-S2 validates this /^[A-Z]{1,10}$/ rule DIRECTLY through its own fixtures and
// adds NO cross-module drift oracle. Cross-module drift validation (against the
// fund-facts writer/boundary) is deferred to C1-S4, when that surface exists.
const TICKER_RE = /^[A-Z]{1,10}$/;

// Allowlist-INPUT rule: ASCII letters only, applied to the ORIGINAL raw token
// BEFORE any case-folding. Unicode uppercasing can expand non-ASCII input into
// ASCII-looking tickers (U+00DF -> "SS", U+FB00 -> "FF", U+017F -> "S"), so a raw
// token must prove ASCII here before toUpperCase() is ever called.
const ALLOWLIST_TOKEN_RE = /^[A-Za-z]{1,10}$/;

const MAX_ALLOWED_TICKERS = 25;   // distinct-ticker cap = the sweep ceiling
const MAX_RAW_TOKENS = 100;       // pre-dedupe token-count guard
const MAX_RAW_CHARS = 2048;       // pathological-string guard

// Env key names. The gate name is pinned by spec §2.3; the token/allowlist names
// are convention-derived (spec discipline: pinned at the implementation GO unless
// the owner amends). Held as plain string literals — NOT process.env reads.
const GATE_KEY = 'PT_ENABLE_FUND_FACTS_SERVER';
const TOKEN_KEY = 'PT_FUND_FACTS_TOKEN';
const ALLOW_KEY = 'PT_FUND_FACTS_ALLOWED_TICKERS';
const UA_KEY = 'SEC_USER_AGENT';

// The fund-facts token must be distinct from exactly the two domain tokens listed
// below — PT_SEC_EVIDENCE_PULL_TOKEN and PT_SEC_EVIDENCE_STORE_WRITE_TOKEN (spec
// §2.1). Absent/empty comparison tokens are NOT a collision — the fund-facts job
// is deployable standalone without the pull/writer stack.
const COLLISION_KEYS = ['PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'];

// evaluateFundFactsPreflight validates, in fail-closed order, every gate/token/
// config prerequisite for a single-ticker fund-facts pull. Only { ok: true } may
// permit the caller to touch persistence, contact SEC, or write. It mutates none
// of its inputs.
function evaluateFundFactsPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;

  // 1) Fund-facts server gate (strict string 'true'). Single gate: fund-facts
  //    writes in-process, so there is no separate writer gate.
  if (env[GATE_KEY] !== 'true') {
    return fail('FUND_FACTS_SERVER_DISABLED');
  }

  // 2) Inbound token: present (non-empty) AND an exact, untrimmed Bearer match.
  //    Missing and mismatch collapse to one reason (no auth oracle).
  const token = env[TOKEN_KEY];
  if (!isNonEmptyString(token) || authorization !== 'Bearer ' + token) {
    return fail('UNAUTHORIZED');
  }

  // 3) Token collision — the fund-facts token must differ from exactly the two
  //    tokens in COLLISION_KEYS (PT_SEC_EVIDENCE_PULL_TOKEN,
  //    PT_SEC_EVIDENCE_STORE_WRITE_TOKEN); a shared secret collapses the
  //    separation between domains. Absent/empty comparison token is not a collision.
  for (let i = 0; i < COLLISION_KEYS.length; i++) {
    const other = env[COLLISION_KEYS[i]];
    if (isNonEmptyString(other) && other === token) {
      return fail('TOKEN_COLLISION');
    }
  }

  // 4) SEC identity — present only if non-empty after trim (the SEC fetch path
  //    also fail-closes on this, but we reject up front, before any I/O).
  const ua = env[UA_KEY];
  if (typeof ua !== 'string' || ua.trim() === '') {
    return fail('SEC_USER_AGENT_MISSING');
  }

  // 5) Server-side allowlist — the sweep bound.
  const allow = parseAllowedTickers(env[ALLOW_KEY]);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  // 6) Request ticker — strict, NON-normalized (it flows straight into the
  //    downstream write path, which is strict). Lowercase/padded is TICKER_INVALID.
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) {
    return fail('TICKER_INVALID');
  }

  // 7) Membership — the ticker must be explicitly allowlisted.
  if (!allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  return { ok: true, ticker: ticker };
}

// parseAllowedTickers parses PT_FUND_FACTS_ALLOWED_TICKERS into a deduped Set of
// validated uppercase tickers. Fail-closed-loud: any malformed entry or a
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
    // Validate the ORIGINAL token (ASCII-only) BEFORE case-folding, so a non-ASCII
    // token that would uppercase into an ASCII-looking ticker cannot slip through
    // (fail-closed-loud on the whole list; never a silent per-token drop).
    const rawToken = rawTokens[i];
    if (!ALLOWLIST_TOKEN_RE.test(rawToken)) {
      return fail('ALLOWLIST_INVALID');
    }
    const ticker = rawToken.toUpperCase();
    tickers.add(ticker);
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

module.exports = { evaluateFundFactsPreflight, parseAllowedTickers };
