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
 *
 * Consistency: the counter is read with the store's default (eventual) consistency. The handler (market-data.js) is a legacy Lambda-style
 * function that gets its Blobs context from connectLambda(event), and that context carries no uncachedEdgeURL, so a strong-consistency
 * read is unsupported there and throws (portfolio-live answered BUDGET_EXHAUSTED on every call). An eventual read can lag behind a very
 * recent write, which makes the count approximate under bursts - acceptable for a cost backstop - and every error still refuses.
 *
 * Diagnostics: every refusal logs exactly one fixed-category line, "[market-data-live-budget] refused: <CATEGORY>". Never logged: error
 * messages, stacks, URLs, tokens, symbols, keys or counter values. The admitted path logs nothing.
 */

'use strict';

const BUDGET_PER_HOUR = 300;
const STORE_NAME = 'market-data-live-budget';
const KEY_PREFIX = 'md:live-budget:';
const ISO_HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}/;
const ERROR_NAME_RE = /^[A-Za-z]{1,40}$/;

function keyFor(nowIso) {
  return KEY_PREFIX + String(nowIso).slice(0, 13);
}

// Logs one fixed-category line and returns false (the refusal).
function refuse(category) {
  try { console.warn('[market-data-live-budget] refused: ' + category); } catch (_) { /* a failing logger must not turn a refusal into a throw */ }
  return false;
}

// Resolves true when `units` upstream calls may proceed (and have been counted), false when refused.
async function take(store, nowIso, units) {
  if (!Number.isInteger(units) || units < 1) { return refuse('BAD_UNITS'); }
  if (typeof nowIso !== 'string' || !ISO_HOUR_RE.test(nowIso)) { return refuse('BAD_TIME'); }
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') { return refuse('NO_STORE'); }
  try {
    const key = keyFor(nowIso);
    const raw = await store.get(key);
    let used = 0;
    if (raw !== null && raw !== undefined) {
      const text = String(raw);
      if (!/^\d+$/.test(text)) { return refuse('BAD_COUNTER'); }
      used = parseInt(text, 10);
      if (!Number.isSafeInteger(used)) { return refuse('BAD_COUNTER'); }
    }
    if (used + units > BUDGET_PER_HOUR) { return refuse('CAP_REACHED'); }
    await store.set(key, String(used + units));
    return true;
  } catch (err) {
    let name = 'Error';
    try { if (err && typeof err.name === 'string' && ERROR_NAME_RE.test(err.name)) { name = err.name; } } catch (_) { /* hostile getter: keep the generic name */ }
    return refuse('STORE_ERROR:' + name);
  }
}

module.exports = { BUDGET_PER_HOUR, STORE_NAME, KEY_PREFIX, keyFor, take };
