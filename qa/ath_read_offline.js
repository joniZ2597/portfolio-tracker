'use strict';

/*
 * qa/ath_read_offline.js
 *
 * R-1 Slice B (B1) re-baselined for B2-auto — public, read-only ATH reader (AR-3), contract
 * ath-read-v2, and the preflight sides.
 *
 * Exercises netlify/functions/lib/ath-read-core.js and lib/ath-preflight.js through the real
 * handler with an injected spy store (event._testStore) and an injected clock. No network, no
 * real Blob store, no real environment (every ATH / collision key is saved, cleared and
 * restored around each case). Planted negatives mutate the production source text.
 *
 * B2-auto changes versus B1: the read route needs no token and no allowlist (gate + ticker only);
 * the response is exactly the ath-read-v2 projection (no evidence, refresh state or timestamps
 * other than verifiedAt); a stored v1 record is read as method 'operator'.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const READ_PATH = path.join(LIB, 'ath-read-core.js');
const PREFLIGHT_PATH = path.join(LIB, 'ath-preflight.js');
const RECORD_PATH = path.join(LIB, 'ath-record.js');

const core = require(READ_PATH);
const preflight = require(PREFLIGHT_PATH);
const athRecord = require(RECORD_PATH);

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

const READ_TOKEN = 'ath-read-tok-qa-1';
const WRITE_TOKEN = 'ath-write-tok-qa-1';
const NOW_ISO = '2026-10-07T10:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

const ENV_KEYS = [
  'PT_ENABLE_ATH_READ_SERVER', 'PT_ATH_READ_TOKEN',
  'PT_ENABLE_ATH_WRITE_SERVER', 'PT_ATH_WRITE_TOKEN',
  'PT_ENABLE_ATH_ENSURE_SERVER',
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

// The read route is public: only its gate is needed.
function armed(extra) {
  return Object.assign({ PT_ENABLE_ATH_READ_SERVER: 'true' }, extra || {});
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
    set: async function (key, value, o) { log.push({ op: 'set', key: key, value: value, opts: o }); data[key] = value; return { modified: true }; },
    delete: async function (key) { log.push({ op: 'delete', key: key }); delete data[key]; },
    list: async function () { log.push({ op: 'list' }); return { blobs: [] }; }
  };
}

function ev(o) {
  o = o || {};
  const e = { httpMethod: o.method || 'POST', headers: { authorization: o.auth }, body: o.body };
  if (o.store) { e._testStore = o.store; }
  e._testClock = { nowMs: NOW_MS };
  return e;
}

function body(ticker) { return JSON.stringify({ ticker: ticker }); }
function parsed(r) { return JSON.parse(r.body); }

// A stored v2 `auto` record.
function record(over) {
  const r = {
    schema: 'ath:v2', ticker: 'AAPL', providerSymbol: 'AAPL', currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified', method: 'auto', athValue: 345.34, athDate: '2026-09-22', verifiedAt: NOW_ISO,
    evidence: {
      source: 'yahoo-daily', firstTradeDate: '1980-12-12', firstBarDate: '1980-12-12', barCount: 11546,
      matchedBar: { date: '2026-09-22', high: 345.34, open: 340, close: 344 }, rejectedBars: [], splitsSeen: [], reason: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, lastCheckedAt: NOW_ISO, splitCheckedThrough: '2026-10-07'
  };
  return Object.assign(r, over || {});
}

// A stored v1 record (written by B3 before B2-auto).
function recordV1(over) {
  const r = {
    schema: 'ath:v1', ticker: 'AAPL', providerSymbol: 'AAPL', tradingViewSymbol: 'NASDAQ:AAPL',
    currency: 'USD', unit: 'USD', basis: 'split-adjusted-no-dividend-adjust',
    status: 'verified', athValue: 345.34, athDate: '2026-09-22', verifiedAt: NOW_ISO, verifiedBy: 'operator',
    evidence: {
      tradingViewHigh: 345.3, tradingViewFirstBarDate: '1980-12-01', tradingViewAdjSetting: 'off',
      matchedBar: { date: '2026-09-22', high: 345.34 }, toleranceUsed: 0.005,
      yahooBarCount: 11546, yahooFirstBarDate: '1980-12-12', higherBars: [], coverageGap: null, searchValue: null
    },
    refresh: { status: 'none', lastAttemptAt: null, reason: null }, pending: null, lastCheckedAt: NOW_ISO
  };
  return Object.assign(r, over || {});
}

function seed(rec) { const o = {}; o['ath:v1:' + rec.ticker] = JSON.stringify(rec); return o; }

async function callRead(handlerCore, envObj, eventObj) {
  return withEnv(envObj, function () { return handlerCore.handler(eventObj); });
}

const PROJECTION_KEYS = 'athDate,athValue,basis,currency,method,readContractVersion,recordStatus,status,ticker,unit,verifiedAt';

// ── predicates (also reused against mutants) ─────────────────────────────────
async function projectsVerifiedOnly(mod) {
  const verified = makeSpyStore({ seed: seed(record()) });
  const v = parsed(await callRead(mod, armed(), ev({ body: body('AAPL'), store: verified })));
  const stale = makeSpyStore({ seed: seed(record({ status: 'stale-suspect' })) });
  const s = parsed(await callRead(mod, armed(), ev({ body: body('AAPL'), store: stale })));
  const unresolvedRec = record({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null });
  unresolvedRec.evidence.matchedBar = null;
  const unres = makeSpyStore({ seed: seed(unresolvedRec) });
  const u = parsed(await callRead(mod, armed(), ev({ body: body('AAPL'), store: unres })));
  return v.athValue === 345.34 && v.athDate === '2026-09-22' && v.recordStatus === 'verified' &&
    s.athValue === null && s.athDate === null && s.recordStatus === 'stale-suspect' &&
    u.athValue === null && u.athDate === null && u.recordStatus === 'unresolved';
}

async function refreshDoesNotSuppress(mod) {
  const rec = record({ refresh: { status: 'unresolved', lastAttemptAt: NOW_ISO, reason: 'FETCH_FAILED' } });
  const store = makeSpyStore({ seed: seed(rec) });
  const b = parsed(await callRead(mod, armed(), ev({ body: body('AAPL'), store: store })));
  return b.status === 'OK' && b.athValue === 345.34 && b.recordStatus === 'verified';
}

async function publicWithoutToken(mod) {
  const store = makeSpyStore({ seed: seed(record()) });
  const r = parsed(await callRead(mod, armed(), ev({ body: body('AAPL'), store: store })));
  return r.status === 'OK' && r.athValue === 345.34;
}

async function exactProjection(projectFn) {
  const out = projectFn('AAPL', record({ refresh: { status: 'unresolved', lastAttemptAt: NOW_ISO, reason: 'FETCH_FAILED' } }));
  return Object.keys(out).sort().join() === PROJECTION_KEYS && JSON.stringify(out).indexOf('evidence') === -1 &&
    JSON.stringify(out).indexOf('lastCheckedAt') === -1 && JSON.stringify(out).indexOf('FETCH_FAILED') === -1;
}

async function readOnlyOneGet(mod) {
  const store = makeSpyStore({ seed: seed(record()) });
  await callRead(mod, armed(), ev({ body: body('AAPL'), store: store }));
  return store.log.length === 1 && store.log[0].op === 'get';
}

async function gateClosed(mod) {
  const store = makeSpyStore({ seed: seed(record()) });
  // A malformed body distinguishes the route gate (checked first, nothing parsed) from the preflight gate behind it.
  const r = await callRead(mod, {}, ev({ body: '{not json', store: store }));
  return parsed(r).status === 'DISABLED' && store.log.length === 0;
}

async function cacheHeaderPublic(mod) {
  const store = makeSpyStore({ seed: seed(record()) });
  const r = await callRead(mod, armed(), ev({ body: body('AAPL'), store: store }));
  return r.headers['Cache-Control'] === 'public, max-age=60';
}

// ── AR-3 ──────────────────────────────────────────────────────────────────────
async function main() {
  const realFetch = globalThis.fetch;
  let realFetchCalls = 0;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('REAL_FETCH_FORBIDDEN'); };
  try {
    await test('AR-3a gate off: DISABLED, zero store calls, nothing parsed', async function () {
      const store = makeSpyStore({ seed: seed(record()) });
      const r = await callRead(core, {}, ev({ body: '{not json', store: store }));
      ok(r.statusCode === 200 && r.body === JSON.stringify({ status: 'DISABLED', reason: 'SERVER_DISABLED' }), 'DISABLED envelope');
      ok(store.log.length === 0, 'no store call');
      const r2 = await callRead(core, { PT_ENABLE_ATH_READ_SERVER: 'TRUE' }, ev({ store: store }));
      ok(parsed(r2).status === 'DISABLED', 'only the exact string true opens the gate');
      const r3 = await callRead(core, { PT_ENABLE_ATH_WRITE_SERVER: 'true', PT_ENABLE_ATH_ENSURE_SERVER: 'true' }, ev({ store: store }));
      ok(parsed(r3).status === 'DISABLED', 'the write / ensure gates do not open the read route');
    });

    await test('AR-3b OPTIONS is 204 and non-POST is 405', async function () {
      const o = await callRead(core, armed(), ev({ method: 'OPTIONS' }));
      ok(o.statusCode === 204, 'OPTIONS');
      const g = await callRead(core, armed(), ev({ method: 'GET' }));
      ok(g.statusCode === 405 && parsed(g).status === 'METHOD_NOT_ALLOWED', 'GET');
    });

    await test('AR-3c public read: identical response with no token, a wrong token and the write token; tokens in the environment change nothing', async function () {
      const mk = function () { return makeSpyStore({ seed: seed(record()) }); };
      const none = await callRead(core, armed(), ev({ body: body('AAPL'), store: mk() }));
      const wrong = await callRead(core, armed(), ev({ auth: 'Bearer wrong', body: body('AAPL'), store: mk() }));
      const write = await callRead(core, armed(), ev({ auth: 'Bearer ' + WRITE_TOKEN, body: body('AAPL'), store: mk() }));
      const withEnvTokens = await callRead(core, armed({ PT_ATH_READ_TOKEN: READ_TOKEN, PT_ATH_WRITE_TOKEN: WRITE_TOKEN }), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: mk() }));
      ok(none.statusCode === 200 && parsed(none).status === 'OK', 'no token reads');
      ok(none.body === wrong.body && none.body === write.body && none.body === withEnvTokens.body, 'responses are byte-identical');
      ok(await publicWithoutToken(core), 'predicate');
    });

    await test('AR-3d no allowlist and no token configuration is needed: any valid ticker reads', async function () {
      const store = makeSpyStore({ seed: seed(record({ ticker: 'MSFT', providerSymbol: 'MSFT' })) });
      const r = await callRead(core, armed({ PT_ATH_ALLOWED_TICKERS: 'TEVA.TA' }), ev({ body: body('MSFT'), store: store }));
      ok(parsed(r).status === 'OK' && parsed(r).ticker === 'MSFT' && parsed(r).athValue === 345.34, 'a ticker outside any allowlist still reads');
      const bad = await callRead(core, armed({ PT_ATH_ALLOWED_TICKERS: 'AAPL,TCH-F34.TA' }), ev({ body: body('MSFT'), store: makeSpyStore({ seed: seed(record({ ticker: 'MSFT', providerSymbol: 'MSFT' })) }) }));
      ok(parsed(bad).status === 'OK', 'a malformed allowlist value is irrelevant to the read route');
      const collide = await callRead(core, armed({ PT_ATH_READ_TOKEN: 'same', PT_ATH_WRITE_TOKEN: 'same' }), ev({ body: body('AAPL'), store: makeSpyStore({ seed: seed(record()) }) }));
      ok(parsed(collide).status === 'OK', 'token collisions are irrelevant to the read route');
    });

    await test('AR-3e allowlist parser is unchanged (it still guards the write side)', async function () {
      const ok1 = preflight.parseAthAllowedTickers('aapl, teva.ta  NICE.TA');
      ok(ok1.ok === true && ok1.tickers.has('AAPL') && ok1.tickers.has('TEVA.TA') && ok1.tickers.has('NICE.TA') && ok1.tickers.size === 3, 'case-folded, deduped, .TA kept');
      ok(preflight.parseAthAllowedTickers(undefined).reason === 'ALLOWLIST_MISSING', 'missing');
      ok(preflight.parseAthAllowedTickers('AAPL,TCH-F34.TA').reason === 'ALLOWLIST_INVALID', 'invalid entry rejects the whole list');
    });

    await test('AR-3f body and ticker validation (no store call on any failure)', async function () {
      const store = makeSpyStore();
      const j = await callRead(core, armed(), ev({ body: '{not json', store: store }));
      ok(j.statusCode === 400 && parsed(j).status === 'INVALID_JSON', 'invalid json');
      const arr = await callRead(core, armed(), ev({ body: '[]', store: store }));
      ok(arr.statusCode === 400, 'array body');
      for (const t of ['aapl', 'AAPL ', 'TCH-F34.TA', 'TEVA.ta', '', 5, null, undefined, 'AAPL.TA.TA']) {
        const r = await callRead(core, armed(), ev({ body: JSON.stringify({ ticker: t }), store: store }));
        ok(r.statusCode === 400 && parsed(r).status === 'INVALID_TICKER', 'ticker ' + String(t));
      }
      ok(store.log.length === 0, 'no store call');
    });

    await test('AR-3g no record: NOT_AVAILABLE; exactly one strong get of the exact key, nothing else', async function () {
      const store = makeSpyStore();
      const r = await callRead(core, armed(), ev({ body: body('TEVA.TA'), store: store }));
      ok(parsed(r).status === 'NOT_AVAILABLE' && parsed(r).reason === 'NO_RECORD', 'NO_RECORD');
      ok(store.log.length === 1 && store.log[0].op === 'get' && store.log[0].key === 'ath:v1:TEVA.TA', 'one get of ath:v1:TEVA.TA');
      ok(store.log[0].opts && store.log[0].opts.consistency === 'strong', 'strong consistency');
    });

    await test('AR-3h athValue is returned only for verified; others are null with the status', async function () {
      ok(await projectsVerifiedOnly(core), 'verified / stale-suspect / unresolved projection');
    });

    await test('AR-3i a failed refresh on a verified record does not suppress the value, and is not exposed', async function () {
      ok(await refreshDoesNotSuppress(core), 'refresh unresolved keeps the stored ATH');
      const store = makeSpyStore({ seed: seed(record({ refresh: { status: 'unresolved', lastAttemptAt: NOW_ISO, reason: 'SUSPECT_MATERIAL' } })) });
      const r = await callRead(core, armed(), ev({ body: body('AAPL'), store: store }));
      ok(r.body.indexOf('SUSPECT_MATERIAL') === -1 && r.body.indexOf('refresh') === -1, 'refresh state is never exposed');
    });

    await test('AR-3j OK envelope: exactly the ath-read-v2 keys; no evidence, refresh, timestamps, allowlist, 1Y High or secrets; one read-only get', async function () {
      const store = makeSpyStore({ seed: seed(record()) });
      const r = await callRead(core, armed({ PT_ATH_ALLOWED_TICKERS: 'AAPL', PT_ATH_READ_TOKEN: READ_TOKEN }), ev({ body: body('AAPL'), store: store }));
      const b = parsed(r);
      ok(r.statusCode === 200 && b.status === 'OK', 'OK');
      const keys = Object.keys(b).sort().join();
      ok(keys === PROJECTION_KEYS, 'projection keys: ' + keys);
      ok(b.readContractVersion === 'ath-read-v2' && b.method === 'auto' && b.verifiedAt === NOW_ISO, 'contract, method, verifiedAt');
      ok(r.body.indexOf(READ_TOKEN) === -1 && r.body.indexOf('AAPL,') === -1, 'no secrets or allowlist contents');
      ok(!/high1y|1Y High|evidence|lastCheckedAt|splitCheckedThrough|refresh/i.test(r.body), 'nothing outside the projection');
      ok(store.log.length === 1 && store.log[0].op === 'get', 'the reader only reads, once');
      ok(r.headers['Cache-Control'] === 'public, max-age=60', 'public cache header');
      ok(await exactProjection(athRecord.projectPublic), 'projection function');
    });

    await test('AR-3k corrupt, mismatched or unreadable store content is DEGRADED, never a value; errors expose nothing', async function () {
      const corrupt = makeSpyStore({ seed: { 'ath:v1:AAPL': '{not json' } });
      ok(parsed(await callRead(core, armed(), ev({ body: body('AAPL'), store: corrupt }))).reason === 'STORE_RECORD_INVALID', 'corrupt json');
      const wrongTicker = makeSpyStore({ seed: { 'ath:v1:AAPL': JSON.stringify(record({ ticker: 'NICE.TA', providerSymbol: 'NICE.TA', currency: 'ILS', unit: 'ILA' })) } });
      ok(parsed(await callRead(core, armed(), ev({ body: body('AAPL'), store: wrongTicker }))).reason === 'STORE_RECORD_INVALID', 'ticker mismatch');
      const extra = record(); extra.override = true;
      const bad = makeSpyStore({ seed: { 'ath:v1:AAPL': JSON.stringify(extra) } });
      ok(parsed(await callRead(core, armed(), ev({ body: body('AAPL'), store: bad }))).reason === 'STORE_RECORD_INVALID', 'record with an override field');
      const throws = makeSpyStore({ getThrows: true });
      const t = parsed(await callRead(core, armed(), ev({ body: body('AAPL'), store: throws })));
      ok(t.status === 'DEGRADED' && t.reason === 'STORE_UNAVAILABLE' && t.athValue === undefined, 'store throw');
      ok(corrupt.log.every(function (l) { return l.op === 'get'; }), 'no write on a corrupt record');
    });

    await test('AR-3l a stored v1 record reads as method operator through upgradeV1 (never written back by the reader)', async function () {
      const store = makeSpyStore({ seed: seed(recordV1()) });
      const b = parsed(await callRead(core, armed(), ev({ body: body('AAPL'), store: store })));
      ok(b.status === 'OK' && b.method === 'operator' && b.athValue === 345.34 && b.recordStatus === 'verified', 'v1 read as operator');
      ok(Object.keys(b).sort().join() === PROJECTION_KEYS, 'same projection');
      ok(store.log.length === 1 && store.log[0].op === 'get', 'no write-back');
    });

    await test('AR-3m preflight sides: read and ensure are public (gate + ticker); write keeps gate, token, collision and allowlist', async function () {
      const env = { PT_ENABLE_ATH_WRITE_SERVER: 'true', PT_ATH_WRITE_TOKEN: WRITE_TOKEN, PT_ATH_READ_TOKEN: READ_TOKEN, PT_ATH_ALLOWED_TICKERS: 'AAPL' };
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'AAPL' }).ok === true, 'write ok');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + READ_TOKEN, ticker: 'AAPL' }).reason === 'UNAUTHORIZED', 'read token cannot write');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: Object.assign({}, env, { PT_ENABLE_ATH_WRITE_SERVER: 'yes' }), authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'AAPL' }).reason === 'WRITE_SERVER_DISABLED', 'write gate strict');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'MSFT' }).reason === 'TICKER_NOT_ALLOWED', 'membership');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'aapl' }).reason === 'TICKER_INVALID', 'ticker is not normalised');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: Object.assign({}, env, { PT_ATH_READ_TOKEN: WRITE_TOKEN }), authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'AAPL' }).reason === 'TOKEN_COLLISION', 'PT_ATH_READ_TOKEN still in the write collision list');
      ok(preflight.evaluateAthPreflight({ side: 'read', env: env, ticker: 'AAPL' }).reason === 'READ_SERVER_DISABLED', 'read gate independent of the write gate');
      const rd = preflight.evaluateAthPreflight({ side: 'read', env: { PT_ENABLE_ATH_READ_SERVER: 'true' }, ticker: 'AAPL' });
      ok(rd.ok === true && rd.ticker === 'AAPL', 'read: gate + ticker only');
      ok(preflight.evaluateAthPreflight({ side: 'read', env: { PT_ENABLE_ATH_READ_SERVER: 'true' }, ticker: 'aapl' }).reason === 'TICKER_INVALID', 'read ticker format');
      const en = preflight.evaluateAthPreflight({ side: 'ensure', env: { PT_ENABLE_ATH_ENSURE_SERVER: 'true' }, ticker: 'MTRX.TA' });
      ok(en.ok === true && en.ticker === 'MTRX.TA', 'ensure: gate + ticker only');
      ok(preflight.evaluateAthPreflight({ side: 'ensure', env: { PT_ENABLE_ATH_READ_SERVER: 'true' }, ticker: 'AAPL' }).reason === 'ENSURE_SERVER_DISABLED', 'ensure has its own gate');
      ok(preflight.evaluateAthPreflight({ side: 'other', env: env, authorization: 'x', ticker: 'AAPL' }).ok === false, 'unknown side fails closed');
    });

    await test('AR-3n the reader never reads the real fetch or any network', async function () {
      ok(realFetchCalls === 0, 'real fetch calls: ' + realFetchCalls);
    });

    // ── planted negatives ───────────────────────────────────────────────────
    async function killed(name, file, mutations, predicate, control) {
      await test('PN ' + name + ' is killed', async function () {
        // Positive control: the unmutated source passes the same predicate.
        ok((await predicate(control)) === true, 'positive control must pass on the unmutated source');
        const mutant = loadMutated(file, mutations);
        // Killed only by the predicate RETURNING false; a throw would hide a broken predicate.
        let survived;
        try { survived = (await predicate(mutant)) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
        ok(!survived, 'mutant survived: the predicate still passes');
      });
    }

    await killed('reader returns the value for any status (AR-3)', RECORD_PATH,
      [['athValue: verified ? record.athValue : null,', 'athValue: record.athValue,']], async function (m) {
        // The projection lives in ath-record; drive the real reader with the mutated projection by predicate on the function itself.
        const stale = m.projectPublic('AAPL', record({ status: 'stale-suspect' }));
        return stale.athValue === null;
      }, athRecord);
    await killed('reader drops the value when only refresh is unresolved (AR-3)', RECORD_PATH,
      [['const verified = record.status === \'verified\';', 'const verified = record.status === \'verified\' && record.refresh.status === \'none\';']], async function (m) {
        return m.projectPublic('AAPL', record({ refresh: { status: 'unresolved', lastAttemptAt: NOW_ISO, reason: 'FETCH_FAILED' } })).athValue === 345.34;
      }, athRecord);
    await killed('projection also exposes evidence, refresh and lastCheckedAt (AR-3)', RECORD_PATH,
      [['    verifiedAt: record.verifiedAt\n  };\n}\n\nmodule.exports', '    verifiedAt: record.verifiedAt, evidence: record.evidence, refresh: record.refresh, lastCheckedAt: record.lastCheckedAt\n  };\n}\n\nmodule.exports']],
      async function (m) { return exactProjection(m.projectPublic); }, athRecord);
    await killed('a token is required again on the read side (AR-3)', PREFLIGHT_PATH,
      [['if (side.public === true) {', 'if (false) {']], async function (m) {
        const r = m.evaluateAthPreflight({ side: 'read', env: { PT_ENABLE_ATH_READ_SERVER: 'true' }, ticker: 'AAPL' });
        return r.ok === true;
      }, preflight);
    await killed('the read gate is skipped (AR-3)', READ_PATH,
      [['process.env.PT_ENABLE_ATH_READ_SERVER !== \'true\'', 'false']], gateClosed, core);
    await killed('the reader writes to the store (AR-3)', READ_PATH,
      [['raw = await store.get(recordKey(ticker), STRONG);', 'await store.set(recordKey(ticker), \'{}\'); raw = await store.get(recordKey(ticker), STRONG);']], readOnlyOneGet, core);
    await killed('the public cache header is dropped (AR-3)', READ_PATH,
      [['return res(200, projectPublic(ticker, stored.record), { \'Cache-Control\': \'public, max-age=60\' });', 'return res(200, projectPublic(ticker, stored.record));']], cacheHeaderPublic, core);
    await killed('an allowlist membership check is required again on the read side (AR-3)', PREFLIGHT_PATH,
      [['    return { ok: true, ticker: ticker };\n  }\n\n  // 2) Inbound token', '    return fail(\'TICKER_NOT_ALLOWED\');\n  }\n\n  // 2) Inbound token']],
      async function (m) {
        const r = m.evaluateAthPreflight({ side: 'read', env: { PT_ENABLE_ATH_READ_SERVER: 'true', PT_ATH_ALLOWED_TICKERS: 'TEVA.TA' }, ticker: 'AAPL' });
        return r.ok === true;
      }, preflight);
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
