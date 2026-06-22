'use strict';

const STORE_NAME = 'research-evidence';
const CACHE_TTL_MS = 15 * 60 * 1000;

async function resolveEvidence(options) {
  const providerResult = () => options.readProvider();
  let store;

  try {
    store = getStoreForEvent(options);
  } catch (err) {
    safeLog(err);
    return { results: providerResult(), cacheStatus: 'DEGRADED' };
  }

  const key = makeKey(options.provider, options.ticker, options.categories);
  const now = getNow(options);

  try {
    const cached = await readCache(store, key);
    if (isFreshPayload(cached, options, now)) {
      return { results: cached.results, cacheStatus: 'HIT' };
    }
  } catch (err) {
    safeLog(err);
    return { results: providerResult(), cacheStatus: 'DEGRADED' };
  }

  const results = providerResult();
  const payload = {
    schemaVersion: 1,
    provider: options.provider,
    ticker: options.ticker,
    categories: options.categories,
    results,
    cachedAt: now
  };

  try {
    await writeCache(store, key, payload);
  } catch (err) {
    safeLog(err);
    return { results, cacheStatus: 'DEGRADED' };
  }

  return { results, cacheStatus: 'MISS' };
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
  return `re:v1:${provider}:${ticker}:${categories.join(',')}`;
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
  makeKey,
  resolveEvidence
};
