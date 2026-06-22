'use strict';

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');
const cache = require('../netlify/functions/lib/evidence-cache');

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER_SELECTOR = 'PT_EVIDENCE_PROVIDER';
const CACHE_GATE = 'PT_EVIDENCE_CACHE';

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function invoke(method, body, extraEvent) {
  const event = Object.assign({ httpMethod: method }, extraEvent || {});
  if (arguments.length > 1) {
    event.body = body;
  }
  const response = await handler(event);
  return {
    response,
    json: response.body ? JSON.parse(response.body) : null
  };
}

function validBody(categories) {
  return JSON.stringify({ ticker: 'FROG', categories: categories || ['earnings'] });
}

function assertDisabled(actual) {
  assert.strictEqual(actual.response.statusCode, 200);
  assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
}

function assertError(actual, statusCode, reason) {
  assert.strictEqual(actual.response.statusCode, statusCode);
  assert.strictEqual(actual.json.status, 'ERROR');
  assert.strictEqual(actual.json.reason, reason);
}

function makeStore(seed, options) {
  const entries = Object.assign({}, seed || {});
  const calls = { get: 0, set: 0, keys: [] };
  const behavior = options || {};

  return {
    calls,
    entries,
    async get(key) {
      calls.get += 1;
      calls.keys.push(key);
      if (behavior.readThrows) {
        throw new Error('read failed safely');
      }
      return entries[key] || null;
    },
    async set(key, value) {
      calls.set += 1;
      calls.keys.push(key);
      if (behavior.writeThrows) {
        throw new Error('write failed safely');
      }
      entries[key] = value;
    }
  };
}

function makeProvider(results) {
  const provider = {
    calls: 0,
    read() {
      provider.calls += 1;
      return results || [
        {
          evidenceId: 'mock:FROG:earnings:1',
          category: 'earnings',
          claim: 'FROG mock earnings evidence 1',
          direction: 'positive',
          confidence: null,
          sourceLabel: null,
          requiresVerification: true,
          scoringImpact: 'none'
        }
      ];
    }
  };
  return provider;
}

async function resolveWithStore(store, provider, overrides) {
  return cache.resolveEvidence(Object.assign({
    event: { blobs: {} },
    provider: 'mock',
    ticker: 'FROG',
    categories: ['earnings'],
    readProvider: () => provider.read(),
    store,
    now: () => 100000
  }, overrides || {}));
}

function assertNonScoring(results) {
  assert.ok(results.length > 0);
  for (const item of results) {
    assert.strictEqual(item.requiresVerification, true);
    assert.strictEqual(item.scoringImpact, 'none');
    assert.strictEqual(item.confidence, null);
    assert.strictEqual(item.sourceLabel, null);
  }
}

async function run() {
  const originalGate = process.env[SERVER_GATE];
  const originalProvider = process.env[PROVIDER_SELECTOR];
  const originalCache = process.env[CACHE_GATE];

  try {
    setEnv(SERVER_GATE, undefined);
    setEnv(PROVIDER_SELECTOR, undefined);
    setEnv(CACHE_GATE, undefined);

    let actual = await invoke('GET');
    assertDisabled(actual);

    actual = await invoke('POST', validBody());
    assertDisabled(actual);

    setEnv(SERVER_GATE, 'true');
    setEnv(PROVIDER_SELECTOR, 'mock');
    setEnv(CACHE_GATE, undefined);

    actual = await invoke('POST', validBody());
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    assertNonScoring(actual.json.results);

    setEnv(CACHE_GATE, 'true');
    actual = await invoke('POST', validBody());
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    assertNonScoring(actual.json.results);

    const missStore = makeStore();
    let provider = makeProvider();
    let resolved = await resolveWithStore(missStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);
    assert.strictEqual(missStore.calls.get, 1);
    assert.strictEqual(missStore.calls.set, 1);

    const hitStore = makeStore(missStore.entries);
    provider = makeProvider();
    resolved = await resolveWithStore(hitStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'HIT');
    assert.strictEqual(provider.calls, 0);
    assertNonScoring(resolved.results);

    const expiredKey = cache.makeKey('mock', 'FROG', ['earnings']);
    const expiredStore = makeStore({
      [expiredKey]: JSON.stringify({
        schemaVersion: 1,
        provider: 'mock',
        ticker: 'FROG',
        categories: ['earnings'],
        results: provider.read(),
        cachedAt: 100000 - cache.CACHE_TTL_MS
      })
    });
    provider = makeProvider();
    resolved = await resolveWithStore(expiredStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);
    assert.strictEqual(expiredStore.calls.set, 1);

    const corruptStore = makeStore({ [expiredKey]: '{' });
    provider = makeProvider();
    resolved = await resolveWithStore(corruptStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);

    const readThrowStore = makeStore(null, { readThrows: true });
    provider = makeProvider();
    resolved = await resolveWithStore(readThrowStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'DEGRADED');
    assert.strictEqual(provider.calls, 1);

    const writeThrowStore = makeStore(null, { writeThrows: true });
    provider = makeProvider();
    resolved = await resolveWithStore(writeThrowStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'DEGRADED');
    assert.strictEqual(provider.calls, 1);

    assert.strictEqual(
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q']),
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q'])
    );
    assert.notStrictEqual(
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q']),
      cache.makeKey('mock', 'FROG', ['sec10q', 'earnings'])
    );

    const invariantStore = makeStore();
    provider = makeProvider();
    const miss = await resolveWithStore(invariantStore, provider);
    provider = makeProvider();
    const hit = await resolveWithStore(makeStore(invariantStore.entries), provider);
    assert.deepStrictEqual(hit.results, miss.results);
    assertNonScoring(hit.results);

    for (const body of ['{', '', '   ', JSON.stringify([]), JSON.stringify('FROG')]) {
      actual = await invoke('POST', body, { blobs: {} });
      assertError(actual, 400, 'INVALID_JSON');
    }

    for (const ticker of ['', '   ', 'BRK.B', 'ABCDEFGHIJK', '123', null, 42]) {
      actual = await invoke('POST', JSON.stringify({ ticker, categories: ['earnings'] }), { blobs: {} });
      assertError(actual, 400, 'INVALID_TICKER');
    }

    const invalidCategoryCases = [
      [],
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'],
      [''],
      [' Earnings'],
      ['1earnings'],
      ['earnings-news'],
      ['earnings news'],
      ['earnings', null],
      ['earnings', 7],
      ['abcdefghijklmnopqrstuvwxyzabcdefg']
    ];

    for (const categories of invalidCategoryCases) {
      actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories }), { blobs: {} });
      assertError(actual, 400, 'INVALID_CATEGORIES');
    }

    console.log('research_evidence_cache_test: PASS');
  } finally {
    setEnv(SERVER_GATE, originalGate);
    setEnv(PROVIDER_SELECTOR, originalProvider);
    setEnv(CACHE_GATE, originalCache);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
