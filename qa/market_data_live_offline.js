'use strict';

/*
 * qa/market_data_live_offline.js
 *
 * market-data-1 (BACKLOG entry 20, work/market-data-1/brief.md): live portfolio prices are Yahoo-only and bounded by an hourly server
 * budget. Offline: the handler runs in-process against an injected global `fetch` spy (a request to any host other than the two
 * known providers throws, so no live call is possible), an in-memory store and an injected clock.
 *
 *   ML-1..ML-7   Slice 1 - provider policy: portfolio-live never reaches Polygon; the scan path (absent purpose / purpose=scan) is unchanged.
 *   LB-1..LB-5   Slice 2 - the budget lib (pure, injected store and clock): 300 units per UTC hour, fail closed.
 *   MB-1..MB-8   Slice 2 - the handler wiring: typed HTTP 429 BUDGET_EXHAUSTED before any upstream call, the scan path never touches the store.
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
function applyOnce(label, text, replacements) {
  let src = text.replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 90));
    src = src.replace(find, () => replace);
  }
  return src;
}
function mutantHandler(label, handlerReps, libReps) {
  const src = applyOnce(label, fs.readFileSync(HANDLER_PATH, 'utf8'), handlerReps || []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptmd-mut-'));
  TMP_DIRS.push(dir);
  fs.writeFileSync(path.join(dir, 'market-data.js'), src);
  if (fs.existsSync(LIB_PATH)) {
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.writeFileSync(path.join(dir, 'lib', 'market-data-live-budget.js'), applyOnce(label + ' (lib)', fs.readFileSync(LIB_PATH, 'utf8'), libReps || []));
  } else {
    assert.ok(!libReps || libReps.length === 0, 'mutant "' + label + '": the budget lib does not exist');
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
  // portfolio-live takes a budget unit before any upstream call: unless a row says otherwise it gets a fresh in-memory store
  // (o.noStore = true leaves the real storage package in place, which cannot open a store offline).
  if (o.store) event._testStore = o.store;
  else if (!o.noStore && query.purpose === 'portfolio-live') event._testStore = makeStore();
  if (o.clock) event._testClock = o.clock;
  if (o.event) Object.assign(event, o.event);
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

// ═══════════════ Slice 2: the hourly budget (lib rows LB, handler rows MB) ═══════════════
const EXHAUSTED = { status: 'ERROR', reason: 'BUDGET_EXHAUSTED', detail: 'portfolio live price budget exhausted for this hour; no upstream request made.', errors: ['BUDGET_EXHAUSTED'] };
// 2026-10-12 is a Monday and New York is on EDT (UTC-4): 12:00Z = 08:00 ET PRE, 15:00Z = 11:00 ET REGULAR, 21:00Z = 17:00 ET POST, 03:00Z = 23:00 ET CLOSED.
const T = { PRE: '2026-10-12T12:00:00.000Z', REGULAR: '2026-10-12T15:00:00.000Z', POST: '2026-10-12T21:00:00.000Z', CLOSED: '2026-10-12T03:00:00.000Z' };
const KEY = (iso) => 'md:live-budget:' + iso.slice(0, 13);
const clockAt = (iso) => ({ nowMs: Date.parse(iso) });
const LIVE_Q = (range) => ({ symbol: 'AAPL', interval: '1d', range: range || '5d', purpose: 'portfolio-live' });
// In-memory store: opts.failGet / opts.failSet plant a store error; opts.log shares one event log with the fetch spy.
function makeStore(opts) {
  const o = opts || {};
  const data = new Map();
  const log = o.log || [];
  return {
    data,
    log,
    async get(key) { log.push('store.get'); if (o.failGet) throw new Error('planted store get failure'); return data.has(key) ? data.get(key) : null; },
    async set(key, value) { log.push('store.set'); if (o.failSet) throw new Error('planted store set failure'); data.set(key, String(value)); }
  };
}
const okFetch = () => makeFetch({ yahoo: 'ok', polygon: 'ok' });
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// scenarios (true when the invariant holds, otherwise a description of the violation)
async function budgetBoundary(mod, range) {
  const store = makeStore();
  store.data.set(KEY(T.REGULAR), '299');
  const a = await callHandler(mod, LIVE_Q(range), { fetch: okFetch(), store, clock: clockAt(T.REGULAR) });
  if (a.statusCode !== 200) return range + ': the 300th unit was refused (' + a.statusCode + ')';
  if (store.data.get(KEY(T.REGULAR)) !== '300') return range + ': counter is ' + store.data.get(KEY(T.REGULAR)) + ', expected 300';
  const f = okFetch();
  const b = await callHandler(mod, LIVE_Q(range), { fetch: f, store, clock: clockAt(T.REGULAR) });
  if (b.statusCode !== 429 || !sameJson(b.body, EXHAUSTED)) return range + ': the 301st unit was not answered with the 429 envelope: ' + b.statusCode + ' ' + JSON.stringify(b.body);
  if (f.calls.length !== 0) return range + ': ' + f.calls.length + ' upstream request(s) after exhaustion';
  if (store.data.get(KEY(T.REGULAR)) !== '300') return range + ': a refused request changed the counter';
  return true;
}
async function newHourNewKey(mod) {
  const store = makeStore();
  store.data.set(KEY(T.REGULAR), '300');
  const a = await callHandler(mod, LIVE_Q('1y'), { fetch: okFetch(), store, clock: clockAt(T.REGULAR) });
  if (a.statusCode !== 429) return 'hour 15 is exhausted but the request got ' + a.statusCode;
  const nextHour = '2026-10-12T16:00:00.000Z';
  const b = await callHandler(mod, LIVE_Q('1y'), { fetch: okFetch(), store, clock: clockAt(nextHour) });
  if (b.statusCode !== 200) return 'a new UTC hour was refused: ' + b.statusCode;
  if (store.data.get(KEY(nextHour)) !== '1' || store.data.get(KEY(T.REGULAR)) !== '300') return 'counters: ' + JSON.stringify(Array.from(store.data.entries()));
  return true;
}
async function overlayUnits(mod) {
  const expectations = [['PRE', '2'], ['POST', '2'], ['REGULAR', '1'], ['CLOSED', '1']];
  for (const range of ['1d', '5d']) {
    for (const [session, units] of expectations) {
      const store = makeStore();
      const r = await callHandler(mod, LIVE_Q(range), { fetch: okFetch(), store, clock: clockAt(T[session]) });
      if (r.statusCode !== 200) return range + ' ' + session + ': request refused (' + r.statusCode + ')';
      if (store.data.get(KEY(T[session])) !== units) return range + ' ' + session + ': took ' + store.data.get(KEY(T[session])) + ' unit(s), expected ' + units;
    }
  }
  const store = makeStore();
  await callHandler(mod, LIVE_Q('1y'), { fetch: okFetch(), store, clock: clockAt(T.PRE) });
  if (store.data.get(KEY(T.PRE)) !== '1') return 'a historical range takes exactly one unit even in PRE (no overlay request exists there): ' + store.data.get(KEY(T.PRE));
  return true;
}
async function failClosed(mod) {
  const cases = [
    ['store get throws', { failGet: true }, null],
    ['store set throws', { failSet: true }, null],
    ['counter abc', {}, 'abc'],
    ['counter -1', {}, '-1'],
    ['counter 12abc (parseInt would accept it)', {}, '12abc'],
    ['counter 1.5', {}, '1.5']
  ];
  for (const [label, storeOpts, counter] of cases) {
    const store = makeStore(storeOpts);
    if (counter !== null) store.data.set(KEY(T.REGULAR), counter);
    const f = okFetch();
    const r = await callHandler(mod, LIVE_Q('1y'), { fetch: f, store, clock: clockAt(T.REGULAR) });
    if (r.statusCode !== 429 || !sameJson(r.body, EXHAUSTED)) return label + ': expected the 429 envelope, got ' + r.statusCode;
    if (f.calls.length !== 0) return label + ': ' + f.calls.length + ' upstream request(s) were made';
  }
  return true;
}
// Records every module the handler asks for while `fn` runs.
async function withLoadSpy(fn) {
  const Module = require('module');
  const original = Module._load;
  const seen = [];
  Module._load = function (request) { seen.push(String(request)); return original.apply(this, arguments); };
  try { return await fn(seen); } finally { Module._load = original; }
}
// The production path to the store (no injected store): a stand-in for the storage package records the calls.
async function storeAcquisition(mod) {
  const Module = require('module');
  const original = Module._load;
  const calls = [];
  let connectThrows = false;
  const backing = makeStore();
  Module._load = function (request) {
    if (request === '@netlify/blobs') {
      return {
        connectLambda(e) { calls.push('connect'); if (connectThrows) throw new Error('planted connect failure'); if (!(e && e.blobs)) throw new Error('connectLambda needs the event'); },
        getStore(name) { calls.push('getStore:' + name); return backing; }
      };
    }
    return original.apply(this, arguments);
  };
  try {
    const r1 = await callHandler(mod, LIVE_Q('1y'), { fetch: okFetch(), noStore: true, clock: clockAt(T.REGULAR), event: { blobs: 'context' } });
    if (r1.statusCode !== 200) return 'with a Blobs context the request was refused: ' + r1.statusCode;
    if (!sameJson(calls, ['connect', 'getStore:market-data-live-budget'])) return 'with a Blobs context the calls were ' + JSON.stringify(calls);
    if (backing.data.get(KEY(T.REGULAR)) !== '1') return 'the unit was not counted in the opened store';
    calls.length = 0;
    const r2 = await callHandler(mod, LIVE_Q('1y'), { fetch: okFetch(), noStore: true, clock: clockAt(T.REGULAR) });
    if (r2.statusCode !== 200 || !sameJson(calls, ['getStore:market-data-live-budget'])) return 'without a Blobs context the calls were ' + JSON.stringify(calls) + ' (' + r2.statusCode + ')';
    calls.length = 0;
    connectThrows = true;
    const f3 = okFetch();
    const r3 = await callHandler(mod, LIVE_Q('1y'), { fetch: f3, noStore: true, clock: clockAt(T.REGULAR), event: { blobs: 'context' } });
    if (r3.statusCode !== 429 || !sameJson(r3.body, EXHAUSTED) || f3.calls.length !== 0) return 'a failing connect did not fail closed: ' + r3.statusCode + ', ' + f3.calls.length + ' request(s)';
    if (!sameJson(calls, ['connect'])) return 'a failing connect must stop before getStore: ' + JSON.stringify(calls);
    return true;
  } finally { Module._load = original; }
}
async function scanUntouched(mod) {
  return withLoadSpy(async (seen) => {
    for (const q of [{ symbol: 'AAPL', interval: '1d', range: '5d' }, { symbol: 'AAPL', interval: '1d', range: '1y' }, { symbol: 'AAPL', interval: '1d', range: '5d', purpose: 'scan' }, { symbol: 'AAPL', interval: '1d', range: '1y', purpose: 'scan' }]) {
      const store = makeStore();
      const r = await callHandler(mod, q, { fetch: okFetch(), store, clock: clockAt(T.REGULAR) });
      if (r.statusCode !== 200) return 'scan request refused: ' + r.statusCode;
      if (store.log.length !== 0 || store.data.size !== 0) return 'the scan path touched the store: ' + JSON.stringify(store.log);
    }
    const bad = seen.filter((s) => /netlify\/blobs|market-data-live-budget/.test(s));
    if (bad.length) return 'the scan path loaded ' + bad.join(', ');
    return true;
  });
}
async function budgetFirst(mod) {
  for (const range of ['5d', '1y']) {
    const events = [];
    const store = makeStore({ log: events });
    const f = makeFetch({ yahoo: 'ok', polygon: 'ok', onCall: (host) => events.push('fetch:' + host) });
    const r = await callHandler(mod, LIVE_Q(range), { fetch: f, store, clock: clockAt(T.REGULAR) });
    if (r.statusCode !== 200) return range + ': ' + r.statusCode;
    const firstFetch = events.findIndex((e) => e.indexOf('fetch:') === 0);
    if (events[0] !== 'store.get' || events[1] !== 'store.set' || firstFetch < 2) return range + ': the budget was not taken before the first upstream request: ' + JSON.stringify(events);
  }
  return true;
}

test('LB-1 take: the 300th unit in an hour is allowed, the 301st is refused and a refusal writes nothing; multi-unit boundary', async () => {
  const lib = loadFresh(LIB_PATH);
  assert.strictEqual(lib.BUDGET_PER_HOUR, 300);
  const store = makeStore();
  for (let i = 1; i <= 300; i += 1) assert.strictEqual(await lib.take(store, T.REGULAR, 1), true, 'unit ' + i);
  assert.strictEqual(store.data.get(KEY(T.REGULAR)), '300');
  const sets = store.log.filter((x) => x === 'store.set').length;
  assert.strictEqual(await lib.take(store, T.REGULAR, 1), false);
  assert.strictEqual(store.log.filter((x) => x === 'store.set').length, sets, 'a refusal writes nothing');
  const s2 = makeStore();
  s2.data.set(KEY(T.REGULAR), '299');
  assert.strictEqual(await lib.take(s2, T.REGULAR, 2), false);
  assert.strictEqual(s2.data.get(KEY(T.REGULAR)), '299');
  assert.strictEqual(await lib.take(s2, T.REGULAR, 1), true);
  assert.strictEqual(s2.data.get(KEY(T.REGULAR)), '300');
});
test('LB-2 key md:live-budget:<YYYY-MM-DDTHH> (UTC), store name market-data-live-budget, a new hour is a new counter', async () => {
  const lib = loadFresh(LIB_PATH);
  assert.strictEqual(lib.keyFor('2026-10-12T15:59:59.999Z'), 'md:live-budget:2026-10-12T15');
  assert.strictEqual(lib.STORE_NAME, 'market-data-live-budget');
  assert.strictEqual(lib.KEY_PREFIX, 'md:live-budget:');
  const store = makeStore();
  assert.strictEqual(await lib.take(store, '2026-10-12T15:59:59.999Z', 1), true);
  assert.strictEqual(await lib.take(store, '2026-10-12T16:00:00.000Z', 1), true);
  assert.deepStrictEqual(Array.from(store.data.entries()).sort(), [['md:live-budget:2026-10-12T15', '1'], ['md:live-budget:2026-10-12T16', '1']]);
});
test('LB-3 a missing counter is zero; a counter with leading zeros is read as decimal', async () => {
  const lib = loadFresh(LIB_PATH);
  const store = makeStore();
  assert.strictEqual(await lib.take(store, T.REGULAR, 1), true);
  assert.strictEqual(store.data.get(KEY(T.REGULAR)), '1');
  const s2 = makeStore();
  s2.data.set(KEY(T.REGULAR), '007');
  assert.strictEqual(await lib.take(s2, T.REGULAR, 3), true);
  assert.strictEqual(s2.data.get(KEY(T.REGULAR)), '10');
});
test('LB-4 fail closed: malformed counters, store errors, a bad store, bad units and a bad time all refuse and write nothing', async () => {
  const lib = loadFresh(LIB_PATH);
  for (const bad of ['abc', '-1', '12abc', '1.5', ' 5', '', '9'.repeat(30), '1e2']) {
    const s = makeStore();
    s.data.set(KEY(T.REGULAR), bad);
    assert.strictEqual(await lib.take(s, T.REGULAR, 1), false, 'counter ' + JSON.stringify(bad));
    assert.strictEqual(s.log.filter((x) => x === 'store.set').length, 0, 'no write for counter ' + JSON.stringify(bad));
  }
  assert.strictEqual(await lib.take(makeStore({ failGet: true }), T.REGULAR, 1), false);
  assert.strictEqual(await lib.take(makeStore({ failSet: true }), T.REGULAR, 1), false);
  for (const store of [null, undefined, {}, { get() {} }, { set() {} }]) assert.strictEqual(await lib.take(store, T.REGULAR, 1), false, 'store ' + JSON.stringify(store));
  for (const units of [0, -1, 1.5, '1', NaN, Infinity, undefined, null]) assert.strictEqual(await lib.take(makeStore(), T.REGULAR, units), false, 'units ' + String(units));
  for (const when of ['garbage', '', 123, undefined, null, '2026-10-12']) assert.strictEqual(await lib.take(makeStore(), when, 1), false, 'time ' + String(when));
});
test('LB-5 the lib is pure: no require, no network, no clock, no environment (store and time are injected)', () => {
  const code = fs.readFileSync(LIB_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\brequire\s*\(/.test(code), 'no require');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|https?\.request/.test(code), 'no network');
  assert.ok(!/process\.env|Date\.now|new Date/.test(code), 'no environment or clock read');
});

test('MB-1 the 300th unit in an hour is allowed, the next answers 429 BUDGET_EXHAUSTED with zero upstream requests (daily and historical ranges)', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await budgetBoundary(mod, '5d'), true);
  assert.strictEqual(await budgetBoundary(mod, '1y'), true);
});
test('MB-2 a new UTC hour is a new key and is allowed again', async () => {
  assert.strictEqual(await newHourNewKey(loadFresh(HANDLER_PATH)), true);
});
test('MB-3 overlay sessions (PRE / POST, daily ranges) take 2 units; CLOSED / REGULAR take 1; a historical range takes 1', async () => {
  assert.strictEqual(await overlayUnits(loadFresh(HANDLER_PATH)), true);
});
test('MB-4 fail closed: a store error or a malformed counter answers 429 with zero upstream requests; so does an unavailable store', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await failClosed(mod), true);
  // no injected store: the real storage package cannot open a store offline -> refused, nothing requested
  await withLoadSpy(async (seen) => {
    const f = okFetch();
    const r = await callHandler(mod, LIVE_Q('1y'), { fetch: f, clock: clockAt(T.REGULAR), noStore: true });
    assert.strictEqual(r.statusCode, 429, 'an unavailable store must fail closed');
    assert.deepStrictEqual(r.body, EXHAUSTED);
    assert.strictEqual(f.calls.length, 0);
    assert.ok(seen.some((s) => /netlify\/blobs/.test(s)), 'positive control: the storage package is loaded lazily, inside the portfolio-live branch');
  });
});
test('MB-5 the scan path: the store spy records zero reads and writes and neither the storage package nor the budget lib is loaded', async () => {
  assert.strictEqual(await scanUntouched(loadFresh(HANDLER_PATH)), true);
  // positive control: portfolio-live does load the lib (lazily) when it takes a unit
  await withLoadSpy(async (seen) => {
    const store = makeStore();
    await callHandler(loadFresh(HANDLER_PATH), LIVE_Q('1y'), { fetch: okFetch(), store, clock: clockAt(T.REGULAR) });
    assert.ok(seen.some((s) => /market-data-live-budget/.test(s)) && store.log.length === 2, 'portfolio-live takes a unit: ' + JSON.stringify(seen.filter((s) => /budget/.test(s))));
  });
});
test('MB-6 gate off -> SERVER_DISABLED before any budget read; an invalid or missing symbol is rejected before the budget too', async () => {
  const mod = loadFresh(HANDLER_PATH);
  const off = makeStore();
  const f = okFetch();
  const r = await callHandler(mod, LIVE_Q('1y'), { fetch: f, store: off, clock: clockAt(T.REGULAR), env: { PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER: null } });
  assert.deepStrictEqual(r.body, ENV_DISABLED);
  assert.strictEqual(off.log.length, 0, 'no budget read with the gate off');
  assert.strictEqual(f.calls.length, 0);
  for (const [query, expected] of [[{ symbol: '', interval: '1d', range: '1y', purpose: 'portfolio-live' }, 'Missing required parameter: symbol'], [{ symbol: 'A B', interval: '1d', range: '1y', purpose: 'portfolio-live' }, 'Invalid symbol format: A B']]) {
    const s = makeStore();
    const r2 = await callHandler(mod, query, { fetch: okFetch(), store: s, clock: clockAt(T.REGULAR) });
    assert.strictEqual(r2.statusCode, 400);
    assert.strictEqual(r2.body.error, expected);
    assert.strictEqual(s.log.length, 0, 'no budget read for ' + expected);
  }
});
test('MB-7 the budget is taken before the first upstream request (call-order spy: store.get, store.set, then fetch)', async () => {
  assert.strictEqual(await budgetFirst(loadFresh(HANDLER_PATH)), true);
});
test('MB-8 client compatibility (read-only): _pfLiveIsTerminalEnvelope from index.html is false for the 429 body, so the client keeps its per-symbol failure handling', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const start = html.indexOf('function _pfLiveIsTerminalEnvelope(');
  assert.ok(start !== -1 && html.indexOf('function _pfLiveIsTerminalEnvelope(', start + 1) === -1, 'the client function exists exactly once');
  let depth = 0;
  let end = -1;
  for (let i = html.indexOf('{', start); i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > start, 'the function body is balanced');
  const isTerminal = new Function(html.slice(start, end) + '\nreturn _pfLiveIsTerminalEnvelope;')();
  assert.strictEqual(isTerminal(EXHAUSTED), false, 'the 429 envelope is not terminal');
  assert.strictEqual(isTerminal(ENV_DISABLED), true, 'positive control: SERVER_DISABLED is terminal');
  assert.strictEqual(isTerminal(ENV_INVALID), true, 'positive control: INVALID_PURPOSE is terminal');
  assert.strictEqual(isTerminal(ENV_AMBIGUOUS), true, 'positive control: AMBIGUOUS_PURPOSE is terminal');
  assert.strictEqual(isTerminal({ chart: {} }), false);
});

test('MB-9 store acquisition (production path): connectLambda(event) runs before getStore when the event carries a Blobs context, getStore opens market-data-live-budget, and a connect failure fails closed', async () => {
  assert.strictEqual(await storeAcquisition(loadFresh(HANDLER_PATH)), true);
});

// ── Slice 2 planted negatives (production handler / lib mutated; the real source passes the same scenario) ──
const GUARD_BLOCK = "  if (purpose === 'portfolio-live' && !(await takeLiveBudget(event, range))) {\n    return res(429, ENVELOPE_BUDGET_EXHAUSTED);\n  }\n";
test('MB-N1 negative: the budget guard placed after the first upstream request -> MB-7 is violated', async () => {
  assert.strictEqual(await budgetFirst(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('guard after the fetch', [
    [GUARD_BLOCK, ''],
    ["    if (_mainRes.status === 'fulfilled' && _mainRes.value) {\n", "    if (purpose === 'portfolio-live' && !(await takeLiveBudget(event, range))) { return res(429, ENVELOPE_BUDGET_EXHAUSTED); }\n    if (_mainRes.status === 'fulfilled' && _mainRes.value) {\n"]
  ]);
  assert.notStrictEqual(await budgetFirst(mut), true);
});
test('MB-N2 negative: the counter is not checked against the limit -> MB-1 is violated', async () => {
  assert.strictEqual(await budgetBoundary(loadFresh(HANDLER_PATH), '5d'), true, 'the real source passes the scenario');
  const mut = mutantHandler('counter not checked', [], [['    if (used + units > BUDGET_PER_HOUR) { return false; }\n', '']]);
  assert.notStrictEqual(await budgetBoundary(mut, '5d'), true);
});
test('MB-N3 negative: the scan path counted against the budget -> MB-5 is violated', async () => {
  assert.strictEqual(await scanUntouched(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('scan counted', [["  if (purpose === 'portfolio-live' && !(await takeLiveBudget(event, range))) {", '  if (!(await takeLiveBudget(event, range))) {']]);
  assert.notStrictEqual(await scanUntouched(mut), true);
});
test('MB-N4 negative: fail-open on a store error -> MB-4 is violated', async () => {
  assert.strictEqual(await failClosed(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('fail open', [], [['  } catch (_) { return false; }\n', '  } catch (_) { return true; }\n']]);
  assert.notStrictEqual(await failClosed(mut), true);
});
test('MB-N5 negative: a malformed counter read leniently (parseInt) -> MB-4 is violated', async () => {
  assert.strictEqual(await failClosed(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('lenient counter', [], [["      if (!/^\\d+$/.test(text)) { return false; }\n", '']]);
  assert.notStrictEqual(await failClosed(mut), true);
});
test('MB-N7 negative: the Blobs context never connected -> MB-9 is violated', async () => {
  assert.strictEqual(await storeAcquisition(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('connect dropped', [['      if (event && event.blobs) blobs.connectLambda(event);\n', '']]);
  assert.notStrictEqual(await storeAcquisition(mut), true);
});
test('MB-N6 negative: the overlay request not counted -> MB-3 is violated', async () => {
  assert.strictEqual(await overlayUnits(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('overlay not counted', [["      if (session === 'PRE' || session === 'POST') units = 2;\n", '']]);
  assert.notStrictEqual(await overlayUnits(mut), true);
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
