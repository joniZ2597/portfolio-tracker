'use strict';

/*
 * qa/sec_evidence_pull_endpoint_offline.js
 *
 * Real Portfolio Evidence Pull — Slice 2F endpoint-adapter offline harness
 * (EP-series). Exercises the CORE-ONLY endpoint
 * (netlify/functions/lib/sec-evidence-pull-core.js) with ZERO real
 * network / Blob / Netlify env / production.
 *
 * Isolation:
 *   - a throwing global.fetch guard makes any real network a hard error; the
 *     provider only ever sees the INJECTED fetch (event._testProviderOptions).
 *   - the store is an in-memory Map (op spy) injected via event._testStore; no
 *     @netlify/blobs handle is ever constructed.
 *   - the gates + tokens + UA + allowlist live on process.env IN-PROCESS ONLY and
 *     are snapshot/restored around the suite; no Netlify env is touched.
 *
 * Auth-first (Codex 2F): a malformed/missing body from an unauthenticated or
 * wrong-token caller must yield 401 — never a body/ticker error. Poisoned-seam
 * cases prove the disabled gate + every failed preflight read NEITHER
 * event._testStore NOR event._testProviderOptions and never reach the orchestrator.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { cikKey, companyKey } = require('../netlify/functions/lib/evidence-store');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'netlify/functions/lib/sec-evidence-pull-core.js';

// The endpoint core is loaded UNDER the network guard inside EP01 (import-inertness
// proof), then reused by the remaining tests.
let EP = null;

// ── env key names + good values (in-process only) ─────────────────────────────
const PULL_GATE   = 'PT_ENABLE_SEC_EVIDENCE_PULL_SERVER';
const WRITER_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const PULL_TOKEN  = 'PT_SEC_EVIDENCE_PULL_TOKEN';
const WRITE_TOKEN = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const UA_KEY      = 'SEC_USER_AGENT';
const ALLOW_KEY   = 'PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS';
const ENV_KEYS = [PULL_GATE, WRITER_GATE, PULL_TOKEN, WRITE_TOKEN, UA_KEY, ALLOW_KEY];

const GOOD_PULL  = 'pull-token-aaaa1111';
const GOOD_WRITE = 'write-token-bbbb2222';
const GOOD_UA    = 'PulseSlice2FTest/1.0 qa@example.com';
const GOOD_AUTH  = 'Bearer ' + GOOD_PULL;

function setEnv(name, value) { if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; } }
function clearAllEnv() { ENV_KEYS.forEach(function (k) { delete process.env[k]; }); }
function fullValidEnv(allow) {
  setEnv(PULL_GATE, 'true');
  setEnv(WRITER_GATE, 'true');
  setEnv(PULL_TOKEN, GOOD_PULL);
  setEnv(WRITE_TOKEN, GOOD_WRITE);
  setEnv(UA_KEY, GOOD_UA);
  setEnv(ALLOW_KEY, allow || 'ZORCH, AAPL, MSFT');
}
function authHdr() { return { authorization: GOOD_AUTH }; }

// ── invoke helpers ────────────────────────────────────────────────────────────
async function invoke(method, opts) {
  opts = opts || {};
  const event = { httpMethod: method, headers: opts.headers || {} };
  if (Object.prototype.hasOwnProperty.call(opts, 'body')) {
    event.body = (opts.body === undefined || typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
  }
  if (opts.store !== undefined) { event._testStore = opts.store; }
  if (opts.providerOptions !== undefined) { event._testProviderOptions = opts.providerOptions; }
  const r = await EP.handler(event);
  return { statusCode: r.statusCode, headers: r.headers, body: (r.body !== undefined ? JSON.parse(r.body) : undefined) };
}

// Poisoned seams: getter traps that COUNT any read of the test seams. On the
// disabled gate and every failed-preflight path they must never fire (touched 0).
async function invokePoisoned(method, opts) {
  opts = opts || {};
  const touched = { store: 0, provider: 0 };
  const event = { httpMethod: method, headers: opts.headers || {} };
  if (Object.prototype.hasOwnProperty.call(opts, 'body')) {
    event.body = (opts.body === undefined || typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
  }
  Object.defineProperty(event, '_testStore', {
    configurable: true, enumerable: false, get: function () { touched.store += 1; return undefined; }
  });
  Object.defineProperty(event, '_testProviderOptions', {
    configurable: true, enumerable: false, get: function () { touched.provider += 1; return undefined; }
  });
  const r = await EP.handler(event);
  return { res: { statusCode: r.statusCode, body: (r.body !== undefined ? JSON.parse(r.body) : undefined) }, touched: touched };
}

// ── injected fetch over SEC fixtures (from Slice 2A/2B/2C) ─────────────────────
function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}
function makeFetch(routes) {
  const spy = { calls: [] };
  spy.fn = async function (url) {
    const u = String(url);
    spy.calls.push(u);
    for (var i = 0; i < routes.length; i++) { if (u.indexOf(routes[i].match) !== -1) { return routes[i].respond; } }
    return jsonResponse(404, {}); // unmatched (incl. concept URLs) -> filing-only
  };
  return spy;
}
function providerOpts(spy, env) { return { fetch: spy.fn, env: env, spacingMs: 0 }; }

function tickersJsonOf(rows) {
  const o = {};
  rows.forEach(function (r, i) { o[String(i)] = { cik_str: r.cikStr, ticker: r.ticker, title: r.title }; });
  return o;
}
function submissions10Q(cikStr, accession, filingDate, reportDate, primaryDoc) {
  return {
    cik: String(cikStr),
    filings: { recent: {
      form: ['10-Q'], filingDate: [filingDate], accessionNumber: [accession],
      primaryDocument: [primaryDoc], reportDate: [reportDate]
    } }
  };
}
function submissionsNo10Q(cikStr) {
  return {
    cik: String(cikStr),
    filings: { recent: {
      form: ['8-K'], filingDate: ['2026-01-05'], accessionNumber: ['0001000013-26-000013'],
      primaryDocument: ['x.htm'], reportDate: ['2025-12-31']
    } }
  };
}
function routesForUniverse(universe) {
  const routes = [{ match: 'company_tickers.json', respond: jsonResponse(200, universe.tickersJson) }];
  Object.keys(universe.submissionsByPaddedCik).forEach(function (paddedCik) {
    routes.push({ match: 'submissions/CIK' + paddedCik, respond: jsonResponse(200, universe.submissionsByPaddedCik[paddedCik]) });
  });
  return routes;
}

const UNIVERSE_SINGLE = {
  tickersJson: tickersJsonOf([{ cikStr: 1000010, ticker: 'ZORCH', title: 'Zorch Test Co' }]),
  submissionsByPaddedCik: { '0001000010': submissions10Q(1000010, '0001000010-26-000010', '2026-02-12', '2025-12-28', 'zorch-20251228.htm') }
};
const UNIVERSE_NOEV = {
  tickersJson: tickersJsonOf([{ cikStr: 1000013, ticker: 'ZEMPTY', title: 'Zempty Test Co' }]),
  submissionsByPaddedCik: { '0001000013': submissionsNo10Q(1000013) }
};

// ── in-memory store modelling create-only Blob semantics (+ op spy) ───────────
function makeMemStore() {
  const map = new Map();
  const ops = { get: 0, set: 0 };
  return {
    _map: map, _ops: ops,
    get: async function (key) { ops.get += 1; return map.has(key) ? map.get(key) : null; },
    set: async function (key, value, o) {
      ops.set += 1;
      if (o && o.onlyIfNew === true && map.has(key)) { return { modified: false }; }
      map.set(key, value);
      return { modified: true };
    }
  };
}

// ── tiny runner (mirrors qa/run-writer-offline.js) ────────────────────────────
let passed = 0;
let failed = 0;
async function test(label, fn) {
  try {
    await fn();
    process.stdout.write('  PASS  ' + label + '\n');
    passed += 1;
  } catch (err) {
    process.stdout.write('  FAIL  ' + label + '\n');
    process.stdout.write('         ' + (err && err.message ? err.message : err) + '\n');
    failed += 1;
  }
}

async function runTests() {
  process.stdout.write('\n=== Real Portfolio Evidence Pull — Slice 2F (endpoint adapter, core-only, offline) ===\n\n');

  const snapshot = {};
  ENV_KEYS.forEach(function (k) { snapshot[k] = process.env[k]; });

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── EP01: import inertness ────────────────────────────────────────────────
    await test('EP01: module import is inert (no network / no throw) and exposes handler', async function () {
      const before = realFetchCalls;
      EP = require('../netlify/functions/lib/sec-evidence-pull-core');
      assert.strictEqual(typeof EP.handler, 'function', 'handler missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    // ── EP02: OPTIONS -> 204, cors headers, no body ───────────────────────────
    await test('EP02: OPTIONS -> 204 with cors headers and no body', async function () {
      clearAllEnv(); // even with the gate off, OPTIONS answers
      const r = await invoke('OPTIONS', {});
      assert.strictEqual(r.statusCode, 204);
      assert.strictEqual(r.body, undefined, 'no body on a 204');
      assert.strictEqual(r.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
    });

    // ── EP03: gate OFF -> 200 DISABLED; poisoned seams untouched; no fetch ─────
    await test('EP03: gate OFF -> 200 DISABLED/SERVER_DISABLED; seams untouched; zero fetch', async function () {
      clearAllEnv();
      const before = realFetchCalls;
      const out = await invokePoisoned('POST', { headers: authHdr(), body: { ticker: 'ZORCH' } });
      assert.strictEqual(out.res.statusCode, 200);
      assert.deepStrictEqual(out.res.body, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
      assert.strictEqual(out.touched.store, 0, 'gate-off must not read _testStore');
      assert.strictEqual(out.touched.provider, 0, 'gate-off must not read _testProviderOptions');
      assert.strictEqual(realFetchCalls, before, 'gate-off must not fetch');
    });

    // ── EP03b: gate strict — non-"true" values are all DISABLED ────────────────
    await test('EP03b: pull gate is strict === "true"; non-"true" -> DISABLED', async function () {
      for (const v of ['false', 'TRUE', 'True', '1', ' true', 'true ', 'yes', '']) {
        fullValidEnv(); setEnv(PULL_GATE, v);
        const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'ZORCH' } });
        assert.strictEqual(r.statusCode, 200, 'gate value ' + JSON.stringify(v));
        assert.strictEqual(r.body.reason, 'SERVER_DISABLED', 'gate value ' + JSON.stringify(v));
      }
    });

    // ── EP04: gate ON, non-POST -> 405 ────────────────────────────────────────
    await test('EP04: gate ON, GET/PUT/DELETE -> 405 METHOD_NOT_ALLOWED', async function () {
      fullValidEnv();
      for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
        const r = await invoke(m, { headers: authHdr(), body: { ticker: 'ZORCH' } });
        assert.strictEqual(r.statusCode, 405, 'method ' + m);
        assert.strictEqual(r.body.reason, 'METHOD_NOT_ALLOWED', 'method ' + m);
      }
    });

    // ── EP05–EP08: AUTH-FIRST — malformed/any body from unauth/wrong -> 401 ────
    await test('EP05: unauthenticated + malformed body -> 401 (never a body error); seams untouched', async function () {
      fullValidEnv();
      const before = realFetchCalls;
      const out = await invokePoisoned('POST', { headers: {}, body: '{not valid json' });
      assert.strictEqual(out.res.statusCode, 401);
      assert.deepStrictEqual(out.res.body, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
      assert.strictEqual(out.touched.store, 0);
      assert.strictEqual(out.touched.provider, 0);
      assert.strictEqual(realFetchCalls, before);
    });

    await test('EP06: unauthenticated + missing/[]/null/{} body -> 401 (auth-first)', async function () {
      fullValidEnv();
      const missing = await invoke('POST', { headers: {} }); // no body at all
      assert.strictEqual(missing.statusCode, 401, 'missing body');
      for (const b of ['[]', 'null', '{}', '"str"', '123']) {
        const r = await invoke('POST', { headers: {}, body: b });
        assert.strictEqual(r.statusCode, 401, 'body ' + b);
        assert.strictEqual(r.body.reason, 'UNAUTHORIZED', 'body ' + b);
      }
    });

    await test('EP07: wrong token + malformed body -> 401 (auth-first); seams untouched', async function () {
      fullValidEnv();
      const out = await invokePoisoned('POST', { headers: { authorization: 'Bearer wrong-token' }, body: '{bad' });
      assert.strictEqual(out.res.statusCode, 401);
      assert.strictEqual(out.res.body.reason, 'UNAUTHORIZED');
      assert.strictEqual(out.touched.store, 0);
      assert.strictEqual(out.touched.provider, 0);
    });

    await test('EP08: wrong token + valid body + valid ticker -> 401', async function () {
      fullValidEnv();
      const r = await invoke('POST', { headers: { authorization: 'Bearer nope' }, body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 401);
      assert.strictEqual(r.body.reason, 'UNAUTHORIZED');
    });

    // ── EP09: correct token + malformed body -> 400 INVALID_JSON ───────────────
    await test('EP09: correct token + malformed body -> 400 INVALID_JSON (post-auth refinement)', async function () {
      fullValidEnv();
      for (const b of ['{bad json', '[]', 'null', '"str"', '42', undefined]) {
        const opts = { headers: authHdr() };
        if (b !== undefined) { opts.body = b; }
        const r = await invoke('POST', opts);
        assert.strictEqual(r.statusCode, 400, 'body ' + JSON.stringify(b));
        assert.deepStrictEqual(r.body, { status: 'INVALID_JSON', reason: 'INVALID_JSON' }, 'body ' + JSON.stringify(b));
      }
    });

    // ── EP10: correct token + invalid ticker -> 400 TICKER_INVALID ─────────────
    await test('EP10: correct token + invalid ticker (lowercase/padded/too-long/missing) -> 400 TICKER_INVALID', async function () {
      fullValidEnv();
      for (const t of ['aapl', ' AAPL', 'AAPL ', 'TOOLONGTICKER', 'A1', '']) {
        const r = await invoke('POST', { headers: authHdr(), body: { ticker: t } });
        assert.strictEqual(r.statusCode, 400, 'ticker ' + JSON.stringify(t));
        assert.deepStrictEqual(r.body, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' }, 'ticker ' + JSON.stringify(t));
      }
      // a well-formed object with NO ticker field is a ticker error, not INVALID_JSON
      const noTicker = await invoke('POST', { headers: authHdr(), body: { notTicker: 'x' } });
      assert.strictEqual(noTicker.statusCode, 400);
      assert.strictEqual(noTicker.body.reason, 'TICKER_INVALID');
    });

    // ── EP11: correct token + not-allowed ticker -> 403 ───────────────────────
    await test('EP11: correct token + valid but not-allowlisted ticker -> 403 TICKER_NOT_ALLOWED', async function () {
      fullValidEnv('ZORCH, AAPL, MSFT'); // ZZZZ absent
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'ZZZZ' } });
      assert.strictEqual(r.statusCode, 403);
      assert.deepStrictEqual(r.body, { status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' });
    });

    // ── EP12–EP20: pinned per-reason mapping (one case each) ──────────────────
    await test('EP12: writer gate OFF -> 200 DISABLED (WRITER_SERVER_DISABLED collapses to uniform)', async function () {
      fullValidEnv(); setEnv(WRITER_GATE, undefined);
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(r.body, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    });

    await test('EP13: UNAUTHORIZED — missing token AND wrong token both -> 401', async function () {
      fullValidEnv();
      const noTok = await invoke('POST', { headers: {}, body: { ticker: 'AAPL' } });
      assert.strictEqual(noTok.statusCode, 401);
      const badTok = await invoke('POST', { headers: { authorization: 'Bearer x' }, body: { ticker: 'AAPL' } });
      assert.strictEqual(badTok.statusCode, 401);
    });

    await test('EP14: WRITER_TOKEN_MISSING -> 500 CONFIGURATION_MISSING', async function () {
      fullValidEnv(); setEnv(WRITE_TOKEN, undefined);
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 500);
      assert.deepStrictEqual(r.body, { status: 'CONFIGURATION_MISSING', reason: 'WRITER_TOKEN_MISSING' });
    });

    await test('EP15: TOKEN_COLLISION (pull === write) -> 500 CONFIGURATION_MISSING', async function () {
      fullValidEnv(); setEnv(PULL_TOKEN, 'same-secret'); setEnv(WRITE_TOKEN, 'same-secret');
      const r = await invoke('POST', { headers: { authorization: 'Bearer same-secret' }, body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 500);
      assert.deepStrictEqual(r.body, { status: 'CONFIGURATION_MISSING', reason: 'TOKEN_COLLISION' });
    });

    await test('EP16: SEC_USER_AGENT_MISSING -> 500 CONFIGURATION_MISSING', async function () {
      fullValidEnv(); setEnv(UA_KEY, undefined);
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 500);
      assert.deepStrictEqual(r.body, { status: 'CONFIGURATION_MISSING', reason: 'SEC_USER_AGENT_MISSING' });
    });

    await test('EP17: ALLOWLIST_MISSING -> 500 CONFIGURATION_MISSING', async function () {
      fullValidEnv(); setEnv(ALLOW_KEY, undefined);
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 500);
      assert.deepStrictEqual(r.body, { status: 'CONFIGURATION_MISSING', reason: 'ALLOWLIST_MISSING' });
    });

    await test('EP18: ALLOWLIST_INVALID -> 500 CONFIGURATION_MISSING', async function () {
      fullValidEnv('aa##bad'); // a token failing the ticker rule -> invalid whole list
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'AAPL' } });
      assert.strictEqual(r.statusCode, 500);
      assert.deepStrictEqual(r.body, { status: 'CONFIGURATION_MISSING', reason: 'ALLOWLIST_INVALID' });
    });

    await test('EP19: TICKER_INVALID -> 400 INVALID_TICKER (explicit per-reason)', async function () {
      fullValidEnv();
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'aapl' } });
      assert.strictEqual(r.statusCode, 400);
      assert.strictEqual(r.body.reason, 'TICKER_INVALID');
    });

    await test('EP20: TICKER_NOT_ALLOWED -> 403 (explicit per-reason)', async function () {
      fullValidEnv('AAPL');
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'MSFT' } });
      assert.strictEqual(r.statusCode, 403);
      assert.strictEqual(r.body.reason, 'TICKER_NOT_ALLOWED');
    });

    // ── EP21: poisoned seams across EVERY failed-preflight reason ──────────────
    await test('EP21: poisoned seams untouched on every failed-preflight reason (gate ON)', async function () {
      const cases = [
        // [envMutator, headers, body, expectStatus]
        [function () { fullValidEnv(); }, {}, { ticker: 'AAPL' }, 401],                                   // UNAUTHORIZED
        [function () { fullValidEnv(); setEnv(WRITER_GATE, undefined); }, authHdr(), { ticker: 'AAPL' }, 200], // WRITER off -> DISABLED
        [function () { fullValidEnv(); setEnv(WRITE_TOKEN, undefined); }, authHdr(), { ticker: 'AAPL' }, 500], // WRITER_TOKEN_MISSING
        [function () { fullValidEnv(); setEnv(PULL_TOKEN, 'dup'); setEnv(WRITE_TOKEN, 'dup'); }, { authorization: 'Bearer dup' }, { ticker: 'AAPL' }, 500], // TOKEN_COLLISION
        [function () { fullValidEnv(); setEnv(UA_KEY, undefined); }, authHdr(), { ticker: 'AAPL' }, 500],  // SEC_USER_AGENT_MISSING
        [function () { fullValidEnv(); setEnv(ALLOW_KEY, undefined); }, authHdr(), { ticker: 'AAPL' }, 500], // ALLOWLIST_MISSING
        [function () { fullValidEnv('aa##bad'); }, authHdr(), { ticker: 'AAPL' }, 500],                    // ALLOWLIST_INVALID
        [function () { fullValidEnv(); }, authHdr(), { ticker: 'aapl' }, 400],                             // TICKER_INVALID
        [function () { fullValidEnv('AAPL'); }, authHdr(), { ticker: 'MSFT' }, 403]                        // TICKER_NOT_ALLOWED
      ];
      const before = realFetchCalls;
      for (var i = 0; i < cases.length; i++) {
        cases[i][0]();
        const out = await invokePoisoned('POST', { headers: cases[i][1], body: cases[i][2] });
        assert.strictEqual(out.res.statusCode, cases[i][3], 'case ' + i + ' status');
        assert.strictEqual(out.touched.store, 0, 'case ' + i + ' read _testStore');
        assert.strictEqual(out.touched.provider, 0, 'case ' + i + ' read _testProviderOptions');
      }
      assert.strictEqual(realFetchCalls, before, 'no real fetch across any failed preflight');
    });

    // ── EP22: _testProviderOptions cannot override a gate/token ───────────────
    await test('EP22: seam-supplied env cannot flip the gate on (env read from process.env only)', async function () {
      clearAllEnv(); // pull gate OFF on process.env
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const injected = providerOpts(spy, { SEC_USER_AGENT: GOOD_UA });
      injected.env.PT_ENABLE_SEC_EVIDENCE_PULL_SERVER = 'true'; // hostile attempt via the seam
      injected.env.PT_SEC_EVIDENCE_PULL_TOKEN = GOOD_PULL;
      const r = await invoke('POST', { headers: authHdr(), body: { ticker: 'ZORCH' }, providerOptions: injected });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.reason, 'SERVER_DISABLED', 'seam env must not enable the gate');
      assert.strictEqual(spy.calls.length, 0, 'no provider fetch when the gate is off');
    });

    // ── EP23: body cannot inject a seam (event-only) ──────────────────────────
    await test('EP23: body-supplied _testStore/_testProviderOptions are ignored; write lands on the EVENT store', async function () {
      fullValidEnv('ZORCH');
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const poisonBody = {
        ticker: 'ZORCH',
        _testStore: { get: async function () { throw new Error('BODY_STORE_USED'); }, set: async function () { throw new Error('BODY_STORE_USED'); } },
        _testProviderOptions: { fetch: function () { throw new Error('BODY_FETCH_USED'); } }
      };
      const r = await invoke('POST', {
        headers: authHdr(), body: poisonBody,
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.status, 'WRITE', 'write must proceed via the event seams');
      assert.strictEqual(store._map.size, 2, 'write landed on the EVENT store, not the body seam');
    });

    // ── EP24: OK path — un-seeded write + writtenKeys + token separation ──────
    await test('EP24: correct token + allowlisted ticker -> 200 WRITE; writtenKeys authoritative; distinct pull/write tokens', async function () {
      fullValidEnv('ZORCH, AAPL'); // pull token != write token (GOOD_PULL != GOOD_WRITE)
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZORCH' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.status, 'WRITE');
      assert.strictEqual(r.body.ticker, 'ZORCH');
      assert.ok(/^\d{10}$/.test(r.body.cik), 'cik must be 10 digits, got ' + r.body.cik);
      assert.ok(r.body.itemCount >= 1, 'at least one evidence item');
      // token separation: a STORE_WRITE proves the orchestrator handed the WRITE
      // token (not the pull token) to the writer — else the writer would 401.
      assert.strictEqual(r.body.writer.status, 'STORE_WRITE', 'writer must accept the write token');
      assert.deepStrictEqual(r.body.writtenKeys, [companyKey(r.body.cik), cikKey('ZORCH')],
        'writtenKeys must be the authoritative [companyKey, cikKey] from the writer');
      assert.strictEqual(store._map.size, 2, 'exactly two canonical keys written');
    });

    // ── EP25: SKIPPED — seeded ticker, no provider fetch ──────────────────────
    await test('EP25: pre-seeded ticker -> 200 SKIPPED/ALREADY_SEEDED; no provider fetch', async function () {
      fullValidEnv('ZORCH');
      const store = makeMemStore();
      store._map.set(cikKey('ZORCH'), JSON.stringify({ cik: '0001000010' }));
      store._map.set(companyKey('0001000010'), JSON.stringify({ evidenceItems: [] }));
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZORCH' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(r.body, { status: 'SKIPPED', reason: 'ALREADY_SEEDED', ticker: 'ZORCH' });
      assert.strictEqual(spy.calls.length, 0, 'skip must occur before any provider fetch');
    });

    // ── EP26: pre-read DEGRADED -> STOP before SEC ────────────────────────────
    await test('EP26: pre-read DEGRADED (store.get throws) -> 200 STOPPED_PRE_READ_DEGRADED; no fetch', async function () {
      fullValidEnv('ZORCH');
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const store = { get: async function () { throw new Error('infra'); }, set: async function () { return { modified: true }; } };
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZORCH' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.reason, 'STOPPED_PRE_READ_DEGRADED');
      assert.strictEqual(r.body.writeAttempted, false);
      assert.strictEqual(spy.calls.length, 0, 'DEGRADED pre-read must stop before any SEC fetch');
    });

    // ── EP27: pre-read INVALID -> 409 CONFLICT ────────────────────────────────
    await test('EP27: pre-read INVALID (malformed stored mapping) -> 409 STOPPED_PRE_READ_INVALID; no fetch', async function () {
      fullValidEnv('ZORCH');
      const store = makeMemStore();
      store._map.set(cikKey('ZORCH'), JSON.stringify(['not', 'an', 'object']));
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZORCH' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 409);
      assert.strictEqual(r.body.reason, 'STOPPED_PRE_READ_INVALID');
      assert.strictEqual(spy.calls.length, 0, 'INVALID pre-read must stop before any SEC fetch');
    });

    // ── EP28: NO_CIK ──────────────────────────────────────────────────────────
    await test('EP28: allowlisted ticker with no CIK mapping -> 200 NO_EVIDENCE/NO_CIK', async function () {
      fullValidEnv('ZNOPE');
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE)); // universe lacks ZNOPE
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZNOPE' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(r.body, { status: 'NO_EVIDENCE', reason: 'NO_CIK', ticker: 'ZNOPE' });
      assert.strictEqual(store._ops.set, 0, 'NO_CIK must not write');
    });

    // ── EP29: NO_EVIDENCE ─────────────────────────────────────────────────────
    await test('EP29: CIK resolves but no 10-Q -> 200 NO_EVIDENCE/NO_EVIDENCE', async function () {
      fullValidEnv('ZEMPTY');
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_NOEV));
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZEMPTY' },
        store: store, providerOptions: providerOpts(spy, { SEC_USER_AGENT: GOOD_UA })
      });
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(r.body, { status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE', ticker: 'ZEMPTY' });
      assert.strictEqual(store._ops.set, 0, 'NO_EVIDENCE must not write');
    });

    // ── EP30: provider throw -> 502 PROVIDER_FAILURE (no raw leak) ─────────────
    await test('EP30: provider fail-closed (throws) -> 502 ERROR/PROVIDER_FAILURE', async function () {
      fullValidEnv('ZORCH'); // process.env UA present -> preflight passes
      const store = makeMemStore();
      const spy = makeFetch(routesForUniverse(UNIVERSE_SINGLE));
      // Seam env WITHOUT SEC_USER_AGENT -> the provider throws before any fetch,
      // proving the seam env is used only downstream (preflight already passed).
      const r = await invoke('POST', {
        headers: authHdr(), body: { ticker: 'ZORCH' },
        store: store, providerOptions: { fetch: spy.fn, env: {}, spacingMs: 0 }
      });
      assert.strictEqual(r.statusCode, 502);
      assert.deepStrictEqual(r.body, { status: 'ERROR', reason: 'PROVIDER_FAILURE' });
      assert.strictEqual(spy.calls.length, 0, 'provider must fail closed before any fetch');
    });

    // ── EP31: static safety of the TARGET module (positional; scan module) ────
    await test('EP31: endpoint core is static-safe (positional auth-first ordering; no client/scoring/bearer)', async function () {
      const src = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');
      const I = function (s) { return src.indexOf(s); };
      // strict pull gate literal present
      assert.ok(/process\.env\.PT_ENABLE_SEC_EVIDENCE_PULL_SERVER\s*!==\s*['"]true['"]/.test(src), 'strict pull gate literal missing');
      const gi = I('PT_ENABLE_SEC_EVIDENCE_PULL_SERVER');
      const pi = I('evaluatePullPreflight(');
      assert.ok(gi !== -1 && pi !== -1 && gi < pi, 'gate must precede preflight');
      assert.ok(pi < I('acquireStore('), 'preflight must precede store acquisition');
      assert.ok(pi < I('pullAndPersistTicker('), 'preflight must precede orchestrator');
      assert.ok(pi < I('acquireProviderOptions('), 'preflight must precede provider options');
      assert.ok(pi < I('@netlify/blobs'), 'preflight must precede @netlify/blobs');
      // auth-first: no INVALID_JSON / body-parse before the preflight call
      assert.ok(I('INVALID_JSON') > pi, 'no INVALID_JSON response may precede the auth/preflight check');
      assert.ok(I('parseBody(event') > pi, 'body must not be parsed before authorization');
      // _testStore checked before requiring blobs
      assert.ok(I('_testStore') !== -1 && I('_testStore') < I('@netlify/blobs'), '_testStore must precede @netlify/blobs');
      // event-only seam
      assert.ok(!/\.value\._test/.test(src), 'test seam read from parsed body — must be event-only');
      // no client/scoring/bearer
      assert.ok(!/localStorage|sessionStorage/.test(src), 'web storage referenced');
      assert.ok(!/\b(?:pt_results|pt_tickers|pt_holdings)\b/.test(src), 'pt_* key referenced');
      assert.ok(!/\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(src), 'scoring ref');
      assert.ok(!/Bearer/.test(src), 'core must not touch the Bearer scheme — preflight owns it');
      assert.ok(/exports\.handler\s*=/.test(src), 'sole handler export missing');
    });

    // ── EP32: behavioral — zero real network across the whole suite ───────────
    await test('EP32: zero real global.fetch across the suite', async function () {
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
    });
  } finally {
    // restore process.env snapshot + the network guard before reporting/exit
    ENV_KEYS.forEach(function (k) { if (snapshot[k] === undefined) { delete process.env[k]; } else { process.env[k] = snapshot[k]; } });
    globalThis.fetch = _origFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
