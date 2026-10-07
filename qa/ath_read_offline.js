'use strict';

/*
 * qa/ath_read_offline.js
 *
 * R-1 Slice B (B1) — gated ATH reader + shared preflight (AR-3).
 *
 * Exercises netlify/functions/lib/ath-read-core.js and lib/ath-preflight.js through the real
 * handler with an injected spy store (event._testStore) and an injected clock. No network, no
 * real Blob store, no real environment (every ATH / collision key is saved, cleared and
 * restored around each case). Planted negatives mutate the production source text.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const READ_PATH = path.join(LIB, 'ath-read-core.js');
const PREFLIGHT_PATH = path.join(LIB, 'ath-preflight.js');

const core = require(READ_PATH);
const preflight = require(PREFLIGHT_PATH);

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

const READ_TOKEN = 'ath-read-tok-qa-1';
const WRITE_TOKEN = 'ath-write-tok-qa-1';
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
    PT_ENABLE_ATH_READ_SERVER: 'true',
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
    set: async function (key, value, o) { log.push({ op: 'set', key: key, value: value, opts: o }); data[key] = value; return { modified: true }; },
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

function body(ticker) { return JSON.stringify({ ticker: ticker }); }
function parsed(r) { return JSON.parse(r.body); }

function record(over) {
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

// ── predicates (also reused against mutants) ─────────────────────────────────
async function projectsVerifiedOnly(mod) {
  const verified = makeSpyStore({ seed: seed(record()) });
  const v = parsed(await callRead(mod, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: verified })));
  const stale = makeSpyStore({ seed: seed(record({ status: 'stale-suspect' })) });
  const s = parsed(await callRead(mod, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: stale })));
  const unresolvedRec = record({ status: 'unresolved', athValue: null, athDate: null, verifiedAt: null, verifiedBy: null });
  unresolvedRec.evidence.matchedBar = null;
  const unres = makeSpyStore({ seed: seed(unresolvedRec) });
  const u = parsed(await callRead(mod, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: unres })));
  return v.athValue === 345.34 && v.athDate === '2026-09-22' && v.recordStatus === 'verified' &&
    s.athValue === null && s.athDate === null && s.recordStatus === 'stale-suspect' &&
    u.athValue === null && u.athDate === null && u.recordStatus === 'unresolved';
}

async function refreshDoesNotSuppress(mod) {
  const rec = record({ refresh: { status: 'unresolved', lastAttemptAt: NOW_ISO, reason: 'NO_CLEAN_MATCH' } });
  const store = makeSpyStore({ seed: seed(rec) });
  const b = parsed(await callRead(mod, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: store })));
  return b.status === 'OK' && b.athValue === 345.34 && b.refresh.status === 'unresolved';
}

async function collisionDetected(pf) {
  const env = { PT_ENABLE_ATH_READ_SERVER: 'true', PT_ATH_READ_TOKEN: 'same', PT_ATH_WRITE_TOKEN: 'same', PT_ATH_ALLOWED_TICKERS: 'AAPL' };
  const r = pf.evaluateAthPreflight({ side: 'read', env: env, authorization: 'Bearer same', ticker: 'AAPL' });
  return r.ok === false && r.reason === 'TOKEN_COLLISION';
}

// ── AR-3 ──────────────────────────────────────────────────────────────────────
async function main() {
  const realFetch = globalThis.fetch;
  let realFetchCalls = 0;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('REAL_FETCH_FORBIDDEN'); };
  try {
    await test('AR-3a gate off: DISABLED, zero store calls, nothing parsed', async function () {
      const store = makeSpyStore({ seed: seed(record()) });
      const r = await callRead(core, {}, ev({ auth: 'Bearer ' + READ_TOKEN, body: '{not json', store: store }));
      ok(r.statusCode === 200 && r.body === JSON.stringify({ status: 'DISABLED', reason: 'SERVER_DISABLED' }), 'DISABLED envelope');
      ok(store.log.length === 0, 'no store call');
      const r2 = await callRead(core, { PT_ENABLE_ATH_READ_SERVER: 'TRUE' }, ev({ store: store }));
      ok(parsed(r2).status === 'DISABLED', 'only the exact string true opens the gate');
      const r3 = await callRead(core, { PT_ENABLE_ATH_WRITE_SERVER: 'true' }, ev({ store: store }));
      ok(parsed(r3).status === 'DISABLED', 'the write gate does not open the read route');
    });

    await test('AR-3b OPTIONS is 204 and non-POST is 405', async function () {
      const o = await callRead(core, armed(), ev({ method: 'OPTIONS' }));
      ok(o.statusCode === 204, 'OPTIONS');
      const g = await callRead(core, armed(), ev({ method: 'GET', auth: 'Bearer ' + READ_TOKEN }));
      ok(g.statusCode === 405 && parsed(g).status === 'METHOD_NOT_ALLOWED', 'GET');
    });

    await test('AR-3c token is checked before the body is parsed and before any store call', async function () {
      const store = makeSpyStore({ seed: seed(record()) });
      const bad = await callRead(core, armed(), ev({ auth: 'Bearer wrong', body: '{not json', store: store }));
      ok(bad.statusCode === 401 && parsed(bad).status === 'UNAUTHORIZED', 'wrong token with malformed body is 401');
      const none = await callRead(core, armed(), ev({ body: '{not json', store: store }));
      ok(none.statusCode === 401, 'missing token');
      const padded = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN + ' ', body: body('AAPL'), store: store }));
      ok(padded.statusCode === 401, 'exact untrimmed Bearer match');
      const writeTok = await callRead(core, armed({ PT_ATH_WRITE_TOKEN: WRITE_TOKEN }), ev({ auth: 'Bearer ' + WRITE_TOKEN, body: body('AAPL'), store: store }));
      ok(writeTok.statusCode === 401, 'the write token does not authorize a read');
      ok(store.log.length === 0, 'no store call on any auth failure');
      const noServerToken = await callRead(core, { PT_ENABLE_ATH_READ_SERVER: 'true', PT_ATH_ALLOWED_TICKERS: 'AAPL' }, ev({ auth: 'Bearer ', body: body('AAPL'), store: store }));
      ok(noServerToken.statusCode === 401, 'a missing server token folds into UNAUTHORIZED');
    });

    await test('AR-3d token collision with every other token is CONFIGURATION_MISSING', async function () {
      const others = ['PT_ATH_WRITE_TOKEN', 'PT_FUND_FACTS_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN', 'PT_OWNER_TOKEN'];
      for (const k of others) {
        const extra = {}; extra[k] = READ_TOKEN;
        const store = makeSpyStore();
        const r = await callRead(core, armed(extra), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: store }));
        ok(r.statusCode === 500 && parsed(r).status === 'CONFIGURATION_MISSING' && parsed(r).reason === 'TOKEN_COLLISION', 'collision with ' + k);
        ok(store.log.length === 0, 'no store call on collision');
      }
      const empty = await callRead(core, armed({ PT_FUND_FACTS_TOKEN: '' }), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: makeSpyStore() }));
      ok(parsed(empty).reason === 'NO_RECORD', 'an empty comparison token is not a collision');
    });

    await test('AR-3e allowlist configuration is validated (fail closed, whole list)', async function () {
      const cases = [
        [undefined, 'ALLOWLIST_MISSING'], ['', 'ALLOWLIST_MISSING'], [' ,, ', 'ALLOWLIST_MISSING'],
        ['AAPL,TCH-F34.TA', 'ALLOWLIST_INVALID'], ['AAPL,ßS', 'ALLOWLIST_INVALID'], ['AAPL,TOOLONGSYMBOLX', 'ALLOWLIST_INVALID'],
        [Array.from({ length: 101 }, function (_, i) { return 'T' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26)) + String.fromCharCode(65 + Math.floor(i / 676)); }).join(','), 'ALLOWLIST_INVALID']
      ];
      for (const c of cases) {
        const env = armed();
        if (c[0] === undefined) { delete env.PT_ATH_ALLOWED_TICKERS; } else { env.PT_ATH_ALLOWED_TICKERS = c[0]; }
        const r = await callRead(core, env, ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: makeSpyStore() }));
        ok(r.statusCode === 500 && parsed(r).reason === c[1], 'allowlist ' + String(c[0]).slice(0, 30) + ' -> ' + c[1] + ' got ' + parsed(r).reason);
      }
      const ok1 = preflight.parseAthAllowedTickers('aapl, teva.ta  NICE.TA');
      ok(ok1.ok === true && ok1.tickers.has('AAPL') && ok1.tickers.has('TEVA.TA') && ok1.tickers.has('NICE.TA') && ok1.tickers.size === 3, 'case-folded, deduped, .TA kept');
    });

    await test('AR-3f body and ticker validation', async function () {
      const store = makeSpyStore();
      const j = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: '{not json', store: store }));
      ok(j.statusCode === 400 && parsed(j).status === 'INVALID_JSON', 'invalid json');
      const arr = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: '[]', store: store }));
      ok(arr.statusCode === 400, 'array body');
      for (const t of ['aapl', 'AAPL ', 'TCH-F34.TA', 'TEVA.ta', '', 5, null, undefined, 'AAPL.TA.TA']) {
        const r = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: JSON.stringify({ ticker: t }), store: store }));
        ok(r.statusCode === 400 && parsed(r).status === 'INVALID_TICKER', 'ticker ' + String(t));
      }
      ok(store.log.length === 0, 'no store call');
    });

    await test('AR-3g ticker outside the allowlist is NOT_AVAILABLE with no store call', async function () {
      const store = makeSpyStore({ seed: seed(record({ ticker: 'MSFT', providerSymbol: 'MSFT' })) });
      const r = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('MSFT'), store: store }));
      ok(r.statusCode === 200 && parsed(r).status === 'NOT_AVAILABLE' && parsed(r).reason === 'NO_RECORD' && parsed(r).ticker === 'MSFT', 'not allowed folds into NO_RECORD');
      ok(store.log.length === 0, 'no store call');
    });

    await test('AR-3h no record: NOT_AVAILABLE; one strong read of the exact key', async function () {
      const store = makeSpyStore();
      const r = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('TEVA.TA'), store: store }));
      ok(parsed(r).status === 'NOT_AVAILABLE' && parsed(r).reason === 'NO_RECORD', 'NO_RECORD');
      ok(store.log.length === 1 && store.log[0].op === 'get' && store.log[0].key === 'ath:v1:TEVA.TA', 'one get of ath:v1:TEVA.TA');
      ok(store.log[0].opts && store.log[0].opts.consistency === 'strong', 'strong consistency');
    });

    await test('AR-3i athValue is returned only for verified; others are null with the status', async function () {
      ok(await projectsVerifiedOnly(core), 'verified / stale-suspect / unresolved projection');
    });

    await test('AR-3j a failed refresh on a verified record does not suppress the value', async function () {
      ok(await refreshDoesNotSuppress(core), 'refresh unresolved keeps the stored ATH');
    });

    await test('AR-3k OK envelope: exact projection, no evidence, no 1Y High, no secrets', async function () {
      const store = makeSpyStore({ seed: seed(record()) });
      const r = await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: store }));
      const b = parsed(r);
      ok(r.statusCode === 200 && b.status === 'OK', 'OK');
      const keys = Object.keys(b).sort().join();
      ok(keys === 'athDate,athValue,basis,currency,lastCheckedAt,pending,readContractVersion,recordStatus,refresh,status,ticker,unit,verifiedAt', 'projection keys: ' + keys);
      ok(b.readContractVersion === 'ath-read-v1', 'read contract version');
      ok(r.body.indexOf(READ_TOKEN) === -1, 'token never echoed');
      ok(!/high1y|1Y High|evidence/i.test(r.body), 'no evidence or 1Y High in the envelope');
      ok(store.log.every(function (l) { return l.op === 'get'; }), 'the reader only reads');
    });

    await test('AR-3l corrupt, mismatched or unreadable store content is DEGRADED, never a value', async function () {
      const corrupt = makeSpyStore({ seed: { 'ath:v1:AAPL': '{not json' } });
      ok(parsed(await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: corrupt }))).reason === 'STORE_RECORD_INVALID', 'corrupt json');
      const wrongTicker = makeSpyStore({ seed: { 'ath:v1:AAPL': JSON.stringify(record({ ticker: 'NICE.TA', providerSymbol: 'NICE.TA' })) } });
      ok(parsed(await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: wrongTicker }))).reason === 'STORE_RECORD_INVALID', 'ticker mismatch');
      const extra = record(); extra.override = true;
      const bad = makeSpyStore({ seed: { 'ath:v1:AAPL': JSON.stringify(extra) } });
      ok(parsed(await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: bad }))).reason === 'STORE_RECORD_INVALID', 'record with an override field');
      const throws = makeSpyStore({ getThrows: true });
      const t = parsed(await callRead(core, armed(), ev({ auth: 'Bearer ' + READ_TOKEN, body: body('AAPL'), store: throws })));
      ok(t.status === 'DEGRADED' && t.reason === 'STORE_UNAVAILABLE' && t.athValue === undefined, 'store throw');
    });

    await test('AR-3m write-side preflight uses its own gate and token', async function () {
      const env = { PT_ENABLE_ATH_WRITE_SERVER: 'true', PT_ATH_WRITE_TOKEN: WRITE_TOKEN, PT_ATH_READ_TOKEN: READ_TOKEN, PT_ATH_ALLOWED_TICKERS: 'AAPL' };
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'AAPL' }).ok === true, 'write ok');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + READ_TOKEN, ticker: 'AAPL' }).reason === 'UNAUTHORIZED', 'read token cannot write');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: Object.assign({}, env, { PT_ENABLE_ATH_WRITE_SERVER: 'yes' }), authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'AAPL' }).reason === 'WRITE_SERVER_DISABLED', 'write gate strict');
      ok(preflight.evaluateAthPreflight({ side: 'read', env: env, authorization: 'Bearer ' + READ_TOKEN, ticker: 'AAPL' }).reason === 'READ_SERVER_DISABLED', 'read gate independent');
      ok(preflight.evaluateAthPreflight({ side: 'other', env: env, authorization: 'x', ticker: 'AAPL' }).ok === false, 'unknown side fails closed');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'MSFT' }).reason === 'TICKER_NOT_ALLOWED', 'membership');
      ok(preflight.evaluateAthPreflight({ side: 'write', env: env, authorization: 'Bearer ' + WRITE_TOKEN, ticker: 'aapl' }).reason === 'TICKER_INVALID', 'ticker is not normalised');
    });

    await test('AR-3n the reader never reads the real fetch or any network', async function () {
      ok(realFetchCalls === 0, 'real fetch calls: ' + realFetchCalls);
    });

    // ── planted negatives ───────────────────────────────────────────────────
    async function killed(name, file, mutations, predicate, which) {
      await test('PN ' + name + ' is killed', async function () {
        const mutant = loadMutated(file, mutations);
        // Killed only by the predicate RETURNING false; a throw would hide a broken predicate.
        let survived;
        try { survived = (await predicate(mutant)) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
        ok(!survived, 'mutant survived: the predicate still passes');
      });
    }

    await killed('reader returns the value for any status (AR-3)', READ_PATH,
      [['record.status === \'verified\' ? record.athValue : null', 'record.athValue']], projectsVerifiedOnly);
    await killed('reader drops the value when only refresh is unresolved (AR-3)', READ_PATH,
      [['record.status === \'verified\' ? record.athValue : null', 'record.status === \'verified\' && record.refresh.status === \'none\' ? record.athValue : null']], refreshDoesNotSuppress);
    await killed('token collision check removed (AR-3)', PREFLIGHT_PATH,
      [['if (isNonEmptyString(other) && other === token) {', 'if (false) {']], collisionDetected);
    await killed('body parsed before the token check in the reader (AR-3)', READ_PATH,
      [['if (!probe.ok && probe.reason !== \'TICKER_INVALID\') {', 'if (false) {']], async function (mod) {
        const store = makeSpyStore();
        const r = await callRead(mod, armed(), ev({ auth: 'Bearer wrong', body: '{not json', store: store }));
        return r.statusCode === 401;
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
