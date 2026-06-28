'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { handler } = require('../netlify/functions/sec-evidence-store-writer');
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
  await test('W70: Step10 DEGRADED → 200 DEGRADED/READ_FAILURE', async function () {
    const store = degradedGetStore(cikKey(TICKER));
    const r = await invoke('POST', VALID_BODY, store, authHdr());
    const j = JSON.parse(r.body);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(j.status, 'DEGRADED');
    assert.strictEqual(j.reason, 'READ_FAILURE');
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
  await test('W75: Step11 DEGRADED → 200 DEGRADED/READ_FAILURE', async function () {
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
    assert.strictEqual(j.reason, 'READ_FAILURE');
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
  await test('W120: no fetch() in sec-evidence-store-writer.js', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in writer');
  });

  await test('W121: no fetch() in lib/evidence-writer.js', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-writer.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src), 'fetch() found in evidence-writer.js');
  });

  await test('W122: no pt_ refs in writer files', async function () {
    const files = [
      path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'),
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
      path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'),
      path.join(ROOT, 'netlify/functions/lib/evidence-writer.js')
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!re.test(src), 'scoring/scan ref in ' + path.basename(f));
    }
  });

  await test('W124: gate check uses !== "true" (strict string equality)', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'), 'utf8');
    assert.ok(
      /PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER\s*!==\s*['"]true['"]/.test(src),
      'gate strict check not found'
    );
  });

  await test('W125: acquireStore checks _testStore before @netlify/blobs', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'), 'utf8');
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

  await test('W128: readRecord in evidence-store.js accepts options param', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/evidence-store.js'), 'utf8');
    assert.ok(/async function readRecord\(store, key, options\)/.test(src), 'readRecord options param not found');
    assert.ok(/store\.get\(key,\s*options\s*\|\|\s*\{\}\)/.test(src), 'store.get options forwarding not found');
  });

  await test('W129: writer calls readRecord with STRONG option', async function () {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/sec-evidence-store-writer.js'), 'utf8');
    assert.ok(/readRecord\(store,.*STRONG\)/.test(src), 'readRecord STRONG call not found');
    assert.ok(/consistency.*strong/.test(src), 'consistency:strong not found in writer');
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
