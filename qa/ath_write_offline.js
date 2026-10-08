'use strict';

/*
 * qa/ath_write_offline.js
 *
 * R-1 Slice B (B3) — gated ATH writer and the server-side verification rule.
 *
 *   AR-4  token before ticker/body, gate, 0.5% boundary, a failed attempt never overwrites a
 *         verified record, client-supplied status is ignored and recomputed.
 *   AR-5  the writer DERIVES the matched bar, every higher bar and the covered / uncovered
 *         split from the submitted FULL Yahoo daily series; independent evidence (brief section 4).
 *   AR-8  no plausibility path, no operator override, no free-text reason, and no client-supplied
 *         matchedBar / higherBars list is ever trusted (Amendment 2, ruling F1 = Option B).
 *
 * Real handler + real ath-record module, injected spy store and clock, no network. Planted
 * negatives mutate the production source text and must make the matching predicate fail.
 *
 * TRUST BOUNDARY recorded in the brief: the Yahoo series is operator-supplied in B1+B3. The
 * writer checks its schema, ordering and recency; it does not fetch Yahoo.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const WRITE_PATH = path.join(LIB, 'ath-write-core.js');
const RECORD_PATH = path.join(LIB, 'ath-record.js');

const core = require(WRITE_PATH);
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
  let src = fs.readFileSync(file, 'utf8');
  mutations.forEach(function (m) {
    if (src.indexOf(m[0]) === -1) { throw new Error('MUTANT_ANCHOR_MISSING: ' + m[0]); }
    src = src.replace(m[0], m[1]);
  });
  const mod = { exports: {} };
  const localRequire = function (p) {
    return require(p.charAt(0) === '.' ? path.resolve(path.dirname(file), p) : p);
  };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, localRequire);
  return mod.exports;
}

const WRITE_TOKEN = 'ath-write-tok-qa-1';
const READ_TOKEN = 'ath-read-tok-qa-1';
const NOW_ISO = '2026-10-07T10:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

const ENV_KEYS = [
  'PT_ENABLE_ATH_READ_SERVER', 'PT_ATH_READ_TOKEN',
  'PT_ENABLE_ATH_WRITE_SERVER', 'PT_ATH_WRITE_TOKEN',
  'PT_ATH_ALLOWED_TICKERS',
  'PT_FUND_FACTS_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN', 'PT_OWNER_TOKEN'
];

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

function armed(extra) {
  return Object.assign({
    PT_ENABLE_ATH_WRITE_SERVER: 'true',
    PT_ATH_WRITE_TOKEN: WRITE_TOKEN,
    PT_ATH_READ_TOKEN: READ_TOKEN,
    PT_ATH_ALLOWED_TICKERS: 'AAPL,TEVA.TA,NICE.TA'
  }, extra || {});
}

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
    set: async function (key, value, o) {
      log.push({ op: 'set', key: key, value: value, opts: o });
      if (opts.setThrows) { throw new Error('boom-set-injected'); }
      data[key] = value;
      return { modified: true };
    },
    delete: async function (key) { log.push({ op: 'delete', key: key }); delete data[key]; }
  };
}

function ev(o) {
  o = o || {};
  const e = { httpMethod: o.method || 'POST', headers: { authorization: o.auth }, body: o.body };
  if (o.store) { e._testStore = o.store; }
  e._testClock = { nowMs: NOW_MS };
  return e;
}

function authOk() { return 'Bearer ' + WRITE_TOKEN; }
function parsed(r) { return JSON.parse(r.body); }

// ── attempt fixtures: a FULL Yahoo daily series, never a verdict ─────────────
// Every series ends on 2026-10-06 (one day before the server clock) so the recency check passes.
function rows(list) { return list.map(function (r) { return { date: r[0], high: r[1] }; }); }

function attempt(over) {
  return Object.assign({
    tradingViewSymbol: 'NASDAQ:AAPL',
    currency: 'USD',
    unit: 'USD',
    tradingViewHigh: 345.34,
    tradingViewFirstBarDate: '1980-12-01',
    tradingViewAdjSetting: 'off',
    bars: rows([['1980-12-12', 0.5], ['2026-09-20', 340], ['2026-09-22', 345.34], ['2026-10-06', 330]]),
    independent: null,
    searchValue: null
  }, over || {});
}

function independent(over) {
  return Object.assign({
    kind: 'ath-claim',
    source: 'Example Statistics Bureau',
    url: 'https://example.org/ath/teva',
    retrievedAt: NOW_ISO,
    quotedValue: 27590,
    quotedDate: '2015-07-27',
    coverageStart: '2002-08-12'
  }, over || {});
}

// TEVA.TA: the corrupt 2003 bar predates TradingView's history (uncovered).
function tevaAttempt(over) {
  return attempt(Object.assign({
    tradingViewSymbol: 'TASE:TEVA', currency: 'ILS', unit: 'ILA',
    tradingViewHigh: 27590, tradingViewFirstBarDate: '2007-07-01',
    bars: rows([['2002-08-12', 5000], ['2003-08-06', 121500], ['2015-07-27', 27590], ['2026-10-06', 12000]]),
    independent: null
  }, over || {}));
}

// NICE.TA: the corrupt 2007 bars are inside TradingView's history (covered).
function niceAttempt(over) {
  return attempt(Object.assign({
    tradingViewSymbol: 'TASE:NICE', currency: 'ILS', unit: 'ILA',
    tradingViewHigh: 99480, tradingViewFirstBarDate: '2007-07-01',
    bars: rows([['2002-08-12', 3000], ['2007-07-30', 2290075.5], ['2007-07-31', 6620085.5], ['2021-11-11', 99480], ['2026-10-06', 40000]]),
    independent: null
  }, over || {}));
}

function record(over) {
  const r = {
    schema: 'ath:v1', ticker: 'AAPL', providerSymbol: 'AAPL', tradingViewSymbol: 'NASDAQ:AAPL',
    currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified', athValue: 300, athDate: '2026-01-02', verifiedAt: '2026-09-01T00:00:00.000Z', verifiedBy: 'operator',
    evidence: {
      tradingViewHigh: 300, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
      matchedBar: { date: '2026-01-02', high: 300 }, toleranceUsed: 0.005,
      yahooBarCount: 11000, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, pending: null, lastCheckedAt: '2026-09-01T00:00:00.000Z'
  };
  return Object.assign(r, over || {});
}

function seed(rec) { const o = {}; o['ath:v1:' + rec.ticker] = JSON.stringify(rec); return o; }

async function write(mod, ticker, att, store, envObj) {
  return withEnv(envObj || armed(), function () {
    return mod.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: ticker, attempt: att }), store: store }));
  });
}

function stored(store, ticker) { return JSON.parse(store.data['ath:v1:' + ticker]); }

// ── predicates over ath-record (reused against mutants) ───────────────────────
function classifyOk(api, att) { const r = api.classifyVerification(att, NOW_ISO); return r.ok === true ? r : null; }
function classifyReason(api, att) { const r = api.classifyVerification(att, NOW_ISO); return r.ok === true ? 'OK:' + r.status : r.reason; }

function boundary(api) {
  const at = function (x) {
    const c = classifyOk(api, attempt({ tradingViewHigh: 100, bars: rows([['2026-09-22', x], ['2026-10-06', 50]]) }));
    return c && c.status;
  };
  const miss = classifyOk(api, attempt({ tradingViewHigh: 100, bars: rows([['2026-09-22', 100.501], ['2026-10-06', 50]]) }));
  return at(100.499) === 'verified' && at(99.501) === 'verified' && at(100.5) === 'verified' &&
    at(100.501) === 'unresolved' && at(99.499) === 'unresolved' && !!miss && miss.matchedBar === null;
}

function statusRecomputed(api) {
  const att = attempt({ tradingViewHigh: 100 });
  att.status = 'verified';
  const c = classifyOk(api, att);
  if (!c) { return false; }
  const rec = api.buildRecord({ ticker: 'AAPL', attempt: att, classification: c, nowIso: NOW_ISO });
  return c.status === 'unresolved' && rec.status === 'unresolved' && rec.athValue === null;
}

// The writer derives every higher bar from the series: both corrupt NICE.TA bars are recorded, in date order.
function higherBarsKept(api) {
  const c = classifyOk(api, niceAttempt());
  return !!c && c.higherBars.length === 2 && c.higherBars[0].date === '2007-07-30' && c.higherBars[1].date === '2007-07-31';
}

// The F1 contract: the spike is found in the SERIES, so it cannot be hidden by an incomplete client list.
function derivesSpikeFromSeries(api) {
  const c = classifyOk(api, tevaAttempt());
  return !!c && c.status === 'unresolved' && c.higherBars.length === 1 && c.higherBars[0].high === 121500 &&
    c.higherBars[0].date === '2003-08-06' && c.higherBars[0].covered === false && c.series.count === 4 && c.series.firstBarDate === '2002-08-12';
}

function legacyKeysRefused(api) {
  const legacy = [['matchedBar', { date: '2015-07-27', high: 27590 }], ['higherBars', []], ['yahooBarCount', 4], ['yahooFirstBarDate', '2002-08-12']];
  return legacy.every(function (kv) {
    const a = tevaAttempt(); a[kv[0]] = kv[1];
    return classifyReason(api, a) === 'UNKNOWN_ATTEMPT_KEY';
  });
}

function seriesOrderEnforced(api) {
  const unsorted = classifyReason(api, attempt({ bars: rows([['2026-09-22', 345.34], ['2026-09-20', 340], ['2026-10-06', 330]]) }));
  const dup = classifyReason(api, attempt({ bars: rows([['2026-09-20', 340], ['2026-09-20', 345.34], ['2026-10-06', 330]]) }));
  return unsorted === 'SERIES_ORDER_INVALID' && dup === 'SERIES_ORDER_INVALID';
}

function seriesRecencyEnforced(api) {
  const old = classifyReason(api, attempt({ bars: rows([['2026-08-20', 340], ['2026-08-28', 345.34]]) }));
  const future = classifyReason(api, attempt({ bars: rows([['2026-09-20', 340], ['2026-10-20', 345.34]]) }));
  const fresh = classifyReason(api, attempt({ bars: rows([['2026-09-20', 340], ['2026-09-27', 345.34]]) }));
  return old === 'SERIES_STALE' && future === 'SERIES_STALE' && fresh === 'OK:verified';
}

function uncoveredNeedsIndependent(api) {
  const none = classifyOk(api, tevaAttempt());
  // Independent evidence that agrees with the Yahoo spike must not clear the bar either.
  const agrees = classifyOk(api, tevaAttempt({ independent: independent({ quotedValue: 121500 }) }));
  return !!none && none.status === 'unresolved' && none.higherBars[0].disposition === 'unresolved' && none.higherBars[0].basis === null &&
    !!agrees && agrees.status === 'unresolved' && agrees.higherBars[0].disposition === 'unresolved';
}

function noPlausibilityRejection(api) {
  // A spike ten times the matched value, uncovered, with no independent evidence: it must stay
  // unresolved. It is never rejected for looking implausible.
  const c = classifyOk(api, tevaAttempt({ bars: rows([['2002-08-12', 5000], ['2003-08-06', 275900], ['2015-07-27', 27590], ['2026-10-06', 12000]]) }));
  return !!c && c.status === 'unresolved' && c.higherBars[0].disposition === 'unresolved';
}

// The 0.5% edge is decided by ONE predicate (match selection). A bar exactly at the edge is the
// match; one just outside it is a higher bar that the chart contradicts. (Floating point:
// 100 * (1 + 0.005) is 100.49999999999999 while |100.5 - 100| / 100 is exactly 0.005.)
function selectionEdge(api) {
  const run = function (x) {
    const c = classifyOk(api, attempt({ tradingViewHigh: 100, bars: rows([['2026-09-20', 100], ['2026-09-23', x], ['2026-10-06', 50]]) }));
    return c ? { status: c.status, matched: c.matchedBar && c.matchedBar.high, higher: c.higherBars.length } : null;
  };
  const a = run(100.499);
  const b = run(100.5);
  const c = run(100.501);
  const direct = api.selectMatchedBar(rows([['2026-09-20', 100], ['2026-09-23', 100.5]]), 100);
  return !!a && !!b && !!c &&
    a.matched === 100.499 && a.higher === 0 &&
    b.matched === 100.5 && b.higher === 0 &&
    c.matched === 100 && c.higher === 1 && c.status === 'verified' &&
    direct.matchedBar.high === 100.5 && direct.higherBars.length === 0;
}

function forbiddenHostsRejected(api) {
  return ['https://finance.yahoo.com/quote/TEVA.TA', 'https://query1.finance.yahoo.com/v8/x', 'https://www.tradingview.com/symbols/TASE-TEVA/',
    'https://TRADINGVIEW.COM/x', 'https://sub.tradingview.com/x', 'https://yahoo.com/x'].every(function (u) {
    return classifyReason(api, tevaAttempt({ independent: independent({ url: u }) })) === 'INDEPENDENT_SOURCE_FORBIDDEN';
  });
}

function unknownKeysRejected(api) {
  return ['override', 'reason', 'unrefutedByChart', 'operatorDisposition', 'note', 'close', 'closeRatio'].every(function (k) {
    const a = attempt(); a[k] = 'x';
    return classifyReason(api, a) === 'UNKNOWN_ATTEMPT_KEY';
  });
}

// ── AR-4 / AR-5 / AR-8 ────────────────────────────────────────────────────────
async function main() {
  const realFetch = globalThis.fetch;
  let realFetchCalls = 0;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('REAL_FETCH_FORBIDDEN'); };
  try {
    // ---- AR-4: gates, order, store behaviour ---------------------------------
    await test('AR-4a gate off: DISABLED, zero store calls; OPTIONS 204; non-POST 405', async function () {
      const store = makeSpyStore();
      const r = await write(core, 'AAPL', attempt(), store, {});
      ok(r.statusCode === 200 && r.body === JSON.stringify({ status: 'DISABLED', reason: 'SERVER_DISABLED' }), 'DISABLED');
      ok(store.log.length === 0, 'no store call');
      const r2 = await write(core, 'AAPL', attempt(), store, { PT_ENABLE_ATH_READ_SERVER: 'true' });
      ok(parsed(r2).status === 'DISABLED', 'the read gate does not open the write route');
      const o = await withEnv(armed(), function () { return core.handler(ev({ method: 'OPTIONS' })); });
      ok(o.statusCode === 204, 'OPTIONS');
      const g = await withEnv(armed(), function () { return core.handler(ev({ method: 'GET', auth: authOk() })); });
      ok(g.statusCode === 405, 'GET');
    });

    await test('AR-4b the token is checked before the body is parsed and before the ticker', async function () {
      const store = makeSpyStore();
      const bad = await withEnv(armed(), function () { return core.handler(ev({ auth: 'Bearer wrong', body: '{not json', store: store })); });
      ok(bad.statusCode === 401 && parsed(bad).status === 'UNAUTHORIZED', 'wrong token + malformed body');
      const badTicker = await withEnv(armed(), function () { return core.handler(ev({ auth: 'Bearer wrong', body: JSON.stringify({ ticker: 'zzz', attempt: attempt() }), store: store })); });
      ok(badTicker.statusCode === 401, 'wrong token + invalid ticker is 401, not 400');
      const readTok = await withEnv(armed(), function () { return core.handler(ev({ auth: 'Bearer ' + READ_TOKEN, body: JSON.stringify({ ticker: 'AAPL', attempt: attempt() }), store: store })); });
      ok(readTok.statusCode === 401, 'the read token cannot write');
      ok(store.log.length === 0, 'no store call');
    });

    await test('AR-4c collision, allowlist, ticker and body-shape failures', async function () {
      const store = makeSpyStore();
      for (const k of ['PT_ATH_READ_TOKEN', 'PT_FUND_FACTS_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN', 'PT_OWNER_TOKEN']) {
        const extra = {}; extra[k] = WRITE_TOKEN;
        const r = await write(core, 'AAPL', attempt(), store, armed(extra));
        ok(r.statusCode === 500 && parsed(r).reason === 'TOKEN_COLLISION', 'collision ' + k);
      }
      const noAllow = armed(); delete noAllow.PT_ATH_ALLOWED_TICKERS;
      ok(parsed(await write(core, 'AAPL', attempt(), store, noAllow)).reason === 'ALLOWLIST_MISSING', 'allowlist missing');
      ok(parsed(await write(core, 'AAPL', attempt(), store, armed({ PT_ATH_ALLOWED_TICKERS: 'AAPL,TCH-F34.TA' }))).reason === 'ALLOWLIST_INVALID', 'allowlist invalid');
      const j = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: '{not json', store: store })); });
      ok(j.statusCode === 400 && parsed(j).status === 'INVALID_JSON', 'invalid json');
      ok(parsed(await write(core, 'aapl', attempt(), store)).status === 'INVALID_TICKER', 'ticker shape');
      const na = await write(core, 'MSFT', attempt(), store);
      ok(na.statusCode === 403 && parsed(na).status === 'TICKER_NOT_ALLOWED', 'membership');
      const extraTop = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'AAPL', attempt: attempt(), override: true }), store: store })); });
      ok(extraTop.statusCode === 400 && parsed(extraTop).status === 'INVALID_SUBMISSION', 'extra body key');
      const noAttempt = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'AAPL' }), store: store })); });
      ok(noAttempt.statusCode === 400 && parsed(noAttempt).status === 'INVALID_SUBMISSION', 'missing attempt');
      const badAction = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'AAPL', action: 'PURGE' }), store: store })); });
      ok(badAction.statusCode === 400 && parsed(badAction).status === 'INVALID_SUBMISSION', 'unknown action');
      ok(store.log.length === 0, 'no store call on any of the above');
    });

    await test('AR-4d a clean US attempt writes one verified record, derived from the series (overwrite semantics, strong pre-read)', async function () {
      const store = makeSpyStore();
      const r = await write(core, 'AAPL', attempt(), store);
      const b = parsed(r);
      ok(r.statusCode === 200 && b.status === 'WRITE' && b.ticker === 'AAPL' && b.recordStatus === 'verified' && b.key === 'ath:v1:AAPL', 'WRITE envelope');
      ok(store.log.length === 2 && store.log[0].op === 'get' && store.log[1].op === 'set', 'one pre-read then one write');
      ok(store.log[0].opts && store.log[0].opts.consistency === 'strong', 'strong pre-read');
      ok(store.log[1].opts === undefined, 'plain overwrite (no onlyIfNew)');
      const rec = stored(store, 'AAPL');
      ok(ath.validateRecordV2(rec).ok === true, 'the stored record validates as ath:v2');
      ok(rec.schema === 'ath:v2' && rec.method === 'operator' && rec.splitCheckedThrough === null, 'v2 operator record');
      ok(Object.keys(rec).sort().join() === ath.RECORD_KEYS_V2.slice().sort().join(), 'exact v2 key set (no verifiedBy / pending / tradingViewSymbol)');
      ok(rec.status === 'verified' && rec.athValue === 345.34 && rec.athDate === '2026-09-22', 'value and date derived from the matched bar of the series');
      ok(rec.verifiedAt === NOW_ISO && rec.lastCheckedAt === NOW_ISO, 'server clock');
      ok(rec.refresh.status === 'none', 'refresh none');
      ok(rec.evidence.toleranceUsed === 0.005 && rec.evidence.matchedBar.high === 345.34 && rec.evidence.higherBars.length === 0, 'evidence');
      ok(rec.evidence.yahooBarCount === 4 && rec.evidence.yahooFirstBarDate === '1980-12-12', 'bar count and first bar are derived from the series, not supplied');
      ok(JSON.stringify(r.body).indexOf(WRITE_TOKEN) === -1, 'token not echoed');
    });

    await test('AR-4e the 0.5% tolerance boundary (inclusive) decides verified versus unresolved', async function () {
      ok(boundary(ath), 'classification boundary');
      const store = makeSpyStore();
      const hi = await write(core, 'AAPL', attempt({ tradingViewHigh: 100, bars: rows([['2026-09-22', 100.501], ['2026-10-06', 50]]) }), store);
      ok(parsed(hi).recordStatus === 'unresolved', '0.501% above is unresolved');
      const rec = stored(store, 'AAPL');
      ok(rec.status === 'unresolved' && rec.athValue === null && rec.evidence.matchedBar === null && rec.verifiedAt === null, 'unresolved record carries no ATH');
      const lo = await write(core, 'AAPL', attempt({ tradingViewHigh: 100, bars: rows([['2026-09-22', 99.501], ['2026-10-06', 50]]) }), makeSpyStore());
      ok(parsed(lo).recordStatus === 'verified', '0.499% below is verified');
    });

    await test('AR-4f a client-supplied status is ignored and recomputed', async function () {
      ok(statusRecomputed(ath), 'status recomputed');
      const att = tevaAttempt();
      att.status = 'verified';
      const store = makeSpyStore();
      const r = await write(core, 'TEVA.TA', att, store);
      ok(parsed(r).recordStatus === 'unresolved', 'a forged status on an unresolved case does not verify');
      const rec = stored(store, 'TEVA.TA');
      ok(rec.status === 'unresolved' && rec.evidence.higherBars[0].covered === false && rec.evidence.higherBars[0].disposition === 'unresolved' && rec.evidence.higherBars[0].basis === null, 'recomputed bar fields');
    });

    await test('AR-4g a failed attempt never overwrites a verified (or stale-suspect) record', async function () {
      const failedAttempt = attempt({ tradingViewHigh: 100 });
      const store = makeSpyStore({ seed: seed(record()) });
      const r = await write(core, 'AAPL', failedAttempt, store);
      const b = parsed(r);
      ok(b.status === 'REFRESH_RECORDED' && b.recordStatus === 'verified' && b.reason === 'NO_CLEAN_MATCH', 'REFRESH_RECORDED');
      const rec = stored(store, 'AAPL');
      ok(rec.status === 'verified' && rec.athValue === 300 && rec.athDate === '2026-01-02', 'verified value intact');
      ok(JSON.stringify(rec.evidence) === JSON.stringify(record().evidence), 'evidence intact');
      ok(rec.refresh.status === 'unresolved' && rec.refresh.lastAttemptAt === NOW_ISO && rec.refresh.reason === 'NO_CLEAN_MATCH' && rec.lastCheckedAt === NOW_ISO, 'failure tracked separately');
      const stale = makeSpyStore({ seed: seed(record({ status: 'stale-suspect' })) });
      const r2 = await write(core, 'AAPL', failedAttempt, stale);
      ok(parsed(r2).status === 'REFRESH_RECORDED' && stored(stale, 'AAPL').status === 'stale-suspect' && stored(stale, 'AAPL').refresh.status === 'unresolved', 'stale-suspect stays stale-suspect');
    });

    await test('AR-4h other transitions: verified replaces anything; unresolved replaces unresolved', async function () {
      const unresolvedRec = record({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null, verifiedBy: null });
      unresolvedRec.evidence.matchedBar = null;
      const s1 = makeSpyStore({ seed: seed(unresolvedRec) });
      ok(parsed(await write(core, 'AAPL', attempt(), s1)).status === 'WRITE' && stored(s1, 'AAPL').status === 'verified', 'unresolved -> verified');
      const s2 = makeSpyStore({ seed: seed(record({ status: 'stale-suspect' })) });
      ok(parsed(await write(core, 'AAPL', attempt(), s2)).recordStatus === 'verified' && stored(s2, 'AAPL').status === 'verified' && stored(s2, 'AAPL').refresh.status === 'none', 'stale-suspect -> verified');
      const s3 = makeSpyStore({ seed: seed(record()) });
      await write(core, 'AAPL', attempt({ tradingViewHigh: 350, bars: rows([['2026-10-01', 350], ['2026-10-06', 340]]) }), s3);
      ok(stored(s3, 'AAPL').athValue === 350 && stored(s3, 'AAPL').athDate === '2026-10-01', 'a new verified ATH replaces the old one');
      const s4 = makeSpyStore({ seed: seed(unresolvedRec) });
      const r4 = await write(core, 'AAPL', attempt({ tradingViewHigh: 100 }), s4);
      ok(parsed(r4).status === 'WRITE' && stored(s4, 'AAPL').status === 'unresolved' && stored(s4, 'AAPL').evidence.tradingViewHigh === 100, 'unresolved -> new unresolved evidence');
    });

    await test('AR-4i store failures are DEGRADED and never write a value', async function () {
      const corrupt = makeSpyStore({ seed: { 'ath:v1:AAPL': '{not json' } });
      const c = await write(core, 'AAPL', attempt(), corrupt);
      ok(parsed(c).status === 'DEGRADED' && parsed(c).reason === 'STORE_RECORD_INVALID', 'corrupt existing record');
      ok(corrupt.log.every(function (l) { return l.op === 'get'; }), 'nothing written over a corrupt record');
      const g = await write(core, 'AAPL', attempt(), makeSpyStore({ getThrows: true }));
      ok(parsed(g).reason === 'STORE_UNAVAILABLE', 'get throws');
      const s = await write(core, 'AAPL', attempt(), makeSpyStore({ setThrows: true }));
      ok(parsed(s).status === 'DEGRADED' && parsed(s).reason === 'STORE_UNAVAILABLE', 'set throws');
    });

    await test('AR-4k B2-auto: the protected path writes v2 operator records; a failed attempt never discards an auto-derived value; a v1 record is written back as v2', async function () {
      const autoRec = {
        schema: 'ath:v2', ticker: 'AAPL', providerSymbol: 'AAPL', currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
        status: 'verified', method: 'auto', athValue: 300, athDate: '2026-01-02', verifiedAt: '2026-09-01T00:00:00.000Z',
        evidence: { source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11000,
          matchedBar: { date: '2026-01-02', high: 300, open: 295, close: 299 }, rejectedBars: [], splitsSeen: [], reason: null },
        refresh: { status: 'none', lastAttemptAt: null, reason: null }, lastCheckedAt: '2026-09-01T00:00:00.000Z', splitCheckedThrough: '2026-09-01'
      };
      ok(ath.validateRecordV2(autoRec).ok === true, 'fixture is a valid v2 auto record');
      const sAuto = makeSpyStore({ seed: seed(autoRec) });
      const failed = await write(core, 'AAPL', attempt({ tradingViewHigh: 100 }), sAuto);
      ok(parsed(failed).status === 'REFRESH_RECORDED' && stored(sAuto, 'AAPL').method === 'auto' && stored(sAuto, 'AAPL').athValue === 300 && stored(sAuto, 'AAPL').refresh.status === 'unresolved', 'a failed operator attempt keeps the auto value');
      const sOk = makeSpyStore({ seed: seed(autoRec) });
      await write(core, 'AAPL', attempt(), sOk);
      ok(stored(sOk, 'AAPL').method === 'operator' && stored(sOk, 'AAPL').athValue === 345.34, 'a verified operator attempt replaces it as an operator record (recovery path)');
      const sV1 = makeSpyStore({ seed: seed(record()) });
      await write(core, 'AAPL', attempt({ tradingViewHigh: 100 }), sV1);
      const back = stored(sV1, 'AAPL');
      ok(back.schema === 'ath:v2' && back.method === 'operator' && ath.validateRecordV2(back).ok === true, 'a v1 record is written back as a valid v2 operator record');
      ok(ath.buildOperatorRecord.length === 1, 'builder arity');
    });

    await test('AR-4j DELETE removes only the allowlisted key (teardown path)', async function () {
      const store = makeSpyStore({ seed: Object.assign(seed(record()), seed(record({ ticker: 'NICE.TA', providerSymbol: 'NICE.TA' }))) });
      const r = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'AAPL', action: 'DELETE' }), store: store })); });
      ok(parsed(r).status === 'DELETED' && parsed(r).key === 'ath:v1:AAPL', 'DELETED');
      ok(store.data['ath:v1:AAPL'] === undefined && store.data['ath:v1:NICE.TA'] !== undefined, 'only that key removed');
      const again = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'AAPL', action: 'DELETE' }), store: store })); });
      ok(parsed(again).status === 'NOT_AVAILABLE', 'absent key');
      const na = await withEnv(armed(), function () { return core.handler(ev({ auth: authOk(), body: JSON.stringify({ ticker: 'MSFT', action: 'DELETE' }), store: store })); });
      ok(na.statusCode === 403, 'not allowlisted');
    });

    // ---- AR-5: derivation from the full series, coverage, independent evidence ----
    await test('AR-5a covered higher bars are DERIVED from the series and contradicted by the chart (NICE.TA)', async function () {
      ok(higherBarsKept(ath), 'both higher bars derived, in date order');
      const store = makeSpyStore();
      const r = await write(core, 'NICE.TA', niceAttempt(), store);
      ok(parsed(r).recordStatus === 'verified', 'verified');
      const rec = stored(store, 'NICE.TA');
      ok(rec.evidence.higherBars.length === 2, 'none dropped');
      ok(rec.evidence.higherBars.every(function (b) { return b.covered === true && b.disposition === 'contradicted-by-chart' && b.basis === 'tradingview'; }), 'chart dispositions');
      ok(rec.evidence.coverageGap === null && rec.athValue === 99480 && rec.athDate === '2021-11-11', 'no gap; matched bar is the ATH');
      ok(rec.evidence.yahooBarCount === 5 && rec.evidence.yahooFirstBarDate === '2002-08-12', 'series statistics derived');
    });

    await test('AR-5b the spike is found in the SERIES: an uncovered higher bar with no independent evidence leaves the record unresolved (TEVA.TA)', async function () {
      ok(derivesSpikeFromSeries(ath), 'spike derived from the series');
      ok(uncoveredNeedsIndependent(ath), 'unresolved');
      const store = makeSpyStore();
      const r = await write(core, 'TEVA.TA', tevaAttempt(), store);
      ok(parsed(r).recordStatus === 'unresolved', 'unresolved');
      const rec = stored(store, 'TEVA.TA');
      ok(rec.status === 'unresolved' && rec.athValue === null, 'no ATH stored');
      ok(rec.evidence.higherBars.length === 1 && rec.evidence.higherBars[0].high === 121500, 'the spike is recorded');
    });

    await test('AR-5c valid ath-claim verifies and records the coverage gap', async function () {
      const store = makeSpyStore();
      const r = await write(core, 'TEVA.TA', tevaAttempt({ independent: independent() }), store);
      ok(parsed(r).recordStatus === 'verified', 'verified');
      const rec = stored(store, 'TEVA.TA');
      ok(rec.evidence.higherBars[0].disposition === 'contradicted-by-independent' && rec.evidence.higherBars[0].basis === 'independent' && rec.evidence.higherBars[0].covered === false, 'independent disposition');
      ok(rec.evidence.coverageGap.uncoveredFrom === '2002-08-12' && rec.evidence.coverageGap.uncoveredTo === '2007-07-01', 'gap bounds (first bar of the series .. first TradingView bar)');
      ok(rec.evidence.coverageGap.independent.kind === 'ath-claim' && rec.evidence.coverageGap.independent.url === 'https://example.org/ath/teva', 'independent evidence recorded verbatim');
      ok(rec.athValue === 27590, 'ATH is the matched bar');
    });

    await test('AR-5d an ath-claim must reach back far enough and match the matched bar', async function () {
      const late = classifyOk(ath, tevaAttempt({ independent: independent({ coverageStart: '2004-01-01' }) }));
      ok(late && late.status === 'unresolved' && late.higherBars[0].disposition === 'unresolved', 'coverageStart after the uncovered bar');
      const edge = classifyOk(ath, tevaAttempt({ independent: independent({ coverageStart: '2003-08-06' }) }));
      ok(edge && edge.status === 'verified', 'coverageStart equal to the bar date is enough');
      const spike = classifyOk(ath, tevaAttempt({ independent: independent({ quotedValue: 121500 }) }));
      ok(spike && spike.status === 'unresolved', 'an independent value equal to the Yahoo spike is unresolved');
      const off = classifyOk(ath, tevaAttempt({ independent: independent({ quotedValue: 27800 }) }));
      ok(off && off.status === 'unresolved', 'an ath-claim outside 0.5% of the matched bar');
      ok(late.coverageGap && late.coverageGap.independent.coverageStart === '2004-01-01', 'unresolved still records the independent evidence it was given');
    });

    await test('AR-5e bar-level evidence contradicts exactly the bar it quotes', async function () {
      const good = classifyOk(ath, tevaAttempt({ independent: independent({ kind: 'bar-level', quotedDate: '2003-08-06', quotedValue: 12165 }) }));
      ok(good && good.status === 'verified' && good.higherBars[0].basis === 'independent', 'differs by more than 0.5% and not above the ATH');
      const close = classifyOk(ath, tevaAttempt({ independent: independent({ kind: 'bar-level', quotedDate: '2003-08-06', quotedValue: 121400 }) }));
      ok(close && close.status === 'unresolved', 'agrees with Yahoo within 0.5%: not a contradiction');
      const wrongDay = classifyOk(ath, tevaAttempt({ independent: independent({ kind: 'bar-level', quotedDate: '2003-08-07', quotedValue: 12165 }) }));
      ok(wrongDay && wrongDay.status === 'unresolved', 'a quote for another day contradicts nothing');
      const stillAbove = classifyOk(ath, tevaAttempt({ independent: independent({ kind: 'bar-level', quotedDate: '2003-08-06', quotedValue: 30000 }) }));
      ok(stillAbove && stillAbove.status === 'unresolved', 'an independent value that is itself above the ATH does not verify');
      const twoBars = rows([['2002-08-12', 5000], ['2003-08-06', 121500], ['2004-02-02', 99999], ['2015-07-27', 27590], ['2026-10-06', 12000]]);
      const two = classifyOk(ath, tevaAttempt({ bars: twoBars, independent: independent({ kind: 'bar-level', quotedDate: '2003-08-06', quotedValue: 12165 }) }));
      ok(two && two.status === 'unresolved' && two.higherBars[0].disposition === 'contradicted-by-independent' && two.higherBars[1].disposition === 'unresolved', 'one bar-level quote cannot clear two uncovered bars');
      const claimTwo = classifyOk(ath, tevaAttempt({ bars: twoBars, independent: independent() }));
      ok(claimTwo && claimTwo.status === 'verified', 'an ath-claim covering the whole period clears both');
    });

    await test('AR-5f independent sources hosted on Yahoo or TradingView are rejected; lookalike hosts are not', async function () {
      ok(forbiddenHostsRejected(ath), 'forbidden hosts');
      const store = makeSpyStore();
      const r = await write(core, 'TEVA.TA', tevaAttempt({ independent: independent({ url: 'https://finance.yahoo.com/quote/TEVA.TA' }) }), store);
      ok(r.statusCode === 400 && parsed(r).status === 'INVALID_SUBMISSION' && parsed(r).reason === 'INDEPENDENT_SOURCE_FORBIDDEN', 'writer rejects');
      ok(store.log.length === 0, 'nothing read or written');
      const lookalike = classifyOk(ath, tevaAttempt({ independent: independent({ url: 'https://notyahoo.com/x' }) }));
      ok(lookalike && lookalike.status === 'verified', 'a host that merely ends in the letters is not forbidden');
      const inner = classifyOk(ath, tevaAttempt({ independent: independent({ url: 'https://example.org/page?ref=finance.yahoo.com' }) }));
      ok(inner && inner.status === 'verified', 'only the host decides');
    });

    await test('AR-5g malformed or misplaced evidence and a malformed, mis-ordered or stale series are INVALID_SUBMISSION (never verified)', async function () {
      const many = [];
      const base = Date.UTC(1900, 0, 1);
      for (let i = 0; i < ath.MAX_BARS + 1; i++) { many.push({ date: new Date(base + i * 86400000).toISOString().slice(0, 10), high: 10 }); }
      const above = [['2002-08-12', 5000], ['2015-07-27', 100]];
      for (let i = 0; i < ath.MAX_HIGHER_BARS + 2; i++) { above.push([new Date(Date.UTC(2016, 0, 1) + i * 86400000).toISOString().slice(0, 10), 200 + i]); }
      above.push(['2026-10-06', 50]);
      const codes = [
        [tevaAttempt({ independent: independent({ kind: 'opinion' }) }), 'INDEPENDENT_INVALID'],
        [tevaAttempt({ independent: independent({ url: 'http://example.org/x' }) }), 'INDEPENDENT_INVALID'],
        [tevaAttempt({ independent: independent({ quotedValue: -1 }) }), 'INDEPENDENT_INVALID'],
        [tevaAttempt({ independent: independent({ coverageStart: '2002-8-1' }) }), 'INDEPENDENT_INVALID'],
        [tevaAttempt({ independent: Object.assign(independent(), { extra: 1 }) }), 'INDEPENDENT_INVALID'],
        [niceAttempt({ independent: independent() }), 'INDEPENDENT_NOT_APPLICABLE'],
        [attempt({ tradingViewHigh: 100, independent: independent() }), 'INDEPENDENT_NOT_APPLICABLE'],
        [attempt({ bars: [] }), 'SERIES_INVALID'],
        [attempt({ bars: 'not an array' }), 'SERIES_INVALID'],
        [attempt({ bars: [{ date: '2026-10-06', high: 330, close: 320 }] }), 'SERIES_INVALID'],
        [attempt({ bars: rows([['2026-10-06', 0]]) }), 'SERIES_INVALID'],
        [attempt({ bars: rows([['2026-10-06', Infinity]]) }), 'SERIES_INVALID'],
        [attempt({ bars: rows([['2026-10-6', 330]]) }), 'SERIES_INVALID'],
        [attempt({ bars: rows([['2026-02-30', 330]]) }), 'SERIES_INVALID'],
        [attempt({ bars: many }), 'SERIES_INVALID'],
        [attempt({ bars: rows([['2026-09-22', 345.34], ['2026-09-20', 340], ['2026-10-06', 330]]) }), 'SERIES_ORDER_INVALID'],
        [attempt({ bars: rows([['2026-09-20', 340], ['2026-09-20', 345.34], ['2026-10-06', 330]]) }), 'SERIES_ORDER_INVALID'],
        [attempt({ bars: rows([['2026-08-20', 340], ['2026-08-28', 345.34]]) }), 'SERIES_STALE'],
        [attempt({ bars: rows([['2026-09-20', 340], ['2026-10-20', 345.34]]) }), 'SERIES_STALE'],
        [attempt({ tradingViewHigh: 200, bars: rows(above) }), 'TOO_MANY_HIGHER_BARS'],
        [attempt({ tradingViewHigh: 0 }), 'ATTEMPT_INVALID'],
        [attempt({ tradingViewFirstBarDate: 'January 1980' }), 'ATTEMPT_INVALID'],
        [attempt({ currency: 'USD', unit: 'ILA' }), 'ATTEMPT_INVALID'],
        [attempt({ tradingViewAdjSetting: 'maybe' }), 'ATTEMPT_INVALID']
      ];
      codes.forEach(function (c, i) {
        const r = ath.classifyVerification(c[0], NOW_ISO);
        ok(r.ok === false && r.reason === c[1], 'case ' + i + ' expected ' + c[1] + ' got ' + JSON.stringify(r).slice(0, 90));
      });
      const noNow = ath.classifyVerification(attempt());
      ok(noNow.ok === false && noNow.reason === 'NOW_REQUIRED', 'the server clock is required');
      ok(seriesOrderEnforced(ath) && seriesRecencyEnforced(ath), 'series order and recency');
      const store = makeSpyStore();
      const w = await write(core, 'AAPL', attempt({ bars: rows([['2026-08-20', 340], ['2026-08-28', 345.34]]) }), store);
      ok(w.statusCode === 400 && parsed(w).status === 'INVALID_SUBMISSION' && parsed(w).reason === 'SERIES_STALE' && store.log.length === 0, 'the writer refuses a stale series without touching the store');
    });

    await test('AR-5h search evidence is recorded and never decides the outcome', async function () {
      const sv = { value: 50000, date: '2015-07-27', citation: 'https://example.org/page' };
      const store = makeSpyStore();
      await write(core, 'AAPL', attempt({ searchValue: sv }), store);
      const rec = stored(store, 'AAPL');
      ok(rec.status === 'verified' && JSON.stringify(rec.evidence.searchValue) === JSON.stringify(sv), 'a disagreeing search value does not block a chart-verified record');
      const noMatch = makeSpyStore();
      await write(core, 'AAPL', attempt({ tradingViewHigh: 100, searchValue: { value: 345.34, date: '2026-09-22', citation: 'https://example.org/p' } }), noMatch);
      ok(stored(noMatch, 'AAPL').status === 'unresolved', 'an agreeing search value does not verify an unmatched record');
      const bad = ath.classifyVerification(attempt({ searchValue: { value: 5 } }), NOW_ISO);
      ok(bad.ok === false && bad.reason === 'ATTEMPT_INVALID', 'malformed search value');
    });

    await test('AR-5i the 0.5% edge is decided by one predicate: exactly at / just inside / just outside', async function () {
      ok(selectionEdge(ath), 'edge: 100.499 and 100.5 are the match, 100.501 is a higher bar contradicted by the chart');
      const store = makeSpyStore();
      const at = await write(core, 'AAPL', attempt({ tradingViewHigh: 100, bars: rows([['2026-09-20', 100], ['2026-09-23', 100.5], ['2026-10-06', 50]]) }), store);
      ok(parsed(at).recordStatus === 'verified' && stored(store, 'AAPL').athValue === 100.5 && stored(store, 'AAPL').evidence.higherBars.length === 0, 'exactly at the edge: the 100.5 bar is the ATH');
      const out = await write(core, 'AAPL', attempt({ tradingViewHigh: 100, bars: rows([['2026-09-20', 100], ['2026-09-23', 100.501], ['2026-10-06', 50]]) }), store);
      ok(parsed(out).recordStatus === 'verified' && stored(store, 'AAPL').athValue === 100, 'just outside: the 100 bar is the ATH');
      ok(stored(store, 'AAPL').evidence.higherBars.length === 1 && stored(store, 'AAPL').evidence.higherBars[0].disposition === 'contradicted-by-chart', 'and the 100.501 bar is recorded as contradicted by the chart');
    });

    // ---- AR-8 / F1: no plausibility path, no override, no client-supplied derived fields ----
    await test('AR-8a a spike at ten times the ATH with no independent evidence is unresolved, never rejected', async function () {
      ok(noPlausibilityRejection(ath), 'uncovered spike stays unresolved');
      const store = makeSpyStore();
      const r = await write(core, 'TEVA.TA', tevaAttempt({ bars: rows([['2002-08-12', 5000], ['2003-08-06', 275900], ['2015-07-27', 27590], ['2026-10-06', 12000]]) }), store);
      ok(parsed(r).recordStatus === 'unresolved', 'writer: unresolved');
      ok(stored(store, 'TEVA.TA').evidence.higherBars[0].disposition === 'unresolved', 'disposition is unresolved, not a rejection');
    });

    await test('AR-8b the writer accepts no override, reason or plausibility field', async function () {
      ok(unknownKeysRejected(ath), 'unknown attempt keys rejected (classification)');
      const store = makeSpyStore();
      for (const k of ['override', 'reason', 'unrefutedByChart', 'operatorDisposition', 'note']) {
        const a = attempt(); a[k] = true;
        const r = await write(core, 'AAPL', a, store);
        ok(r.statusCode === 400 && parsed(r).reason === 'UNKNOWN_ATTEMPT_KEY', 'attempt.' + k);
        const b = niceAttempt(); b.bars[0][k] = 'looks wrong';
        const r2 = await write(core, 'NICE.TA', b, store);
        ok(r2.statusCode === 400 && parsed(r2).status === 'INVALID_SUBMISSION', 'bars[].' + k);
        const c = tevaAttempt({ independent: independent() }); c.independent[k] = 'x';
        const r3 = await write(core, 'TEVA.TA', c, store);
        ok(r3.statusCode === 400 && parsed(r3).status === 'INVALID_SUBMISSION', 'independent.' + k);
      }
      ok(store.log.length === 0, 'nothing read or written for any of them');
    });

    await test('AR-8c F1: a client-supplied matchedBar / higherBars / bar count is refused, so an incomplete list can never produce a verified record', async function () {
      ok(legacyKeysRefused(ath), 'legacy derived keys refused');
      const store = makeSpyStore();
      // The scenario Codex raised: the uncovered spike is in the series, the client hides it with an empty higherBars list.
      const hidden = tevaAttempt(); hidden.higherBars = []; hidden.matchedBar = { date: '2015-07-27', high: 27590 };
      const r = await write(core, 'TEVA.TA', hidden, store);
      ok(r.statusCode === 400 && parsed(r).reason === 'UNKNOWN_ATTEMPT_KEY' && store.log.length === 0, 'refused, nothing stored');
      // Without the forged list the writer finds the spike itself and does not verify.
      const honest = await write(core, 'TEVA.TA', tevaAttempt(), store);
      ok(parsed(honest).recordStatus === 'unresolved' && stored(store, 'TEVA.TA').evidence.higherBars[0].high === 121500, 'the writer derives the spike from the series');
      // Dropping the spike from the SERIES is the one thing it cannot see: recorded as the operator-supplied trust boundary.
      const dropped = tevaAttempt({ bars: rows([['2007-07-02', 5000], ['2015-07-27', 27590], ['2026-10-06', 12000]]) });
      const d = await write(core, 'TEVA.TA', dropped, makeSpyStore());
      ok(parsed(d).recordStatus === 'verified', 'documented limit: a series the operator trimmed is accepted (evidence records the first bar for audit)');
    });

    await test('AR-8d no response or stored record carries a plausibility annotation', async function () {
      const store = makeSpyStore();
      const outs = [];
      outs.push((await write(core, 'TEVA.TA', tevaAttempt(), store)).body);
      outs.push(store.data['ath:v1:TEVA.TA']);
      outs.push((await write(core, 'NICE.TA', niceAttempt(), store)).body);
      outs.push(store.data['ath:v1:NICE.TA']);
      ok(outs.every(function (o) { return !/plausib|outlier|suspicious|implausible|anomal|\bratio\b|looks wrong/i.test(o); }), 'no plausibility vocabulary');
    });

    await test('AR-8e the real fetch was never called', async function () {
      ok(realFetchCalls === 0, 'real fetch calls: ' + realFetchCalls);
    });

    // ── planted negatives (mutation on production source) ───────────────────
    async function killed(name, file, mutations, predicate) {
      await test('PN ' + name + ' is killed', async function () {
        const mutant = loadMutated(file, mutations);
        // Killed only by the predicate RETURNING false; a throw would hide a broken predicate.
        let survived;
        try { survived = (await predicate(mutant)) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
        ok(!survived, 'mutant survived: the predicate still passes');
      });
    }

    await killed('the operator record is written as method auto (AR-4k)', RECORD_PATH,
      [['function buildOperatorRecord(input) { return upgradeV1(buildRecord(input)); }', 'function buildOperatorRecord(input) { const r = upgradeV1(buildRecord(input)); r.method = \'auto\'; return r; }']],
      async function (mod) {
        const out = mod.buildOperatorRecord({ ticker: 'AAPL', attempt: attempt(), classification: mod.classifyVerification(attempt(), NOW_ISO), nowIso: NOW_ISO });
        return out.method === 'operator' && mod.validateRecordV2(out).ok === true;
      });
    await killed('tolerance changed (AR-4)', RECORD_PATH, [['const TOLERANCE = 0.005;', 'const TOLERANCE = 0.02;']], boundary);
    await killed('client status trusted (AR-4)', RECORD_PATH, [['status: classification.status,', 'status: attempt.status !== undefined ? attempt.status : classification.status,']], statusRecomputed);
    await killed('selection edge uses tv * (1 +/- TOLERANCE) instead of the shared predicate (AR-5i)', RECORD_PATH,
      [['if (isPositive(tradingViewHigh) && withinTolerance(b.high, tradingViewHigh)) {', 'if (isPositive(tradingViewHigh) && b.high <= tradingViewHigh * (1 + TOLERANCE) && b.high >= tradingViewHigh * (1 - TOLERANCE)) {']], selectionEdge);
    await killed('higher bar dropped from higherBars (AR-5)', RECORD_PATH, [['higherBars: classified,', 'higherBars: classified.slice(1),']], higherBarsKept);
    await killed('higher bars derived from only part of the series (F1)', RECORD_PATH,
      [['.filter(function (b) { return b.high > matchedBar.high; })', '.filter(function (b) { return b.high > matchedBar.high && b.date > \'2010-01-01\'; })']], derivesSpikeFromSeries);
    await killed('a client-supplied matchedBar / higherBars list is accepted (F1)', RECORD_PATH,
      [['const ALLOWED_ATTEMPT_KEYS = new Set(ATTEMPT_KEYS.concat([\'status\']));', 'const ALLOWED_ATTEMPT_KEYS = new Set(ATTEMPT_KEYS.concat([\'status\', \'matchedBar\', \'higherBars\', \'yahooBarCount\', \'yahooFirstBarDate\']));']], legacyKeysRefused);
    await killed('series order check removed (F1)', RECORD_PATH,
      [['if (!(b.date > prevDate)) { return invalid(\'SERIES_ORDER_INVALID\'); }', 'if (false) { return invalid(\'SERIES_ORDER_INVALID\'); }']], seriesOrderEnforced);
    await killed('series recency check removed (F1)', RECORD_PATH,
      [['if (ageDays > MAX_SERIES_AGE_DAYS || ageDays < -1) { return invalid(\'SERIES_STALE\'); }', 'if (false) { return invalid(\'SERIES_STALE\'); }']], seriesRecencyEnforced);
    await killed('uncovered bar accepted without independent evidence (AR-5)', RECORD_PATH,
      [['disposition = verdict.contradicts ? \'contradicted-by-independent\' : \'unresolved\';', 'disposition = \'contradicted-by-independent\';']], uncoveredNeedsIndependent);
    await killed('independent source on a Yahoo or TradingView host accepted (AR-5)', RECORD_PATH,
      [['if (isForbiddenHost(host)) {', 'if (false) {']], forbiddenHostsRejected);
    await killed('plausibility rule added (AR-8)', RECORD_PATH,
      [['let disposition = \'unresolved\';', 'let disposition = h.high > 5 * matched.high ? \'contradicted-by-independent\' : \'unresolved\';']], noPlausibilityRejection);
    await killed('override or free-text field accepted (AR-1, AR-8)', RECORD_PATH,
      [['if (!ALLOWED_ATTEMPT_KEYS.has(k)) { return invalid(\'UNKNOWN_ATTEMPT_KEY\'); }', 'if (false) { return invalid(\'UNKNOWN_ATTEMPT_KEY\'); }']], unknownKeysRejected);
    await killed('write-token check moved after the body is parsed (AR-4)', WRITE_PATH,
      [['if (!probe.ok && probe.reason !== \'TICKER_INVALID\') {', 'if (false) {']], async function (mod) {
        const r = await withEnv(armed(), function () { return mod.handler(ev({ auth: 'Bearer wrong', body: '{not json', store: makeSpyStore() })); });
        return r.statusCode === 401;
      });
    await killed('a failed attempt overwrites a verified record (AR-4)', WRITE_PATH,
      [['if (existing.status === \'verified\' || existing.status === \'stale-suspect\') {', 'if (false) {']], async function (mod) {
        const store = makeSpyStore({ seed: seed(record()) });
        await write(mod, 'AAPL', attempt({ tradingViewHigh: 100 }), store);
        return stored(store, 'AAPL').status === 'verified';
      });
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
