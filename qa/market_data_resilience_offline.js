'use strict';

/*
 * qa/market_data_resilience_offline.js
 *
 * market-data-resilience-1 (work/market-data-resilience-1/brief.md, TSR-3 / F-4): one bounded retry on a fast Polygon HTTP 429
 * on the scan historical path, and a typed fallback reason (`X-PT-Polygon-Fallback`) on the Yahoo-fallback response. Offline:
 * the handler runs in-process against an injected global `fetch` spy (any host other than the two providers throws), an
 * injected clock (`event._testClock.nowMs`) and an injected sleep (`event._testSleep`).
 *
 *   MR-1..MR-8   behaviour rows (retry, call counts, header, wait bounds, 2000 ms rule, unchanged paths, double failure).
 *   MR-N1..N5    planted negatives: the PRODUCTION handler is mutated in a temp copy (every anchor exactly once) and must flip a
 *                scenario that the real handler passes.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'netlify', 'functions', 'market-data.js');
const HEADER = 'X-PT-Polygon-Fallback';

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

function loadFresh(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

// ── planted-negative helper: a temp copy of the production handler (and its lib dir) with exact-once replacements ──
const TMP_DIRS = [];
function applyOnce(label, text, replacements) {
  let src = text.replace(/\r\n/g, '\n');
  for (const [find, replace] of replacements) {
    const n = src.split(find).length - 1;
    assert.strictEqual(n, 1, 'mutant "' + label + '": anchor found ' + n + ' time(s): ' + find.slice(0, 90));
    src = src.replace(find, () => replace);
  }
  return src;
}
function mutantHandler(label, reps) {
  const src = applyOnce(label, fs.readFileSync(HANDLER_PATH, 'utf8'), reps);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptmr-mut-'));
  TMP_DIRS.push(dir);
  fs.writeFileSync(path.join(dir, 'market-data.js'), src);
  const libDir = path.join(ROOT, 'netlify', 'functions', 'lib');
  if (fs.existsSync(libDir)) fs.cpSync(libDir, path.join(dir, 'lib'), { recursive: true });
  return loadFresh(path.join(dir, 'market-data.js'));
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────
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

function polyResp(status, body, retryAfter) {
  const headers = {};
  if (retryAfter !== undefined && retryAfter !== null) headers['retry-after'] = String(retryAfter);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { const k = String(name).toLowerCase(); return Object.prototype.hasOwnProperty.call(headers, k) ? headers[k] : null; } },
    json: async () => body
  };
}
function yahooResp(ok) {
  return ok
    ? { ok: true, status: 200, headers: { get() { return null; } }, json: async () => JSON.parse(JSON.stringify(YAHOO_CHART)) }
    : { ok: false, status: 500, headers: { get() { return null; } }, json: async () => ({}) };
}
const P429 = (ra) => ({ kind: 'resp', status: 429, body: {}, retryAfter: ra });
const P200 = { kind: 'resp', status: 200, body: POLYGON_BARS };
const P500 = { kind: 'resp', status: 500, body: {} };

// plan: { polygon: [step, ...] (consumed in order; the last repeats), yahoo: 'ok' | 'fail', onPolygon?: (n) => void }
// step: { kind:'resp', status, body, retryAfter } | { kind:'abort' } | { kind:'throw' }
function makeFetch(plan) {
  const calls = [];
  const polygonSteps = plan.polygon || [P200];
  let polygonN = 0;
  const f = async function (url, init) {
    const u = String(url);
    let host = 'unknown';
    if (u.indexOf('https://query1.finance.yahoo.com/') === 0) host = u.indexOf('includePrePost=true') !== -1 ? 'yahoo-intraday' : 'yahoo';
    else if (u.indexOf('https://api.polygon.io/') === 0) host = 'polygon';
    calls.push({ host, url: u, init });
    if (host === 'unknown') throw new Error('unexpected upstream request: ' + u);
    if (host === 'polygon') {
      const step = polygonSteps[Math.min(polygonN, polygonSteps.length - 1)];
      polygonN += 1;
      if (typeof plan.onPolygon === 'function') plan.onPolygon(polygonN);
      if (step.kind === 'abort') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
      if (step.kind === 'throw') throw new Error(step.message || 'getaddrinfo ENOTFOUND api.polygon.io');
      return polyResp(step.status, step.body, step.retryAfter);
    }
    if (host === 'yahoo-intraday') return { ok: true, status: 200, headers: { get() { return null; } }, json: async () => ({ chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } }) };
    return yahooResp(plan.yahoo === 'ok');
  };
  f.calls = calls;
  f.count = (host) => calls.filter((c) => c.host === host).length;
  return f;
}

// Runs the handler. env value null = unset. Returns { statusCode, headers, body, sleeps }.
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
  global.fetch = o.fetch;
  const warns = [];
  console.log = console.error = function () {};
  console.warn = function () { warns.push(Array.prototype.slice.call(arguments).join(' ')); };
  const sleeps = [];
  const event = { queryStringParameters: query, multiValueQueryStringParameters: {} };
  if (o.sleep !== false) event._testSleep = async (ms) => { sleeps.push(ms); };
  if (o.clock) event._testClock = o.clock;
  if (query.purpose === 'portfolio-live') event._testStore = { async get() { return null; }, async set() {} };
  try {
    const r = await mod.handler(event);
    return { statusCode: r.statusCode, headers: r.headers || {}, body: JSON.parse(r.body), sleeps, warns };
  } finally {
    Object.assign(console, savedConsole);
    global.fetch = savedFetch;
    for (const k of Object.keys(savedEnv)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
}
const HIST = { symbol: 'AAPL', interval: '1d', range: '1y' };
const DAILY = { symbol: 'AAPL', interval: '1d', range: '5d' };
const hasHeader = (r) => Object.prototype.hasOwnProperty.call(r.headers, HEADER);
const providerOf = (r) => r.body && r.body.chart && r.body.chart.result && r.body.chart.result[0].meta._provider;

// ── scenarios: true when the invariant holds, otherwise a description of the violation ──
async function s_retryOnce(mod) { // MR-1
  const f = makeFetch({ polygon: [P429(), P200], yahoo: 'ok' });
  const r = await callHandler(mod, HIST, { fetch: f });
  if (f.count('polygon') !== 2) return 'expected 2 Polygon calls, saw ' + f.count('polygon');
  if (f.count('yahoo') !== 0) return 'expected 0 Yahoo calls, saw ' + f.count('yahoo');
  if (r.statusCode !== 200) return 'status ' + r.statusCode;
  if (providerOf(r) !== 'polygon') return '_provider is ' + providerOf(r);
  if (hasHeader(r)) return 'the fallback header is present on a Polygon success';
  return true;
}
async function s_retryCap(mod) { // MR-2
  const f = makeFetch({ polygon: [P429()], yahoo: 'ok' });
  const r = await callHandler(mod, HIST, { fetch: f });
  if (f.count('polygon') !== 2) return 'expected exactly 2 Polygon calls, saw ' + f.count('polygon');
  if (f.count('yahoo') !== 1) return 'expected 1 Yahoo call, saw ' + f.count('yahoo');
  if (r.statusCode !== 200) return 'status ' + r.statusCode;
  if (r.headers[HEADER] !== 'http-429') return 'header is ' + JSON.stringify(r.headers[HEADER]);
  return true;
}
async function s_no500Retry(mod) { // MR-3
  const f = makeFetch({ polygon: [P500], yahoo: 'ok' });
  const r = await callHandler(mod, HIST, { fetch: f });
  if (f.count('polygon') !== 1) return 'expected exactly 1 Polygon call, saw ' + f.count('polygon');
  if (f.count('yahoo') !== 1) return 'expected 1 Yahoo call, saw ' + f.count('yahoo');
  if (r.headers[HEADER] !== 'http-500') return 'header is ' + JSON.stringify(r.headers[HEADER]);
  return true;
}
const CLASS_CASES = [
  ['body NOT_AUTHORIZED', { kind: 'resp', status: 200, body: { status: 'NOT_AUTHORIZED' } }, 'auth'],
  ['body NOT_AUTHORIZED + error string', { kind: 'resp', status: 200, body: { status: 'NOT_AUTHORIZED', error: 'Unknown API Key' } }, 'auth'],
  ['body ERROR + error text mentioning NOT_AUTHORIZED', { kind: 'resp', status: 200, body: { status: 'ERROR', error: 'upstream said NOT_AUTHORIZED for this plan' } }, 'error'],
  ['empty results', { kind: 'resp', status: 200, body: { status: 'OK', results: [] } }, 'empty'],
  ['abort', { kind: 'abort' }, 'timeout'],
  ['network throw', { kind: 'throw' }, 'network']
];
async function s_classes(mod) { // MR-4
  for (const [label, step, want] of CLASS_CASES) {
    const f = makeFetch({ polygon: [step], yahoo: 'ok' });
    const r = await callHandler(mod, HIST, { fetch: f });
    if (f.count('polygon') !== 1) return label + ': expected exactly 1 Polygon call, saw ' + f.count('polygon');
    if (r.headers[HEADER] !== want) return label + ': header ' + JSON.stringify(r.headers[HEADER]) + ', expected ' + want;
  }
  return true;
}
async function s_classMessageFree(mod) { // MR-4 both-fields / message text only
  const f = makeFetch({ polygon: [{ kind: 'resp', status: 200, body: { status: 'NOT_AUTHORIZED', error: 'Unknown API Key' } }], yahoo: 'ok' });
  const r = await callHandler(mod, HIST, { fetch: f });
  if (r.headers[HEADER] !== 'auth') return 'NOT_AUTHORIZED with an error string classified as ' + JSON.stringify(r.headers[HEADER]);
  const g = makeFetch({ polygon: [{ kind: 'resp', status: 200, body: { status: 'ERROR', error: 'text mentioning NOT_AUTHORIZED' } }], yahoo: 'ok' });
  const r2 = await callHandler(mod, HIST, { fetch: g });
  if (r2.headers[HEADER] !== 'error') return 'ERROR whose text mentions NOT_AUTHORIZED classified as ' + JSON.stringify(r2.headers[HEADER]);
  return true;
}
async function s_waits(mod) { // MR-5
  for (const [ra, want] of [['1', 1000], ['30', 1500], ['9999999999', 1500], ['9'.repeat(400), 1500], [undefined, 1000], ['abc', 1000], ['', 1000], ['-3', 1000]]) {
    const f = makeFetch({ polygon: [P429(ra), P200], yahoo: 'ok' });
    const r = await callHandler(mod, HIST, { fetch: f });
    if (r.sleeps.length !== 1 || r.sleeps[0] !== want) return 'Retry-After ' + JSON.stringify(ra) + ': waited ' + JSON.stringify(r.sleeps) + ', expected [' + want + ']';
  }
  return true;
}
async function s_timeouts(mod) { // R-1 per-request timeout of the retry is 3000 ms (observed through the abort timer)
  const f = makeFetch({ polygon: [P429(), P200], yahoo: 'ok' });
  const timers = [];
  const realSet = global.setTimeout;
  global.setTimeout = function (fn, ms) { timers.push(ms); return realSet.apply(this, arguments); };
  try { await callHandler(mod, HIST, { fetch: f }); } finally { global.setTimeout = realSet; }
  if (timers.indexOf(3000) === -1) return 'no 3000 ms timer for the retry: ' + JSON.stringify(timers);
  return true;
}
async function s_slow429(mod) { // MR-6
  const clock = { nowMs: Date.parse('2026-10-14T12:00:00.000Z') };
  const f = makeFetch({ polygon: [P429(), P200], yahoo: 'ok', onPolygon: () => { clock.nowMs += 2500; } });
  const r = await callHandler(mod, HIST, { fetch: f, clock });
  if (f.count('polygon') !== 1) return 'a 429 slower than 2000 ms was retried (' + f.count('polygon') + ' Polygon calls)';
  if (r.headers[HEADER] !== 'http-429') return 'header is ' + JSON.stringify(r.headers[HEADER]);
  if (r.sleeps.length !== 0) return 'a wait happened: ' + JSON.stringify(r.sleeps);
  // positive control: a 429 inside the window is retried
  const clock2 = { nowMs: Date.parse('2026-10-14T12:00:00.000Z') };
  const g = makeFetch({ polygon: [P429(), P200], yahoo: 'ok', onPolygon: () => { clock2.nowMs += 1500; } });
  await callHandler(mod, HIST, { fetch: g, clock: clock2 });
  if (g.count('polygon') !== 2) return 'positive control: a 429 after 1500 ms was not retried';
  return true;
}
async function s_unchanged(mod) { // MR-7
  const a = makeFetch({ polygon: [P429()], yahoo: 'fail' });
  const r1 = await callHandler(mod, DAILY, { fetch: a });
  if (a.count('polygon') !== 1) return 'daily: expected exactly 1 Polygon call, saw ' + a.count('polygon');
  if (hasHeader(r1)) return 'daily: the fallback header is present';
  if (r1.statusCode !== 502) return 'daily: status ' + r1.statusCode;
  for (const range of ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']) {
    const b = makeFetch({ polygon: [P429()], yahoo: 'ok' });
    const r2 = await callHandler(mod, { symbol: 'AAPL', interval: '1d', range, purpose: 'portfolio-live' }, { fetch: b, clock: { nowMs: Date.parse('2026-10-12T15:00:00.000Z') } });
    if (b.count('polygon') !== 0) return 'portfolio-live ' + range + ': Polygon was requested';
    if (hasHeader(r2)) return 'portfolio-live ' + range + ': the fallback header is present';
  }
  const c = makeFetch({ polygon: [P429()], yahoo: 'ok' });
  const r3 = await callHandler(mod, HIST, { fetch: c, env: { POLYGON_API_KEY: null } });
  if (c.count('polygon') !== 0) return 'key unset: Polygon was requested';
  if (hasHeader(r3)) return 'key unset: the fallback header is present';
  return true;
}
async function s_yahooAlsoFails(mod) { // MR-8
  const f = makeFetch({ polygon: [P429()], yahoo: 'fail' });
  const r = await callHandler(mod, HIST, { fetch: f });
  if (f.count('polygon') !== 2) return 'expected 2 Polygon calls, saw ' + f.count('polygon');
  if (r.statusCode !== 502) return 'status ' + r.statusCode;
  if (r.body.error !== 'All providers failed for AAPL: Yahoo HTTP 500') return 'body ' + JSON.stringify(r.body);
  if (r.headers[HEADER] !== 'http-429') return 'header is ' + JSON.stringify(r.headers[HEADER]);
  return true;
}
async function s_headerOn502(mod) { // R-3: a Yahoo-fallback response other than 200 (here the 502 after a Yahoo empty result) carries the header too
  let n = 0;
  const fetchSpy = async function (url) {
    const u = String(url);
    if (u.indexOf('https://api.polygon.io/') === 0) return polyResp(500, {});
    if (u.indexOf('https://query1.finance.yahoo.com/') === 0) { n += 1; return { ok: true, status: 200, headers: { get() { return null; } }, json: async () => ({ chart: { result: [] } }) }; }
    throw new Error('unexpected upstream request: ' + u);
  };
  const r = await callHandler(mod, HIST, { fetch: fetchSpy });
  if (n !== 1) return 'Yahoo calls ' + n;
  // fetchYahoo throws on an empty result, so the handler's 404 branch is not reachable through the real fetchYahoo: this fixture lands on the 502.
  if (r.statusCode !== 502) return 'expected the 502 Yahoo-fallback response, got ' + r.statusCode;
  if (r.headers[HEADER] !== 'http-500') return '502 response header ' + JSON.stringify(r.headers[HEADER]);
  return true;
}
async function s_warnLine(mod) { // R-3: the class is appended to the existing fallback warn line
  const f = makeFetch({ polygon: [P429()], yahoo: 'ok' });
  const r = await callHandler(mod, HIST, { fetch: f });
  const line = r.warns.filter((w) => w.indexOf('polygon failed for') !== -1);
  if (line.length !== 1) return 'expected one "polygon failed" warn line, saw ' + line.length;
  if (line[0].indexOf('http-429') === -1) return 'the class is not in the warn line: ' + line[0];
  if (line[0].indexOf('falling back to Yahoo') === -1) return 'the existing warn text changed: ' + line[0];
  return true;
}

// ── rows ─────────────────────────────────────────────────────────────────────────────────
test('MR-1 historical scan: Polygon 429 then 200 -> exactly 2 Polygon calls, 0 Yahoo, 200, _provider polygon, no fallback header', async () => {
  assert.strictEqual(await s_retryOnce(loadFresh(HANDLER_PATH)), true);
});
test('MR-2 Polygon 429 twice -> exactly 2 Polygon calls, then Yahoo (200), header http-429; the class is in the existing warn line', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await s_retryCap(mod), true);
  assert.strictEqual(await s_warnLine(mod), true);
});
test('MR-3 Polygon 500 -> exactly 1 Polygon call, then Yahoo, header http-500', async () => {
  assert.strictEqual(await s_no500Retry(loadFresh(HANDLER_PATH)), true);
});
test('MR-4 one Polygon call each: NOT_AUTHORIZED -> auth (also with an error string); ERROR + text mentioning NOT_AUTHORIZED -> error; empty; abort -> timeout; network', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await s_classes(mod), true);
  assert.strictEqual(await s_classMessageFree(mod), true);
});
test('MR-5 wait: Retry-After 1 -> 1000 ms, 30 -> 1500 ms (cap), absent / invalid -> 1000 ms; the retry request has a 3000 ms timeout', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await s_waits(mod), true);
  assert.strictEqual(await s_timeouts(mod), true);
});
test('MR-6 a 429 observed after > 2000 ms (_testClock) -> no retry, header http-429; a 429 inside the window is retried (positive control)', async () => {
  assert.strictEqual(await s_slow429(loadFresh(HANDLER_PATH)), true);
});
test('MR-7 unchanged paths: daily scan (Yahoo fail -> Polygon 429) = 1 Polygon call, no header; portfolio-live = 0 Polygon calls, no header; key unset = 0 Polygon calls, no header', async () => {
  assert.strictEqual(await s_unchanged(loadFresh(HANDLER_PATH)), true);
});
test('MR-8 Yahoo also fails after Polygon 429 x2 -> 502 with the existing body text, header http-429; the header also rides a 502 fallback response from a Yahoo empty result', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await s_yahooAlsoFails(mod), true);
  assert.strictEqual(await s_headerOn502(mod), true);
});

// ── planted negatives (production handler mutated; the real handler passes the same scenario) ──
// Each anchor must occur exactly once in market-data.js (applyOnce asserts it).
test('MR-N1 negative: retry also on HTTP 500 -> MR-3 is violated', async () => {
  assert.strictEqual(await s_no500Retry(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('retry on any status', [['!(err && err.httpStatus === 429)', '!(err && err.httpStatus >= 400)']]);
  assert.notStrictEqual(await s_no500Retry(mut), true);
});
test('MR-N2 negative: no retry cap (a second 429 is retried again) -> MR-2 is violated', async () => {
  assert.strictEqual(await s_retryCap(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('no retry cap', [['attempt >= 2 ||', 'attempt >= 5 ||']]);
  assert.notStrictEqual(await s_retryCap(mut), true);
});
test('MR-N3 negative: the fallback header set on success -> MR-1 is violated', async () => {
  assert.strictEqual(await s_retryOnce(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('header on success', [[
    "          return res(200, data);\n        }\n        polygonFallbackClass = 'empty';",
    "          return res(200, data, { 'X-PT-Polygon-Fallback': 'http-429' });\n        }\n        polygonFallbackClass = 'empty';"
  ]]);
  assert.notStrictEqual(await s_retryOnce(mut), true);
});
test('MR-N4 negative: a retry added to the daily branch -> MR-7 is violated', async () => {
  assert.strictEqual(await s_unchanged(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('retry in the daily branch', [[
    "        const data = await fetchPolygon(sym, interval, range, polygonKey);\n        if (data) {\n          console.log('[market-data] polygon OK for', sym, 'range=' + range);\n          return res(200, data);\n        }\n        console.warn('[market-data] polygon returned no data for', sym);",
    "        const data = await fetchPolygonWithRetry(event, sym, interval, range, polygonKey);\n        if (data) {\n          console.log('[market-data] polygon OK for', sym, 'range=' + range);\n          return res(200, data);\n        }\n        console.warn('[market-data] polygon returned no data for', sym);"
  ]]);
  assert.notStrictEqual(await s_unchanged(mut), true);
});
test('MR-N5 negative: classification from the message text -> the both-fields case of MR-4 is violated', async () => {
  assert.strictEqual(await s_classMessageFree(loadFresh(HANDLER_PATH)), true, 'the real source passes the scenario');
  const mut = mutantHandler('classify by message', [["err.bodyStatus === 'NOT_AUTHORIZED'", '/NOT_AUTHORIZED/.test(String(err.message))']]);
  assert.notStrictEqual(await s_classMessageFree(mut), true);
});

// ── run, then clean ──────────────────────────────────────────────────────────────────────
(async () => {
  for (const t of pending) {
    try { await t.fn(); passed += 1; } catch (e) { failed += 1; failures.push(t.name + ' -- ' + (e && e.message ? e.message : String(e))); }
  }
  for (const d of TMP_DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
  if (failed > 0) {
    for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
    process.stdout.write('\nOFFLINE VALIDATION (market-data resilience): FAIL (' + failed + '/' + (passed + failed) + ')\n');
    process.exit(1);
  }
  process.stdout.write('  PASS  ' + passed + ' market-data resilience assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (market-data resilience): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
})();
