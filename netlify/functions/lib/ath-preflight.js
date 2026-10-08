'use strict';

/*
 * netlify/functions/lib/ath-preflight.js
 *
 * R-1 Slice B (B1+B3) — gate / token / allowlist preflight for the ATH read and write routes.
 * Pure: no I/O, no process.env of its own (the caller injects `env`), mutates no input.
 *
 * Fail-closed order (same as fund-facts): gate -> auth -> collision -> allowlist -> ticker
 * format -> membership -> success. Read and write have independent gates and tokens.
 *
 *   read  : PT_ENABLE_ATH_READ_SERVER   (public, gate + ticker only; B2-auto)
 *   ensure: PT_ENABLE_ATH_ENSURE_SERVER (public, gate + ticker only; B2-auto)
 *   write : PT_ENABLE_ATH_WRITE_SERVER / PT_ATH_WRITE_TOKEN (protected recovery path)
 *   shared allowlist: PT_ATH_ALLOWED_TICKERS  (the server-side enforcement of "tracked universe only")
 *
 * Ticker rule: the app's own symbol shape (1-10 letters, optional literal .TA), strict and
 * NON-normalised. The fund-facts rule (letters only) would reject every Tel Aviv symbol.
 */

const { TICKER_RE } = require('./ath-record');

// `public` sides (read, ensure): gate + ticker format only. No token, no allowlist: a read is
// read-only and an ensure derives server-side from trusted market data for any valid supported
// ticker (D-A1 / D-A2). Only the write side keeps token, collision and allowlist checks.
const SIDES = {
  read: {
    public: true,
    gate: 'PT_ENABLE_ATH_READ_SERVER',
    disabled: 'READ_SERVER_DISABLED'
  },
  ensure: {
    public: true,
    gate: 'PT_ENABLE_ATH_ENSURE_SERVER',
    disabled: 'ENSURE_SERVER_DISABLED'
  },
  write: {
    gate: 'PT_ENABLE_ATH_WRITE_SERVER',
    token: 'PT_ATH_WRITE_TOKEN',
    other: 'PT_ATH_READ_TOKEN',
    disabled: 'WRITE_SERVER_DISABLED'
  }
};

const ALLOW_KEY = 'PT_ATH_ALLOWED_TICKERS';

// Every currently-known token that must differ from the ATH tokens.
const EXISTING_TOKEN_KEYS = [
  'PT_FUND_FACTS_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
  'PT_OWNER_TOKEN'
];

// ASCII-only raw token, validated BEFORE case folding (non-ASCII input can uppercase into
// ASCII-looking symbols). Letters, optionally followed by a Tel Aviv .TA suffix.
const ALLOWLIST_TOKEN_RE = /^[A-Za-z]{1,10}(\.[Tt][Aa])?$/;
const MAX_ALLOWED_TICKERS = 100;
const MAX_RAW_TOKENS = 200;
const MAX_RAW_CHARS = 2048;

function evaluateAthPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;
  const side = Object.prototype.hasOwnProperty.call(SIDES, inp.side) ? SIDES[inp.side] : null;
  if (side === null) { return fail('SIDE_INVALID'); }

  // 1) Gate (strict string 'true').
  if (env[side.gate] !== 'true') {
    return fail(side.disabled);
  }

  if (side.public === true) {
    if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) { return fail('TICKER_INVALID'); }
    return { ok: true, ticker: ticker };
  }

  // 2) Inbound token: exact, untrimmed Bearer match. Missing and mismatch collapse to one reason.
  const token = env[side.token];
  if (!isNonEmptyString(token) || authorization !== 'Bearer ' + token) {
    return fail('UNAUTHORIZED');
  }

  // 3) Collision with the other ATH token and every existing token.
  const collisionKeys = EXISTING_TOKEN_KEYS.concat([side.other]);
  for (let i = 0; i < collisionKeys.length; i++) {
    const other = env[collisionKeys[i]];
    if (isNonEmptyString(other) && other === token) {
      return fail('TOKEN_COLLISION');
    }
  }

  // 4) Allowlist configuration.
  const allow = parseAthAllowedTickers(env[ALLOW_KEY]);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  // 5) Ticker format (strict, not normalised).
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) {
    return fail('TICKER_INVALID');
  }

  // 6) Membership (the core decides the privacy-safe public mapping).
  if (!allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  return { ok: true, ticker: ticker };
}

// Fail-closed-loud: any malformed entry or overflow rejects the WHOLE list.
//   absent / blank / delimiter-only -> ALLOWLIST_MISSING
//   non-string / over-length / bad entry / overflow -> ALLOWLIST_INVALID
function parseAthAllowedTickers(raw) {
  if (raw === undefined || raw === null) { return fail('ALLOWLIST_MISSING'); }
  if (typeof raw !== 'string') { return fail('ALLOWLIST_INVALID'); }
  if (raw.length > MAX_RAW_CHARS) { return fail('ALLOWLIST_INVALID'); }
  if (raw.trim() === '') { return fail('ALLOWLIST_MISSING'); }

  const rawTokens = raw.split(/[\s,]+/).filter(function (t) { return t !== ''; });
  if (rawTokens.length === 0) { return fail('ALLOWLIST_MISSING'); }
  if (rawTokens.length > MAX_RAW_TOKENS) { return fail('ALLOWLIST_INVALID'); }

  const tickers = new Set();
  for (let i = 0; i < rawTokens.length; i++) {
    if (!ALLOWLIST_TOKEN_RE.test(rawTokens[i])) { return fail('ALLOWLIST_INVALID'); }
    tickers.add(rawTokens[i].toUpperCase());
  }
  if (tickers.size > MAX_ALLOWED_TICKERS) { return fail('ALLOWLIST_INVALID'); }
  return { ok: true, tickers: tickers };
}

function fail(reason) { return { ok: false, reason: reason }; }
function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === 'string' && v !== ''; }

module.exports = {
  evaluateAthPreflight,
  parseAthAllowedTickers,
  EXISTING_TOKEN_KEYS,
  MAX_ALLOWED_TICKERS
};
