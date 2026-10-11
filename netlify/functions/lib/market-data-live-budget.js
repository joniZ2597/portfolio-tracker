/**
 * market-data-live-budget - hourly upstream budget for purpose=portfolio-live (market-data-1, BACKLOG entry 20).
 *
 * Pure: the store and the clock are injected; this module imports no storage package and starts no request.
 * At most BUDGET_PER_HOUR upstream calls per UTC hour are admitted for portfolio-live; beyond that the caller answers with a typed
 * envelope and makes no upstream call. Fail closed: a missing store, a store error, an unreadable or malformed counter, or a bad
 * argument all refuse the request (the budget is a cost backstop, never a gate that opens on error).
 *
 * Counter: key md:live-budget:<YYYY-MM-DDTHH> (UTC), value a base-10 non-negative integer string. Read-modify-write, approximate
 * under concurrency (acceptable for a cost backstop).
 */

'use strict';

const BUDGET_PER_HOUR = 300;
const STORE_NAME = 'market-data-live-budget';
const KEY_PREFIX = 'md:live-budget:';
const STRONG = { consistency: 'strong' };
const ISO_HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}/;

function keyFor(nowIso) {
  return KEY_PREFIX + String(nowIso).slice(0, 13);
}

// Resolves true when `units` upstream calls may proceed (and have been counted), false when refused.
async function take(store, nowIso, units) {
  if (!Number.isInteger(units) || units < 1) { return false; }
  if (typeof nowIso !== 'string' || !ISO_HOUR_RE.test(nowIso)) { return false; }
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') { return false; }
  try {
    const key = keyFor(nowIso);
    const raw = await store.get(key, STRONG);
    let used = 0;
    if (raw !== null && raw !== undefined) {
      const text = String(raw);
      if (!/^\d+$/.test(text)) { return false; }
      used = parseInt(text, 10);
      if (!Number.isSafeInteger(used)) { return false; }
    }
    if (used + units > BUDGET_PER_HOUR) { return false; }
    await store.set(key, String(used + units));
    return true;
  } catch (_) { return false; }
}

module.exports = { BUDGET_PER_HOUR, STORE_NAME, KEY_PREFIX, keyFor, take };
