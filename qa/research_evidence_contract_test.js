'use strict';

const assert = require('assert');
const { handler } = require('../netlify/functions/research-evidence');
const contract = require('../netlify/functions/lib/evidence-contract');

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

function validItem(overrides) {
  return Object.assign({
    evidenceId: 'e1',
    category: 'earnings',
    claim: 'claim',
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

function expectValid(results, categories) {
  const out = contract.validateAndProject(results, categories || ['earnings']);
  assert.strictEqual(out.ok, true);
  return out.results;
}

function expectInvalid(results, categories) {
  const out = contract.validateAndProject(results, categories || ['earnings']);
  assert.strictEqual(out.ok, false);
}

async function runValidatorTests() {
  // Projection strips unknown fields; known nullable fields default to null.
  const projected = expectValid([Object.assign(validItem(), { surprise: 'x' })]);
  assert.deepStrictEqual(projected[0], validItem());
  assert.ok(!('surprise' in projected[0]));

  // 0 and 50 results valid; 51 invalid; no truncation.
  assert.deepStrictEqual(contract.validateAndProject([], ['earnings']), { ok: true, results: [] });
  const fifty = [];
  for (let i = 0; i < 50; i += 1) {
    fifty.push(validItem({ evidenceId: 'id' + i }));
  }
  assert.strictEqual(expectValid(fifty).length, 50);
  expectInvalid(fifty.concat(validItem({ evidenceId: 'id50' })));

  // evidenceId: trimmed non-empty string, max 160, unique after trim.
  expectInvalid([validItem({ evidenceId: '   ' })]);
  expectInvalid([validItem({ evidenceId: '' })]);
  expectInvalid([validItem({ evidenceId: 7 })]);
  expectInvalid([validItem({ evidenceId: 'x'.repeat(161) })]);
  assert.strictEqual(expectValid([validItem({ evidenceId: 'x'.repeat(160) })])[0].evidenceId.length, 160);
  expectInvalid([validItem({ evidenceId: 'dup' }), validItem({ evidenceId: ' dup ' })]);
  assert.strictEqual(expectValid([validItem({ evidenceId: '  trim  ' })])[0].evidenceId, 'trim');

  // category must be a requested allowed category.
  expectInvalid([validItem({ category: 'guidance' })], ['earnings']);
  assert.strictEqual(expectValid([validItem({ category: ' earnings ' })], ['earnings'])[0].category, 'earnings');

  // claim: trimmed non-empty string, max 1000.
  expectInvalid([validItem({ claim: '   ' })]);
  expectInvalid([validItem({ claim: 'x'.repeat(1001) })]);
  assert.strictEqual(expectValid([validItem({ claim: 'x'.repeat(1000) })])[0].claim.length, 1000);

  // direction enum, exact.
  for (const d of ['positive', 'neutral', 'negative']) {
    assert.strictEqual(expectValid([validItem({ direction: d })])[0].direction, d);
  }
  expectInvalid([validItem({ direction: 'sideways' })]);
  expectInvalid([validItem({ direction: 'POSITIVE' })]);

  // Invariants are exact.
  expectInvalid([validItem({ confidence: 0 })]);
  expectInvalid([validItem({ confidence: 0.5 })]);
  expectInvalid([validItem({ requiresVerification: false })]);
  expectInvalid([validItem({ requiresVerification: 'true' })]);
  expectInvalid([validItem({ scoringImpact: 'low' })]);

  // sourceLabel: null or trimmed non-empty string max 200.
  assert.strictEqual(expectValid([validItem({ sourceLabel: '  Label  ' })])[0].sourceLabel, 'Label');
  expectInvalid([validItem({ sourceLabel: '   ' })]);
  expectInvalid([validItem({ sourceLabel: 'x'.repeat(201) })]);

  // sourceUrl: null or absolute HTTPS URL max 2048.
  assert.strictEqual(expectValid([validItem({ sourceUrl: 'https://a.com/x' })])[0].sourceUrl, 'https://a.com/x');
  for (const bad of [
    'http://a.com',
    'ftp://a.com',
    '/relative/path',
    'a.com',
    'javascript:alert(1)',
    'data:text/html,x',
    'https://user:pass@a.com',
    'https://a.com/ space',
    'not a url',
    'https://' + 'a'.repeat(2048) + '.com'
  ]) {
    expectInvalid([validItem({ sourceUrl: bad })]);
  }

  // sourceDate: null or strict YYYY-MM-DD real UTC calendar date.
  assert.strictEqual(expectValid([validItem({ sourceDate: '2026-01-15' })])[0].sourceDate, '2026-01-15');
  for (const bad of ['2026-1-5', '20260115', '2026/01/15', '2026-13-01', '2026-02-30', '2026-00-10', 'abcd-ef-gh', '2026-01-15T00:00:00Z']) {
    expectInvalid([validItem({ sourceDate: bad })]);
  }

  // sourceType: null or known enum.
  for (const t of contract.SOURCE_TYPES) {
    assert.strictEqual(expectValid([validItem({ sourceType: t })])[0].sourceType, t);
  }
  expectInvalid([validItem({ sourceType: 'tweet' })]);
  expectInvalid([validItem({ sourceType: 'SEC_FILING' })]);

  // Bad container / item shapes.
  expectInvalid('nope');
  expectInvalid([null]);
  expectInvalid([42]);
  expectInvalid([[]]);

  // normalizeCategories: dedupe + canonical order; reject unsupported.
  assert.deepStrictEqual(contract.normalizeCategories([' valuation ', 'earnings', 'earnings']), ['earnings', 'valuation']);
  assert.deepStrictEqual(contract.normalizeCategories(['sec10q', 'guidance', 'earnings', 'valuation']), ['earnings', 'guidance', 'valuation', 'sec10q']);
  assert.strictEqual(contract.normalizeCategories([]), null);
  assert.strictEqual(contract.normalizeCategories(['earnings', 'analyst_rating']), null);
  assert.strictEqual(contract.normalizeCategories(['Earnings']), null);
  assert.strictEqual(contract.normalizeCategories('earnings'), null);
  // Raw array length is capped at 10 before dedupe (11 duplicate allowed cats => reject).
  assert.strictEqual(contract.normalizeCategories(Array(11).fill('earnings')), null);
  assert.deepStrictEqual(contract.normalizeCategories(Array(10).fill('earnings')), ['earnings']);

  // resolveProviderOutput maps failures without leaking detail; awaits async providers.
  let outcome = await contract.resolveProviderOutput(() => [validItem()], ['earnings']);
  assert.strictEqual(outcome.ok, true);
  assert.strictEqual(outcome.results.length, 1);

  outcome = await contract.resolveProviderOutput(async () => [validItem()], ['earnings']);
  assert.strictEqual(outcome.ok, true);

  outcome = await contract.resolveProviderOutput(() => { throw new Error('boom secret'); }, ['earnings']);
  assert.deepStrictEqual(outcome, { ok: false, reason: 'PROVIDER_FAILURE' });

  outcome = await contract.resolveProviderOutput(() => Promise.reject(new Error('boom secret')), ['earnings']);
  assert.deepStrictEqual(outcome, { ok: false, reason: 'PROVIDER_FAILURE' });

  outcome = await contract.resolveProviderOutput(() => [validItem({ direction: 'bad' })], ['earnings']);
  assert.deepStrictEqual(outcome, { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' });

  outcome = await contract.resolveProviderOutput(() => ({}), ['earnings']);
  assert.deepStrictEqual(outcome, { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' });
}

async function run() {
  const originalGate = process.env[GATE];
  const originalProvider = process.env[PROVIDER];

  try {
    setEnv(GATE, undefined);
    setEnv(PROVIDER, undefined);

    let actual = await invoke('GET');
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });

    actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories: ['earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json, { status: 'DISABLED', reason: 'SERVER_DISABLED' });

    setEnv(GATE, 'true');
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

    // Every returned item carries the full provenance-ready shape (and nothing else).
    const expectedKeys = ['evidenceId', 'category', 'claim', 'direction', 'confidence', 'sourceLabel', 'sourceUrl', 'sourceDate', 'sourceType', 'requiresVerification', 'scoringImpact'];
    for (const evidenceItem of actual.json.results) {
      assert.deepStrictEqual(Object.keys(evidenceItem), expectedKeys);
      assert.strictEqual(evidenceItem.confidence, null);
      assert.strictEqual(evidenceItem.requiresVerification, true);
      assert.strictEqual(evidenceItem.scoringImpact, 'none');
      assert.ok(['positive', 'neutral', 'negative'].includes(evidenceItem.direction));
      assert.ok(evidenceItem.sourceUrl === null || /^https:\/\//.test(evidenceItem.sourceUrl));
      assert.ok(evidenceItem.sourceDate === null || /^\d{4}-\d{2}-\d{2}$/.test(evidenceItem.sourceDate));
      assert.ok(evidenceItem.sourceType === null || contract.SOURCE_TYPES.includes(evidenceItem.sourceType));
    }

    // Ticker trim.
    actual = await invoke('POST', JSON.stringify({ ticker: ' nvda ', categories: ['earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.strictEqual(actual.json.ticker, 'NVDA');

    // Dedupe + canonical category order echoed in the response.
    actual = await invoke('POST', JSON.stringify({ ticker: 'MSFT', categories: [' valuation ', 'earnings', 'earnings'] }));
    assert.strictEqual(actual.response.statusCode, 200);
    assert.deepStrictEqual(actual.json.categories, ['earnings', 'valuation']);

    actual = await invoke('POST', JSON.stringify({ ticker: 'MSFT', categories: ['sec10q', 'earnings', 'guidance', 'valuation'] }));
    assert.deepStrictEqual(actual.json.categories, ['earnings', 'guidance', 'valuation', 'sec10q']);

    // Allow-list: unsupported / mixed-unsupported => 400 INVALID_CATEGORIES before provider.
    for (const categories of [['analyst_rating'], ['earnings', 'analyst_rating'], ['Earnings'], ['earnings-news']]) {
      actual = await invoke('POST', JSON.stringify({ ticker: 'FROG', categories }));
      assertError(actual, 400, 'INVALID_CATEGORIES');
    }

    for (const ticker of ['', '   ', 'BRK.B', 'ABCDEFGHIJK', '123', null, 42]) {
      actual = await invoke('POST', JSON.stringify({ ticker, categories: ['earnings'] }));
      assertError(actual, 400, 'INVALID_TICKER');
    }

    const invalidCategoryCases = [
      [],
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'],
      Array(11).fill('earnings'),
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

    await runValidatorTests();

    console.log('research_evidence_contract_test: PASS');
  } finally {
    setEnv(GATE, originalGate);
    setEnv(PROVIDER, originalProvider);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
