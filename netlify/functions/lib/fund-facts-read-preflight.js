'use strict';

// T1-C1 — Fund-Facts READ preflight (pure, dormant). Independent gate/token
// boundary from the write-side preflight (T1-C0 ruling). Only import is
// parseAllowedTickers, reused verbatim (that module has zero requires).
const { parseAllowedTickers } = require('./fund-facts-preflight');

const TICKER_RE = /^[A-Z]{1,10}$/;

const GATE_KEY = 'PT_ENABLE_FUND_FACTS_READ_SERVER';
const TOKEN_KEY = 'PT_FUND_FACTS_READ_TOKEN';
const ALLOW_KEY = 'PT_FUND_FACTS_ALLOWED_TICKERS'; // shared with the write side

// Every currently-known write-capable token (T1-C1 rev-3 §8, frozen).
const COLLISION_KEYS = [
  'PT_FUND_FACTS_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
  'PT_OWNER_TOKEN'
];

// Fail-closed order: gate -> auth -> collision -> allowlist -> ticker format
// -> membership -> success. Mutates no input.
function evaluateFundFactsReadPreflight(input) {
  const inp = isObject(input) ? input : {};
  const env = isObject(inp.env) ? inp.env : {};
  const authorization = inp.authorization;
  const ticker = inp.ticker;

  // 1) Gate.
  if (env[GATE_KEY] !== 'true') {
    return fail('READ_SERVER_DISABLED');
  }

  // 2) Auth — missing/empty server token folds into the same reason as a
  //    wrong caller credential, matching the shipped write preflight exactly.
  const token = env[TOKEN_KEY];
  if (!isNonEmptyString(token) || authorization !== 'Bearer ' + token) {
    return fail('UNAUTHORIZED');
  }

  // 3) Collision.
  for (let i = 0; i < COLLISION_KEYS.length; i++) {
    const other = env[COLLISION_KEYS[i]];
    if (isNonEmptyString(other) && other === token) {
      return fail('TOKEN_COLLISION');
    }
  }

  // 4) Allowlist configuration.
  const allow = parseAllowedTickers(env[ALLOW_KEY]);
  if (!allow.ok) {
    return fail(allow.reason);
  }

  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) {
    return fail('TICKER_INVALID');
  }

  // 6) Allowlist membership — a genuine internal reason; the core (not this
  //    module) decides the privacy-safe public mapping.
  if (!allow.tickers.has(ticker)) {
    return fail('TICKER_NOT_ALLOWED');
  }

  // 7) Success.
  return { ok: true, ticker: ticker };
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

module.exports = { evaluateFundFactsReadPreflight, COLLISION_KEYS };
