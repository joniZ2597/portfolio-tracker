'use strict';

/*
 * netlify/functions/lib/news-catalysts-preflight.js
 *
 * WU-P7A1 · P7A1-IMPL — News Catalysts server preflight + allowlist (PURE, DORMANT).
 *
 * Fail-closed gate/token/config validator + sweep-resistant ticker allowlist for
 * the (still-deferred) news-catalysts server endpoint. PURE and
 * dependency-injected: it reads NO variable from the runtime environment, opens
 * no network, constructs no persistence handle, and imports no module (zero
 * module-imports, zero require()). Every input is injected; the future endpoint
 * reads the runtime environment once at the boundary and passes the values in,
 * proceeding only on an { ok: true } result — BEFORE any persistence, network,
 * provider, or write call. No HTTP route, no request entrypoint, no caller:
 * dormancy is structural.
 *
 * Contract (frozen by qa/news_catalysts_preflight_offline.js), following the
 * shape frozen for fund-facts-preflight.js:
 *   evaluateNewsCatalystsPreflight({ env, authorization, ticker })
 *     -> { ok: true, ticker }            (exact key set)
 *      | { ok: false, reason }           (exact key set; reason in fixed vocab)
 *   parseAllowedTickers(raw)
 *     -> { ok: true, tickers: Set<string> }
 *      | { ok: false, reason }
 *
 * Fixed failure vocabulary (first failure wins; the evaluation order below):
 *   SERVER_DISABLED, UNAUTHORIZED, TOKEN_COLLISION,
 *   ALLOWLIST_MISSING, ALLOWLIST_INVALID, TICKER_NOT_ALLOWED.
 */

// Allowlist-INPUT rule: ASCII letters only, applied to the ORIGINAL raw token
// BEFORE any case-folding. Unicode uppercasing can expand non-ASCII input into
// ASCII-looking tickers (U+00DF -> "SS", U+FB00 -> "FF", U+017F -> "S"), so a raw
// token must prove ASCII here before toUpperCase() is ever called.
const ALLOWLIST_TOKEN_RE = /^[A-Za-z]{1,10}$/;

const MAX_ALLOWED_TICKERS = 25;   // distinct-ticker cap = the sweep ceiling
const MAX_RAW_TOKENS = 100;       // pre-dedupe token-count guard
const MAX_RAW_CHARS = 2048;       // pathological-string guard

// Env key names. Held as plain string literals — NOT process.env reads.
const GATE_KEY = 'PT_ENABLE_NEWS_CATALYSTS_SERVER';
const TOKEN_KEY = 'PT_NEWS_CATALYSTS_TOKEN';
const ALLOW_KEY = 'PT_NEWS_CATALYSTS_ALLOWED_TICKERS';

// The news-catalysts token must be distinct from exactly the five domain tokens
// below. Declared as a literal list with no sixth member and no name absent — the
// module performs no enumeration, iteration or pattern match over the environment
// object to discover collision candidates. Absent/empty comparison tokens are NOT
// a collision.
const COLLISION_KEYS = [
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

// evaluateNewsCatalystsPreflight validates, in fail-closed order, every gate/
// token/config prerequisite for a single-ticker news-catalysts request. Only
// { ok: true } may permit the caller to touch persistence, contact a provider, or
// write. It mutates none of its inputs.
function evaluateNewsCatalystsPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;

  // 1) Server gate (strict string 'true'), checked first before any upstream I/O.
  if (env[GATE_KEY] !== 'true') {
    return fail('SERVER_DISABLED');
  }

  // 2) Inbound token: present (non-empty) AND an exact, untrimmed Bearer match.
  //    Missing and mismatch collapse to one reason (no auth oracle).
  const token = env[TOKEN_KEY];
  if (!isNonEmptyString(token) || authorization !== 'Bearer ' + token) {
    return fail('UNAUTHORIZED');
  }

  // 3) Token collision — the news-catalysts token must differ from exactly the
  //    five tokens in COLLISION_KEYS; a shared secret collapses the separation
  //    between domains. Absent/empty comparison token is not a collision.
  for (let i = 0; i < COLLISION_KEYS.length; i++) {
    const other = env[COLLISION_KEYS[i]];
    if (isNonEmptyString(other) && other === token) {
      return fail('TOKEN_COLLISION');
    }
  }

  // 4) Server-side allowlist — the sweep bound.
  const allow = parseAllowedTickers(env[ALLOW_KEY]);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  // 5) Membership — the ticker must be explicitly allowlisted.
  if (typeof ticker !== 'string' || !allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  return { ok: true, ticker: ticker };
}

// parseAllowedTickers parses PT_NEWS_CATALYSTS_ALLOWED_TICKERS into a deduped Set
// of validated uppercase tickers. Fail-closed-loud: any malformed entry or a
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

module.exports = { evaluateNewsCatalystsPreflight, parseAllowedTickers };
