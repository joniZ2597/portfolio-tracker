'use strict';

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER_SELECTOR = 'PT_EVIDENCE_PROVIDER';

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

function assertDisabled(actual) {
  assert.strictEqual(actual.response.statusCode, 200);
  assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
}

async function run() {
  const originalGate = process.env[SERVER_GATE];
  const originalProvider = process.env[PROVIDER_SELECTOR];

  try {
    setEnv(SERVER_GATE, undefined);
    setEnv(PROVIDER_SELECTOR, undefined);

    let actual = await invoke('GET');
    assertDisabled(actual);

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assertDisabled(actual);

    setEnv(SERVER_GATE, 'true');

    actual = await invoke('GET');
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY' });

    actual = await invoke('OPTIONS');
    assert.strictEqual(actual.response.statusCode, 204);
    assert.strictEqual(actual.response.body, '');

    actual = await invoke('PUT');
    assertError(actual, 405, 'METHOD_NOT_ALLOWED');

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assertError(actual, 500, 'CONFIGURATION_MISSING');

    setEnv(PROVIDER_SELECTOR, 'unknown');
    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assertError(actual, 500, 'CONFIGURATION_MISSING');

    setEnv(PROVIDER_SELECTOR, 'mock');
    actual = await invoke('POST', JSON.stringify({ ticker: ' frog ', categories: [' earnings ', 'sec10q'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.status, 'OK');
    assert.strictEqual(actual.json.schemaVersion, 1);
    assert.strictEqual(actual.json.ticker, 'FROG');
    assert.deepStrictEqual(actual.json.categories, ['earnings', 'sec10q']);
    assert.strictEqual(typeof actual.json.requestId, 'string');
    assert.ok(actual.json.requestId.length > 0);
    assert.deepStrictEqual(actual.json.provenance, {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: 'mock',
      confidence: null
    });
    assert.strictEqual(typeof actual.json.servedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(actual.json.servedAt)));

    assert.deepStrictEqual(actual.json.results, [
      {
        evidenceId: 'mock:FROG:earnings:1',
        category: 'earnings',
        claim: 'FROG mock earnings evidence 1',
        direction: 'positive',
        confidence: null,
        sourceLabel: null,
        requiresVerification: true,
        scoringImpact: 'none'
      },
      {
        evidenceId: 'mock:FROG:earnings:2',
        category: 'earnings',
        claim: 'FROG mock earnings evidence 2',
        direction: 'neutral',
        confidence: null,
        sourceLabel: null,
        requiresVerification: true,
        scoringImpact: 'none'
      },
      {
        evidenceId: 'mock:FROG:earnings:3',
        category: 'earnings',
        claim: 'FROG mock earnings evidence 3',
        direction: 'negative',
        confidence: null,
        sourceLabel: null,
        requiresVerification: true,
        scoringImpact: 'none'
      },
      {
        evidenceId: 'mock:FROG:sec10q:1',
        category: 'sec10q',
        claim: 'FROG mock sec10q evidence 1',
        direction: 'neutral',
        confidence: null,
        sourceLabel: null,
        requiresVerification: true,
        scoringImpact: 'none'
      }
    ]);

    for (const item of actual.json.results) {
      assert.ok(['positive', 'negative', 'neutral'].includes(item.direction));
      assert.strictEqual(item.requiresVerification, true);
      assert.strictEqual(item.scoringImpact, 'none');
      assert.strictEqual(item.confidence, null);
      assert.strictEqual(item.sourceLabel, null);
    }

    for (const body of ['{', '', '   ', JSON.stringify([]), JSON.stringify('FROG')]) {
      actual = await invoke('POST', body);
      assertError(actual, 400, 'INVALID_JSON');
    }

    for (const ticker of ['', '   ', 'BRK.B', 'ABCDEFGHIJK', '123', null, 42]) {
      actual = await invoke('POST', JSON.stringify({ ticker, categories: ['earnings'] }));
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
      actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories }));
      assertError(actual, 400, 'INVALID_CATEGORIES');
    }

    console.log('research_evidence_mock_provider_test: PASS');
  } finally {
    setEnv(SERVER_GATE, originalGate);
    setEnv(PROVIDER_SELECTOR, originalProvider);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
