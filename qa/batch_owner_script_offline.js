'use strict';

/*
 * qa/batch_owner_script_offline.js
 *
 * EG-21D-1 — owner-run batch pull script offline proof (OS-series).
 *
 * Exercises tools/batch-pull-owner.js end to end through its exported
 * main(argv, io) seam: dry-run default (zero network, token never read),
 * fail-closed CONFIG/INPUT/EXTRACT stages with zero fetch, the live path via
 * an INJECTED fetch spy (sequential order, exact Bearer header, ledger +
 * writtenKeys verbatim, STOP semantics, synthetic TRANSPORT_ERROR wrap),
 * token hygiene, and a static forbidden-surface scan of the script source.
 *
 * Isolation (WR-series house pattern):
 *   - throwing globalThis.fetch guard: any real network is a hard error; the
 *     live path only ever sees the injected io.fetchImpl spy.
 *   - fixtures (doc/token files) live in a mkdtemp dir OUTSIDE the repo and
 *     are removed in finally.
 *   - requiring the script is side-effect free (require.main guard).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = require('../tools/batch-pull-owner');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_REL = 'tools/batch-pull-owner.js';
const DEFAULT_BASE = 'https://branch-dev--portfoliotrk.netlify.app';
const ROUTE = '/.netlify/functions/sec-evidence-pull';

function stripComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// ── fixtures ──────────────────────────────────────────────────────────────────
let tmpDir = null;

function fixture(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

function makeDoc(symbols) {
  const holdings = {};
  symbols.forEach(function (sym) {
    holdings[sym] = { symbol: sym, positionSize: 5 };
  });
  return { schemaVersion: 1, holdings: holdings };
}

function docFile(name, symbols) {
  return fixture(name, JSON.stringify(makeDoc(symbols)));
}

// n distinct letters-only symbols (supports n <= 52): TA..TZ, then TAA..TAZ.
function manyTickers(n) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out = [];
  for (let i = 0; i < n && i < 26; i++) { out.push('T' + letters[i]); }
  for (let i = 26; i < n; i++) { out.push('TA' + letters[i - 26]); }
  return out;
}

// ── io harness ────────────────────────────────────────────────────────────────
function makeSink() {
  const chunks = [];
  return {
    write: function (s) { chunks.push(String(s)); },
    text: function () { return chunks.join(''); }
  };
}

function throwingFetch() {
  throw new Error('INJECTED_FETCH_MUST_NOT_RUN');
}

async function run(argv, fetchImpl) {
  const stdout = makeSink();
  const stderr = makeSink();
  const r = await script.main(argv, {
    fetchImpl: fetchImpl || throwingFetch,
    stdout: stdout,
    stderr: stderr
  });
  return { exitCode: r.exitCode, result: r.result, stdout: stdout.text(), stderr: stderr.text() };
}

// Scripted fetch spy: script is (callIndex, url, options) -> Response-like,
// or an array consumed in call order. `{ throw: true }` throws (FETCH_FAILED).
function makeFetchSpy(scriptFn) {
  const spy = { calls: [] };
  spy.fn = async function (url, options) {
    spy.calls.push({ url: url, options: options });
    const r = typeof scriptFn === 'function' ? scriptFn(spy.calls.length, url, options) : scriptFn[spy.calls.length - 1];
    if (r && r.throw === true) { throw new Error('NETWORK_DOWN'); }
    return r;
  };
  return spy;
}

function jsonResponse(status, body) {
  return { status: status, json: async function () { return body; } };
}

function nonJsonResponse(status) {
  return { status: status, json: async function () { throw new Error('body is not JSON'); } };
}

const KEYS = {
  ZALPHA: ['secstore:v1:company:0001000021', 'secstore:v1:cik:ZALPHA'],
  ZBRAVO: ['secstore:v1:company:0001000022', 'secstore:v1:cik:ZBRAVO'],
  ZCHARL: ['secstore:v1:company:0001000023', 'secstore:v1:cik:ZCHARL']
};
const CIKS = { ZALPHA: '0001000021', ZBRAVO: '0001000022', ZCHARL: '0001000023' };

function writeResponseFor(ticker) {
  return jsonResponse(200, { status: 'WRITE', ticker: ticker, cik: CIKS[ticker], itemCount: 3, writtenKeys: KEYS[ticker] });
}

// ── tiny runner (mirrors qa/batch_pull_wiring_offline.js) ─────────────────────
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
  process.stdout.write('\n=== EG-21D-1 — owner batch pull script proof (offline) ===\n\n');

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg21d-os-'));

  try {
    await test('OS01: dry-run happy path -> stage PLAN, sorted tickers, exit 0, zero fetch', async function () {
      const doc = docFile('os01.json', ['ZCHARL', 'ZALPHA', 'ZBRAVO']); // deliberately unsorted insertion
      const r = await run(['--doc', doc]);
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.result.ok, true);
      assert.strictEqual(r.result.stage, 'PLAN');
      assert.strictEqual(r.result.dryRun, true);
      assert.strictEqual(r.result.count, 3);
      assert.deepStrictEqual(r.result.tickers, ['ZALPHA', 'ZBRAVO', 'ZCHARL'], 'extractor sorted order');
      assert.strictEqual(r.result.base, DEFAULT_BASE);
      assert.ok(r.result.request.indexOf('POST ' + ROUTE) === 0, 'request line names the exact route');
      assert.ok(r.stdout.indexOf('"PLAN"') !== -1, 'plan printed to stdout');
    });

    await test('OS02: dry-run never touches the token file (nonexistent path still succeeds)', async function () {
      const doc = docFile('os02.json', ['ZALPHA']);
      const r = await run(['--doc', doc, '--token-file', path.join(tmpDir, 'does-not-exist.token')]);
      assert.strictEqual(r.exitCode, 0, 'a token-file read would have failed this run');
      assert.strictEqual(r.result.stage, 'PLAN');
    });

    await test('OS03: live token config fail-closed (missing flag / unreadable / empty), zero fetch', async function () {
      const doc = docFile('os03.json', ['ZALPHA']);
      const missing = await run(['--doc', doc, '--live']);
      assert.deepStrictEqual(missing.result, { ok: false, stage: 'CONFIG', reason: 'TOKEN_FILE_MISSING' });
      assert.strictEqual(missing.exitCode, 1);
      const unreadable = await run(['--doc', doc, '--live', '--token-file', path.join(tmpDir, 'nope.token')]);
      assert.deepStrictEqual(unreadable.result, { ok: false, stage: 'CONFIG', reason: 'TOKEN_FILE_UNREADABLE' });
      assert.strictEqual(unreadable.exitCode, 1);
      const empty = await run(['--doc', doc, '--live', '--token-file', fixture('empty.token', '\n')]);
      assert.deepStrictEqual(empty.result, { ok: false, stage: 'CONFIG', reason: 'TOKEN_EMPTY' });
      assert.strictEqual(empty.exitCode, 1);
    });

    await test('OS04: production / non-https / garbage base rejected before any work', async function () {
      const doc = docFile('os04.json', ['ZALPHA']);
      const prod = await run(['--doc', doc, '--base', 'https://portfoliotrk.netlify.app']);
      assert.deepStrictEqual(prod.result, { ok: false, stage: 'CONFIG', reason: 'PROD_TARGET_FORBIDDEN' });
      assert.strictEqual(prod.exitCode, 1);
      const prodDot = await run(['--doc', doc, '--base', 'https://portfoliotrk.netlify.app.']);
      assert.deepStrictEqual(prodDot.result, { ok: false, stage: 'CONFIG', reason: 'PROD_TARGET_FORBIDDEN' },
        'trailing-dot hostname must not bypass the production rejection');
      assert.strictEqual(prodDot.exitCode, 1);
      const prodDots = await run(['--doc', doc, '--base', 'https://portfoliotrk.netlify.app..']);
      assert.deepStrictEqual(prodDots.result, { ok: false, stage: 'CONFIG', reason: 'PROD_TARGET_FORBIDDEN' },
        'multiple trailing dots must not bypass the production rejection');
      const http = await run(['--doc', doc, '--base', 'http://branch-dev--portfoliotrk.netlify.app']);
      assert.deepStrictEqual(http.result, { ok: false, stage: 'CONFIG', reason: 'BASE_URL_INVALID' });
      const garbage = await run(['--doc', doc, '--base', 'not a url']);
      assert.deepStrictEqual(garbage.result, { ok: false, stage: 'CONFIG', reason: 'BASE_URL_INVALID' });
      const unknown = await run(['--doc', doc, '--frobnicate']);
      assert.deepStrictEqual(unknown.result, { ok: false, stage: 'CONFIG', reason: 'UNKNOWN_FLAG' });
      const noDoc = await run([]);
      assert.deepStrictEqual(noDoc.result, { ok: false, stage: 'CONFIG', reason: 'DOC_FLAG_MISSING' });
      const noValue = await run(['--doc']);
      assert.deepStrictEqual(noValue.result, { ok: false, stage: 'CONFIG', reason: 'FLAG_VALUE_MISSING' });
    });

    await test('OS05: doc failures fail closed with zero fetch (envelope hint, extract family, INPUT family)', async function () {
      const envelope = await run(['--doc', fixture('env.json', JSON.stringify({ status: 'OK', doc: makeDoc(['ZALPHA']) }))]);
      assert.deepStrictEqual(envelope.result, { ok: false, stage: 'EXTRACT', reason: 'RAW_ENVELOPE', ledger: [] });
      assert.strictEqual(envelope.exitCode, 1);
      assert.ok(envelope.stderr.indexOf('save only the .doc member') !== -1, 'educational hint printed');
      const empty = await run(['--doc', fixture('empty.json', JSON.stringify({ schemaVersion: 1, holdings: {} }))]);
      assert.deepStrictEqual(empty.result, { ok: false, stage: 'EXTRACT', reason: 'TICKERS_EMPTY', ledger: [] });
      const tooMany = await run(['--doc', docFile('many.json', manyTickers(26))]);
      assert.deepStrictEqual(tooMany.result, { ok: false, stage: 'EXTRACT', reason: 'TICKERS_TOO_MANY', ledger: [] });
      const lower = await run(['--doc', docFile('lower.json', ['ZALPHA', 'zbad'])]);
      assert.deepStrictEqual(lower.result, { ok: false, stage: 'EXTRACT', reason: 'TICKER_INVALID', ledger: [] });
      const missing = await run(['--doc', path.join(tmpDir, 'no-such-doc.json')]);
      assert.deepStrictEqual(missing.result, { ok: false, stage: 'INPUT', reason: 'DOC_FILE_NOT_FOUND' });
      const garbage = await run(['--doc', fixture('garbage.json', '{ not json')]);
      assert.deepStrictEqual(garbage.result, { ok: false, stage: 'INPUT', reason: 'DOC_JSON_INVALID' });
    });

    const TOKEN = 'pull-token-os-9999';
    let liveOutputs = '';

    await test('OS06: live happy path via injected spy -> sequential POSTs, exact Bearer, ledger verbatim, exit 0', async function () {
      const doc = docFile('os06.json', ['ZCHARL', 'ZALPHA', 'ZBRAVO']);
      const tokenFile = fixture('os06.token', TOKEN + '\n'); // trailing newline stripped, nothing else
      const spy = makeFetchSpy(function (n, url, options) {
        return writeResponseFor(JSON.parse(options.body).ticker);
      });
      const r = await run(['--doc', doc, '--live', '--token-file', tokenFile], spy.fn);
      liveOutputs += r.stdout + r.stderr + JSON.stringify(r.result);
      assert.strictEqual(r.exitCode, 0);
      assert.strictEqual(r.result.stage, 'BATCH');
      assert.strictEqual(r.result.ok, true);
      assert.strictEqual(r.result.complete, true);
      assert.strictEqual(spy.calls.length, 3, 'one POST per ticker');
      const tickersCalled = spy.calls.map(function (c) { return JSON.parse(c.options.body).ticker; });
      assert.deepStrictEqual(tickersCalled, ['ZALPHA', 'ZBRAVO', 'ZCHARL'], 'sequential extractor-sorted order');
      spy.calls.forEach(function (c) {
        assert.strictEqual(c.url, DEFAULT_BASE + ROUTE, 'exact branch-dev route');
        assert.strictEqual(c.options.method, 'POST');
        assert.strictEqual(c.options.headers.authorization, 'Bearer ' + TOKEN, 'exact-token Bearer (newline stripped)');
        assert.strictEqual(c.options.headers['content-type'], 'application/json');
      });
      assert.strictEqual(r.result.ledger.length, 3);
      r.result.ledger.forEach(function (e) {
        assert.strictEqual(e.status, 'WRITE');
        assert.deepStrictEqual(e.writtenKeys, KEYS[e.ticker], e.ticker + ' writtenKeys verbatim');
      });
      assert.ok(r.stdout.indexOf('ZALPHA 200 WRITE writtenKeys=') !== -1, 'per-ticker progress line');
    });

    await test('OS07: STOP semantics -> stoppedAt echoed verbatim, later ticker never fetched, exit 2', async function () {
      const doc = docFile('os07.json', ['ZCHARL', 'ZALPHA', 'ZBRAVO']); // sorted: ZALPHA, ZBRAVO, ZCHARL
      const tokenFile = fixture('os07.token', TOKEN);
      const spy = makeFetchSpy(function (n, url, options) {
        if (n === 1) { return writeResponseFor(JSON.parse(options.body).ticker); }
        if (n === 2) { return jsonResponse(502, { status: 'ERROR', reason: 'PROVIDER_FAILURE' }); }
        throw new Error('THIRD_CALL_MUST_NOT_RUN');
      });
      const r = await run(['--doc', doc, '--live', '--token-file', tokenFile], spy.fn);
      liveOutputs += r.stdout + r.stderr + JSON.stringify(r.result);
      assert.strictEqual(r.exitCode, 2);
      assert.strictEqual(r.result.stage, 'BATCH');
      assert.strictEqual(r.result.ok, true);
      assert.strictEqual(r.result.complete, false);
      assert.strictEqual(r.result.stoppedAt, 'ZBRAVO');
      assert.strictEqual(r.result.stopStatus, 'ERROR');
      assert.strictEqual(r.result.stopReason, 'PROVIDER_FAILURE');
      assert.strictEqual(spy.calls.length, 2, 'ZCHARL never called after the stop');
      assert.strictEqual(r.result.ledger.length, 2);
      assert.deepStrictEqual(r.result.ledger[0].writtenKeys, KEYS.ZALPHA, 'completed WRITE keys survive the stop');
    });

    await test('OS08: transport wrap -> synthetic TRANSPORT_ERROR STOP with ledger intact (throw + non-JSON)', async function () {
      const doc = docFile('os08.json', ['ZALPHA', 'ZBRAVO']);
      const tokenFile = fixture('os08.token', TOKEN);
      const threw = makeFetchSpy([writeResponseFor('ZALPHA'), { throw: true }]);
      const r1 = await run(['--doc', doc, '--live', '--token-file', tokenFile], threw.fn);
      liveOutputs += r1.stdout + r1.stderr + JSON.stringify(r1.result);
      assert.strictEqual(r1.exitCode, 2);
      assert.strictEqual(r1.result.complete, false);
      assert.strictEqual(r1.result.stoppedAt, 'ZBRAVO');
      assert.strictEqual(r1.result.stopStatus, 'TRANSPORT_ERROR');
      assert.strictEqual(r1.result.stopReason, 'FETCH_FAILED');
      assert.strictEqual(r1.result.ledger.length, 2, 'ledger intact — not lost to the exception');
      assert.deepStrictEqual(r1.result.ledger[0].writtenKeys, KEYS.ZALPHA);
      assert.strictEqual(r1.result.ledger[1].statusCode, null);
      const notJson = makeFetchSpy([nonJsonResponse(200)]);
      const r2 = await run(['--doc', docFile('os08b.json', ['ZALPHA']), '--live', '--token-file', tokenFile], notJson.fn);
      liveOutputs += r2.stdout + r2.stderr + JSON.stringify(r2.result);
      assert.strictEqual(r2.exitCode, 2);
      assert.strictEqual(r2.result.stopStatus, 'TRANSPORT_ERROR');
      assert.strictEqual(r2.result.stopReason, 'BODY_NOT_JSON');
    });

    await test('OS09: token never appears in any captured stdout/stderr/result across the live runs', function () {
      assert.ok(liveOutputs.length > 0, 'live outputs were captured');
      assert.strictEqual(liveOutputs.indexOf(TOKEN), -1, 'token must never be printed or echoed');
    });

    await test('OS10: static scan — no env/blobs/storage/route; require-allowlist; guards and literals present', function () {
      const raw = fs.readFileSync(path.join(ROOT, SCRIPT_REL), 'utf8');
      const code = stripComments(raw);
      assert.ok(!/process\.env/.test(code), 'no process.env');
      assert.ok(!/@netlify\/blobs|getStore/.test(code), 'no blobs handle / getStore');
      assert.ok(!/localStorage|sessionStorage/.test(code), 'no web storage');
      assert.ok(!/exports\.handler|export\s+default|export\s+const\s+config|withLambda/.test(code), 'no route/handler export');
      assert.ok(!/\bimport\s/.test(code), 'no ESM import');
      const allow = ['fs', 'path',
        '../netlify/functions/lib/portfolio-ticker-source',
        '../netlify/functions/lib/batch-pull-driver'];
      const requireRe = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
      let m;
      let sawExtractor = false;
      let sawDriver = false;
      while ((m = requireRe.exec(code)) !== null) {
        assert.ok(allow.indexOf(m[2]) !== -1, 'require outside allowlist: ' + m[2]);
        if (m[2] === allow[2]) { sawExtractor = true; }
        if (m[2] === allow[3]) { sawDriver = true; }
      }
      assert.ok(sawExtractor && sawDriver, 'composes both shipped libs');
      assert.ok(/require\.main === module/.test(code), 'require.main guard present');
      assert.ok(raw.indexOf("'" + DEFAULT_BASE + "'") !== -1, 'default branch-dev base literal present');
      const prodLiterals = code.match(/(['"])portfoliotrk\.netlify\.app\1/g) || [];
      assert.strictEqual(prodLiterals.length, 1, 'production hostname literal appears only as the rejection constant');
      assert.strictEqual((code.match(/module\.exports/g) || []).length, 1, 'exactly one module.exports');
      assert.ok(/'use strict'/.test(raw), 'use strict present');
    });

    await test('OS11: zero real global.fetch across the suite', function () {
      assert.strictEqual(realFetchCalls, 0, 'the real globalThis.fetch must never be called');
    });
  } finally {
    globalThis.fetch = _origFetch;
    if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
