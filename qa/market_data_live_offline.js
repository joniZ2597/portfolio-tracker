'use strict';

/*
 * qa/market_data_live_offline.js
 *
 * market-data-1 (BACKLOG entry 20, work/market-data-1/brief.md): live portfolio prices are Yahoo-only and bounded by an hourly server
 * budget. Offline: the handler runs in-process against an injected global `fetch` spy (a request to any host other than the two
 * known providers throws, so no live call is possible), an in-memory store and an injected clock.
 *
 *   ML-1..ML-6   Slice 1 - provider policy: portfolio-live never reaches Polygon; the scan path (absent purpose / purpose=scan) is unchanged.
 *   Planted negatives mutate the PRODUCTION source (a temp copy; every anchor must occur exactly once) and must flip a scenario that
 *   the real source passes.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'netlify', 'functions', 'market-data.js');
const LIB_PATH = path.join(ROOT, 'netlify', 'functions', 'lib', 'market-data-live-budget.js');

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

// ── the handler under test ───────────────────────────────────────────────────────────────
function loadFresh(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

const TMP_DIRS = [];
// A mutated copy of the production handler (and of the budget lib, when it exists) in a private temp dir.
function mutantHandler(label, replacements) {
  let src = fs.readFileSync(HANDLER_PATH, 'utf8').replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 90));
    src = src.replace(find, () => replace);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptmd-mut-'));
  TMP_DIRS.push(dir);
  fs.writeFileSync(path.join(dir, 'market-data.js'), src);
  if (fs.existsSync(LIB_PATH)) {
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.writeFileSync(path.join(dir, 'lib', 'market-data-live-budget.js'), fs.readFileSync(LIB_PATH, 'utf8'));
  }
  return loadFresh(path.join(dir, 'market-data.js'));
}

// ── fetch spy ────────────────────────────────────────────────────────────────────────────
const YAHOO_CHART = {
  chart: {
    result: [{
      meta: { symbol: 'AAPL', regularMarketPrice: 190, chartPreviousClose: 188 },
      timestamp: [1700000000, 1700086400],
      indicators: { quote: [{ open: [1, 2], high: [2, 3], low: [1, 2], close: [188, 190], volume: [10, 20] }] }
    }],
    error: null
  }
};
const POLYGON_BARS = {
  status: 'OK',
  results: [
    { t: 1700000000000, o: 1, h: 2, l: 1, c: 188, v: 10 },
    { t: 1700086400000, o: 2, h: 3, l: 2, c: 190, v: 20 }
  ]
};
function jsonResponse(ok, status, body) { return { ok, status, json: async () => body }; }

// plan: { yahoo: 'ok' | 'fail', polygon: 'ok' | 'fail', onCall?: (host) => void }
function makeFetch(plan) {
  const calls = [];
  const f = async function (url) {
    const u = String(url);
    let host = 'unknown';
    if (u.indexOf('https://query1.finance.yahoo.com/') === 0) host = u.indexOf('includePrePost=true') !== -1 ? 'yahoo-intraday' : 'yahoo';
    else if (u.indexOf('https://api.polygon.io/') === 0) host = 'polygon';
    calls.push({ host, url: u });
    if (typeof plan.onCall === 'function') plan.onCall(host);
    if (host === 'unknown') throw new Error('unexpected upstream request: ' + u);
    if (host === 'polygon') return plan.polygon === 'ok' ? jsonResponse(true, 200, POLYGON_BARS) : jsonResponse(false, 500, {});
    if (host === 'yahoo-intraday') return jsonResponse(true, 200, { chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
    return plan.yahoo === 'ok' ? jsonResponse(true, 200, JSON.parse(JSON.stringify(YAHOO_CHART))) : jsonResponse(false, 500, {});
  };
  f.calls = calls;
  f.count = (host) => calls.filter((c) => c.host === host).length;
  return f;
}

// Runs the handler with the given environment, fetch spy, store and clock. env value null = unset.
async function callHandler(mod, query, opts) {
  const o = opts || {};
  const env = Object.assign({ POLYGON_API_KEY: 'test-polygon-key', PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER: 'true' }, o.env || {});
  const savedEnv = {};
  for (const k of Object.keys(env)) {
    savedEnv[k] = process.env[k];
    if (env[k] === null) delete process.env[k]; else process.env[k] = env[k];
  }
  const savedFetch = global.fetch;
  const savedConsole = { log: console.log, warn: console.warn, error: console.error };
  global.fetch = o.fetch || makeFetch({ yahoo: 'ok', polygon: 'ok' });
  console.log = console.warn = console.error = function () {};
  const event = { queryStringParameters: query, multiValueQueryStringParameters: o.multi || {} };
  if (o.store) event._testStore = o.store;
  if (o.clock) event._testClock = o.clock;
  try {
    const r = await mod.handler(event);
    return { statusCode: r.statusCode, body: JSON.parse(r.body) };
  } finally {
    Object.assign(console, savedConsole);
    global.fetch = savedFetch;
    for (const k of Object.keys(savedEnv)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
}

// ── the existing G-L envelopes, pinned literally (ML-5 / ML-6) ───────────────────────────
const ENV_DISABLED = { status: 'DISABLED', reason: 'SERVER_DISABLED', detail: 'portfolio live prices disabled on this deployment; no upstream request made.', errors: ['SERVER_DISABLED'] };
const ENV_INVALID = { status: 'ERROR', reason: 'INVALID_PURPOSE', detail: 'invalid request purpose', errors: ['INVALID_PURPOSE'] };
const ENV_AMBIGUOUS = { status: 'ERROR', reason: 'AMBIGUOUS_PURPOSE', detail: 'ambiguous request purpose', errors: ['AMBIGUOUS_PURPOSE'] };

// ── scenarios: each returns true when the invariant holds, otherwise a short description of the violation ──
async function scanDailyOrder(mod) {
  const f = makeFetch({ yahoo: 'fail', polygon: 'ok' });
  const r = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range: '5d' }, { fetch: f });
  if (f.calls.length === 0 || f.calls[0].host !== 'yahoo') return 'the first request was not Yahoo: ' + JSON.stringify(f.calls.map((c) => c.host));
  const firstPolygon = f.calls.findIndex((c) => c.host === 'polygon');
  const lastYahoo = f.calls.map((c) => c.host.indexOf('yahoo') === 0).lastIndexOf(true);
  if (firstPolygon === -1) return 'Polygon was never tried after Yahoo failed';
  if (firstPolygon < lastYahoo) return 'Polygon was tried before Yahoo finished';
  if (f.count('polygon') !== 1) return 'expected one Polygon request, saw ' + f.count('polygon');
  if (r.statusCode !== 200 || !r.body.chart || r.body.chart.result[0].meta._provider !== 'polygon') return 'the Polygon fallback response was not returned: ' + r.statusCode;
  return true;
}
async function scanHistoricalOrder(mod) {
  const f = makeFetch({ yahoo: 'ok', polygon: 'fail' });
  const r = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range: '1y' }, { fetch: f });
  if (f.calls.length < 2 || f.calls[0].host !== 'polygon') return 'the first request was not Polygon: ' + JSON.stringify(f.calls.map((c) => c.host));
  if (f.calls[1].host !== 'yahoo') return 'Yahoo did not follow the failed Polygon request';
  if (r.statusCode !== 200) return 'expected the Yahoo fallback response, got ' + r.statusCode;
  return true;
}
async function liveDailyYahooOnly(mod) {
  const f = makeFetch({ yahoo: 'fail', polygon: 'ok' });
  const r = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: 'portfolio-live' }, { fetch: f });
  if (f.count('polygon') !== 0) return 'Polygon was requested ' + f.count('polygon') + ' time(s) for portfolio-live';
  if (r.statusCode !== 502) return 'expected 502, got ' + r.statusCode;
  if (r.body.error !== 'All providers failed for AAPL range=5d') return 'unexpected error body: ' + JSON.stringify(r.body);
  return true;
}
async function liveHistoricalYahooOnly(mod) {
  const ok = makeFetch({ yahoo: 'ok', polygon: 'ok' });
  const r1 = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range: '1y', purpose: 'portfolio-live' }, { fetch: ok });
  if (ok.count('polygon') !== 0) return 'Polygon was requested for portfolio-live historical (Yahoo ok)';
  if (r1.statusCode !== 200 || r1.body.chart.result[0].meta._provider !== 'yahoo') return 'expected the Yahoo response stamped provider yahoo, got ' + r1.statusCode;
  const bad = makeFetch({ yahoo: 'fail', polygon: 'ok' });
  const r2 = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range: '1y', purpose: 'portfolio-live' }, { fetch: bad });
  if (bad.count('polygon') !== 0) return 'Polygon was requested for portfolio-live historical (Yahoo failed)';
  if (r2.statusCode !== 502 || r2.body.error !== 'All providers failed for AAPL: Yahoo HTTP 500') return 'unexpected failure response: ' + r2.statusCode + ' ' + JSON.stringify(r2.body);
  return true;
}

// ── Slice 1 rows ─────────────────────────────────────────────────────────────────────────
test('ML-1 scan daily range: Yahoo first, then Polygon on a Yahoo failure (recorded call order), unchanged', async () => {
  const real = loadFresh(HANDLER_PATH);
  assert.strictEqual(await scanDailyOrder(real), true);
  // purpose=scan behaves exactly like an absent purpose
  const f = makeFetch({ yahoo: 'fail', polygon: 'ok' });
  const r = await callHandler(real, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: 'scan' }, { fetch: f });
  assert.ok(f.calls[0].host === 'yahoo' && f.count('polygon') === 1 && r.statusCode === 200, 'purpose=scan: ' + JSON.stringify(f.calls.map((c) => c.host)));
});
test('ML-2 scan historical range: Polygon first, then Yahoo, unchanged', async () => {
  const real = loadFresh(HANDLER_PATH);
  assert.strictEqual(await scanHistoricalOrder(real), true);
});
test('ML-3 portfolio-live daily range: Yahoo fails -> the existing 502 body and zero Polygon requests', async () => {
  assert.strictEqual(await liveDailyYahooOnly(loadFresh(HANDLER_PATH)), true);
});
test('ML-4 portfolio-live historical range: Yahoo only (stamped provider yahoo), zero Polygon requests whether Yahoo succeeds or fails', async () => {
  assert.strictEqual(await liveHistoricalYahooOnly(loadFresh(HANDLER_PATH)), true);
});
test('ML-5 server gate off -> the typed SERVER_DISABLED envelope and zero upstream requests (existing behaviour pinned)', async () => {
  const real = loadFresh(HANDLER_PATH);
  for (const gate of [null, '', 'false', 'TRUE', '1']) {
    const f = makeFetch({ yahoo: 'ok', polygon: 'ok' });
    const r = await callHandler(real, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: 'portfolio-live' }, { fetch: f, env: { PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER: gate } });
    assert.strictEqual(r.statusCode, 200, 'gate ' + JSON.stringify(gate));
    assert.deepStrictEqual(r.body, ENV_DISABLED, 'gate ' + JSON.stringify(gate));
    assert.strictEqual(f.calls.length, 0, 'zero upstream requests with the gate ' + JSON.stringify(gate));
  }
});
test('ML-6 INVALID / AMBIGUOUS purpose envelopes unchanged, with zero upstream requests', async () => {
  const real = loadFresh(HANDLER_PATH);
  for (const bad of ['nope', '', 'Portfolio-Live', 'scan ']) {
    const f = makeFetch({ yahoo: 'ok', polygon: 'ok' });
    const r = await callHandler(real, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: bad }, { fetch: f });
    assert.strictEqual(r.statusCode, 400, 'purpose ' + JSON.stringify(bad));
    assert.deepStrictEqual(r.body, ENV_INVALID, 'purpose ' + JSON.stringify(bad));
    assert.strictEqual(f.calls.length, 0);
  }
  const f2 = makeFetch({ yahoo: 'ok', polygon: 'ok' });
  const amb = await callHandler(real, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: 'scan' }, { fetch: f2, multi: { purpose: ['scan', 'portfolio-live'] } });
  assert.strictEqual(amb.statusCode, 400);
  assert.deepStrictEqual(amb.body, ENV_AMBIGUOUS);
  assert.strictEqual(f2.calls.length, 0);
});

test('ML-7 portfolio-live reaches Polygon on no range and with the key set or unset; scan with the key unset stays Yahoo-only', async () => {
  const real = loadFresh(HANDLER_PATH);
  for (const range of ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']) {
    for (const key of ['test-polygon-key', null]) {
      for (const yahoo of ['ok', 'fail']) {
        const f = makeFetch({ yahoo, polygon: 'ok' });
        const r = await callHandler(real, { symbol: 'AAPL', interval: '1d', range, purpose: 'portfolio-live' }, { fetch: f, env: { POLYGON_API_KEY: key } });
        assert.strictEqual(f.count('polygon'), 0, 'portfolio-live range ' + range + ' key ' + key + ' yahoo ' + yahoo);
        assert.strictEqual(r.statusCode, yahoo === 'ok' ? 200 : 502, 'portfolio-live range ' + range + ' yahoo ' + yahoo);
      }
    }
  }
  const f = makeFetch({ yahoo: 'fail', polygon: 'ok' });
  const r = await callHandler(real, { symbol: 'AAPL', interval: '1d', range: '5d' }, { fetch: f, env: { POLYGON_API_KEY: null } });
  assert.strictEqual(f.count('polygon'), 0, 'scan without a Polygon key never requests Polygon');
  assert.strictEqual(r.statusCode, 502);
});

// ── Slice 1 planted negatives (production source mutated; the real source passes the same scenario) ──
test('ML-N1 negative: Polygon re-enabled for portfolio-live -> ML-3 / ML-4 are violated', async () => {
  assert.strictEqual(await liveDailyYahooOnly(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  assert.strictEqual(await liveHistoricalYahooOnly(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('polygon re-enabled', [["const polygonAllowed = polygonKey !== '' && purpose !== 'portfolio-live';", "const polygonAllowed = polygonKey !== '';"]]);
  assert.notStrictEqual(await liveDailyYahooOnly(mut), true, 'daily: the mutant must reach Polygon');
  assert.notStrictEqual(await liveHistoricalYahooOnly(mut), true, 'historical: the mutant must reach Polygon');
});
test('ML-N2 negative: the scan order changed (historical goes Yahoo-first) -> ML-2 is violated', async () => {
  assert.strictEqual(await scanHistoricalOrder(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('scan order changed', [["const isDailyPriceRange = range === '1d' || range === '5d';", 'const isDailyPriceRange = true;']]);
  assert.notStrictEqual(await scanHistoricalOrder(mut), true, 'the mutant must violate the Polygon-first historical order');
});

// ── run, then clean ──────────────────────────────────────────────────────────────────────
(async () => {
  for (const t of pending) {
    try { await t.fn(); passed += 1; } catch (e) { failed += 1; failures.push(t.name + ' -- ' + (e && e.message ? e.message : String(e))); }
  }
  for (const d of TMP_DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
  if (failed > 0) {
    for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
    process.stdout.write('\nOFFLINE VALIDATION (market-data live): FAIL (' + failed + '/' + (passed + failed) + ')\n');
    process.exit(1);
  }
  process.stdout.write('  PASS  ' + passed + ' market-data live assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (market-data live): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
})();
