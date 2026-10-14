'use strict';

/*
 * qa/tase_session_overlay_offline.js
 *
 * tase-session-overlay-1 (PA-S01, work/tase-session-overlay-1/brief.md): a .TA symbol never gets the US extended-hours overlay on the
 * daily path (1d / 5d). Offline: the handler runs in-process against an injected global `fetch` spy (a request to any host other than
 * the two known providers throws) and an injected clock (event._testClock.nowMs).
 *
 *   TS-1  US AAPL, PRE            -> one intraday request, marketState PRE, preMarketPrice present (unchanged)
 *   TS-2  MTRX.TA, PRE            -> zero intraday requests, 200, no marketState / preMarketPrice / preMarketChangePercent
 *   TS-3  MTRX.TA, POST           -> zero intraday requests, no postMarketPrice
 *   TS-4  BRK.B (dot-class US), PRE -> overlay as for AAPL
 *   TS-5  REGULAR / CLOSED        -> zero intraday requests for any symbol
 *   TS-6  lower-case .ta          -> treated like .TA
 *   TS-N1 / TS-N2 planted negatives on a mutated copy of the production handler (each anchor exactly once).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'netlify', 'functions', 'market-data.js');

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

function loadFresh(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

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
function mutantHandler(label, replacements) {
  const src = applyOnce(label, fs.readFileSync(HANDLER_PATH, 'utf8'), replacements);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptts-mut-'));
  TMP_DIRS.push(dir);
  fs.writeFileSync(path.join(dir, 'market-data.js'), src);
  return loadFresh(path.join(dir, 'market-data.js'));
}

// ── clocks: 2026-10-12 is a Monday and New York is on EDT (UTC-4) ─────────────────────────
const CLOCK = {
  PRE: Date.parse('2026-10-12T10:00:00.000Z'),     // 06:00 ET
  POST: Date.parse('2026-10-12T21:00:00.000Z'),    // 17:00 ET
  REGULAR: Date.parse('2026-10-12T15:00:00.000Z'), // 11:00 ET
  CLOSED: Date.parse('2026-10-12T03:00:00.000Z')   // Sunday 23:00 ET
};

// The handler stamps the overlay against the REAL ET date (getEtDateStr() reads real time), while the session comes from the injected
// clock. So the intraday fixture bar is placed on the real ET date at an in-session ET hour, computed here with Intl.
function etParts(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false })
    .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return { date: p.year + '-' + p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24 };
}
function realTodayBarTs(etHour) {
  const today = etParts(Date.now()).date;
  const [y, m, d] = today.split('-').map(Number);
  for (const off of [4, 5]) {
    const ms = Date.UTC(y, m - 1, d, etHour + off, 0, 0);
    const e = etParts(ms);
    if (e.date === today && e.hour === etHour) return ms / 1000;
  }
  throw new Error('no UTC instant for ET ' + etHour + ':00 on ' + today);
}
const PRE_PRICE = 191.25;
const POST_PRICE = 189.5;

// ── fetch spy ────────────────────────────────────────────────────────────────────────────
function jsonResponse(ok, status, body) { return { ok, status, json: async () => body }; }
function dailyChart(sym) {
  return {
    chart: {
      result: [{
        meta: { symbol: sym, regularMarketPrice: 190, chartPreviousClose: 188 },
        timestamp: [1700000000, 1700086400],
        indicators: { quote: [{ open: [1, 2], high: [2, 3], low: [1, 2], close: [188, 190], volume: [10, 20] }] }
      }],
      error: null
    }
  };
}
function intradayChart() {
  return { chart: { result: [{ timestamp: [realTodayBarTs(6), realTodayBarTs(17)], indicators: { quote: [{ close: [PRE_PRICE, POST_PRICE] }] } }] } };
}
function makeFetch() {
  const calls = [];
  const f = async function (url) {
    const u = String(url);
    let host = 'unknown';
    if (u.indexOf('https://query1.finance.yahoo.com/') === 0) host = u.indexOf('includePrePost=true') !== -1 ? 'yahoo-intraday' : 'yahoo';
    else if (u.indexOf('https://api.polygon.io/') === 0) host = 'polygon';
    calls.push({ host, url: u });
    if (host === 'unknown') throw new Error('unexpected upstream request: ' + u);
    if (host === 'polygon') return jsonResponse(false, 500, {});
    const sym = decodeURIComponent(u.split('/chart/')[1].split('?')[0]);
    if (host === 'yahoo-intraday') return jsonResponse(true, 200, intradayChart());
    return jsonResponse(true, 200, dailyChart(sym));
  };
  f.calls = calls;
  f.count = (host) => calls.filter((c) => c.host === host).length;
  return f;
}

// Scan path (absent purpose), daily range, injected clock.
async function callDaily(mod, symbol, nowMs, range) {
  const savedEnv = process.env.POLYGON_API_KEY;
  const savedFetch = global.fetch;
  const savedConsole = { log: console.log, warn: console.warn, error: console.error };
  const f = makeFetch();
  delete process.env.POLYGON_API_KEY;
  global.fetch = f;
  console.log = console.warn = console.error = function () {};
  try {
    const r = await mod.handler({
      queryStringParameters: { symbol, interval: '1d', range: range || '5d' },
      multiValueQueryStringParameters: {},
      _testClock: { nowMs }
    });
    return { statusCode: r.statusCode, body: JSON.parse(r.body), fetch: f };
  } finally {
    Object.assign(console, savedConsole);
    global.fetch = savedFetch;
    if (savedEnv === undefined) delete process.env.POLYGON_API_KEY; else process.env.POLYGON_API_KEY = savedEnv;
  }
}
const metaOf = (r) => r.body.chart.result[0].meta;

// ── scenarios: each returns true when the invariant holds, else a short description of the violation ──
async function usOverlay(mod, sym) {
  const r = await callDaily(mod, sym, CLOCK.PRE);
  if (r.statusCode !== 200) return sym + ' PRE: status ' + r.statusCode;
  if (r.fetch.count('yahoo-intraday') !== 1) return sym + ' PRE: intraday requests = ' + r.fetch.count('yahoo-intraday');
  const m = metaOf(r);
  if (m.marketState !== 'PRE') return sym + ' PRE: marketState ' + m.marketState;
  if (m.preMarketPrice !== PRE_PRICE) return sym + ' PRE: preMarketPrice ' + m.preMarketPrice;
  return true;
}
async function taNoOverlay(mod, sym, session) {
  const r = await callDaily(mod, sym, CLOCK[session]);
  if (r.statusCode !== 200) return sym + ' ' + session + ': status ' + r.statusCode;
  if (r.fetch.count('yahoo-intraday') !== 0) return sym + ' ' + session + ': intraday requests = ' + r.fetch.count('yahoo-intraday');
  if (r.fetch.count('yahoo') !== 1) return sym + ' ' + session + ': main requests = ' + r.fetch.count('yahoo');
  const m = metaOf(r);
  for (const k of ['marketState', 'preMarketPrice', 'preMarketChangePercent', 'postMarketPrice', 'postMarketChangePercent']) {
    if (k in m) return sym + ' ' + session + ': ' + k + ' present';
  }
  return true;
}

test('TS-1 US AAPL in PRE: one intraday request; marketState PRE; preMarketPrice present', async () => {
  assert.strictEqual(await usOverlay(loadFresh(HANDLER_PATH), 'AAPL'), true);
});
test('TS-1b US AAPL in POST: overlay applied (postMarketPrice), unchanged behaviour', async () => {
  const r = await callDaily(loadFresh(HANDLER_PATH), 'AAPL', CLOCK.POST);
  assert.strictEqual(r.fetch.count('yahoo-intraday'), 1);
  assert.strictEqual(metaOf(r).marketState, 'POST');
  assert.strictEqual(metaOf(r).postMarketPrice, POST_PRICE);
});
test('TS-2 MTRX.TA in PRE: zero intraday requests; 200; no overlay fields', async () => {
  assert.strictEqual(await taNoOverlay(loadFresh(HANDLER_PATH), 'MTRX.TA', 'PRE'), true);
});
test('TS-3 MTRX.TA in POST: zero intraday requests; no postMarketPrice', async () => {
  assert.strictEqual(await taNoOverlay(loadFresh(HANDLER_PATH), 'MTRX.TA', 'POST'), true);
});
test('TS-4 BRK.B (dot-class US share) in PRE: overlay as for AAPL', async () => {
  assert.strictEqual(await usOverlay(loadFresh(HANDLER_PATH), 'BRK.B'), true);
});
test('TS-5 REGULAR / CLOSED: zero intraday requests for any symbol', async () => {
  const mod = loadFresh(HANDLER_PATH);
  for (const sym of ['AAPL', 'MTRX.TA', 'BRK.B']) {
    for (const session of ['REGULAR', 'CLOSED']) {
      for (const range of ['1d', '5d']) {
        const r = await callDaily(mod, sym, CLOCK[session], range);
        assert.strictEqual(r.statusCode, 200, sym + ' ' + session);
        assert.strictEqual(r.fetch.count('yahoo-intraday'), 0, sym + ' ' + session + ' ' + range);
      }
    }
  }
});
test('TS-6 lower-case .ta is treated like .TA', async () => {
  const mod = loadFresh(HANDLER_PATH);
  assert.strictEqual(await taNoOverlay(mod, 'mtrx.ta', 'PRE'), true);
  assert.strictEqual(await taNoOverlay(mod, 'mtrx.ta', 'POST'), true);
});

// ── planted negatives (mutate the production source) ─────────────────────────────────────
const LINE_79 = "      _needsOverlay = (_session === 'PRE' || _session === 'POST') && !/\\.TA$/i.test(sym);\n";
test('TS-N1 negative: .TA exclusion removed -> TS-2 is violated', async () => {
  assert.strictEqual(await taNoOverlay(loadFresh(HANDLER_PATH), 'MTRX.TA', 'PRE'), true, 'the real source passes the scenario');
  const mut = mutantHandler('exclusion removed', [[LINE_79, "      _needsOverlay = _session === 'PRE' || _session === 'POST';\n"]]);
  assert.notStrictEqual(await taNoOverlay(mut, 'MTRX.TA', 'PRE'), true);
});
test('TS-N2 negative: regex widened to any dotted symbol -> TS-4 is violated', async () => {
  assert.strictEqual(await usOverlay(loadFresh(HANDLER_PATH), 'BRK.B'), true, 'the real source passes the scenario');
  const mut = mutantHandler('regex widened', [[LINE_79, "      _needsOverlay = (_session === 'PRE' || _session === 'POST') && !/\\./.test(sym);\n"]]);
  assert.notStrictEqual(await usOverlay(mut, 'BRK.B'), true);
});

// ── run, then clean ──────────────────────────────────────────────────────────────────────
(async () => {
  for (const t of pending) {
    try { await t.fn(); passed += 1; } catch (e) { failed += 1; failures.push(t.name + ' -- ' + (e && e.message ? e.message : String(e))); }
  }
  for (const d of TMP_DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
  if (failed > 0) {
    for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
    process.stdout.write('\nOFFLINE VALIDATION (tase session overlay): FAIL (' + failed + '/' + (passed + failed) + ')\n');
    process.exit(1);
  }
  process.stdout.write('  PASS  ' + passed + ' tase-session-overlay assertion(s) passed\n');
  process.stdout.write('OFFLINE VALIDATION (tase session overlay): PASS (' + passed + '/' + passed + ')\n');
  process.exit(0);
})();
