'use strict';

/*
 * qa/ath_ensure_offline.js
 *
 * R-1 Slice B2-auto — the public ath-ensure route (brief section 5.2, E-1..E-10 plus the split /
 * raise / upgrade flows). Exercises netlify/functions/lib/ath-ensure-core.js through the real
 * handler with an injected spy store (event._testStore), an injected clock (event._testClock) and
 * a STUBBED Yahoo fetch (event._testFetch). No network, no real Blob store, no real environment;
 * globalThis.fetch is replaced by a throwing spy for the whole run.
 *
 * Planted negatives mutate the PRODUCTION source text (anchor proven to occur exactly once), are
 * paired with a positive control, and must make the predicate RETURN false.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const ENSURE_PATH = path.join(LIB, 'ath-ensure-core.js');
const RECORD_PATH = path.join(LIB, 'ath-record.js');

const core = require(ENSURE_PATH);
const ath = require(RECORD_PATH);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    process.stdout.write('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e) + '\n');
  }
}

function ok(cond, msg) {
  if (!cond) { throw new Error(msg || 'assertion failed'); }
}

function loadMutated(file, mutations) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  mutations.forEach(function (m) {
    if (src.split(m[0]).length !== 2) { throw new Error('MUTANT_ANCHOR_MISSING_OR_NOT_UNIQUE: ' + m[0]); }
    src = src.replace(m[0], m[1]);
  });
  const mod = { exports: {} };
  const localRequire = function (p) {
    return require(p.charAt(0) === '.' ? path.resolve(path.dirname(file), p) : p);
  };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, localRequire);
  return mod.exports;
}

const NOW_ISO = '2026-10-08T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const HOUR = 3600 * 1000;
const BUDGET_KEY = 'ath:budget:2026-10-08T12';

const ENV_KEYS = ['PT_ENABLE_ATH_ENSURE_SERVER', 'PT_ENABLE_ATH_READ_SERVER', 'PT_ENABLE_ATH_WRITE_SERVER', 'PT_ATH_WRITE_TOKEN', 'PT_ATH_READ_TOKEN', 'PT_ATH_ALLOWED_TICKERS'];

async function withEnv(envObj, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(envObj || {}).forEach(function (k) { process.env[k] = envObj[k]; });
  try {
    return await fn();
  } finally {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    });
  }
}

const ARMED = { PT_ENABLE_ATH_ENSURE_SERVER: 'true' };

function makeSpyStore(opts) {
  opts = opts || {};
  const data = Object.assign({}, opts.seed || {});
  const log = [];
  return {
    data: data,
    log: log,
    get: async function (key, o) {
      log.push({ op: 'get', key: key, opts: o });
      if (opts.getThrows) { throw new Error('boom-get-injected'); }
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    set: async function (key, value, o) { log.push({ op: 'set', key: key, value: value, opts: o }); data[key] = value; return { modified: true }; },
    delete: async function (key) { log.push({ op: 'delete', key: key }); delete data[key]; },
    list: async function () { log.push({ op: 'list' }); return { blobs: [] }; }
  };
}

// ── Yahoo stub ────────────────────────────────────────────────────────────────
function tsOf(day) { return Date.parse(day + 'T14:30:00Z') / 1000; }

function chartJson(rows, o) {
  o = o || {};
  const first = o.firstTradeDay || rows[0][0];
  const body = {
    chart: {
      result: [{
        meta: { currency: o.currency || 'USD', symbol: 'YAHOO_RAW_MARKER', longName: 'YAHOO_RAW_MARKER Inc', exchangeTimezoneName: o.tz || 'America/New_York', firstTradeDate: tsOf(first) },
        timestamp: rows.map(function (r) { return tsOf(r[0]); }),
        indicators: { quote: [{
          open: rows.map(function (r) { return r[1]; }),
          high: rows.map(function (r) { return r[2]; }),
          low: rows.map(function () { return 1; }),
          close: rows.map(function (r) { return r[3]; })
        }] }
      }]
    }
  };
  if (o.splits) {
    body.chart.result[0].events = { splits: {} };
    o.splits.forEach(function (s, i) { body.chart.result[0].events.splits[String(i)] = { date: tsOf(s[0]), numerator: s[1], denominator: s[2] || 1 }; });
  }
  return body;
}

// responses: array (last repeats), or function(url, index). An Error throws; { http: n } is an HTTP failure.
function makeFetch(responses) {
  const calls = [];
  const fn = async function (url) {
    calls.push(url);
    const i = calls.length - 1;
    const r = typeof responses === 'function' ? responses(url, i) : responses[Math.min(i, responses.length - 1)];
    if (r instanceof Error) { throw r; }
    if (r && r.http) { return { ok: false, status: r.http }; }
    return { ok: true, json: async function () { return r; } };
  };
  fn.calls = calls;
  return fn;
}

const FULL_ROWS = [['2002-08-12', 100, 110, 105], ['2021-11-11', 140, 150, 145], ['2026-09-22', 340, 345.34, 344], ['2026-10-07', 300, 310, 305]];
const FULL = chartJson(FULL_ROWS);

// ── records ───────────────────────────────────────────────────────────────────
function iso(msAgo) { return new Date(NOW_MS - msAgo).toISOString(); }

function autoRecord(over) {
  return Object.assign({
    schema: 'ath:v2', ticker: 'AAPL', providerSymbol: 'AAPL', currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified', method: 'auto', athValue: 100, athDate: '2026-09-22', verifiedAt: iso(30 * 24 * HOUR),
    evidence: {
      source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11000,
      matchedBar: { date: '2026-09-22', high: 100, open: 97, close: 99 }, rejectedBars: [], splitsSeen: [], reason: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, lastCheckedAt: iso(7 * HOUR), splitCheckedThrough: iso(7 * HOUR).slice(0, 10)
  }, over || {});
}

function operatorRecord(over) {
  const r = autoRecord(over);
  r.method = 'operator';
  r.evidence = {
    tradingViewHigh: 100, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
    matchedBar: { date: r.athDate, high: r.athValue }, toleranceUsed: 0.005,
    yahooBarCount: 11000, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
  };
  if (!over || over.splitCheckedThrough === undefined) { r.splitCheckedThrough = null; }
  return r;
}

function unresolvedAuto(over) {
  const r = autoRecord(Object.assign({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null }, over || {}));
  r.evidence.matchedBar = null; r.evidence.reason = 'COVERAGE';
  r.refresh = { status: 'unresolved', lastAttemptAt: r.lastCheckedAt, reason: 'COVERAGE' };
  return r;
}

function v1Record() {
  return {
    schema: 'ath:v1', ticker: 'AAPL', providerSymbol: 'AAPL', tradingViewSymbol: 'NASDAQ:AAPL', currency: 'USD', unit: 'USD',
    basis: 'split-adjusted-no-dividend-adjust', status: 'verified', athValue: 100, athDate: '2026-09-22', verifiedAt: iso(30 * 24 * HOUR), verifiedBy: 'operator',
    evidence: {
      tradingViewHigh: 100, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
      matchedBar: { date: '2026-09-22', high: 100 }, toleranceUsed: 0.005,
      yahooBarCount: 11000, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, pending: null, lastCheckedAt: iso(7 * HOUR)
  };
}

function seed(rec, extra) { const o = Object.assign({}, extra || {}); o['ath:v1:' + rec.ticker] = JSON.stringify(rec); return o; }

function ev(o) {
  o = o || {};
  const e = { httpMethod: o.method || 'POST', headers: { authorization: o.auth }, body: o.body === undefined ? JSON.stringify({ ticker: o.ticker || 'AAPL' }) : o.body };
  if (o.store) { e._testStore = o.store; }
  if (o.fetch) { e._testFetch = o.fetch; }
  e._testClock = { nowMs: o.nowMs === undefined ? NOW_MS : o.nowMs };
  return e;
}

async function call(mod, o, env) {
  return withEnv(env || ARMED, function () { return mod.handler(ev(o)); });
}
function parsed(r) { return JSON.parse(r.body); }
function sets(store, key) { return store.log.filter(function (l) { return l.op === 'set' && (key === undefined || l.key === key); }); }
function stored(store, ticker) { return JSON.parse(store.data['ath:v1:' + (ticker || 'AAPL')]); }

const PUBLIC_KEYS = 'action,athDate,athValue,basis,budget,currency,method,readContractVersion,recordStatus,status,ticker,unit,verifiedAt';

// ── predicates ────────────────────────────────────────────────────────────────
async function pE1(m) {
  const store = makeSpyStore(); const f = makeFetch([FULL]);
  const r = await withEnv({}, function () { return m.handler(Object.assign(ev({ store: store, fetch: f }), { body: '{not json' })); });
  return r.statusCode === 200 && r.body === JSON.stringify({ status: 'DISABLED', reason: 'SERVER_DISABLED' }) && store.log.length === 0 && f.calls.length === 0;
}
async function pE2(m) {
  const bodies = [{ ticker: 'AAPL', athValue: 999 }, { ticker: 'AAPL', price: 150 }, { ticker: 'AAPL', date: '2026-10-01' }, { ticker: 'AAPL', ath: 1 }, {}, { athValue: 5 }];
  for (const b of bodies) {
    const store = makeSpyStore(); const f = makeFetch([FULL]);
    const r = await call(m, { body: JSON.stringify(b), store: store, fetch: f });
    if (!(r.statusCode === 400 && parsed(r).status === 'INVALID_SUBMISSION' && f.calls.length === 0 && store.log.length === 0)) { return false; }
  }
  return true;
}
async function pE3(m) {
  const store = makeSpyStore(); const f = makeFetch([FULL]);
  const r = parsed(await call(m, { store: store, fetch: f }));
  return f.calls.length === 1 && r.action === 'derived' && r.athValue === 345.34 && r.recordStatus === 'verified';
}
async function pE4(m) {
  const cases = [
    [autoRecord({ lastCheckedAt: iso(6 * HOUR - 1000) }), 0], [autoRecord({ lastCheckedAt: iso(6 * HOUR) }), 1],
    [unresolvedAuto({ lastCheckedAt: iso(24 * HOUR - 1000) }), 0], [unresolvedAuto({ lastCheckedAt: iso(24 * HOUR) }), 1],
    [operatorRecord({ status: 'stale-suspect', lastCheckedAt: iso(400 * HOUR) }), 0],
    [autoRecord({ status: 'stale-suspect', lastCheckedAt: iso(5 * HOUR) }), 0], [autoRecord({ status: 'stale-suspect', lastCheckedAt: iso(6 * HOUR) }), 1]
  ];
  for (const c of cases) {
    const store = makeSpyStore({ seed: seed(c[0]) }); const f = makeFetch([chartJson([['2026-10-05', 90, 95, 94]], { firstTradeDay: '1980-12-12' })]);
    await call(m, { store: store, fetch: f });
    if (f.calls.length !== c[1]) { return false; }
    if (c[1] === 0 && sets(store).length !== 0) { return false; }
  }
  return true;
}
async function pE5(m) {
  const store = makeSpyStore({ seed: seed(autoRecord({ lastCheckedAt: iso(10 * HOUR) }), { [BUDGET_KEY]: '300' }) }); const f = makeFetch([FULL]);
  const r = parsed(await call(m, { store: store, fetch: f }));
  return f.calls.length === 0 && r.budget === 'exhausted' && r.athValue === 100 && sets(store).length === 0;
}
async function pE6(m) {
  const store = makeSpyStore({ seed: seed(autoRecord({ lastCheckedAt: iso(7 * HOUR) })) }); const f = makeFetch([new Error('network down')]);
  const r = parsed(await call(m, { store: store, fetch: f }));
  const rec = stored(store);
  return r.athValue === 100 && r.recordStatus === 'verified' && rec.athValue === 100 && rec.status === 'verified' && rec.refresh.status === 'unresolved' && rec.refresh.reason === 'FETCH_FAILED';
}
async function pE7(m) {
  const scenarios = [
    { store: makeSpyStore(), fetch: makeFetch([FULL]) },
    { store: makeSpyStore({ seed: seed(autoRecord()) }), fetch: makeFetch([chartJson([['2026-10-05', 100, 104, 103]], { firstTradeDay: '1980-12-12' })]) },
    { store: makeSpyStore({ seed: seed(autoRecord({ athValue: 1000, lastCheckedAt: iso(7 * 24 * HOUR), splitCheckedThrough: '2026-10-01', evidence: Object.assign(autoRecord().evidence, { matchedBar: { date: '2026-09-22', high: 1000, open: 990, close: 995 } }) })) }),
      fetch: makeFetch(function (url, i) { return i === 0 ? chartJson([['2026-10-05', 90, 95, 94]], { firstTradeDay: '1980-12-12', splits: [['2026-10-06', 10]] }) : chartJson(FULL_ROWS.map(function (r) { return [r[0], r[1] / 10, r[2] / 10, r[3] / 10]; }), { splits: [['2026-10-06', 10]] }); }) },
    { store: makeSpyStore({ seed: seed(operatorRecord()) }), fetch: makeFetch([FULL]) }
  ];
  for (const s of scenarios) {
    await call(m, { store: s.store, fetch: s.fetch });
    const bad = s.store.log.some(function (l) {
      if (l.op !== 'get' && l.op !== 'set') { return true; }
      return !(l.key === 'ath:v1:AAPL' || /^ath:budget:\d{4}-\d{2}-\d{2}T\d{2}$/.test(l.key));
    });
    if (bad) { return false; }
  }
  return true;
}
async function pE8(m) {
  const store = makeSpyStore(); const f = makeFetch([FULL]);
  const r = await call(m, { store: store, fetch: f });
  const b = parsed(r);
  const second = await call(m, { store: makeSpyStore({ seed: seed(autoRecord({ lastCheckedAt: iso(7 * HOUR) })) }), fetch: makeFetch([new Error('x')]) });
  return Object.keys(b).sort().join() === PUBLIC_KEYS &&
    !/evidence|refresh|lastCheckedAt|splitCheckedThrough|rejectedBars|matchedBar|YAHOO_RAW_MARKER|barCount|firstTradeDate|FETCH_FAILED/.test(r.body + second.body) && r.headers['Cache-Control'] === 'no-store';
}
async function pE9(m) {
  const mk = function () { return makeSpyStore({ seed: seed(autoRecord({ lastCheckedAt: iso(1 * HOUR) })) }); };
  const none = await call(m, { store: mk(), fetch: makeFetch([FULL]) });
  const garbage = await call(m, { auth: 'Bearer garbage', store: mk(), fetch: makeFetch([FULL]) });
  const store3 = makeSpyStore(); const f3 = makeFetch([FULL]);
  const fresh = await call(m, { store: store3, fetch: f3 });
  const freshAuth = await call(m, { auth: 'Bearer x', store: makeSpyStore(), fetch: makeFetch([FULL]) });
  const withTokens = await call(m, { store: makeSpyStore(), fetch: makeFetch([FULL]) }, Object.assign({ PT_ATH_WRITE_TOKEN: 'w', PT_ATH_READ_TOKEN: 'r' }, ARMED));
  return parsed(none).status === 'OK' && none.body === garbage.body && fresh.body === freshAuth.body && fresh.body === withTokens.body && parsed(fresh).status === 'OK';
}
async function pE10(m) {
  const store = makeSpyStore({ seed: seed(autoRecord({ lastCheckedAt: iso(7 * HOUR) })) }); const f = makeFetch([chartJson([['2026-10-05', 90, 95, 94]], { firstTradeDay: '1980-12-12' })]);
  const before = stored(store);
  await call(m, { store: store, fetch: f });
  const recSets = sets(store, 'ath:v1:AAPL');
  const after = stored(store);
  const strip = function (r) { const c = JSON.parse(JSON.stringify(r)); delete c.lastCheckedAt; delete c.splitCheckedThrough; return JSON.stringify(c); };
  const again = await call(m, { store: store, fetch: f });
  return recSets.length === 1 && strip(before) === strip(after) && after.lastCheckedAt === NOW_ISO && f.calls.length === 1 && sets(store, 'ath:v1:AAPL').length === 1 && parsed(again).action === 'none';
}
async function pOperatorSplit(m) {
  const store = makeSpyStore({ seed: seed(operatorRecord({ verifiedAt: iso(30 * 24 * HOUR), lastCheckedAt: iso(7 * HOUR) })) });
  const f = makeFetch(function (url, i) {
    return i === 0 ? chartJson([['2026-10-05', 9, 9.5, 9.4]], { firstTradeDay: '1980-12-12', splits: [['2026-10-06', 10]] }) : FULL;
  });
  const r = parsed(await call(m, { store: store, fetch: f }));
  const rec = stored(store);
  return f.calls.length === 1 && rec.method === 'operator' && rec.status === 'stale-suspect' && rec.refresh.reason === 'SPLIT_NEEDS_RECOVERY' && rec.athValue === 100 &&
    r.recordStatus === 'stale-suspect' && r.athValue === null && r.action === 'stale-suspect';
}
async function pNoAuthRequired(m) {
  const r = parsed(await call(m, { store: makeSpyStore(), fetch: makeFetch([FULL]) }));
  return r.status === 'OK';
}

async function main() {
  const realFetch = globalThis.fetch;
  let realFetchCalls = 0;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('REAL_FETCH_FORBIDDEN'); };
  try {
    await test('E-1 gate off: DISABLED, zero store calls, zero fetches, nothing parsed; only the exact string true opens it', async function () {
      ok(await pE1(core), 'E-1');
      const store = makeSpyStore(); const f = makeFetch([FULL]);
      ok(parsed(await call(core, { store: store, fetch: f }, { PT_ENABLE_ATH_ENSURE_SERVER: 'TRUE' })).status === 'DISABLED', 'TRUE');
      ok(parsed(await call(core, { store: store, fetch: f }, { PT_ENABLE_ATH_READ_SERVER: 'true', PT_ENABLE_ATH_WRITE_SERVER: 'true' })).status === 'DISABLED', 'other gates do not open it');
      ok(store.log.length === 0 && f.calls.length === 0, 'still nothing');
    });

    await test('E-2 any key besides ticker (athValue, price, date, ...) is 400 INVALID_SUBMISSION with zero fetch and zero store calls', async function () {
      ok(await pE2(core), 'E-2');
      const store = makeSpyStore(); const f = makeFetch([FULL]);
      const t = await call(core, { body: JSON.stringify({ ticker: 'aapl' }), store: store, fetch: f });
      ok(t.statusCode === 400 && parsed(t).status === 'INVALID_TICKER' && f.calls.length === 0 && store.log.length === 0, 'bad ticker');
      for (const body of ['{not json', '[]', '', 'null']) {
        const r = await call(core, { body: body, store: store, fetch: f });
        ok(r.statusCode === 400 && parsed(r).status === 'INVALID_JSON', 'body ' + body);
      }
      ok((await call(core, { method: 'OPTIONS' })).statusCode === 204 && (await call(core, { method: 'GET' })).statusCode === 405, 'OPTIONS / GET');
      ok(f.calls.length === 0 && store.log.length === 0, 'no I/O on any refusal');
    });

    await test('E-3 no record: exactly one fetch (full history, events=split), a derived verified auto record is stored, action derived', async function () {
      ok(await pE3(core), 'E-3');
      const store = makeSpyStore(); const f = makeFetch([FULL]);
      const r = parsed(await call(core, { store: store, fetch: f }));
      ok(f.calls[0].indexOf('/AAPL?interval=1d&period1=0&period2=' + Math.floor(NOW_MS / 1000) + '&events=split') !== -1, 'url ' + f.calls[0]);
      const rec = stored(store);
      ok(ath.validateRecordV2(rec).ok === true && rec.method === 'auto' && rec.status === 'verified' && rec.athValue === 345.34 && rec.athDate === '2026-09-22', 'stored record');
      ok(r.method === 'auto' && r.budget === 'ok' && r.verifiedAt === NOW_ISO, 'response');
      ok(store.data[BUDGET_KEY] === '1', 'budget counted');
      const ta = makeSpyStore(); const fta = makeFetch([chartJson([['2007-07-30', 14000, 15240, 15000], ['2026-10-07', 9000, 9500, 9100]], { currency: 'ILA', tz: 'Asia/Jerusalem' })]);
      const rta = parsed(await call(core, { ticker: 'MTRX.TA', store: ta, fetch: fta }));
      ok(rta.unit === 'ILA' && rta.currency === 'ILS' && rta.athValue === 15240, 'MTRX.TA in ILA');
    });

    await test('E-4 cooldowns: verified 6 h, unresolved 24 h, auto stale-suspect 6 h; an operator stale-suspect record is never fetched; no write inside a cooldown', async function () {
      ok(await pE4(core), 'E-4');
    });

    await test('E-5 budget: the 301st fetch in an hour makes none, reports exhausted and returns the record; a new hour starts a new counter', async function () {
      ok(await pE5(core), 'E-5');
      const none = makeSpyStore({ seed: { [BUDGET_KEY]: '300' } }); const f = makeFetch([FULL]);
      const r = parsed(await call(core, { store: none, fetch: f }));
      ok(r.status === 'NOT_AVAILABLE' && r.budget === 'exhausted' && f.calls.length === 0, 'no record + exhausted');
      const last = makeSpyStore({ seed: { [BUDGET_KEY]: '299' } }); const f2 = makeFetch([FULL]);
      const a = parsed(await call(core, { store: last, fetch: f2 }));
      ok(a.action === 'derived' && last.data[BUDGET_KEY] === '300', 'the 300th is allowed and counted');
      const next = makeSpyStore({ seed: { [BUDGET_KEY]: '300' } }); const f3 = makeFetch([FULL]);
      const b = parsed(await withEnv(ARMED, function () { return core.handler(ev({ store: next, fetch: f3, nowMs: NOW_MS + HOUR })); }));
      ok(b.action === 'derived' && f3.calls.length === 1 && next.data['ath:budget:2026-10-08T13'] === '1', 'next clock hour is a fresh counter');
    });

    await test('E-6 a fetch failure on a verified record keeps the value and records FETCH_FAILED (BODY_INVALID likewise); with no record it stores an unresolved record so the 24 h cooldown applies', async function () {
      ok(await pE6(core), 'E-6');
      const http = makeSpyStore({ seed: seed(autoRecord()) });
      await call(core, { store: http, fetch: makeFetch([{ http: 429 }]) });
      ok(stored(http).refresh.reason === 'FETCH_FAILED' && stored(http).athValue === 100, 'http 429');
      const badBody = makeSpyStore({ seed: seed(autoRecord()) });
      await call(core, { store: badBody, fetch: makeFetch([{ chart: { result: [] } }]) });
      ok(stored(badBody).refresh.reason === 'BODY_INVALID' && stored(badBody).athValue === 100, 'invalid body');
      const none = makeSpyStore(); const f = makeFetch([new Error('down')]);
      const r = parsed(await call(core, { store: none, fetch: f }));
      ok(r.recordStatus === 'unresolved' && r.athValue === null && r.action === 'derived', 'unresolved record');
      ok(stored(none).refresh.reason === 'FETCH_FAILED' && ath.validateRecordV2(stored(none)).ok === true, 'stored reason');
      await call(core, { store: none, fetch: f });
      ok(f.calls.length === 1, 'the 24 h cooldown prevents a refetch');
    });

    await test('E-7 only get / set on ath:v1:<TICKER> and the hourly budget key; never list or delete (derive, raise, split and operator flows)', async function () {
      ok(await pE7(core), 'E-7');
    });

    await test('E-8 a response is exactly the public projection plus action and budget: no evidence, refresh, timestamps or raw Yahoo data; no-store', async function () {
      ok(await pE8(core), 'E-8');
    });

    await test('E-9 a supplied Authorization header (or any token in the environment) changes nothing; none is required', async function () {
      ok(await pE9(core), 'E-9');
      ok(await pNoAuthRequired(core), 'no auth needed');
    });

    await test('E-10 no redundant writes: a no-change check writes only the advanced check clock (content identical); an immediate repeat writes nothing', async function () {
      ok(await pE10(core), 'E-10');
    });

    await test('E-11 an incremental check raises a verified auto record to the new high; an operator record is raised but stays operator', async function () {
      const a = makeSpyStore({ seed: seed(autoRecord()) }); const fa = makeFetch([chartJson([['2026-10-05', 100, 104, 103]], { firstTradeDay: '1980-12-12' })]);
      const ra = parsed(await call(core, { store: a, fetch: fa }));
      ok(ra.action === 'raised' && ra.athValue === 104 && ra.athDate === '2026-10-05' && ra.method === 'auto' && stored(a).evidence.matchedBar.high === 104, 'auto raised');
      ok(fa.calls[0].indexOf('period1=' + Math.floor(Date.parse(iso(7 * HOUR).slice(0, 10) + 'T00:00:00Z') / 1000 - 7 * 86400)) !== -1, 'recent period1 = lastCheckedAt day - 7 d: ' + fa.calls[0]);
      const o = makeSpyStore({ seed: seed(operatorRecord()) }); const fo = makeFetch([chartJson([['2026-10-05', 100, 104, 103]], { firstTradeDay: '1980-12-12' })]);
      const ro = parsed(await call(core, { store: o, fetch: fo }));
      ok(ro.action === 'raised' && ro.athValue === 104 && ro.method === 'operator' && stored(o).evidence.autoRaise.length === 1 && ath.validateRecordV2(stored(o)).ok === true, 'operator raised, stays operator');
      const low = makeSpyStore({ seed: seed(autoRecord()) });
      const rl = parsed(await call(core, { store: low, fetch: makeFetch([chartJson([['2026-10-05', 80, 90, 85]], { firstTradeDay: '1980-12-12' })]) }));
      ok(rl.action === 'checked' && rl.athValue === 100, 'a lower bar never lowers');
      const mat = makeSpyStore({ seed: seed(autoRecord()) });
      const rm = parsed(await call(core, { store: mat, fetch: makeFetch([chartJson([['2026-10-05', 60, 400, 50]], { firstTradeDay: '1980-12-12' })]) }));
      ok(rm.recordStatus === 'verified' && rm.athValue === 100 && stored(mat).refresh.reason === 'SUSPECT_MATERIAL', 'a material suspect bar keeps the value and flags it');
    });

    await test('E-12 a split on a verified auto record: persisted stale-suspect first, then re-derived in the same request (two fetches, two budget units)', async function () {
      const rec = autoRecord({ athValue: 1000, athDate: '2026-09-22', lastCheckedAt: iso(7 * 24 * HOUR), splitCheckedThrough: '2026-10-01', evidence: Object.assign(autoRecord().evidence, { matchedBar: { date: '2026-09-22', high: 1000, open: 990, close: 995 } }) });
      const scaled = FULL_ROWS.map(function (r) { return [r[0], r[1] / 10, r[2] / 10, r[3] / 10]; }); // ATH 34.534 on 2026-09-22 vs 1000 / 10 = 100: inconsistent
      const consistent = [['2002-08-12', 10, 11, 10.5], ['2026-09-22', 99, 100.3, 100]]; // 100.3 vs 1000 / 10 = 100
      const store = makeSpyStore({ seed: seed(rec) });
      const f = makeFetch(function (url, i) {
        return i === 0 ? chartJson([['2026-10-05', 9, 9.5, 9.4]], { firstTradeDay: '1980-12-12', splits: [['2026-10-06', 10]] }) : chartJson(consistent, { splits: [['2026-10-06', 10]] });
      });
      const r = parsed(await call(core, { store: store, fetch: f }));
      const order = sets(store).map(function (s) { return s.key === 'ath:v1:AAPL' ? JSON.parse(s.value).status : 'budget'; });
      ok(f.calls.length === 2 && f.calls[0].indexOf('period1=0') === -1 && f.calls[1].indexOf('period1=0') !== -1, 'recent then full: ' + f.calls.join(' | '));
      ok(order.join() === 'budget,stale-suspect,budget,verified', 'stale-suspect persisted before the re-derive: ' + order.join());
      ok(r.action === 'derived' && r.recordStatus === 'verified' && r.athValue === 100.3 && store.data[BUDGET_KEY] === '2', 'consistent re-derive accepted: ' + r.athValue);
      const bad = makeSpyStore({ seed: seed(rec) });
      const fbad = makeFetch(function (url, i) {
        return i === 0 ? chartJson([['2026-10-05', 9, 9.5, 9.4]], { firstTradeDay: '1980-12-12', splits: [['2026-10-06', 10]] }) : chartJson(scaled.slice(0, 2).concat([['2026-09-30', 1, 1.5, 1.2]]).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }), { splits: [['2026-10-06', 10]] });
      });
      const rb = parsed(await call(core, { store: bad, fetch: fbad }));
      ok(rb.recordStatus === 'stale-suspect' && rb.athValue === null && rb.action === 'stale-suspect' && stored(bad).refresh.reason === 'SPLIT_INCONSISTENT' && stored(bad).athValue === 1000, 'inconsistent re-derive stays stale-suspect: ' + JSON.stringify(rb));
      const again = makeFetch([FULL]);
      await call(core, { store: bad, fetch: again });
      ok(again.calls.length === 0, 'retried only after the 6 h cooldown');
    });

    await test('E-13 a split on a verified operator record: stale-suspect / SPLIT_NEEDS_RECOVERY after ONE fetch, no automatic re-derive, and it is never fetched again', async function () {
      ok(await pOperatorSplit(core), 'E-13');
      const store = makeSpyStore({ seed: seed(operatorRecord({ verifiedAt: iso(30 * 24 * HOUR), lastCheckedAt: iso(7 * HOUR) })) });
      await call(core, { store: store, fetch: makeFetch([chartJson([['2026-10-05', 9, 9.5, 9.4]], { firstTradeDay: '1980-12-12', splits: [['2026-10-06', 10]] })]) });
      const f = makeFetch([FULL]);
      await withEnv(ARMED, function () { return core.handler(ev({ store: store, fetch: f, nowMs: NOW_MS + 90 * 24 * HOUR })); });
      ok(f.calls.length === 0, 'an operator stale-suspect record is only recovered through the protected path');
    });

    await test('E-14 a v1 record is read as operator and written back as v2 only when it next changes; an unresolved operator record (no value to protect) is derived after 24 h', async function () {
      const store = makeSpyStore({ seed: seed(v1Record()) });
      const none = await call(core, { store: makeSpyStore({ seed: seed(Object.assign(v1Record(), { lastCheckedAt: iso(1 * HOUR) })) }), fetch: makeFetch([FULL]) });
      ok(parsed(none).method === 'operator' && parsed(none).action === 'none', 'cooldown: read as operator, nothing written');
      const r = parsed(await call(core, { store: store, fetch: makeFetch([chartJson([['2026-10-05', 100, 101, 100]], { firstTradeDay: '1980-12-12' })]) }));
      ok(r.method === 'operator' && stored(store).schema === 'ath:v2' && stored(store).method === 'operator' && ath.validateRecordV2(stored(store)).ok === true, 'written back as v2 operator');
      const v1u = v1Record(); v1u.status = 'unresolved'; v1u.athValue = null; v1u.athDate = null; v1u.verifiedAt = null; v1u.verifiedBy = null; v1u.evidence.matchedBar = null; v1u.lastCheckedAt = iso(25 * HOUR);
      const us = makeSpyStore({ seed: seed(v1u) }); const fu = makeFetch([FULL]);
      const ru = parsed(await call(core, { store: us, fetch: fu }));
      ok(fu.calls.length === 1 && ru.method === 'auto' && ru.recordStatus === 'verified', 'unresolved operator record is derived');
    });

    await test('E-15 corrupt or mismatched stored content is DEGRADED and never overwritten; a store failure is DEGRADED with no fetch', async function () {
      const f = makeFetch([FULL]);
      const corrupt = makeSpyStore({ seed: { 'ath:v1:AAPL': '{not json' } });
      ok(parsed(await call(core, { store: corrupt, fetch: f })).reason === 'STORE_RECORD_INVALID' && sets(corrupt).length === 0, 'corrupt');
      const wrong = makeSpyStore({ seed: { 'ath:v1:AAPL': JSON.stringify(autoRecord({ ticker: 'MSFT', providerSymbol: 'MSFT' })) } });
      ok(parsed(await call(core, { store: wrong, fetch: f })).reason === 'STORE_RECORD_INVALID' && sets(wrong).length === 0, 'ticker mismatch');
      const throws = makeSpyStore({ getThrows: true });
      const t = parsed(await call(core, { store: throws, fetch: f }));
      ok(t.status === 'DEGRADED' && t.reason === 'STORE_UNAVAILABLE' && f.calls.length === 0, 'store down');
    });

    await test('E-16 a unit change (an ILA record now reported in another currency) is UNSUPPORTED and keeps the value', async function () {
      const rec = autoRecord({ ticker: 'MTRX.TA', providerSymbol: 'MTRX.TA', currency: 'ILS', unit: 'ILA' });
      const store = makeSpyStore({ seed: seed(rec) });
      const r = parsed(await call(core, { ticker: 'MTRX.TA', store: store, fetch: makeFetch([chartJson([['2026-10-05', 100, 104, 103]], { currency: 'USD', tz: 'Asia/Jerusalem' })]) }));
      ok(r.athValue === 100 && stored(store, 'MTRX.TA').refresh.reason === 'UNSUPPORTED', 'unsupported');
    });

    await test('E-17 the real fetch was never called', async function () {
      ok(realFetchCalls === 0, 'real fetch calls: ' + realFetchCalls);
    });

    // ── planted negatives ───────────────────────────────────────────────────
    async function killed(name, mutations, predicate) {
      await test('PN ' + name + ' is killed', async function () {
        ok((await predicate(core)) === true, 'positive control: the unmutated module must pass the predicate');
        const mutant = loadMutated(ENSURE_PATH, mutations);
        let survived;
        try { survived = (await predicate(mutant)) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
        ok(!survived, 'mutant survived: the predicate still passes');
      });
    }

    await killed('E-1 the ensure gate is skipped', [['process.env.PT_ENABLE_ATH_ENSURE_SERVER !== \'true\'', 'false']], pE1);
    await killed('E-2 an extra body key is accepted', [['if (keys.length !== 1 || keys[0] !== \'ticker\') {', 'if (keys.indexOf(\'ticker\') === -1) {']], pE2);
    await killed('E-3 a full derive fetches twice', [['async function fullDerive(ctx, existing) {\n  const r = await fetchChart(ctx.ticker, { fetchImpl: ctx.fetchImpl, nowMs: ctx.nowMs });', 'async function fullDerive(ctx, existing) {\n  await fetchChart(ctx.ticker, { fetchImpl: ctx.fetchImpl, nowMs: ctx.nowMs });\n  const r = await fetchChart(ctx.ticker, { fetchImpl: ctx.fetchImpl, nowMs: ctx.nowMs });']], pE3);
    await killed('E-4 the verified cooldown is ignored', [['return age >= VERIFIED_COOLDOWN_MS ? \'RECENT\' : \'NONE\';', 'return \'RECENT\';']], pE4);
    await killed('E-4 an operator stale-suspect record is fetched', [['if (record.method === \'operator\') { return \'NONE\'; }', 'if (false) { return \'NONE\'; }']], pE4);
    await killed('E-4 the unresolved cooldown is ignored', [['return age >= UNRESOLVED_COOLDOWN_MS ? \'FULL\' : \'NONE\';', 'return \'FULL\';']], pE4);
    await killed('E-5 the budget is ignored', [['if (used >= BUDGET_PER_HOUR) { return false; }', 'if (false) { return false; }']], pE5);
    await killed('E-6 a fetch failure clears the verified value', [['if (!r.ok) { return { record: recordFetchFailure(existing, null, r.reason, ctx.nowIso), action: \'checked\' }; }', 'if (!r.ok) { return { record: recordFetchFailure(null, Object.assign({ ticker: ctx.ticker }, unitForTicker(ctx.ticker)), r.reason, ctx.nowIso), action: \'checked\' }; }']], pE6);
    await killed('E-7 a list call is made', [['try { raw = await store.get(key, STRONG); }', 'try { await store.list(); raw = await store.get(key, STRONG); }']], pE7);
    await killed('E-7 a delete call is made', [['await store.set(key, serialized);', 'await store.set(key, serialized); await store.delete(\'ath:budget:x\');']], pE7);
    await killed('E-8 the evidence is leaked in the response', [['{ action: action, budget: budget }', '{ action: action, budget: budget, evidence: record.evidence }']], pE8);
    await killed('E-9 a token is required again', [['const pf = evaluateAthPreflight({ side: \'ensure\'', 'if (!(event && event.headers && event.headers.authorization)) { return res(401, { status: \'UNAUTHORIZED\' }); }\n  const pf = evaluateAthPreflight({ side: \'ensure\'']], pNoAuthRequired);
    await killed('E-10 the record is written twice', [['if (serialized !== persisted) { await store.set(key, serialized); }', 'await store.set(key, serialized); await store.set(key, serialized);']], pE10);
    await killed('E-13 an operator record is automatically re-derived after a split', [['if (!sp.rederive) { return { record: sp.record, action: \'stale-suspect\' }; }', 'if (false) { return { record: sp.record, action: \'stale-suspect\' }; }']], pOperatorSplit);
  } finally {
    globalThis.fetch = realFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exitCode = 1; }
}

main().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 1;
});
