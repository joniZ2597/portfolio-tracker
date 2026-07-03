'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { handler } = require('../netlify/functions/sec-evidence-store');
const { cikKey, companyKey, readRecord, sanitizeReadError } = require('../netlify/functions/lib/evidence-store');

const GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_SERVER';
const ROOT = path.resolve(__dirname, '..');

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function invoke(method, body, store) {
  const event = { httpMethod: method };
  if (body !== undefined) {
    event.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if (store) { event._testStore = store; }
  return handler(event);
}

function nullStore() {
  return { get: async function () { return null; } };
}

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log('  PASS  ' + label);
    passed += 1;
  } catch (err) {
    console.log('  FAIL  ' + label);
    console.log('         ' + err.message);
    failed += 1;
  }
}

async function runTests() {

  await test('gate OFF: DISABLED, store not touched', async function () {
    setEnv(GATE, undefined);
    let touched = false;
    const spy = { get: async function () { touched = true; return null; } };
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, spy);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DISABLED');
    assert.strictEqual(j.reason, 'SERVER_DISABLED');
    assert.strictEqual(touched, false);
  });

  await test('OPTIONS 204 with gate off', async function () {
    setEnv(GATE, undefined);
    const r = await handler({ httpMethod: 'OPTIONS' });
    assert.strictEqual(r.statusCode, 204);
  });

  await test('GET: METHOD_NOT_ALLOWED', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('GET');
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 405);
    assert.strictEqual(j.status, 'METHOD_NOT_ALLOWED');
    assert.strictEqual(j.reason, 'METHOD_NOT_ALLOWED');
  });

  await test('invalid JSON body: INVALID_JSON', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', 'not-json');
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_JSON');
    assert.strictEqual(j.reason, 'INVALID_JSON');
  });

  await test('numeric ticker: INVALID_TICKER', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: '123', categories: ['sec10q'] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_TICKER');
    assert.strictEqual(j.reason, 'INVALID_TICKER');
  });

  await test('BRK.B dot ticker: INVALID_TICKER', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'BRK.B', categories: ['sec10q'] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_TICKER');
  });

  await test('11-char ticker: INVALID_TICKER', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'ABCDEFGHIJK', categories: ['sec10q'] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_TICKER');
  });

  await test('empty categories: INVALID_CATEGORIES', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'AAPL', categories: [] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_CATEGORIES');
    assert.strictEqual(j.reason, 'INVALID_CATEGORIES');
  });

  await test('unsupported category: INVALID_CATEGORIES', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['earnings'] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_CATEGORIES');
  });

  await test('mixed supported+unsupported: INVALID_CATEGORIES', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q', 'earnings'] });
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_CATEGORIES');
  });

  await test('duplicate sec10q deduped: proceeds to STORE_MISS', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q', 'sec10q'] }, nullStore());
    const j = JSON.parse(r.body);
    assert.notStrictEqual(j.status, 'INVALID_CATEGORIES');
    assert.strictEqual(j.status, 'STORE_MISS');
    assert.deepStrictEqual(j.categories, ['sec10q']);
  });

  await test('CIK key absent: STORE_MISS', async function () {
    setEnv(GATE, 'true');
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, nullStore());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_MISS');
    assert.strictEqual(j.ticker, 'AAPL');
    assert.deepStrictEqual(j.categories, ['sec10q']);
  });

  await test('company key absent: STORE_MISS', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function (key) {
      return key === cikKey('AAPL') ? JSON.stringify({ cik: '0000320193' }) : null;
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_MISS');
  });

  await test('non-JSON CIK record: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function () { return 'not-json'; } };
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('malformed CIK field: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function () { return JSON.stringify({ cik: 'BAD' }); } };
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('store.get throws: DEGRADED', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function () { throw new Error('infra error'); } };
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
  });

  await test('EG-20C-3: reader DEGRADED response carries no diag fields (3-arg path unchanged)', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function () { throw new Error('infra error'); } };
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.errorName, undefined);
    assert.strictEqual(j.stage, undefined);
    assert.strictEqual(j.writeAttempted, undefined);
    assert.ok(r.body.indexOf('infra error') === -1, 'err.message leaked from reader');
  });

  await test('EG-20C-3: readRecord 3-arg DEGRADED is bare (no diag key)', async function () {
    const store = { get: async function () { throw new Error('boom'); } };
    const result = await readRecord(store, 'any-key', { consistency: 'strong' });
    assert.deepStrictEqual(result, { state: 'DEGRADED' });
  });

  await test('EG-20C-3: readRecord wantDiag=true DEGRADED carries allowlisted diag only', async function () {
    const err = new Error('secret message');
    err.status = 502;
    err.code = 'ERR_X'; // identifier-shaped but NOT allowlisted → must be omitted
    const store = { get: async function () { throw err; } };
    const result = await readRecord(store, 'any-key', { consistency: 'strong' }, true);
    assert.strictEqual(result.state, 'DEGRADED');
    assert.deepStrictEqual(result.diag, { errorName: 'Error', httpStatus: 502 });
    assert.ok(JSON.stringify(result).indexOf('secret message') === -1, 'err.message leaked in diag');
    assert.ok(JSON.stringify(result).indexOf('ERR_X') === -1, 'unlisted errorCode leaked in diag');
  });

  await test('EG-20C-3: sanitizeReadError hostile input → UnknownError only', async function () {
    assert.deepStrictEqual(sanitizeReadError(null), { errorName: 'UnknownError' });
    assert.deepStrictEqual(sanitizeReadError('free text'), { errorName: 'UnknownError' });
    assert.deepStrictEqual(
      sanitizeReadError({ name: 'not a safe: name', status: 42, code: 'bad code!' }),
      { errorName: 'UnknownError' }
    );
    assert.deepStrictEqual(
      sanitizeReadError({ get name() { throw new Error('x'); }, status: 503 }),
      { errorName: 'UnknownError', httpStatus: 503 }
    );
  });

  await test('EG-20C-3: sanitizeReadError fixed vocabulary — unlisted identifiers rejected, listed pass', async function () {
    assert.deepStrictEqual(
      sanitizeReadError({ name: 'MaliciousIdentifierName', code: 'ERR_FAKE_CUSTOM_CODE', status: 500 }),
      { errorName: 'UnknownError', httpStatus: 500 }
    );
    assert.deepStrictEqual(
      sanitizeReadError({ name: 'BlobsInternalError', code: 'ECONNRESET', status: 502 }),
      { errorName: 'BlobsInternalError', httpStatus: 502, errorCode: 'ECONNRESET' }
    );
  });

  await test('valid fixture: STORE_HIT with scoringImpact none', async function () {
    setEnv(GATE, 'true');
    const item = {
      evidenceId: 'eid-001', category: 'sec10q',
      claim: 'Revenue grew 12% YoY', direction: 'positive',
      confidence: null, sourceLabel: 'AAPL 10-Q',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
      sourceDate: '2024-08-01', sourceType: 'sec_filing',
      requiresVerification: true, scoringImpact: 'none'
    };
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      if (key === companyKey('0000320193')) { return JSON.stringify({ evidenceItems: [item] }); }
      return null;
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_HIT');
    assert.strictEqual(j.provider, 'sec_evidence_store');
    assert.strictEqual(j.cacheStatus, 'STORE_HIT');
    assert.strictEqual(j.ticker, 'AAPL');
    assert.deepStrictEqual(j.categories, ['sec10q']);
    assert.strictEqual(j.scoringImpact, 'none');
    assert.strictEqual(j.evidenceItems.length, 1);
    assert.strictEqual(j.evidenceItems[0].scoringImpact, 'none');
    assert.strictEqual(j.evidenceItems[0].confidence, null);
    assert.strictEqual(j.evidenceItems[0].requiresVerification, true);
  });

  await test('non-JSON company payload: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return 'not-json';
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('evidenceItems non-array: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return JSON.stringify({ evidenceItems: 'bad' });
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('item with bad scoringImpact: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const bad = {
      evidenceId: 'e1', category: 'sec10q', claim: 'test',
      direction: 'positive', confidence: null,
      sourceLabel: 'AAPL 10-Q',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
      sourceDate: '2024-08-01', sourceType: 'sec_filing',
      requiresVerification: true, scoringImpact: 'high'
    };
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return JSON.stringify({ evidenceItems: [bad] });
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('duplicate evidenceId: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const makeItem = function (id) {
      return {
        evidenceId: id, category: 'sec10q', claim: 'test',
        direction: 'positive', confidence: null,
        sourceLabel: 'AAPL 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
        sourceDate: '2024-08-01', sourceType: 'sec_filing',
        requiresVerification: true, scoringImpact: 'none'
      };
    };
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return JSON.stringify({ evidenceItems: [makeItem('dup'), makeItem('dup')] });
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('>50 evidenceItems: STORE_INVALID', async function () {
    setEnv(GATE, 'true');
    const items = [];
    for (let i = 0; i < 51; i += 1) {
      items.push({
        evidenceId: 'e' + i, category: 'sec10q', claim: 'test',
        direction: 'positive', confidence: null,
        sourceLabel: 'AAPL 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
        sourceDate: '2024-08-01', sourceType: 'sec_filing',
        requiresVerification: true, scoringImpact: 'none'
      });
    }
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return JSON.stringify({ evidenceItems: items });
    }};
    const r = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_INVALID');
  });

  await test('same POST twice: byte-identical body', async function () {
    setEnv(GATE, 'true');
    const item = {
      evidenceId: 'e1', category: 'sec10q', claim: 'test',
      direction: 'positive', confidence: null,
      sourceLabel: 'AAPL 10-Q',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
      sourceDate: '2024-08-01', sourceType: 'sec_filing',
      requiresVerification: true, scoringImpact: 'none'
    };
    const store = { get: async function (key) {
      if (key === cikKey('AAPL')) { return JSON.stringify({ cik: '0000320193' }); }
      return JSON.stringify({ evidenceItems: [item] });
    }};
    const r1 = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    const r2 = await invoke('POST', { ticker: 'AAPL', categories: ['sec10q'] }, store);
    assert.strictEqual(r1.body, r2.body);
  });

  await test('static: no fetch in sec-evidence-store.js', async function () {
    const src = fs.readFileSync(
      path.join(ROOT, 'netlify/functions/sec-evidence-store.js'), 'utf8'
    );
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in sec-evidence-store.js');
  });

  await test('static: no fetch in lib/evidence-store.js', async function () {
    const src = fs.readFileSync(
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8'
    );
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in lib/evidence-store.js');
  });

  await test('static: no Blob writes in lib/evidence-store.js', async function () {
    const src = fs.readFileSync(
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8'
    );
    assert.ok(!/\b(?:set|setJSON|delete|deleteJSON)\s*\(/.test(src), 'Blob write found');
  });

  await test('static: no Blob writes in sec-evidence-store.js', async function () {
    const src = fs.readFileSync(
      path.join(ROOT, 'netlify/functions/sec-evidence-store.js'), 'utf8'
    );
    assert.ok(!/\b(?:set|setJSON|delete|deleteJSON)\s*\(/.test(src), 'Blob write found');
  });

  await test('static: no evidence-provider in store files', async function () {
    const files = [
      path.join(ROOT, 'netlify/functions/sec-evidence-store.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!/evidence-provider/.test(src),
        'evidence-provider found in ' + path.basename(f));
    }
  });

  await test('static: no pt_ refs in store files', async function () {
    const files = [
      path.join(ROOT, 'netlify/functions/sec-evidence-store.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!/\bpt_/.test(src), 'pt_ ref found in ' + path.basename(f));
    }
  });

  await test('static: no scoring/scan refs in store files', async function () {
    const re = /\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|runScan|scanResults|_techCache)\b/;
    const files = [
      path.join(ROOT, 'netlify/functions/sec-evidence-store.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!re.test(src), 'scoring/scan ref found in ' + path.basename(f));
    }
  });

  setEnv(GATE, undefined);
  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  console.log('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  console.error('FATAL', err);
  process.exit(1);
});
