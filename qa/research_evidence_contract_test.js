'use strict';

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');

const GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER = 'PT_EVIDENCE_PROVIDER';

async function invoke(method, body) {
  const event = { httpMethod: method };
  if (arguments.length > 1) {
    event.body = body;
  }
  const response = await handler(event);
  return {
    response,
    json: response.body ? JSON.parse(response.body) : null
  };
}

function setGate(value) {
  setEnv(GATE, value);
}

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function assertError(actual, statusCode, reason) {
  assert.strictEqual(actual.response.statusCode, statusCode);
  assert.strictEqual(actual.json.status, 'ERROR');
  assert.strictEqual(actual.json.reason, reason);
}

async function run() {
  const originalGate = process.env[GATE];
  const originalProvider = process.env[PROVIDER];

  try {
    setGate(undefined);
    setEnv(PROVIDER, undefined);

    let actual = await invoke('GET');
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });

    setGate('true');
    setEnv(PROVIDER, undefined);

    actual = await invoke('OPTIONS');
    assert.strictEqual(actual.response.statusCode, 204);
    assert.strictEqual(actual.response.body, '');

    actual = await invoke('GET');
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY' });

    actual = await invoke('PUT');
    assertError(actual, 405, 'METHOD_NOT_ALLOWED');

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assertError(actual, 500, 'CONFIGURATION_MISSING');

    setEnv(PROVIDER, 'mock');

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.status, 'OK');
    assert.strictEqual(actual.json.schemaVersion, 1);
    assert.strictEqual(actual.json.ticker, 'FROG');
    assert.deepStrictEqual(actual.json.categories, ['earnings']);
    assert.strictEqual(typeof actual.json.requestId, 'string');
    assert.ok(actual.json.requestId.length > 0);
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    assert.ok(Array.isArray(actual.json.results));
    assert.ok(actual.json.results.length > 0);
    assert.deepStrictEqual(actual.json.provenance, {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: 'mock',
      confidence: null
    });
    assert.strictEqual(typeof actual.json.servedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(actual.json.servedAt)));

    actual = await invoke('POST', JSON.stringify({ ticker: ' nvda ', categories: ['earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.ticker, 'NVDA');

    actual = await invoke('POST', JSON.stringify({
      ticker: 'MSFT',
      categories: [' earnings ', 'analyst_rating', 'sec10q']
    }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json.categories, ['earnings', 'analyst_rating', 'sec10q']);

    for (const ticker of ['', '   ', 'BRK.B', 'ABCDEFGHIJK', '123', null, 42]) {
      actual = await invoke('POST', JSON.stringify({ ticker, categories: ['earnings'] }));
      assertError(actual, 400, 'INVALID_TICKER');
    }

    const tooManyCategories = [
      'c1', 'c2', 'c3', 'c4', 'c5',
      'c6', 'c7', 'c8', 'c9', 'c10', 'c11'
    ];
    const invalidCategoryCases = [
      [],
      tooManyCategories,
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
      actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories }));
      assertError(actual, 400, 'INVALID_CATEGORIES');
    }

    for (const body of ['{', '', '   ', JSON.stringify([]), JSON.stringify('FROG')]) {
      actual = await invoke('POST', body);
      assertError(actual, 400, 'INVALID_JSON');
    }

    console.log('research_evidence_contract_test: PASS');
  } finally {
    setGate(originalGate);
    setEnv(PROVIDER, originalProvider);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
