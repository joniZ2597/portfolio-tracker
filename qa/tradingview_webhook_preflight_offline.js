'use strict';

/*
 * qa/tradingview_webhook_preflight_offline.js
 *
 * TradingView alert-webhook ingestion — v1 pilot offline QA
 * (work/tradingview-alerts/brief.md).
 *
 * Exercises the PURE preflight/normalizer
 * (netlify/functions/lib/tradingview-webhook-preflight.js) directly, and the endpoint
 * (netlify/functions/tradingview-webhook.js) via an injected event._testStore seam
 * (mirrors sec-evidence-store-writer-core.js's acquireStore pattern) — NO real
 * @netlify/blobs handle is ever constructed, NO real network. A throwing
 * globalThis.fetch guard is installed throughout to prove neither module ever
 * touches the real network.
 *
 * Coverage (brief "Testing" section, items 1-11):
 *   TV01 server gate disabled -> rejected before any parse/storage attempt
 *   TV02 server token misconfigured (absent/empty) -> rejected regardless of the
 *        request's secret
 *   TV03 malformed JSON body -> rejected, no storage write attempted
 *   TV04 missing `secret` field -> rejected
 *   TV05 wrong/invalid `secret` value -> rejected
 *   TV06 valid request -> accepted
 *   TV07 secret never appears in the persisted event or in any log output
 *   TV08 missing/invalid required payload fields -> rejected, distinct from auth
 *   TV09 normalized event shape matches the schema exactly; receiptId independent
 *        of receivedAt; sourceTimestamp normalized to ISO-8601 or null
 *   TV10 simulated storage failure: no success response, no leaked internals, no
 *        second/alternate write, only the dedicated store adapter invoked
 *   TV11 no mutation of any existing portfolio/product state or other store
 *        namespace
 *
 * Run: node qa/tradingview_webhook_preflight_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PREFLIGHT_SRC = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'tradingview-webhook-preflight.js');
const ENDPOINT_SRC = path.resolve(__dirname, '..', 'netlify', 'functions', 'tradingview-webhook.js');

const GATE = 'PT_ENABLE_TRADINGVIEW_WEBHOOK_SERVER';
const TOKEN = 'PT_TRADINGVIEW_WEBHOOK_TOKEN';
const GOOD_TOKEN = 'tv-webhook-token-aaaa1111';
const NOW_MS = 1700000000000; // fixed, deterministic
const RECEIPT_ID = 'test-receipt-0001';

function baseEnv(overrides) {
  const e = {};
  e[GATE] = 'true';
  e[TOKEN] = GOOD_TOKEN;
  return Object.assign(e, overrides || {});
}
function delEnv(env, key) { const e = Object.assign({}, env); delete e[key]; return e; }
function goodPayload(overrides) {
  return Object.assign({ secret: GOOD_TOKEN, symbol: 'AAPL', alertType: 'buy_signal' }, overrides || {});
}

function setProcessEnv(name, value) { if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; } }
function clearProcessEnv() { delete process.env[GATE]; delete process.env[TOKEN]; }

// ── in-memory store spy (never a real @netlify/blobs handle) ─────────────────
function makeSpyStore() {
  const calls = [];
  return {
    calls: calls,
    setJSON: async function (key, value) {
      calls.push({ op: 'setJSON', key: key, value: value });
    }
  };
}
function makeFailingStore(errorMessage) {
  const calls = [];
  return {
    calls: calls,
    setJSON: async function (key, value) {
      calls.push({ op: 'setJSON', key: key, value: value });
      throw new Error(errorMessage);
    }
  };
}

async function invokeEndpoint(EP, method, opts) {
  opts = opts || {};
  const event = { httpMethod: method };
  if (Object.prototype.hasOwnProperty.call(opts, 'body')) {
    event.body = opts.body;
  }
  if (opts.store !== undefined) { event._testStore = opts.store; }
  const r = await EP.handler(event);
  return { statusCode: r.statusCode, body: r.body !== undefined ? JSON.parse(r.body) : undefined };
}

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
  process.stdout.write('\n=== TradingView alert-webhook ingestion v1 pilot (offline) ===\n\n');

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  const _origEnv = {};
  _origEnv[GATE] = process.env[GATE];
  _origEnv[TOKEN] = process.env[TOKEN];

  let PF = null;
  let EP = null;

  try {
    await test('TV00: modules import inertly (no network) and expose the expected entrypoints', async function () {
      const before = realFetchCalls;
      PF = require(PREFLIGHT_SRC);
      EP = require(ENDPOINT_SRC);
      assert.strictEqual(typeof PF.evaluateTradingViewWebhookPreflight, 'function', 'evaluateTradingViewWebhookPreflight missing');
      assert.strictEqual(typeof PF.buildNormalizedEvent, 'function', 'buildNormalizedEvent missing');
      assert.strictEqual(typeof EP.handler, 'function', 'handler missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    // ── TV01: server gate disabled ────────────────────────────────────────────
    await test('TV01: server gate disabled -> SERVER_DISABLED, rejected before any parse/storage attempt', async function () {
      const bad = [undefined, '', 'false', 'True', '1'];
      for (const v of bad) {
        const env = v === undefined ? delEnv(baseEnv(), GATE) : baseEnv({ [GATE]: v });
        const r = PF.evaluateTradingViewWebhookPreflight({
          env: env, method: 'POST', body: 'not even valid json {{{', nowMs: NOW_MS, receiptId: RECEIPT_ID
        });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'SERVER_DISABLED', 'gate value ' + JSON.stringify(v));
      }

      setProcessEnv(GATE, undefined);
      setProcessEnv(TOKEN, GOOD_TOKEN);
      const store = makeSpyStore();
      const out = await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload()), store: store });
      assert.strictEqual(out.statusCode, 200);
      assert.deepStrictEqual(out.body, { status: 'SERVER_DISABLED', reason: 'SERVER_DISABLED' });
      assert.strictEqual(store.calls.length, 0, 'gate-off must not attempt any storage write');
    });

    // ── TV02: server token misconfigured ──────────────────────────────────────
    await test('TV02: server token absent/empty -> SERVER_CONFIG_ERROR regardless of the request secret', async function () {
      const misconfigured = [delEnv(baseEnv(), TOKEN), baseEnv({ [TOKEN]: '' })];
      for (const env of misconfigured) {
        const r = PF.evaluateTradingViewWebhookPreflight({
          env: env, method: 'POST', body: JSON.stringify(goodPayload({ secret: 'anything-at-all' })), nowMs: NOW_MS, receiptId: RECEIPT_ID
        });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'SERVER_CONFIG_ERROR');
      }

      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, '');
      const store = makeSpyStore();
      const out = await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload({ secret: 'anything-at-all' })), store: store });
      assert.strictEqual(out.statusCode, 500);
      assert.deepStrictEqual(out.body, { status: 'SERVER_CONFIG_ERROR', reason: 'SERVER_CONFIG_ERROR' });
      assert.strictEqual(store.calls.length, 0, 'misconfigured token must not attempt any storage write');
    });

    // ── TV03: malformed JSON body ──────────────────────────────────────────────
    await test('TV03: malformed JSON body -> MALFORMED_REQUEST, no storage write attempted', async function () {
      const bad = [undefined, '', 'not json', '{"unterminated":', '"just a string"', '42', 'null'];
      for (const b of bad) {
        const r = PF.evaluateTradingViewWebhookPreflight({
          env: baseEnv(), method: 'POST', body: b, nowMs: NOW_MS, receiptId: RECEIPT_ID
        });
        assert.strictEqual(r.ok, false, 'body ' + JSON.stringify(b));
        assert.strictEqual(r.reason, 'MALFORMED_REQUEST', 'body ' + JSON.stringify(b));
      }

      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, GOOD_TOKEN);
      const store = makeSpyStore();
      const out = await invokeEndpoint(EP, 'POST', { body: 'not json', store: store });
      assert.strictEqual(out.statusCode, 400);
      assert.strictEqual(out.body.reason, 'MALFORMED_REQUEST');
      assert.strictEqual(store.calls.length, 0);
    });

    // ── TV04 / TV05: secret missing / wrong ───────────────────────────────────
    await test('TV04: missing secret field -> UNAUTHORIZED', async function () {
      const payload = goodPayload();
      delete payload.secret;
      const r = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(payload), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, 'UNAUTHORIZED');
    });

    await test('TV05: wrong secret value (properly configured server token) -> UNAUTHORIZED', async function () {
      const r = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload({ secret: 'not-the-token' })), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, 'UNAUTHORIZED');

      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, GOOD_TOKEN);
      const store = makeSpyStore();
      const out = await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload({ secret: 'not-the-token' })), store: store });
      assert.strictEqual(out.statusCode, 401);
      assert.strictEqual(out.body.reason, 'UNAUTHORIZED');
      assert.strictEqual(store.calls.length, 0);
    });

    // ── TV06: valid request accepted ──────────────────────────────────────────
    await test('TV06: valid request (correct secret + valid payload, configured token) -> accepted', async function () {
      const r = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload()), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.event.symbol, 'AAPL');

      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, GOOD_TOKEN);
      const store = makeSpyStore();
      const out = await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload()), store: store });
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.status, 'OK');
      assert.strictEqual(typeof out.body.receiptId, 'string');
      assert.strictEqual(store.calls.length, 1, 'exactly one write on a valid request');
    });

    // ── TV07: secret never persisted or logged ────────────────────────────────
    await test('TV07: secret never appears in the persisted event or in any log output', async function () {
      const r = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload()), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(r.ok, true);
      assert.ok(!Object.prototype.hasOwnProperty.call(r.event, 'secret'), 'normalized event must not carry a secret field');
      assert.ok(JSON.stringify(r.event).indexOf(GOOD_TOKEN) === -1, 'secret value leaked into the serialized event');

      const logs = [];
      const _origLog = console.log;
      const _origError = console.error;
      console.log = function () { logs.push(Array.prototype.slice.call(arguments).join(' ')); };
      console.error = function () { logs.push(Array.prototype.slice.call(arguments).join(' ')); };
      try {
        setProcessEnv(GATE, 'true');
        setProcessEnv(TOKEN, GOOD_TOKEN);
        const store = makeSpyStore();
        await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload()), store: store });
      } finally {
        console.log = _origLog;
        console.error = _origError;
      }
      const joined = logs.join('\n');
      assert.ok(joined.indexOf(GOOD_TOKEN) === -1, 'secret value leaked into log output');
    });

    // ── TV08: missing/invalid required payload fields ─────────────────────────
    await test('TV08: missing/invalid symbol or alertType -> INVALID_PAYLOAD, distinct from auth failures', async function () {
      const cases = [
        goodPayload({ symbol: undefined }),
        goodPayload({ symbol: '' }),
        goodPayload({ symbol: 123 }),
        goodPayload({ alertType: undefined }),
        goodPayload({ alertType: '' }),
        goodPayload({ alertType: null })
      ];
      for (const payload of cases) {
        const r = PF.evaluateTradingViewWebhookPreflight({
          env: baseEnv(), method: 'POST', body: JSON.stringify(payload), nowMs: NOW_MS, receiptId: RECEIPT_ID
        });
        assert.strictEqual(r.ok, false, JSON.stringify(payload));
        assert.strictEqual(r.reason, 'INVALID_PAYLOAD', JSON.stringify(payload));
      }
    });

    // ── TV09: normalized event shape ──────────────────────────────────────────
    await test('TV09: normalized event shape is exact; receiptId independent of receivedAt; timestamp/price normalization', async function () {
      const r1 = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload()), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(r1.ok, true);
      assert.deepStrictEqual(
        Object.keys(r1.event).sort(),
        ['alertType', 'eventVersion', 'price', 'provider', 'receiptId', 'receivedAt', 'sourceTimestamp', 'symbol'].sort()
      );
      assert.strictEqual(r1.event.provider, 'tradingview');
      assert.strictEqual(r1.event.eventVersion, 1);
      assert.strictEqual(r1.event.price, null);
      assert.strictEqual(r1.event.sourceTimestamp, null);
      assert.strictEqual(r1.event.receiptId, RECEIPT_ID);
      assert.strictEqual(r1.event.receivedAt, new Date(NOW_MS).toISOString());
      assert.notStrictEqual(r1.event.receiptId, r1.event.receivedAt, 'receiptId must not be derived from receivedAt');

      // a valid-but-non-ISO timestamp is normalized to ISO-8601, not passed through
      const r2 = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(),
        method: 'POST',
        body: JSON.stringify(goodPayload({ sourceTimestamp: 'Tue, 01 Jan 2019 00:00:00 GMT', price: 123.45 })),
        nowMs: NOW_MS,
        receiptId: RECEIPT_ID
      });
      assert.strictEqual(r2.ok, true);
      assert.strictEqual(r2.event.sourceTimestamp, new Date('Tue, 01 Jan 2019 00:00:00 GMT').toISOString());
      assert.strictEqual(r2.event.price, 123.45);

      const invalidTs = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload({ sourceTimestamp: 'not-a-date' })), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(invalidTs.ok, false);
      assert.strictEqual(invalidTs.reason, 'INVALID_PAYLOAD');

      const invalidPrice = PF.evaluateTradingViewWebhookPreflight({
        env: baseEnv(), method: 'POST', body: JSON.stringify(goodPayload({ price: 'free' })), nowMs: NOW_MS, receiptId: RECEIPT_ID
      });
      assert.strictEqual(invalidPrice.ok, false);
      assert.strictEqual(invalidPrice.reason, 'INVALID_PAYLOAD');
    });

    // ── TV10: simulated storage failure ───────────────────────────────────────
    await test('TV10: simulated storage failure -> no success, no leaked internals, no second write, only the dedicated store adapter invoked', async function () {
      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, GOOD_TOKEN);
      const distinctiveInternalError = 'INTERNAL_BLOB_DRIVER_TRACE_xyz789';
      const store = makeFailingStore(distinctiveInternalError);
      const out = await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload()), store: store });

      assert.notStrictEqual(out.statusCode, 200, 'a storage failure must not return success');
      assert.strictEqual(out.body.status, 'SERVER_ERROR');
      assert.ok(JSON.stringify(out.body).indexOf(distinctiveInternalError) === -1, 'response leaked storage internals');
      assert.strictEqual(store.calls.length, 1, 'no second/alternate write attempted after the first failure');
      assert.strictEqual(store.calls[0].op, 'setJSON', 'only the dedicated store adapter (setJSON) was invoked');
    });

    // ── TV11: no mutation of any existing state / other store namespace ───────
    await test('TV11: no other existing store namespace or pt_* key is referenced by this module', async function () {
      const raw = fs.readFileSync(ENDPOINT_SRC, 'utf8');
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      assert.ok(!/\b(?:pt_results|pt_tickers|pt_holdings)\b/.test(code), 'pt_* storage key referenced');
      assert.ok(!/\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(code), 'scoring reference present');
      const getStoreCalls = code.match(/getStore\s*\(/g) || [];
      assert.strictEqual(getStoreCalls.length, 1, 'exactly one getStore( call expected');
      assert.ok(/getStore\(STORE_NAME\)/.test(code), 'getStore must be called with STORE_NAME only');
      assert.ok(/STORE_NAME\s*=\s*'tradingview-events-store'/.test(code), 'STORE_NAME must be the dedicated tradingview-events-store');

      // end-to-end: a valid request only ever calls setJSON on the injected store —
      // no other store/namespace is touched by the request path.
      const store = makeSpyStore();
      setProcessEnv(GATE, 'true');
      setProcessEnv(TOKEN, GOOD_TOKEN);
      await invokeEndpoint(EP, 'POST', { body: JSON.stringify(goodPayload()), store: store });
      assert.strictEqual(store.calls.length, 1);
      assert.strictEqual(store.calls[0].op, 'setJSON');
    });

    // ── preflight-module purity (comment-stripped scan) ───────────────────────
    await test('TV12: preflight module is static-pure (no process.env / require / I/O / store access)', async function () {
      const raw = fs.readFileSync(PREFLIGHT_SRC, 'utf8');
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      assert.ok(/module\.exports\s*=/.test(code), 'comment-strip removed code (export line missing)');
      assert.ok(!/process\.env/.test(code), 'process.env referenced');
      assert.ok(!/\brequire\s*\(/.test(code), 'require( present — module must be self-contained');
      assert.ok(!/\bfetch\s*\(/.test(code), 'fetch( present');
      assert.ok(!/globalThis\.fetch/.test(code), 'globalThis.fetch referenced');
      assert.ok(!/exports\.handler/.test(code), 'exports.handler present');
      assert.ok(!/@netlify\/blobs/.test(code), '@netlify/blobs referenced');
      assert.ok(!/getStore\s*\(/.test(code), 'getStore( called');
      assert.ok(!/\bcrypto\.randomUUID\s*\(/.test(code), 'crypto.randomUUID( called internally — must be injected');
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
    });
  } finally {
    globalThis.fetch = _origFetch;
    setProcessEnv(GATE, _origEnv[GATE]);
    setProcessEnv(TOKEN, _origEnv[TOKEN]);
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
