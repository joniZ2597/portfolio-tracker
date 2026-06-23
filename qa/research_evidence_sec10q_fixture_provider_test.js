'use strict';

// EG-20F-3 — offline test for the sec10q fixture provider + its handler wiring.
// Pure Node, no network: run with `node qa/research_evidence_sec10q_fixture_provider_test.js`.

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');
const fixtureProvider = require('../netlify/functions/lib/evidence-provider-sec10q-fixture');

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER_SELECTOR = 'PT_EVIDENCE_PROVIDER';
const CACHE_GATE = 'PT_EVIDENCE_CACHE';

const DIRECTIONS = ['positive', 'neutral', 'negative'];
const ITEM_KEYS = [
  'evidenceId', 'category', 'claim', 'direction', 'confidence',
  'sourceLabel', 'sourceUrl', 'sourceDate', 'sourceType',
  'requiresVerification', 'scoringImpact'
];

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

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

function assertError(actual, statusCode, reason) {
  assert.strictEqual(actual.response.statusCode, statusCode);
  assert.strictEqual(actual.json.status, 'ERROR');
  assert.strictEqual(actual.json.reason, reason);
}

// Assert a single item satisfies the frozen sec10q-fixture contract shape.
function assertContractItem(item) {
  assert.deepStrictEqual(Object.keys(item).sort(), ITEM_KEYS.slice().sort());
  assert.strictEqual(item.category, 'sec10q');
  assert.strictEqual(typeof item.evidenceId, 'string');
  assert.ok(item.evidenceId.trim().length > 0);
  assert.strictEqual(typeof item.claim, 'string');
  assert.ok(item.claim.trim().length > 0);
  assert.ok(DIRECTIONS.includes(item.direction));
  assert.strictEqual(item.confidence, null);
  assert.strictEqual(item.requiresVerification, true);
  assert.strictEqual(item.scoringImpact, 'none');
  assert.ok(item.sourceType === null || item.sourceType === 'sec_filing');
  assert.ok(item.sourceUrl === null || /^https:\/\//.test(item.sourceUrl));
  assert.ok(item.sourceDate === null || /^\d{4}-\d{2}-\d{2}$/.test(item.sourceDate));
  assert.ok(item.sourceLabel === null || (typeof item.sourceLabel === 'string' && item.sourceLabel.trim().length > 0));
}

// Coverage required by the EG-20F-3 host policy + definition of done.
function assertCoverage(items) {
  const ids = items.map((i) => i.evidenceId);
  assert.strictEqual(new Set(ids).size, ids.length, 'evidenceId values must be unique');

  const secGov = items.filter((i) => typeof i.sourceUrl === 'string' && /^https:\/\/(www\.)?sec\.gov\//.test(i.sourceUrl));
  assert.ok(secGov.length >= 1, 'expected >= 1 sec.gov sourceUrl');

  const exampleCom = items.filter((i) => typeof i.sourceUrl === 'string' && /^https:\/\/example\.com\//.test(i.sourceUrl));
  assert.ok(exampleCom.length >= 1, 'expected >= 1 example.com sourceUrl');

  const directions = new Set(items.map((i) => i.direction));
  for (const d of DIRECTIONS) {
    assert.ok(directions.has(d), 'expected >= 1 item with direction ' + d);
  }

  const fullNull = items.filter((i) =>
    i.sourceLabel === null && i.sourceUrl === null && i.sourceDate === null && i.sourceType === null);
  assert.ok(fullNull.length >= 1, 'expected >= 1 fully null-source-metadata item');
}

async function run() {
  const originalGate = process.env[SERVER_GATE];
  const originalProvider = process.env[PROVIDER_SELECTOR];
  const originalCache = process.env[CACHE_GATE];
  const originalGetEvidence = fixtureProvider.getEvidence;

  try {
    // --- 1. Provider direct output: shape + coverage. -----------------------
    const direct = fixtureProvider.getEvidence({ ticker: 'FROG', categories: ['sec10q'] });
    assert.ok(Array.isArray(direct));
    assert.ok(direct.length >= 4, 'expected >= 4 fixture items');
    direct.forEach(assertContractItem);
    assertCoverage(direct);
    // Ticker is interpolated into evidenceId/claim.
    assert.ok(direct.every((i) => i.evidenceId.indexOf('FROG') !== -1));
    assert.ok(direct.every((i) => i.claim.indexOf('FROG') !== -1));

    // --- 2. categories without sec10q (and bad inputs) return []. -----------
    assert.deepStrictEqual(fixtureProvider.getEvidence({ ticker: 'FROG', categories: ['earnings'] }), []);
    assert.deepStrictEqual(fixtureProvider.getEvidence({ ticker: 'FROG', categories: [] }), []);
    assert.deepStrictEqual(fixtureProvider.getEvidence({ ticker: 'FROG', categories: undefined }), []);
    assert.deepStrictEqual(fixtureProvider.getEvidence({}), []);
    assert.deepStrictEqual(fixtureProvider.getEvidence(), []);
    // sec10q present among other categories still emits the sec10q rows.
    assert.ok(fixtureProvider.getEvidence({ ticker: 'FROG', categories: ['earnings', 'sec10q'] }).length >= 4);

    // --- 3. Handler gate-off remains DISABLED (provider never required). ----
    setEnv(SERVER_GATE, undefined);
    setEnv(PROVIDER_SELECTOR, 'sec10q_fixture');
    setEnv(CACHE_GATE, undefined);
    let actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['sec10q'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });

    // --- 4-9. Gate on + selector sec10q_fixture + POST returns OK. ----------
    setEnv(SERVER_GATE, 'true');
    actual = await invoke('POST', JSON.stringify({ ticker: ' frog ', categories: [' sec10q '] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.status, 'OK');
    assert.strictEqual(actual.json.schemaVersion, 1);
    assert.strictEqual(actual.json.ticker, 'FROG');
    assert.deepStrictEqual(actual.json.categories, ['sec10q']);
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS'); // cache gate off
    assert.strictEqual(typeof actual.json.requestId, 'string');
    assert.ok(actual.json.requestId.length > 0);
    assert.strictEqual(typeof actual.json.servedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(actual.json.servedAt)));

    // provenance.provider is sec10q_fixture; non-scoring envelope intact.
    assert.deepStrictEqual(actual.json.provenance, {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: 'sec10q_fixture',
      confidence: null
    });

    assert.ok(Array.isArray(actual.json.results));
    assert.ok(actual.json.results.length >= 4);
    actual.json.results.forEach(assertContractItem);
    assertCoverage(actual.json.results);
    // Projection echoes the FROG ticker into evidenceId/claim.
    assert.ok(actual.json.results.every((i) => i.evidenceId.indexOf('FROG') !== -1));

    // --- 10. Cache gate off => BYPASS (re-confirm with explicit categories). -
    actual = await invoke('POST', JSON.stringify({ ticker: 'NVDA', categories: ['sec10q'] }));
    assert.strictEqual(actual.json.status, 'OK');
    assert.strictEqual(actual.json.cacheStatus, 'BYPASS');
    assert.strictEqual(actual.json.ticker, 'NVDA');

    // --- 11. Unknown / mock selector behavior unchanged (regression). -------
    setEnv(PROVIDER_SELECTOR, undefined);
    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['sec10q'] }));
    assertError(actual, 500, 'CONFIGURATION_MISSING');

    setEnv(PROVIDER_SELECTOR, 'unknown');
    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['sec10q'] }));
    assertError(actual, 500, 'CONFIGURATION_MISSING');

    setEnv(PROVIDER_SELECTOR, 'mock');
    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assert.strictEqual(actual.json.status, 'OK');
    assert.strictEqual(actual.json.provenance.provider, 'mock'); // mock path untouched

    // --- 12. Malformed fixture output => PROVIDER_INVALID_RESPONSE (502). ----
    // Patch the in-memory export only (file/internals unchanged); restore
    // before asserting so the override never leaks.
    setEnv(PROVIDER_SELECTOR, 'sec10q_fixture');
    fixtureProvider.getEvidence = () => [{
      evidenceId: 'sec10q_fixture:FROG:bad',
      category: 'sec10q',
      claim: 'malformed direction',
      direction: 'sideways', // invalid => contract rejects
      confidence: null,
      sourceLabel: null,
      sourceUrl: null,
      sourceDate: null,
      sourceType: null,
      requiresVerification: true,
      scoringImpact: 'none'
    }];
    const malformed = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['sec10q'] }));
    fixtureProvider.getEvidence = originalGetEvidence;
    assert.strictEqual(malformed.response.statusCode, 502);
    assert.strictEqual(malformed.json.status, 'ERROR');
    assert.strictEqual(malformed.json.reason, 'PROVIDER_INVALID_RESPONSE');

    console.log('research_evidence_sec10q_fixture_provider_test: PASS');
  } finally {
    fixtureProvider.getEvidence = originalGetEvidence;
    setEnv(SERVER_GATE, originalGate);
    setEnv(PROVIDER_SELECTOR, originalProvider);
    setEnv(CACHE_GATE, originalCache);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
