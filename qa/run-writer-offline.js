'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { handler } = require('../netlify/functions/lib/sec-evidence-store-writer-core');
const { cikKey, companyKey, budgetKey } = require('../netlify/functions/lib/evidence-store');
const {
  buildCanonicalCompanyJSON,
  buildCanonicalMappingJSON
} = require('../netlify/functions/lib/evidence-writer');

const ROOT = path.resolve(__dirname, '..');
const WRITE_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const TOKEN_ENV  = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const TEST_TOKEN = 'test-write-token-x7k9z3mq';
const TICKER = 'AAPL';
const CIK    = '0000320193';

// ── env helpers ──────────────────────────────────────────────────────────────
function setEnv(name, value) {
  if (value === undefined) { delete process.env[name]; }
  else { process.env[name] = value; }
}
function enableGate() { setEnv(WRITE_GATE, 'true'); setEnv(TOKEN_ENV, TEST_TOKEN); }
function disableGate() { setEnv(WRITE_GATE, undefined); setEnv(TOKEN_ENV, undefined); }

// ── invoke helper ─────────────────────────────────────────────────────────────
function invoke(method, body, store, headers) {
  const event = { httpMethod: method, headers: headers || {} };
  if (body !== undefined) {
    event.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if (store) { event._testStore = store; }
  return handler(event);
}
function authHdr() { return { authorization: 'Bearer ' + TEST_TOKEN }; }

// ── canonical projected item ──────────────────────────────────────────────────
// Must mirror what validateWritePayload produces from VALID_ITEM
const PROJECTED_ITEM = {
  evidenceId: 'eid-001',
  category: 'sec10q',
  claim: 'Revenue grew 12% YoY',
  direction: 'positive',
  confidence: null,
  sourceLabel: null,
  sourceUrl: null,
  sourceDate: null,
  sourceType: null,
  requiresVerification: true,
  scoringImpact: 'none'
};
const VALID_ITEM = {
  evidenceId: 'eid-001',
  category: 'sec10q',
  claim: 'Revenue grew 12% YoY',
  direction: 'positive',
  confidence: null,
  requiresVerification: true,
  scoringImpact: 'none'
};
const VALID_BODY = { ticker: TICKER, cik: CIK, evidenceItems: [VALID_ITEM] };
const CANONICAL_COMPANY = buildCanonicalCompanyJSON([PROJECTED_ITEM]);
const CANONICAL_MAPPING = buildCanonicalMappingJSON(CIK);

// ── store factories ───────────────────────────────────────────────────────────

// All gets → MISSING, all sets → modified:true
function cleanStore() {
  return {
    get: async function() { return null; },
    set: async function() { return { modified: true }; }
  };
}

// Specific get key throws; others return null
function degradedGetStore(throwKey) {
  return {
    get: async function(key) {
      if (key === throwKey) throw new Error('infra');
      return null;
    },
    set: async function() { return { modified: true }; }
  };
}

// Pre-reads (1st call per key) return null; writes are configurable;
// Step 13b re-reads (2nd call per key) return provided values.
function step13bStore(opts) {
  const counts = {};
  return {
    get: async function(key) {
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] === 1) return null; // all pre-reads MISSING
      if (key === cikKey(TICKER))   return opts.mappingGet;
      if (key === companyKey(CIK))  return opts.companyGet;
      return null;
    },
    set: async function(key) {
      if (key === companyKey(CIK)) {
        return opts.companySet !== undefined ? opts.companySet : { modified: true };
      }
      if (key === cikKey(TICKER)) {
        return opts.mappingSet !== undefined ? opts.mappingSet : { modified: false };
      }
      return { modified: true };
    }
  };
}

// Step 10/11 pre-read store: returns specified values for the first get of each key
function preReadStore(opts) {
  const counts = {};
  return {
    get: async function(key) {
      counts[key] = (counts[key] || 0) + 1;
      if (key === cikKey(TICKER)) {
        if (typeof opts.mapping === 'function') return opts.mapping(counts[key]);
        return opts.mapping;
      }
      if (key === companyKey(CIK)) {
        if (typeof opts.company === 'function') return opts.company(counts[key]);
        return opts.company;
      }
      return null;
    },
    set: async function() { return { modified: true }; }
  };
}

// ── test runner ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    process.stdout.write('  PASS  ' + label + '\n');
    passed += 1;
  } catch (err) {
    process.stdout.write('  FAIL  ' + label + '\n');
    process.stdout.write('         ' + err.message + '\n');
    failed += 1;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function runTests() {
  process.stdout.write('\n=== EG-20C Slice 2 Writer Offline Tests ===\n\n');

  // ── Section 1: Gate and OPTIONS ──────────────────────────────────────────
  disableGate();

  await test('W01: OPTIONS before gate → 204', async function () {
    const r = await handler({ httpMethod: 'OPTIONS' });
    assert.strictEqual(r.statusCode, 204);
  });

  await test('W02: gate off (undefined) → 200 DISABLED', async function () {
    enableGate(); setEnv(WRITE_GATE, undefined);
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DISABLED');
    assert.strictEqual(j.reason, 'SERVER_DISABLED');
  });

  await test('W03: gate value "false" → 200 DISABLED', async function () {
    setEnv(WRITE_GATE, 'false');
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'DISABLED');
  });

  await test('W04: gate truthy "1" (not strict "true") → 200 DISABLED', async function () {
    setEnv(WRITE_GATE, '1');
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'DISABLED');
  });

  enableGate();

  await test('W05: GET with gate on → 405 METHOD_NOT_ALLOWED', async function () {
    const r = await invoke('GET', undefined, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 405);
    assert.strictEqual(j.status, 'METHOD_NOT_ALLOWED');
  });

  await test('W06: PUT with gate on → 405', async function () {
    const r = await invoke('PUT', VALID_BODY, cleanStore(), authHdr());
    assert.strictEqual(r.statusCode, 405);
  });

  // ── Section 2: Token checks ───────────────────────────────────────────────
  await test('W10: no token env → 401 UNAUTHORIZED', async function () {
    setEnv(TOKEN_ENV, undefined);
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 401);
    assert.strictEqual(j.status, 'UNAUTHORIZED');
    assert.strictEqual(j.reason, 'UNAUTHORIZED');
    setEnv(TOKEN_ENV, TEST_TOKEN);
  });

  await test('W11: empty token env → 401', async function () {
    setEnv(TOKEN_ENV, '');
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    assert.strictEqual(r.statusCode, 401);
    setEnv(TOKEN_ENV, TEST_TOKEN);
  });

  await test('W12: no auth header → 401', async function () {
    const r = await invoke('POST', VALID_BODY, cleanStore(), {});
    assert.strictEqual(r.statusCode, 401);
  });

  await test('W13: wrong token → 401', async function () {
    const r = await invoke('POST', VALID_BODY, cleanStore(), { authorization: 'Bearer wrong' });
    assert.strictEqual(r.statusCode, 401);
  });

  await test('W14: gate off does not touch store', async function () {
    setEnv(WRITE_GATE, undefined);
    let storeHit = false;
    const spy = { get: async function () { storeHit = true; return null; } };
    await invoke('POST', VALID_BODY, spy, authHdr());
    assert.strictEqual(storeHit, false);
    setEnv(WRITE_GATE, 'true');
  });

  // ── Section 3: Body parse ─────────────────────────────────────────────────
  await test('W20: no body → 400 INVALID_JSON', async function () {
    const r = await invoke('POST', undefined, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(j.status, 'INVALID_JSON');
  });

  await test('W21: empty body → 400 INVALID_JSON', async function () {
    const event = { httpMethod: 'POST', headers: authHdr(), body: '', _testStore: cleanStore() };
    const r = await handler(event);
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_JSON');
  });

  await test('W22: non-JSON string → 400 INVALID_JSON', async function () {
    const r = await invoke('POST', 'not-json', cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_JSON');
  });

  await test('W23: JSON null → 400 INVALID_JSON', async function () {
    const r = await invoke('POST', 'null', cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_JSON');
  });

  await test('W24: JSON array → 400 INVALID_JSON', async function () {
    const r = await invoke('POST', '[]', cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_JSON');
  });

  // ── Section 4: Ticker validation ──────────────────────────────────────────
  await test('W30: missing ticker → INVALID_TICKER', async function () {
    const r = await invoke('POST', { cik: CIK, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'INVALID_TICKER');
    assert.strictEqual(j.reason, 'INVALID_TICKER');
  });

  await test('W31: numeric ticker "123" → INVALID_TICKER', async function () {
    const r = await invoke('POST', { ticker: '123', cik: CIK, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_TICKER');
  });

  await test('W32: lowercase "aapl" → INVALID_TICKER (strict, no normalisation)', async function () {
    const r = await invoke('POST', { ticker: 'aapl', cik: CIK, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_TICKER');
  });

  await test('W33: 11-char ticker → INVALID_TICKER', async function () {
    const r = await invoke('POST', { ticker: 'ABCDEFGHIJK', cik: CIK, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_TICKER');
  });

  await test('W34: ticker with leading space → INVALID_TICKER (no trim)', async function () {
    const r = await invoke('POST', { ticker: ' AAPL', cik: CIK, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_TICKER');
  });

  // ── Section 5: CIK validation ─────────────────────────────────────────────
  await test('W40: missing cik → INVALID_CIK', async function () {
    const r = await invoke('POST', { ticker: TICKER, evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'INVALID_CIK');
    assert.strictEqual(j.reason, 'INVALID_CIK');
  });

  await test('W41: 9-digit cik → INVALID_CIK', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: '000032019', evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_CIK');
  });

  await test('W42: alpha cik → INVALID_CIK', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: 'ABCDEFGHIJ', evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_CIK');
  });

  await test('W43: cik with leading space → INVALID_CIK (no trim)', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: ' 0000320193', evidenceItems: [VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_CIK');
  });

  // ── Section 6: Evidence items validation ─────────────────────────────────
  await test('W50: missing evidenceItems → INVALID_EVIDENCE_ITEMS', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: CIK }, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'INVALID_EVIDENCE_ITEMS');
    assert.strictEqual(j.reason, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W51: non-array evidenceItems → INVALID_EVIDENCE_ITEMS', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: 'bad' }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W52: empty array → INVALID_EVIDENCE_ITEMS', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W53: 51 items → INVALID_EVIDENCE_ITEMS', async function () {
    const items = [];
    for (let i = 0; i < 51; i++) { items.push(Object.assign({}, VALID_ITEM, { evidenceId: 'eid-' + i })); }
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: items }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W54: 50 items → valid (reaches store)', async function () {
    const items = [];
    for (let i = 0; i < 50; i++) { items.push(Object.assign({}, VALID_ITEM, { evidenceId: 'eid-' + i })); }
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: items }, cleanStore(), authHdr());
    assert.notStrictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W55: item missing evidenceId → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = { category: 'sec10q', claim: 'test', direction: 'positive', confidence: null, requiresVerification: true, scoringImpact: 'none' };
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W56: duplicate evidenceId → INVALID_EVIDENCE_ITEMS', async function () {
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [VALID_ITEM, VALID_ITEM] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W57: unknown category "earnings" → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { category: 'earnings' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W58: bad direction → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-002', direction: 'bullish' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W59: confidence:0 (not null) → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-003', confidence: 0 });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W60: requiresVerification:false → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-004', requiresVerification: false });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W61: scoringImpact:"high" → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-005', scoringImpact: 'high' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W62: valid source fields → proceeds past validation', async function () {
    const withSrc = Object.assign({}, VALID_ITEM, {
      evidenceId: 'eid-src',
      sourceLabel: 'AAPL 10-Q',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
      sourceDate: '2024-08-01',
      sourceType: 'sec_filing'
    });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [withSrc] }, cleanStore(), authHdr());
    assert.notStrictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W63: http sourceUrl → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-url', sourceUrl: 'http://insecure.com' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W64: bad sourceDate → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-date', sourceDate: 'notadate' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  await test('W65: bad sourceType → INVALID_EVIDENCE_ITEMS', async function () {
    const bad = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-stype', sourceType: 'unknown_type' });
    const r = await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [bad] }, cleanStore(), authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'INVALID_EVIDENCE_ITEMS');
  });

  // ── Section 7: Step 10 — mapping pre-read ────────────────────────────────
  await test('W70: Step10 DEGRADED → 200 DEGRADED/STRONG_PRE_READ_FAILURE (MAPPING_PRE_READ)', async function () {
    const store = degradedGetStore(cikKey(TICKER));
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STRONG_PRE_READ_FAILURE');
    assert.strictEqual(j.stage, 'MAPPING_PRE_READ');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'Error');
  });

  await test('W71: Step10 INVALID → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const store = preReadStore({ mapping: 'not-json', company: null });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W72: Step10 OK but cik missing → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const store = preReadStore({ mapping: JSON.stringify({ noCikField: true }), company: null });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W73: Step10 OK but cik not 10-digit → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const store = preReadStore({ mapping: JSON.stringify({ cik: '12345' }), company: null });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W74: Step10 OK with different storedCik → 409 CONFLICT/CIK_MISMATCH', async function () {
    const store = preReadStore({ mapping: JSON.stringify({ cik: '9999999999' }), company: null });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'CIK_MISMATCH');
    assert.strictEqual(j.storedCik, '9999999999');
    assert.strictEqual(j.inboundCik, CIK);
  });

  // ── Section 8: Step 11 — company pre-read ───────────────────────────────
  await test('W75: Step11 DEGRADED → 200 DEGRADED/STRONG_PRE_READ_FAILURE (COMPANY_PRE_READ)', async function () {
    const store = {
      get: async function (key) {
        if (key === cikKey(TICKER)) return null;   // Step10 MISSING
        throw new Error('infra');                   // Step11 DEGRADED
      },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STRONG_PRE_READ_FAILURE');
    assert.strictEqual(j.stage, 'COMPANY_PRE_READ');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'Error');
  });

  await test('W76: Step11 INVALID → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const store = preReadStore({ mapping: null, company: 'not-json' });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  // ── Section 9: Step 10/11 decision table ────────────────────────────────
  await test('W77: MISSING+OK → 409 CONFLICT/COMPANY_CONFLICT', async function () {
    const store = preReadStore({ mapping: null, company: CANONICAL_COMPANY });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'COMPANY_CONFLICT');
  });

  await test('W78: SAME_CIK+MISSING → 409 CONFLICT/ORPHAN_STATE', async function () {
    const store = preReadStore({ mapping: CANONICAL_MAPPING, company: null });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'ORPHAN_STATE');
  });

  await test('W79: SAME_CIK+OK company schema invalid (no evidenceItems) → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const store = preReadStore({ mapping: CANONICAL_MAPPING, company: JSON.stringify({ noEvidenceItems: true }) });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W80: SAME_CIK+OK+IDENTICAL → 200 STORE_WRITE_NOOP with ticker/cik/count', async function () {
    const store = preReadStore({ mapping: CANONICAL_MAPPING, company: CANONICAL_COMPANY });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_WRITE_NOOP');
    assert.strictEqual(j.ticker, TICKER);
    assert.strictEqual(j.cik, CIK);
    assert.strictEqual(j.evidenceItemCount, 1);
  });

  await test('W81: SAME_CIK+OK+NOT_IDENTICAL → 409 CONFLICT/MAPPING_VERIFY_CONFLICT', async function () {
    const differentCompany = buildCanonicalCompanyJSON([Object.assign({}, PROJECTED_ITEM, { claim: 'DIFFERENT CLAIM' })]);
    const store = preReadStore({ mapping: CANONICAL_MAPPING, company: differentCompany });
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_CONFLICT');
  });

  // ── Section 10: Step 12 ───────────────────────────────────────────────────
  await test('W82: Step12 modified:true + Step13 modified:true → 200 STORE_WRITE', async function () {
    const r = await invoke('POST', VALID_BODY, cleanStore(), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_WRITE');
    assert.strictEqual(j.ticker, TICKER);
    assert.strictEqual(j.cik, CIK);
    assert.strictEqual(j.evidenceItemCount, 1);
  });

  await test('W83: Step12 modified:false → 409 CONFLICT/CONCURRENT_CREATE', async function () {
    const store = {
      get: async function () { return null; },
      set: async function () { return { modified: false }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.status, 'CONFLICT');
    assert.strictEqual(j.reason, 'CONCURRENT_CREATE');
  });

  await test('W84: Step12 throws → 200 DEGRADED/COMPANY_WRITE_FAILURE', async function () {
    const store = {
      get: async function () { return null; },
      set: async function (key) {
        if (key === companyKey(CIK)) throw new Error('company fail');
        return { modified: true };
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'COMPANY_WRITE_FAILURE');
  });

  await test('W85: Step12 returns malformed object → 200 DEGRADED/COMPANY_WRITE_FAILURE', async function () {
    const store = {
      get: async function () { return null; },
      set: async function (key) {
        if (key === companyKey(CIK)) return {};
        return { modified: true };
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'COMPANY_WRITE_FAILURE');
  });

  // ── Section 11: Step 13 ───────────────────────────────────────────────────
  await test('W86: Step13 throws → 200 DEGRADED/MAPPING_WRITE_FAILURE', async function () {
    const store = {
      get: async function () { return null; },
      set: async function (key) {
        if (key === companyKey(CIK)) return { modified: true };
        throw new Error('mapping fail');
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'MAPPING_WRITE_FAILURE');
  });

  await test('W87: Step13 returns malformed object → 200 DEGRADED/MAPPING_WRITE_FAILURE', async function () {
    const store = {
      get: async function () { return null; },
      set: async function (key) {
        if (key === companyKey(CIK)) return { modified: true };
        return {};
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'MAPPING_WRITE_FAILURE');
  });

  // ── Section 12: Step 13b ──────────────────────────────────────────────────
  await test('W90: Step13b mapping INVALID → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: 'not-json', companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W91: Step13b mapping MISSING → 200 DEGRADED/MAPPING_VERIFY_FAILURE', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: null, companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_FAILURE');
  });

  await test('W92: Step13b mapping DEGRADED → 200 DEGRADED/MAPPING_VERIFY_FAILURE', async function () {
    const counts = {};
    const store = {
      get: async function (key) {
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] === 1) return null;
        if (key === cikKey(TICKER)) throw new Error('infra');
        return null;
      },
      set: async function (key) {
        if (key === companyKey(CIK)) return { modified: true };
        return { modified: false };
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_FAILURE');
  });

  await test('W93: Step13b mapping OK bad cik schema → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: JSON.stringify({ cik: 'BADCIK' }), companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W94: Step13b storedCik !== inboundCik → 409 CONFLICT/MAPPING_CONCURRENT_CREATE with storedCik/inboundCik', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: JSON.stringify({ cik: '9999999999' }), companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'MAPPING_CONCURRENT_CREATE');
    assert.strictEqual(j.storedCik, '9999999999');
    assert.strictEqual(j.inboundCik, CIK);
  });

  await test('W95: Step13b company DEGRADED → 200 DEGRADED/MAPPING_VERIFY_FAILURE', async function () {
    const counts = {};
    const store = {
      get: async function (key) {
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] === 1) return null;
        if (key === cikKey(TICKER))  return CANONICAL_MAPPING;
        if (key === companyKey(CIK)) throw new Error('infra');
        return null;
      },
      set: async function (key) {
        if (key === companyKey(CIK)) return { modified: true };
        return { modified: false };
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_FAILURE');
  });

  await test('W96: Step13b company MISSING → 409 CONFLICT/MAPPING_VERIFY_CONFLICT', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: CANONICAL_MAPPING, companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_CONFLICT');
  });

  await test('W97: Step13b company INVALID → 409 CONFLICT/MAPPING_VERIFY_CONFLICT', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: CANONICAL_MAPPING, companyGet: 'not-json' }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_CONFLICT');
  });

  await test('W98: Step13b company OK bad schema (no evidenceItems) → 409 CONFLICT/STORE_INVALID_CONFLICT', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: CANONICAL_MAPPING, companyGet: JSON.stringify({ noField: true }) }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'STORE_INVALID_CONFLICT');
  });

  await test('W99: Step13b company OK not IDENTICAL → 409 CONFLICT/MAPPING_VERIFY_CONFLICT', async function () {
    const different = buildCanonicalCompanyJSON([Object.assign({}, PROJECTED_ITEM, { claim: 'DIFFERENT' })]);
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: CANONICAL_MAPPING, companyGet: different }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_CONFLICT');
  });

  await test('W100: Step13b company IDENTICAL → 200 STORE_WRITE_PARTIAL_VERIFIED', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: CANONICAL_MAPPING, companyGet: CANONICAL_COMPANY }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'STORE_WRITE_PARTIAL_VERIFIED');
    assert.strictEqual(j.ticker, TICKER);
    assert.strictEqual(j.cik, CIK);
    assert.strictEqual(j.evidenceItemCount, 1);
  });

  // ── Section 13: Canonical JSON shape ────────────────────────────────────
  await test('W101: company JSON has only evidenceItems (no top-level cik)', async function () {
    let written;
    const store = {
      get: async function () { return null; },
      set: async function (key, value) { if (key === companyKey(CIK)) written = value; return { modified: true }; }
    };
    await invoke('POST', VALID_BODY, store, authHdr());
    const parsed = JSON.parse(written);
    assert.ok('evidenceItems' in parsed, 'missing evidenceItems');
    assert.ok(!('cik' in parsed), 'unexpected top-level cik');
    assert.strictEqual(Object.keys(parsed).length, 1);
  });

  await test('W102: mapping JSON has only cik (no ticker)', async function () {
    let written;
    const store = {
      get: async function () { return null; },
      set: async function (key, value) {
        if (key === companyKey(CIK)) return { modified: true };
        if (key === cikKey(TICKER)) { written = value; return { modified: true }; }
        return { modified: true };
      }
    };
    await invoke('POST', VALID_BODY, store, authHdr());
    const parsed = JSON.parse(written);
    assert.ok('cik' in parsed, 'missing cik');
    assert.ok(!('ticker' in parsed), 'unexpected ticker');
    assert.strictEqual(Object.keys(parsed).length, 1);
    assert.strictEqual(parsed.cik, CIK);
  });

  await test('W103: projected items strip unknown fields', async function () {
    const withExtra = Object.assign({}, VALID_ITEM, { evidenceId: 'eid-extra', EXTRAFLD: 'bad' });
    let written;
    const store = {
      get: async function () { return null; },
      set: async function (key, value) { if (key === companyKey(CIK)) written = value; return { modified: true }; }
    };
    await invoke('POST', { ticker: TICKER, cik: CIK, evidenceItems: [withExtra] }, store, authHdr());
    const item = JSON.parse(written).evidenceItems[0];
    assert.ok(!('EXTRAFLD' in item), 'unknown field not stripped');
    assert.strictEqual(item.scoringImpact, 'none');
    assert.strictEqual(item.requiresVerification, true);
    assert.strictEqual(item.confidence, null);
    assert.strictEqual(item.sourceLabel, null);
  });

  // ── Section 14: budgetKey guard ──────────────────────────────────────────
  await test('W110: budgetKey is never written', async function () {
    const written = [];
    const store = {
      get: async function () { return null; },
      set: async function (key) { written.push(key); return { modified: true }; }
    };
    await invoke('POST', VALID_BODY, store, authHdr());
    const bk = budgetKey(TICKER);
    assert.ok(!written.includes(bk), 'budgetKey was written: ' + bk);
  });

  // ── Section 15: Static source checks ────────────────────────────────────
  await test('W120: no fetch() in writer core', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in writer');
  });

  await test('W121: no fetch() in lib/evidence-writer.js', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-writer.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in evidence-writer.js');
  });

  await test('W122: no pt_ refs in writer files', async function () {
    const files = [
      path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-writer.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!/\bpt_/.test(src), 'pt_ ref in ' + path.basename(f));
    }
  });

  await test('W123: no scoring/scan refs in writer files', async function () {
    const re = /\b(orchestrate|analyzeChunk|enforceScoreConsistency|runScan|scanResults|_techCache)\b/;
    const files = [
      path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-writer.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!re.test(src), 'scoring/scan ref in ' + path.basename(f));
    }
  });

  await test('W124: gate check uses !== "true" (strict string equality)', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8');
    assert.ok(
      /PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER\s*!==\s*['"]true['"]/.test(src),
      'gate strict check not found'
    );
  });

  await test('W125: acquireStore checks _testStore before @netlify/blobs', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8');
    const ti = src.indexOf('_testStore');
    const bi = src.indexOf('@netlify/blobs');
    assert.ok(ti !== -1, '_testStore not found');
    assert.ok(bi !== -1, '@netlify/blobs not found');
    assert.ok(ti < bi, '_testStore check must precede @netlify/blobs');
  });

  await test('W126: no Blob writes in evidence-store.js (Slice 1 regression)', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8');
    assert.ok(!/\bstore\.(set|setJSON|delete|deleteJSON)\s*\(/.test(src), 'Blob write in evidence-store.js');
  });

  await test('W127: no Blob writes in sec-evidence-store.js (Slice 1 regression)', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store.js'), 'utf8');
    assert.ok(!/\bstore\.(set|setJSON|delete|deleteJSON)\s*\(/.test(src), 'Blob write in sec-evidence-store.js');
  });

  await test('W128: readRecord accepts options + wantDiag params; wantDiag not forwarded to store.get', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8');
    assert.ok(/async function readRecord\(store, key, options, wantDiag\)/.test(src), 'readRecord options+wantDiag params not found');
    assert.ok(/store\.get\(key,\s*options\s*\|\|\s*\{\}\)/.test(src), 'store.get options forwarding not found');
    assert.ok(!/store\.get\([^)]*wantDiag/.test(src), 'wantDiag must not be passed into store.get');
  });

  await test('W129: writer calls readRecord with STRONG option', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8');
    assert.ok(/readRecord\(store,.*STRONG\)/.test(src), 'readRecord STRONG call not found');
    assert.ok(/consistency.*strong/.test(src), 'consistency:strong not found in writer');
  });

  // ── Section 16: EG-20C-3 strong pre-read diagnostics ────────────────────
  await test('W130: Step10 throw → full sanitized envelope, zero writes', async function () {
    const sets = [];
    const store = {
      get: async function (key) {
        if (key === cikKey(TICKER)) throw new Error('infra');
        return null;
      },
      set: async function (key) { sets.push(key); return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STRONG_PRE_READ_FAILURE');
    assert.strictEqual(j.stage, 'MAPPING_PRE_READ');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'Error');
    assert.ok(!('message' in j), 'message leaked');
    assert.ok(!('stack' in j), 'stack leaked');
    assert.strictEqual(sets.length, 0, 'write attempted after pre-read failure');
  });

  await test('W131: Step11 throw → COMPANY_PRE_READ envelope, zero writes', async function () {
    const sets = [];
    const store = {
      get: async function (key) {
        if (key === companyKey(CIK)) throw new Error('infra');
        return null;
      },
      set: async function (key) { sets.push(key); return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STRONG_PRE_READ_FAILURE');
    assert.strictEqual(j.stage, 'COMPANY_PRE_READ');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'Error');
    assert.strictEqual(sets.length, 0, 'write attempted after pre-read failure');
  });

  await test('W132: allowlisted err name/status/code pass through sanitized', async function () {
    const err = new Error('secret infra detail');
    err.name = 'BlobsInternalError';
    err.status = 502;
    err.code = 'ETIMEDOUT';
    const store = {
      get: async function () { throw err; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.errorName, 'BlobsInternalError');
    assert.strictEqual(j.httpStatus, 502);
    assert.strictEqual(j.errorCode, 'ETIMEDOUT');
    assert.ok(r.body.indexOf('secret infra detail') === -1, 'err.message leaked into body');
  });

  await test('W133: hostile err values sanitized to UnknownError, no leakage', async function () {
    const err = new Error('SECRET ' + cikKey(TICKER));
    err.name = 'free text with spaces: not an identifier';
    err.status = 9999;
    err.code = 'has spaces and: punctuation';
    const store = {
      get: async function () { throw err; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.ok(!('httpStatus' in j), 'invalid httpStatus leaked');
    assert.ok(!('errorCode' in j), 'invalid errorCode leaked');
    assert.ok(r.body.indexOf('SECRET') === -1, 'err.message leaked');
    assert.ok(r.body.indexOf('secstore:v1') === -1, 'raw Blob key namespace leaked');
    assert.ok(r.body.indexOf('free text') === -1, 'unsafe errorName leaked');
  });

  await test('W134: thrown string → UnknownError, no free text', async function () {
    const store = {
      get: async function () { throw 'string failure with details'; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.ok(r.body.indexOf('string failure') === -1, 'thrown string leaked');
  });

  await test('W135: thrown null → UnknownError', async function () {
    const store = {
      get: async function () { throw null; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STRONG_PRE_READ_FAILURE');
    assert.strictEqual(j.errorName, 'UnknownError');
  });

  await test('W136: throwing .name getter → UnknownError, valid status kept', async function () {
    const err = { get name() { throw new Error('hostile getter'); }, status: 503 };
    const store = {
      get: async function () { throw err; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.strictEqual(j.httpStatus, 503);
    assert.ok(r.body.indexOf('hostile getter') === -1, 'getter error leaked');
  });

  await test('W137: no retry — throwing pre-read get called exactly once', async function () {
    let calls = 0;
    const store = {
      get: async function () { calls += 1; throw new Error('infra'); },
      set: async function () { return { modified: true }; }
    };
    await invoke('POST', VALID_BODY, store, authHdr());
    assert.strictEqual(calls, 1, 'store.get retried after throw');
  });

  await test('W138: Step13b failure unchanged — no stage/diag fields', async function () {
    const r = await invoke('POST', VALID_BODY, step13bStore({ mappingGet: null, companyGet: null }), authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_FAILURE');
    assert.strictEqual(j.stage, undefined);
    assert.strictEqual(j.errorName, undefined);
    assert.strictEqual(j.writeAttempted, undefined);
  });

  await test('W139: gate off + bad token → zero store get/set calls', async function () {
    let touched = 0;
    const spy = {
      get: async function () { touched += 1; return null; },
      set: async function () { touched += 1; return { modified: true }; }
    };
    setEnv(WRITE_GATE, undefined);
    await invoke('POST', VALID_BODY, spy, authHdr());
    setEnv(WRITE_GATE, 'true');
    await invoke('POST', VALID_BODY, spy, { authorization: 'Bearer wrong' });
    assert.strictEqual(touched, 0, 'store touched while gated/unauthorized');
  });

  await test('W140: clean write still passes onlyIfNew:true on both sets', async function () {
    const opts = {};
    const store = {
      get: async function () { return null; },
      set: async function (key, value, o) { opts[key] = o; return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'STORE_WRITE');
    assert.deepStrictEqual(opts[companyKey(CIK)], { onlyIfNew: true });
    assert.deepStrictEqual(opts[cikKey(TICKER)], { onlyIfNew: true });
  });

  await test('W141: no console logging in writer entry, core, or evidence-store lib', async function () {
    const files = [
      path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.mjs'),
      path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-store.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!/\bconsole\s*\./.test(src), 'console usage in ' + path.basename(f));
    }
  });

  await test('W142: forbidden diagnostic sources absent from sanitizer output path', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8');
    const fnStart = src.indexOf('function sanitizeReadError');
    assert.ok(fnStart !== -1, 'sanitizeReadError not found');
    const fnEnd = src.indexOf('\n}', fnStart);
    const body = src.slice(fnStart, fnEnd);
    assert.ok(!/\.message\b/.test(body), 'sanitizer reads err.message');
    assert.ok(!/\.stack\b/.test(body), 'sanitizer reads err.stack');
    assert.ok(!/toString/.test(body), 'sanitizer calls toString');
  });

  await test('W143: identifier-shaped but unlisted name/code are NOT surfaced', async function () {
    const err = new Error('secret');
    err.name = 'MaliciousIdentifierName';
    err.code = 'ERR_FAKE_CUSTOM_CODE';
    err.status = 502;
    const store = {
      get: async function () { throw err; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.ok(!('errorCode' in j), 'unlisted errorCode surfaced');
    assert.strictEqual(j.httpStatus, 502);
    assert.ok(r.body.indexOf('MaliciousIdentifierName') === -1, 'unlisted errorName leaked');
    assert.ok(r.body.indexOf('ERR_FAKE_CUSTOM_CODE') === -1, 'unlisted errorCode leaked');
  });

  await test('W144: clean write — Steps 10+11 read strong-only, no default-consistency read', async function () {
    const reads = [];
    const store = {
      get: async function (key, options) { reads.push({ key, options }); return null; },
      set: async function () { return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    assert.strictEqual(JSON.parse(r.body).status, 'STORE_WRITE');
    assert.strictEqual(reads.length, 2, 'expected exactly 2 pre-reads');
    assert.strictEqual(reads[0].key, cikKey(TICKER), 'Step 10 must read mapping key first');
    assert.deepStrictEqual(reads[0].options, { consistency: 'strong' }, 'Step 10 not strong');
    assert.strictEqual(reads[1].key, companyKey(CIK), 'Step 11 must read company key second');
    assert.deepStrictEqual(reads[1].options, { consistency: 'strong' }, 'Step 11 not strong');
    for (const rd of reads) {
      assert.deepStrictEqual(rd.options, { consistency: 'strong' }, 'default-consistency read detected');
    }
  });

  await test('W145: Step 10 failure — strong read, exactly once, zero writes', async function () {
    const reads = [];
    const sets = [];
    const store = {
      get: async function (key, options) { reads.push({ key, options }); throw new Error('infra'); },
      set: async function (key) { sets.push(key); return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    assert.strictEqual(JSON.parse(r.body).stage, 'MAPPING_PRE_READ');
    assert.strictEqual(reads.length, 1, 'failing pre-read must be read exactly once (no retry)');
    assert.strictEqual(reads[0].key, cikKey(TICKER));
    assert.deepStrictEqual(reads[0].options, { consistency: 'strong' }, 'Step 10 not strong');
    assert.strictEqual(sets.length, 0, 'failure must perform zero writes');
  });

  await test('W146: Step 11 failure — both reads strong, once each, zero writes', async function () {
    const reads = [];
    const sets = [];
    const store = {
      get: async function (key, options) {
        reads.push({ key, options });
        if (key === companyKey(CIK)) throw new Error('infra');
        return null;
      },
      set: async function (key) { sets.push(key); return { modified: true }; }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    assert.strictEqual(JSON.parse(r.body).stage, 'COMPANY_PRE_READ');
    assert.strictEqual(reads.length, 2, 'expected exactly 2 reads (no retry)');
    assert.strictEqual(reads.filter(function (x) { return x.key === cikKey(TICKER); }).length, 1);
    assert.strictEqual(reads.filter(function (x) { return x.key === companyKey(CIK); }).length, 1);
    for (const rd of reads) {
      assert.deepStrictEqual(rd.options, { consistency: 'strong' }, 'non-strong read detected');
    }
    assert.strictEqual(sets.length, 0, 'failure must perform zero writes');
  });

  await test('W147: Step 13b path — all reads strong, historical response unchanged', async function () {
    const reads = [];
    const counts = {};
    const store = {
      get: async function (key, options) {
        reads.push({ key, options });
        counts[key] = (counts[key] || 0) + 1;
        return null; // pre-reads MISSING; 13b mapping re-read MISSING
      },
      set: async function (key) {
        if (key === companyKey(CIK)) return { modified: true };
        return { modified: false }; // mapping set unmodified → Step 13b
      }
    };
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(j.reason, 'MAPPING_VERIFY_FAILURE', 'Step 13b behavior changed');
    assert.strictEqual(j.stage, undefined, 'Step 13b must not carry stage');
    assert.strictEqual(j.errorName, undefined, 'Step 13b must not carry diag');
    for (const rd of reads) {
      assert.deepStrictEqual(rd.options, { consistency: 'strong' }, 'non-strong read in writer');
    }
    assert.strictEqual(reads.length, 3, 'expected 2 pre-reads + 1 Step 13b mapping re-read');
  });

  // ── Section 17: EG-20C-6B modern-runtime store acquisition ────────────────
  await test('W148: core store acquisition is ambient-only — getStore(STORE_NAME), no manual wiring', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8');
    assert.ok(!/connectLambda/.test(src), 'connectLambda found in core');
    assert.ok(!/NETLIFY_BLOBS_CONTEXT/.test(src), 'NETLIFY_BLOBS_CONTEXT found in core');
    assert.ok(!/siteID/.test(src), 'siteID found in core');
    assert.ok(!/apiURL/.test(src), 'apiURL found in core');
    assert.ok(!/edgeURL/i.test(src), 'edgeURL config found in core');
    assert.ok(!/getStore\(\s*\{/.test(src), 'getStore must not receive a config object');
    const fnStart = src.indexOf('function acquireStore');
    assert.ok(fnStart !== -1, 'acquireStore not found');
    const body = src.slice(fnStart, src.indexOf('\n}', fnStart));
    const iTest = body.indexOf('_testStore');
    const iGet = body.indexOf('return getStore(STORE_NAME);');
    assert.ok(iTest !== -1 && iGet !== -1, 'acquireStore pieces missing');
    assert.ok(iTest < iGet, '_testStore short-circuit must come first');
  });

  await test('W149: modern entry — withLambda around core, stable route, no config export, no legacy duplicate', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.mjs'), 'utf8');
    assert.ok(/@netlify\/aws-lambda-compat/.test(src), 'compat import missing');
    assert.ok(/\.\/lib\/sec-evidence-store-writer-core\.js/.test(src), 'core import missing');
    assert.ok(/export default withLambda\(/.test(src), 'export default withLambda missing');
    assert.ok(!/export const config/.test(src), 'config export would change routing');
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js')),
      'legacy .js entry still present — duplicate endpoint risk'
    );
  });

  // Wrapper-chain tests: the real compat wrapper around the real core handler,
  // invoked with real Request objects (Node >= 20 fetch globals). Store-free
  // stages only — store-dependent stages stay covered via _testStore above.
  const { withLambda } = require('@netlify/aws-lambda-compat');
  const wrapped = withLambda(handler);
  const ROUTE = 'https://qa.local/.netlify/functions/sec-evidence-store-writer';
  function jsonPost(body, extraHeaders) {
    return new Request(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body
    });
  }

  await test('W150: wrapper OPTIONS → 204, empty body, CORS preserved', async function () {
    const resp = await wrapped(new Request(ROUTE, { method: 'OPTIONS' }), {});
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(await resp.text(), '');
    assert.strictEqual(resp.headers.get('access-control-allow-origin'), '*');
    assert.strictEqual(resp.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  });

  await test('W151: wrapper gate-off POST → 200 DISABLED/SERVER_DISABLED', async function () {
    disableGate();
    const resp = await wrapped(jsonPost(JSON.stringify(VALID_BODY)), {});
    assert.strictEqual(resp.status, 200);
    const j = await resp.json();
    assert.strictEqual(j.status, 'DISABLED');
    assert.strictEqual(j.reason, 'SERVER_DISABLED');
  });

  await test('W152: wrapper gate-on GET → 405 METHOD_NOT_ALLOWED', async function () {
    enableGate();
    const resp = await wrapped(new Request(ROUTE, { method: 'GET' }), {});
    assert.strictEqual(resp.status, 405);
    assert.strictEqual((await resp.json()).reason, 'METHOD_NOT_ALLOWED');
  });

  await test('W153: wrapper gate-on POST without token → 401 UNAUTHORIZED', async function () {
    enableGate();
    const resp = await wrapped(jsonPost(JSON.stringify(VALID_BODY)), {});
    assert.strictEqual(resp.status, 401);
    assert.strictEqual((await resp.json()).reason, 'UNAUTHORIZED');
  });

  await test('W154: wrapper lowercases Authorization header — token accepted, body stage reached', async function () {
    enableGate();
    const resp = await wrapped(jsonPost('not-json', { Authorization: 'Bearer ' + TEST_TOKEN }), {});
    assert.strictEqual(resp.status, 400);
    assert.strictEqual((await resp.json()).reason, 'INVALID_JSON');
  });

  await test('W155: wrapper valid write offline → DEGRADED/STORE_UNAVAILABLE sanitized envelope (ambient-only, fail-closed)', async function () {
    enableGate();
    setEnv('NETLIFY_BLOBS_CONTEXT', undefined);
    const resp = await wrapped(jsonPost(JSON.stringify(VALID_BODY), { Authorization: 'Bearer ' + TEST_TOKEN }), {});
    assert.strictEqual(resp.status, 200);
    const j = await resp.json();
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STORE_UNAVAILABLE');
    assert.strictEqual(j.stage, 'STORE_ACQUISITION');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'MissingBlobsEnvironmentError');
    assert.deepStrictEqual(
      Object.keys(j).sort(),
      ['errorName', 'reason', 'stage', 'status', 'writeAttempted']
    );
  });

  // ── Section 18: EG-20C-6C acquisition diagnostics ─────────────────────────
  // Core-level events whose _testStore getter throws: the property read happens
  // inside the handler's acquisition try, so arbitrary error shapes reach the
  // STORE_UNAVAILABLE catch without acquireStore itself being modified.
  function acquisitionThrowEvent(errValue) {
    const event = {
      httpMethod: 'POST',
      headers: authHdr(),
      body: JSON.stringify(VALID_BODY)
    };
    Object.defineProperty(event, '_testStore', { get() { throw errValue; } });
    return event;
  }
  const ACQ_ENVELOPE_KEYS = ['errorName', 'reason', 'stage', 'status', 'writeAttempted'];

  await test('W156: unlisted acquisition error name → UnknownError, nothing else surfaced', async function () {
    enableGate();
    const r = await handler(acquisitionThrowEvent({ name: 'TotallyNovelBlobsError', code: 'ERR_FAKE_CUSTOM_CODE', status: 999 }));
    assert.strictEqual(r.statusCode, 200);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STORE_UNAVAILABLE');
    assert.strictEqual(j.stage, 'STORE_ACQUISITION');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.deepStrictEqual(Object.keys(j).sort(), ACQ_ENVELOPE_KEYS);
  });

  await test('W157: BlobsConsistencyError-shaped acquisition error surfaces via shared vocabulary', async function () {
    enableGate();
    const err = new Error('SECRET-ACQ-MESSAGE-DO-NOT-LEAK');
    err.name = 'BlobsConsistencyError';
    const r = await handler(acquisitionThrowEvent(err));
    assert.strictEqual(r.statusCode, 200);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STORE_UNAVAILABLE');
    assert.strictEqual(j.stage, 'STORE_ACQUISITION');
    assert.strictEqual(j.writeAttempted, false);
    assert.strictEqual(j.errorName, 'BlobsConsistencyError');
    assert.ok(r.body.indexOf('SECRET-ACQ-MESSAGE-DO-NOT-LEAK') === -1, 'error message leaked into envelope');
    assert.deepStrictEqual(Object.keys(j).sort(), ACQ_ENVELOPE_KEYS);
  });

  await test('W158: hostile getters at acquisition → UnknownError only, no leakage', async function () {
    enableGate();
    const hostile = {};
    Object.defineProperty(hostile, 'name',   { get() { throw new Error('boom-name'); } });
    Object.defineProperty(hostile, 'status', { get() { throw new Error('boom-status'); } });
    Object.defineProperty(hostile, 'code',   { get() { throw new Error('boom-code'); } });
    const r = await handler(acquisitionThrowEvent(hostile));
    assert.strictEqual(r.statusCode, 200);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'STORE_UNAVAILABLE');
    assert.strictEqual(j.errorName, 'UnknownError');
    assert.ok(r.body.indexOf('boom-') === -1, 'hostile getter text leaked into envelope');
    assert.deepStrictEqual(Object.keys(j).sort(), ACQ_ENVELOPE_KEYS);
  });

  await test('W159: acquisition failure returns before any store use; acquireStore byte-identical', async function () {
    // Behavioral proof: W155-W158 all returned STORE_UNAVAILABLE (never
    // STRONG_PRE_READ_FAILURE), so the catch returned before Step 10 and no
    // store handle ever existed. Structural proof below.
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/sec-evidence-store-writer-core.js'), 'utf8').replace(/\r\n/g, '\n');
    const iUnavail = src.indexOf("reason: 'STORE_UNAVAILABLE'");
    const iStep10 = src.indexOf('const step10');
    assert.ok(iUnavail !== -1 && iStep10 !== -1 && iUnavail < iStep10, 'STORE_UNAVAILABLE return must precede Step 10');
    const iCatch = src.indexOf('} catch (err) {', src.indexOf('acquireStore(event)'));
    assert.ok(iCatch !== -1 && iCatch < iUnavail, 'acquisition catch missing');
    const catchBlock = src.slice(iCatch, iStep10);
    assert.ok(!/store\./.test(catchBlock), 'acquisition catch region must not touch a store handle');
    assert.ok(!/readRecord/.test(catchBlock), 'acquisition catch region must not read');
    const expected = 'function acquireStore(event) {\n' +
      '  if (event && event._testStore) { return event._testStore; }\n' +
      "  const { getStore } = require('@netlify/blobs');\n" +
      '  return getStore(STORE_NAME);\n' +
      '}\n';
    assert.ok(src.indexOf(expected) !== -1, 'acquireStore body changed');
  });

  // ── cleanup ───────────────────────────────────────────────────────────────
  disableGate();

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + err.stack + '\n');
  process.exit(1);
});
