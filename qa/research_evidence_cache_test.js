'use strict';

const assert = require('assert');
const Module = require('module');
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

function defaultItem(overrides) {
  return Object.assign({
    evidenceId: 'mock:FROG:earnings:1',
    category: 'earnings',
    claim: 'FROG mock earnings evidence 1',
    direction: 'positive',
    confidence: null,
    sourceLabel: null,
    sourceUrl: null,
    sourceDate: null,
    sourceType: null,
    requiresVerification: true,
    scoringImpact: 'none'
  }, overrides || {});
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
      if (results === 'throw') {
        throw new Error('provider boom secret');
      }
      if (results !== undefined) {
        return results;
      }
      return [defaultItem()];
    }
  };
  return provider;
}

async function withBlobStub(stub, callback) {
  const originalLoad = Module._load;
  const moduleName = '@netlify/' + 'blobs';

  Module._load = function (request, parent, isMain) {
    if (request === moduleName) {
      return stub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    await callback();
  } finally {
    Module._load = originalLoad;
  }
}

function makeBlobStub(store) {
  const connectName = 'connect' + 'Lambda';
  const storeName = 'get' + 'Store';
  const calls = { connect: [], store: [] };
  const stub = {};

  stub[connectName] = function (event) {
    calls.connect.push(event);
    const chained = {};
    Object.defineProperty(chained, storeName, {
      get() {
        throw new Error('chained store access should not be used');
      }
    });
    return chained;
  };
  stub[storeName] = function (name) {
    calls.store.push(name);
    return store;
  };
  stub.calls = calls;
  return stub;
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

function freshPayload(results) {
  return JSON.stringify({
    schemaVersion: 1,
    provider: 'mock',
    ticker: 'FROG',
    categories: ['earnings'],
    results,
    cachedAt: 100000
  });
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

    // Cache gate on but no event.blobs => BYPASS.
    setEnv(CACHE_GATE, 'true');
    actual = await invoke('POST', validBody());
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    assertNonScoring(actual.json.results);

    const key = cache.makeKey('mock', 'FROG', ['earnings']);
    assert.strictEqual(key.indexOf('re:v2:'), 0);

    // MISS writes projected output.
    const missStore = makeStore();
    let provider = makeProvider();
    let resolved = await resolveWithStore(missStore, provider);
    assert.strictEqual(resolved.ok, true);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);
    assert.strictEqual(missStore.calls.get, 1);
    assert.strictEqual(missStore.calls.set, 1);
    assertNonScoring(resolved.results);

    // Ambient blob path => MISS.
    const ambientStore = makeStore();
    const blobStub = makeBlobStub(ambientStore);
    provider = makeProvider();
    await withBlobStub(blobStub, async () => {
      resolved = await cache.resolveEvidence({
        event: { blobs: { siteID: 'site' } },
        provider: 'mock',
        ticker: 'FROG',
        categories: ['earnings'],
        readProvider: () => provider.read(),
        now: () => 100000
      });
    });
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(blobStub.calls.connect.length, 1);
    assert.deepStrictEqual(blobStub.calls.connect[0], { blobs: { siteID: 'site' } });
    assert.deepStrictEqual(blobStub.calls.store, ['research-evidence']);
    assert.strictEqual(provider.calls, 1);
    assert.strictEqual(ambientStore.calls.set, 1);

    // HIT re-validates and skips the provider.
    const hitStore = makeStore(missStore.entries);
    provider = makeProvider();
    resolved = await resolveWithStore(hitStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'HIT');
    assert.strictEqual(provider.calls, 0);
    assertNonScoring(resolved.results);

    // MISS and HIT results match.
    const invariantStore = makeStore();
    provider = makeProvider();
    const miss = await resolveWithStore(invariantStore, provider);
    provider = makeProvider();
    const hit = await resolveWithStore(makeStore(invariantStore.entries), provider);
    assert.deepStrictEqual(hit.results, miss.results);
    assertNonScoring(hit.results);

    // Expired => MISS.
    const expiredStore = makeStore({
      [key]: JSON.stringify({
        schemaVersion: 1,
        provider: 'mock',
        ticker: 'FROG',
        categories: ['earnings'],
        results: [defaultItem()],
        cachedAt: 100000 - cache.CACHE_TTL_MS
      })
    });
    provider = makeProvider();
    resolved = await resolveWithStore(expiredStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);

    // Corrupt JSON => MISS.
    const corruptStore = makeStore({ [key]: '{' });
    provider = makeProvider();
    resolved = await resolveWithStore(corruptStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);

    // Fresh but invalid/legacy HIT => MISS (not DEGRADED); provider re-run.
    const invalidHitStore = makeStore({ [key]: freshPayload([defaultItem({ direction: 'sideways' })]) });
    provider = makeProvider();
    resolved = await resolveWithStore(invalidHitStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);

    // Read failure => DEGRADED after valid provider output.
    const readThrowStore = makeStore(null, { readThrows: true });
    provider = makeProvider();
    resolved = await resolveWithStore(readThrowStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'DEGRADED');
    assert.strictEqual(provider.calls, 1);

    // Write failure => DEGRADED.
    const writeThrowStore = makeStore(null, { writeThrows: true });
    provider = makeProvider();
    resolved = await resolveWithStore(writeThrowStore, provider);
    assert.strictEqual(resolved.cacheStatus, 'DEGRADED');
    assert.strictEqual(provider.calls, 1);

    // Store acquisition failure => DEGRADED after valid provider output.
    const throwingBlobStub = {};
    throwingBlobStub['connect' + 'Lambda'] = function () {};
    throwingBlobStub['get' + 'Store'] = function () {
      throw new Error('store boom');
    };
    provider = makeProvider();
    await withBlobStub(throwingBlobStub, async () => {
      resolved = await cache.resolveEvidence({
        event: {},
        provider: 'mock',
        ticker: 'FROG',
        categories: ['earnings'],
        readProvider: () => provider.read(),
        now: () => 100000
      });
    });
    assert.strictEqual(resolved.cacheStatus, 'DEGRADED');
    assert.strictEqual(provider.calls, 1);

    // Provider rejection => PROVIDER_FAILURE, never cached.
    const failStore = makeStore();
    provider = makeProvider('throw');
    resolved = await resolveWithStore(failStore, provider);
    assert.deepStrictEqual(resolved, { ok: false, reason: 'PROVIDER_FAILURE' });
    assert.strictEqual(failStore.calls.set, 0);

    // Invalid provider output => PROVIDER_INVALID_RESPONSE, never cached.
    const invalidStore = makeStore();
    provider = makeProvider([defaultItem({ scoringImpact: 'high' })]);
    resolved = await resolveWithStore(invalidStore, provider);
    assert.deepStrictEqual(resolved, { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' });
    assert.strictEqual(invalidStore.calls.set, 0);

    // Cache failure + provider rejection => PROVIDER_FAILURE.
    provider = makeProvider('throw');
    resolved = await resolveWithStore(makeStore(null, { readThrows: true }), provider);
    assert.deepStrictEqual(resolved, { ok: false, reason: 'PROVIDER_FAILURE' });

    // Cache failure + invalid provider output => PROVIDER_INVALID_RESPONSE.
    provider = makeProvider([defaultItem({ confidence: 1 })]);
    resolved = await resolveWithStore(makeStore(null, { readThrows: true }), provider);
    assert.deepStrictEqual(resolved, { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' });

    // Async provider is awaited.
    provider = {
      calls: 0,
      read() {
        provider.calls += 1;
        return Promise.resolve([defaultItem()]);
      }
    };
    resolved = await resolveWithStore(makeStore(), provider);
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.strictEqual(provider.calls, 1);

    // Unknown fields stripped from MISS, HIT, and DEGRADED outputs.
    const dirtyMissStore = makeStore();
    resolved = await resolveWithStore(dirtyMissStore, makeProvider([defaultItem({ secret: 'leak' })]));
    assert.strictEqual(resolved.cacheStatus, 'MISS');
    assert.ok(!('secret' in resolved.results[0]));

    const dirtyHit = await resolveWithStore(makeStore(dirtyMissStore.entries), makeProvider());
    assert.strictEqual(dirtyHit.cacheStatus, 'HIT');
    assert.ok(!('secret' in dirtyHit.results[0]));

    const dirtyDegraded = await resolveWithStore(makeStore(null, { writeThrows: true }), makeProvider([defaultItem({ secret: 'leak' })]));
    assert.strictEqual(dirtyDegraded.cacheStatus, 'DEGRADED');
    assert.ok(!('secret' in dirtyDegraded.results[0]));

    // Canonical cache key (namespace v2; join order-sensitive on already-canonical input).
    assert.strictEqual(
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q']),
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q'])
    );
    assert.notStrictEqual(
      cache.makeKey('mock', 'FROG', ['earnings', 'sec10q']),
      cache.makeKey('mock', 'FROG', ['sec10q', 'earnings'])
    );

    // Handler input validation still rejects before provider/cache.
    for (const body of ['{', '', '   ', JSON.stringify([]), JSON.stringify('FROG')]) {
      actual = await invoke('POST', body, { blobs: {} });
      assertError(actual, 400, 'INVALID_JSON');
    }

    for (const ticker of ['', '   ', 'BRK.B', 'ABCDEFGHIJK', '123', null, 42]) {
      actual = await invoke('POST', JSON.stringify({ ticker, categories: ['earnings'] }), { blobs: {} });
      assertError(actual, 400, 'INVALID_TICKER');
    }

    for (const categories of [[], ['analyst_rating'], ['earnings', 'x@y'], ['Earnings']]) {
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
