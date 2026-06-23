'use strict';

const contract = require('./evidence-contract');

const STORE_NAME = 'research-evidence';
const CACHE_TTL_MS = 15 * 60 * 1000;
// Internal cache namespace. Public schemaVersion stays 1; bumping this to v2
// invalidates every legacy entry written under the old contract.
const CACHE_NAMESPACE = 're:v2';

// Resolve evidence with the Blob cache. Returns
//   { ok: true, results, cacheStatus }  (cacheStatus = HIT | MISS | DEGRADED)
// or
//   { ok: false, reason }               (PROVIDER_FAILURE | PROVIDER_INVALID_RESPONSE)
//
// Rules:
// - The provider is always awaited and its output validated/projected before
//   it is returned or written; invalid provider output is never cached.
// - A valid cache HIT is re-validated before return; an invalid/legacy HIT is
//   treated as a MISS (not DEGRADED).
// - A cache failure (store acquisition / read / write) may only surface as
//   DEGRADED once valid provider output exists; provider rejection or invalid
//   provider output take precedence (PROVIDER_FAILURE / PROVIDER_INVALID_RESPONSE).
async function resolveEvidence(options) {
  const categories = options.categories;
  const key = makeKey(options.provider, options.ticker, categories);
  const now = getNow(options);

  let store = null;
  let cacheUsable = true;

  try {
    store = getStoreForEvent(options);
  } catch (err) {
    safeLog(err);
    cacheUsable = false;
  }

  if (cacheUsable) {
    try {
      const cached = await readCache(store, key);
      if (isFreshPayload(cached, options, now)) {
        const projected = contract.validateAndProject(cached.results, categories);
        if (projected.ok) {
          return { ok: true, results: projected.results, cacheStatus: 'HIT' };
        }
        // Invalid / legacy HIT → fall through and treat as a MISS.
      }
    } catch (err) {
      safeLog(err);
      cacheUsable = false;
    }
  }

  const outcome = await contract.resolveProviderOutput(options.readProvider, categories);
  if (!outcome.ok) {
    return outcome;
  }
  const results = outcome.results;

  if (!cacheUsable) {
    return { ok: true, results, cacheStatus: 'DEGRADED' };
  }

  try {
    await writeCache(store, key, makePayload(options, results, now));
  } catch (err) {
    safeLog(err);
    return { ok: true, results, cacheStatus: 'DEGRADED' };
  }

  return { ok: true, results, cacheStatus: 'MISS' };
}

function makePayload(options, results, now) {
  return {
    schemaVersion: 1,
    provider: options.provider,
    ticker: options.ticker,
    categories: options.categories,
    results,
    cachedAt: now
  };
}

function getStoreForEvent(options) {
  if (options.store) {
    return options.store;
  }

  if (options.blobs) {
    options.blobs.connectLambda(options.event);
    return options.blobs.getStore(STORE_NAME);
  }

  const { connectLambda, getStore } = require('@netlify/blobs');
  connectLambda(options.event);
  return getStore(STORE_NAME);
}

async function readCache(store, key) {
  if (typeof store.get === 'function') {
    const raw = await store.get(key);
    return parseCache(raw);
  }

  if (typeof store.getJSON === 'function') {
    return store.getJSON(key);
  }

  return null;
}

async function writeCache(store, key, payload) {
  if (typeof store.setJSON === 'function') {
    await store.setJSON(key, payload);
    return;
  }

  await store.set(key, JSON.stringify(payload));
}

function parseCache(raw) {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'object') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function isFreshPayload(payload, options, now) {
  return Boolean(
    payload &&
    payload.schemaVersion === 1 &&
    payload.provider === options.provider &&
    payload.ticker === options.ticker &&
    Array.isArray(payload.categories) &&
    sameArray(payload.categories, options.categories) &&
    Array.isArray(payload.results) &&
    typeof payload.cachedAt === 'number' &&
    now - payload.cachedAt >= 0 &&
    now - payload.cachedAt < CACHE_TTL_MS
  );
}

function makeKey(provider, ticker, categories) {
  return `${CACHE_NAMESPACE}:${provider}:${ticker}:${categories.join(',')}`;
}

function getNow(options) {
  return options.now ? options.now() : Date.now();
}

function sameArray(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function safeLog(err) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[research-evidence-cache]', err && err.message ? err.message : 'cache failure');
  }
}

module.exports = {
  CACHE_TTL_MS,
  STORE_NAME,
  CACHE_NAMESPACE,
  makeKey,
  resolveEvidence
};
