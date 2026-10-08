'use strict';

/*
 * netlify/functions/lib/ath-ensure-core.js
 *
 * R-1 Slice B2-auto — public, ticker-only ATH maintenance. Route: /.netlify/functions/ath-ensure.
 *
 * Request : POST { ticker }   (exactly that one key; no token needed, a supplied one is ignored)
 * Response: the ath-read-v2 projection plus { action, budget }. No evidence, no refresh state, no
 *           timestamps other than verifiedAt, no raw Yahoo data.
 *
 * Dormant unless PT_ENABLE_ATH_ENSURE_SERVER === 'true' (checked before the method, the body, any
 * store access and any fetch). The browser never submits an ATH value: every automatic value is
 * derived here from a Yahoo daily series that THIS server fetched (ath-yahoo.js).
 *
 * Decision table (stored state -> action):
 *   none                          -> full derive
 *   unresolved (24 h cooldown)    -> full derive
 *   stale-suspect auto (6 h)      -> full derive (split rule)
 *   stale-suspect operator        -> no fetch
 *   verified, either method (6 h) -> recent check: splits first, then the incremental update
 *   cooldown not passed           -> no fetch, no write
 *
 * Store access: `get` / `set` of ath:v1:<TICKER> and of the hourly budget counter. No list, no delete.
 */

const { evaluateAthPreflight } = require('./ath-preflight');
const {
  STORE_NAME,
  recordKey,
  parseStoredRecord,
  validateRecordV2,
  deriveAuto,
  buildAutoRecord,
  recordFetchFailure,
  applyRecentBars,
  applySplits,
  completeSplitRederive,
  projectPublic
} = require('./ath-record');
const { fetchChart } = require('./ath-yahoo');

const STRONG = { consistency: 'strong' };
const VERIFIED_COOLDOWN_MS = 6 * 3600 * 1000;
const UNRESOLVED_COOLDOWN_MS = 24 * 3600 * 1000;
const BUDGET_PER_HOUR = 300;
const BUDGET_KEY_PREFIX = 'ath:budget:';
const RECENT_LOOKBACK_DAYS = 7;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return { statusCode: statusCode, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors()), body: JSON.stringify(body) };
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') { return { ok: false }; }
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch (_) { return { ok: false }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

function resolveNowMs(event) {
  const clock = event && event._testClock;
  return clock && typeof clock.nowMs === 'number' && isFinite(clock.nowMs) ? clock.nowMs : Date.now();
}

function unitForTicker(ticker) {
  return /\.TA$/.test(ticker) ? { currency: 'ILS', unit: 'ILA' } : { currency: 'USD', unit: 'USD' };
}

// What the stored state calls for. 'NONE' | 'FULL' | 'RECENT'.
function decide(record, nowMs) {
  if (record === null) { return 'FULL'; }
  const age = nowMs - Date.parse(record.lastCheckedAt);
  if (record.status === 'unresolved') { return age >= UNRESOLVED_COOLDOWN_MS ? 'FULL' : 'NONE'; }
  if (record.status === 'stale-suspect') {
    if (record.method === 'operator') { return 'NONE'; }
    return age >= VERIFIED_COOLDOWN_MS ? 'FULL' : 'NONE';
  }
  if (record.status === 'verified') { return age >= VERIFIED_COOLDOWN_MS ? 'RECENT' : 'NONE'; }
  return 'NONE';
}

// Hourly Yahoo budget (read-modify-write; approximate under concurrency, acceptable for DEV).
// Resolves true when a fetch may proceed (and has been counted), false when exhausted.
async function takeBudget(store, nowIso) {
  const key = BUDGET_KEY_PREFIX + nowIso.slice(0, 13);
  const raw = await store.get(key, STRONG);
  const used = raw === null || raw === undefined ? 0 : parseInt(String(raw), 10);
  if (!isFinite(used) || used < 0) { return false; }
  if (used >= BUDGET_PER_HOUR) { return false; }
  await store.set(key, String(used + 1));
  return true;
}

function recentPeriod1(record) {
  const day = Date.parse(record.lastCheckedAt.slice(0, 10) + 'T00:00:00Z');
  return Math.max(0, Math.floor(day / 1000) - RECENT_LOOKBACK_DAYS * 86400);
}

function seriesOf(r) { return { firstTradeDate: r.firstTradeDate, bars: r.bars, splits: r.splits }; }

// A full derive for a missing / unresolved / stale-suspect(auto) record.
async function fullDerive(ctx, existing) {
  const r = await fetchChart(ctx.ticker, { fetchImpl: ctx.fetchImpl, nowMs: ctx.nowMs });
  const meta = r.ok ? { ticker: ctx.ticker, currency: r.currency, unit: r.unit } : Object.assign({ ticker: ctx.ticker }, unitForTicker(ctx.ticker));
  if (!r.ok) {
    return { record: recordFetchFailure(existing, meta, r.reason, ctx.nowIso), action: existing === null ? 'derived' : 'checked' };
  }
  if (existing !== null && existing.unit !== r.unit) {
    return { record: recordFetchFailure(existing, meta, 'UNSUPPORTED', ctx.nowIso), action: 'checked' };
  }
  const derived = deriveAuto(seriesOf(r), ctx.nowIso);
  if (existing !== null && existing.status === 'stale-suspect') {
    // The splits that made it stale: everything dated after the value that was verified.
    const since = existing.verifiedAt ? existing.verifiedAt.slice(0, 10) : '';
    const splits = r.splits.filter(function (s) { return s.date > since; });
    const next = completeSplitRederive(existing, derived, splits, ctx.nowIso);
    return { record: next, action: next.status === 'verified' ? 'derived' : 'stale-suspect' };
  }
  // Missing or unresolved: a fresh automatic record (an unresolved operator record carries no value to protect).
  return { record: buildAutoRecord(meta, derived, ctx.nowIso), action: 'derived' };
}

async function recentCheck(ctx, existing) {
  const r = await fetchChart(ctx.ticker, { fetchImpl: ctx.fetchImpl, nowMs: ctx.nowMs, period1: recentPeriod1(existing) });
  if (!r.ok) { return { record: recordFetchFailure(existing, null, r.reason, ctx.nowIso), action: 'checked' }; }
  if (r.unit !== existing.unit) { return { record: recordFetchFailure(existing, null, 'UNSUPPORTED', ctx.nowIso), action: 'checked' }; }

  // Splits first (persisted as stale-suspect before any re-derive).
  const sp = applySplits(existing, r.splits, ctx.nowIso);
  if (!sp.triggered) { return applyRecentBars(existing, { bars: r.bars }, ctx.nowIso); }
  if (!sp.rederive) { return { record: sp.record, action: 'stale-suspect' }; } // operator: recovery path only
  return { record: sp.record, action: 'stale-suspect', rederive: true };
}

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Server gate: strict string 'true'. Off => dormant: no body parse, no preflight, no store, no fetch.
  if (process.env.PT_ENABLE_ATH_ENSURE_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }
  // Ticker only: any other key (a price, a value, a date, ...) is refused before anything else.
  const keys = Object.keys(parsed.value);
  if (keys.length !== 1 || keys[0] !== 'ticker') {
    return res(400, { status: 'INVALID_SUBMISSION', reason: 'BODY_SHAPE' });
  }

  const pf = evaluateAthPreflight({ side: 'ensure', env: process.env, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return pf.reason === 'TICKER_INVALID'
      ? res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' })
      : res(500, { status: 'ERROR', reason: 'PREFLIGHT_UNMAPPED' });
  }
  const ticker = pf.ticker;
  const key = recordKey(ticker);
  const nowMs = resolveNowMs(event);
  const nowIso = new Date(nowMs).toISOString();
  const ctx = { ticker: ticker, nowMs: nowMs, nowIso: nowIso, fetchImpl: event && event._testFetch };

  function degraded(reason) { return res(200, { status: 'DEGRADED', reason: reason, ticker: ticker }); }

  let store;
  try { store = acquireStore(event); } catch (_) { return degraded('STORE_UNAVAILABLE'); }

  let raw;
  try { raw = await store.get(key, STRONG); } catch (_) { return degraded('STORE_UNAVAILABLE'); }
  let existing = null;
  if (raw !== null && raw !== undefined) {
    const stored = parseStoredRecord(raw);
    // A corrupt record is never overwritten.
    if (!stored.ok || stored.record.ticker !== ticker) { return degraded('STORE_RECORD_INVALID'); }
    existing = stored.record;
  }

  function respond(record, action, budget) {
    if (record === null) { return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker, action: action, budget: budget }); }
    return res(200, Object.assign(projectPublic(ticker, record), { action: action, budget: budget }));
  }

  const decision = decide(existing, nowMs);
  if (decision === 'NONE') { return respond(existing, 'none', 'ok'); }

  let outcome;
  const budget = 'ok';
  let persisted = existing === null ? null : JSON.stringify(existing);
  try {
    if (!(await takeBudget(store, nowIso))) { return respond(existing, 'none', 'exhausted'); }
    outcome = decision === 'FULL' ? await fullDerive(ctx, existing) : await recentCheck(ctx, existing);
    if (outcome.rederive === true) {
      // A split on an `auto` record: persist stale-suspect first, then re-derive in this request.
      persisted = JSON.stringify(outcome.record);
      await store.set(key, persisted);
      existing = outcome.record;
      if (!(await takeBudget(store, nowIso))) {
        return respond(existing, 'stale-suspect', 'exhausted');
      }
      outcome = await fullDerive(ctx, existing);
    }
  } catch (_) {
    return degraded('STORE_UNAVAILABLE');
  }

  const next = outcome.record;
  if (!validateRecordV2(next).ok) { return res(500, { status: 'ERROR', reason: 'RECORD_BUILD_INVALID' }); }
  // Write only when something changed (a v1 record is upgraded in place when it next changes).
  try {
    const serialized = JSON.stringify(next);
    if (serialized !== persisted) { await store.set(key, serialized); }
  } catch (_) {
    return degraded('STORE_UNAVAILABLE');
  }
  return respond(next, outcome.action, budget);
};

module.exports.decide = decide;
module.exports.BUDGET_PER_HOUR = BUDGET_PER_HOUR;
module.exports.VERIFIED_COOLDOWN_MS = VERIFIED_COOLDOWN_MS;
module.exports.UNRESOLVED_COOLDOWN_MS = UNRESOLVED_COOLDOWN_MS;
