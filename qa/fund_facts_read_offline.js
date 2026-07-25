'use strict';

const assert = require('assert');
const path = require('path');

const READ_PREFLIGHT_PATH = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-read-preflight.js');
const READ_CORE_PATH = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-read-core.js');
const WRITE_CORE_PATH = path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-core.js');

const readPreflight = require(READ_PREFLIGHT_PATH);
const readCore = require(READ_CORE_PATH);
const writeCore = require(WRITE_CORE_PATH);

const TICKER = 'FROG';
const CIK = '0001800667';
const TICKER_2 = 'AAPL';
const CIK_2 = '0000320193';

const READ_TOKEN = 'read-tok-qa-1';
const WRITE_TOKEN = 'write-tok-qa-1';
const PULL_TOKEN = 'pull-tok-qa-1';
const STORE_WRITE_TOKEN = 'store-write-tok-qa-1';
const OWNER_TOKEN = 'owner-tok-qa-1';

const NOW_ISO = '2026-07-25T00:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const RUN_ID = 1700000000000;

const CONTRACT_VERSION = 'fund-contract-v1';
const SOURCE_TIER = 'sec_xbrl_primary';
const PROVIDER_ID = 'j1-sec-facts@job-model-v1';

function pointerKey(ticker) { return 'fundstore:v1:cik:' + ticker; }
function factsKey(cik) { return 'fundstore:v1:facts:' + cik; }

const ENV_KEYS = [
  'PT_ENABLE_FUND_FACTS_READ_SERVER',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_ENABLE_FUND_FACTS_SERVER',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_ALLOWED_TICKERS',
  'SEC_USER_AGENT',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
  'PT_OWNER_TOKEN'
];

function withEnv(envObj, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(envObj || {}).forEach(function (k) { process.env[k] = envObj[k]; });
  return Promise.resolve().then(fn).finally(function () {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    });
  });
}

function readArmedEnv(extra) {
  return Object.assign({
    PT_ENABLE_FUND_FACTS_READ_SERVER: 'true',
    PT_FUND_FACTS_READ_TOKEN: READ_TOKEN,
    PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL'
  }, extra || {});
}

function writeArmedEnv(extra) {
  return Object.assign({
    PT_ENABLE_FUND_FACTS_SERVER: 'true',
    PT_FUND_FACTS_TOKEN: WRITE_TOKEN,
    PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL',
    SEC_USER_AGENT: 'PulseT1C1Test/1.0 qa@example.com'
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
      if (opts.getThrows && opts.getThrows[key]) { throw new Error('boom-get-injected'); }
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    set: async function (key, value, o) {
      log.push({ op: 'set', key: key, value: value, opts: o });
      if (o && o.onlyIfNew === true && Object.prototype.hasOwnProperty.call(data, key)) {
        return { modified: false };
      }
      data[key] = value;
      return { modified: true };
    }
  };
}

function makeReadEvent(o) {
  o = o || {};
  const ev = { httpMethod: o.method || 'POST', headers: { authorization: o.auth }, body: o.body };
  if (o.store) { ev._testStore = o.store; }
  ev._testClock = { nowMs: typeof o.nowMs === 'number' ? o.nowMs : NOW_MS };
  return ev;
}

function makeWriteEvent(o) {
  o = o || {};
  const ev = { httpMethod: 'POST', headers: { authorization: o.auth }, body: o.body };
  if (o.store) { ev._testStore = o.store; }
  ev._testProviderOptions = { nowIso: NOW_ISO, providerImpl: o.providerImpl };
  return ev;
}

function parsedBody(r) { return JSON.parse(r.body); }

function fiscalFact(overrides) {
  return Object.assign({
    concept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
    unit: 'USD',
    fiscalYear: 2026,
    fiscalPeriod: 'Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    valueNumeric: 125000000,
    form: '10-Q',
    accessionNumber: '0001800667-26-000042',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/',
    filed: '2026-05-08'
  }, overrides || {});
}

function emptySeriesMember() {
  return { conceptUsed: null, facts: [] };
}

function fullSeries(overrides) {
  const base = {
    revenue: { conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax', facts: [fiscalFact()] },
    netIncome: emptySeriesMember(),
    eps: emptySeriesMember(),
    cfo: emptySeriesMember(),
    capex: emptySeriesMember(),
    cash: emptySeriesMember(),
    debt: emptySeriesMember(),
    equity: emptySeriesMember(),
    shares: emptySeriesMember()
  };
  return Object.assign(base, overrides || {});
}

function fullDerived(overrides) {
  const base = {
    revenueGrowth: null,
    netMargin: null,
    freeCashFlow: null,
    balanceSheetStrength: null
  };
  return Object.assign(base, overrides || {});
}

function validRecord(ticker, cik, overrides) {
  return Object.assign({
    ticker: ticker,
    cik: cik,
    fetchedAt: NOW_ISO,
    sourceTier: SOURCE_TIER,
    contractVersion: CONTRACT_VERSION,
    provider: PROVIDER_ID,
    runId: RUN_ID,
    series: fullSeries(),
    derived: fullDerived(),
    filings: [],
    gaps: ['debt: no concept present'],
    secRequests: [],
    confidence: null,
    verificationStatus: 'verified'
  }, overrides || {});
}

function validPointer(cik) {
  return JSON.stringify({ cik: cik });
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

function liveGuard() {
  throw new Error('LIVE_NETWORK_FORBIDDEN');
}

async function runTests() {
  process.stdout.write('\n=== T1-C1 — fund-facts-read-core RD-series (offline) ===\n\n');

  const originalFetch = global.fetch;
  global.fetch = liveGuard;

  try {
    await test('RD01 gate OFF GET -> 200 DISABLED, zero store access', async function () {
      await withEnv({}, async function () {
        const spy = makeSpyStore({ seed: {} });
        const out = await readCore.handler(makeReadEvent({
          method: 'GET',
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DISABLED',
          reason: 'SERVER_DISABLED'
        });
        assert.strictEqual(spy.log.length, 0, 'zero store access when gate is off');
      });
    });

    await test('RD02 method !== POST -> 405, zero store access', async function () {
      await withEnv(readArmedEnv(), async function () {
        const spy = makeSpyStore({ seed: {} });

        const out = await readCore.handler(makeReadEvent({
          method: 'GET',
          auth: 'Bearer ' + READ_TOKEN,
          store: spy
        }));

        assert.strictEqual(out.statusCode, 405);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'METHOD_NOT_ALLOWED',
          reason: 'METHOD_NOT_ALLOWED'
        });
        assert.strictEqual(
          spy.log.length,
          0,
          'zero store access before method guard returns'
        );
      });
    });

    await test('RD03 missing/wrong Bearer token -> 401, zero store access', async function () {
      await withEnv(readArmedEnv(), async function () {
        const spyMissing = makeSpyStore({ seed: {} });
        const outMissing = await readCore.handler(makeReadEvent({
          body: JSON.stringify({ ticker: TICKER }),
          store: spyMissing
        }));
        assert.strictEqual(outMissing.statusCode, 401);
        assert.deepStrictEqual(parsedBody(outMissing), {
          status: 'UNAUTHORIZED',
          reason: 'UNAUTHORIZED'
        });
        assert.strictEqual(spyMissing.log.length, 0, 'zero store access, missing token');

        const spyWrong = makeSpyStore({ seed: {} });
        const outWrong = await readCore.handler(makeReadEvent({
          auth: 'Bearer wrong-token',
          body: JSON.stringify({ ticker: TICKER }),
          store: spyWrong
        }));
        assert.strictEqual(outWrong.statusCode, 401);
        assert.deepStrictEqual(parsedBody(outWrong), {
          status: 'UNAUTHORIZED',
          reason: 'UNAUTHORIZED'
        });
        assert.strictEqual(spyWrong.log.length, 0, 'zero store access, wrong token');
      });
    });

    await test('RD04 read-token collisions -> 500, zero store access', async function () {
      const collisionKeys = [
        'PT_FUND_FACTS_TOKEN',
        'PT_SEC_EVIDENCE_PULL_TOKEN',
        'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
        'PT_OWNER_TOKEN'
      ];

      for (const key of collisionKeys) {
        const extra = {};
        extra[key] = READ_TOKEN;

        await withEnv(readArmedEnv(extra), async function () {
          const spy = makeSpyStore({ seed: {} });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 500, key);
          assert.deepStrictEqual(parsedBody(out), {
            status: 'CONFIGURATION_MISSING',
            reason: 'TOKEN_COLLISION'
          }, key);
          assert.strictEqual(
            spy.log.length,
            0,
            'zero store access, collision on ' + key
          );
        });
      }
    });

    await test('RD05 allowlist missing -> 500 CONFIGURATION_MISSING/ALLOWLIST_MISSING', async function () {
      const env = readArmedEnv();
      delete env.PT_FUND_FACTS_ALLOWED_TICKERS;

      await withEnv(env, async function () {
        const spy = makeSpyStore({ seed: {} });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 500);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'CONFIGURATION_MISSING',
          reason: 'ALLOWLIST_MISSING'
        });
        assert.strictEqual(spy.log.length, 0, 'zero store access');
      });
    });

    await test('RD06 allowlist invalid (malformed token) -> 500 CONFIGURATION_MISSING/ALLOWLIST_INVALID', async function () {
      const env = readArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FR0G,AAPL' });

      await withEnv(env, async function () {
        const spy = makeSpyStore({ seed: {} });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 500);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'CONFIGURATION_MISSING',
          reason: 'ALLOWLIST_INVALID'
        });
        assert.strictEqual(spy.log.length, 0, 'zero store access');
      });
    });

    await test('RD07 ticker format-invalid -> 400 INVALID_TICKER, zero store access', async function () {
      await withEnv(readArmedEnv(), async function () {
        const badTickers = ['frog', ' FROG', 'FROG ', 'TOOLONGTICKR', ''];

        for (const bad of badTickers) {
          const spy = makeSpyStore({ seed: {} });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: bad }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 400, JSON.stringify(bad));
          assert.deepStrictEqual(parsedBody(out), {
            status: 'INVALID_TICKER',
            reason: 'TICKER_INVALID'
          }, JSON.stringify(bad));
          assert.strictEqual(spy.log.length, 0, 'zero store access');
        }
      });
    });

    await test('RD08 privacy collapse for unavailable ticker', async function () {
      let outNotAllowed;
      let spyNotAllowed;

      await withEnv(
        readArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'AAPL' }),
        async function () {
          spyNotAllowed = makeSpyStore({ seed: {} });
          outNotAllowed = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spyNotAllowed
          }));
        }
      );

      let outUnseeded;
      let spyUnseeded;

      await withEnv(
        readArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG' }),
        async function () {
          spyUnseeded = makeSpyStore({ seed: {} });
          outUnseeded = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spyUnseeded
          }));
        }
      );

      const expectedBody = {
        status: 'NOT_AVAILABLE',
        reason: 'NO_RECORD',
        ticker: TICKER
      };

      assert.strictEqual(outNotAllowed.statusCode, 200);
      assert.strictEqual(outUnseeded.statusCode, 200);
      assert.deepStrictEqual(parsedBody(outNotAllowed), expectedBody);
      assert.deepStrictEqual(parsedBody(outUnseeded), expectedBody);

      assert.strictEqual(spyNotAllowed.log.length, 0);

      assert.strictEqual(spyUnseeded.log.length, 1);
      assert.strictEqual(spyUnseeded.log[0].op, 'get');
      assert.deepStrictEqual(spyUnseeded.log[0].opts, {
        consistency: 'strong'
      });

      assert.strictEqual(outNotAllowed.body, outUnseeded.body);
      assert.deepStrictEqual(outNotAllowed.headers, outUnseeded.headers);
    });

    await test('RD09 malformed JSON body -> 400 INVALID_JSON, zero store access', async function () {
      await withEnv(readArmedEnv(), async function () {
        const badBodies = ['not-json{{', '', '[]', 'null', '"a string"'];

        for (const bad of badBodies) {
          const spy = makeSpyStore({ seed: {} });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: bad,
            store: spy
          }));

          assert.strictEqual(out.statusCode, 400, JSON.stringify(bad));
          assert.deepStrictEqual(parsedBody(out), {
            status: 'INVALID_JSON',
            reason: 'INVALID_JSON'
          }, JSON.stringify(bad));
          assert.strictEqual(spy.log.length, 0, 'zero store access');
        }
      });
    });

    await test('RD10 store-acquire throw -> 200 DEGRADED/STORE_UNAVAILABLE', async function () {
      await withEnv(readArmedEnv(), async function () {
        const ev = makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER })
        });
        ev._testStore = undefined;
        delete ev._testStore;
        Object.defineProperty(ev, '_testStore', {
          get: function () { throw new Error('boom-acquire'); }
        });

        const out = await readCore.handler(ev);
        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_UNAVAILABLE',
          ticker: TICKER
        });
      });
    });

    await test('RD11 pointer read throws -> STORE_UNAVAILABLE', async function () {
      await withEnv(readArmedEnv(), async function () {
        const pointerThrows = {};
        pointerThrows[pointerKey(TICKER)] = true;

        const spy = makeSpyStore({
          seed: {},
          getThrows: pointerThrows
        });

        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_UNAVAILABLE',
          ticker: TICKER
        });

        assert.strictEqual(spy.log.length, 1);
        assert.strictEqual(spy.log[0].op, 'get');
        assert.deepStrictEqual(spy.log[0].opts, {
          consistency: 'strong'
        });
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false
        );
      });
    });

    await test('RD12 facts read throws -> STORE_UNAVAILABLE', async function () {
      await withEnv(readArmedEnv(), async function () {
        const factsThrows = {};
        factsThrows[factsKey(CIK)] = true;

        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);

        const spy = makeSpyStore({
          seed: seed,
          getThrows: factsThrows
        });

        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_UNAVAILABLE',
          ticker: TICKER
        });

        assert.strictEqual(spy.log.length, 2);
        assert.deepStrictEqual(
          spy.log.map(function (entry) { return entry.op; }),
          ['get', 'get']
        );
        assert.deepStrictEqual(spy.log[0].opts, {
          consistency: 'strong'
        });
        assert.deepStrictEqual(spy.log[1].opts, {
          consistency: 'strong'
        });
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false
        );
        assert.notStrictEqual(spy.log[0].key, spy.log[1].key);
      });
    });

    await test('RD13 malformed pointer JSON -> DEGRADED/STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const seed = {};
        seed[pointerKey(TICKER)] = 'not-json{{';

        const spy = makeSpyStore({ seed: seed });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_RECORD_INVALID',
          ticker: TICKER
        });
        assert.strictEqual(spy.log.length, 1);
        assert.strictEqual(spy.log[0].op, 'get');
        assert.deepStrictEqual(spy.log[0].opts, {
          consistency: 'strong'
        });
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false
        );
      });
    });

    await test('RD14a invalid pointer shape -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const badPointers = [
          JSON.stringify({ cik: CIK, extra: 'unexpected' }),
          JSON.stringify({}),
          JSON.stringify([CIK]),
          JSON.stringify(null)
        ];

        for (const bad of badPointers) {
          const seed = {};
          seed[pointerKey(TICKER)] = bad;

          const spy = makeSpyStore({ seed: seed });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 200, bad);
          assert.deepStrictEqual(parsedBody(out), {
            status: 'DEGRADED',
            reason: 'STORE_RECORD_INVALID',
            ticker: TICKER
          }, bad);

          assert.strictEqual(spy.log.length, 1, bad);
          assert.strictEqual(spy.log[0].op, 'get', bad);
          assert.deepStrictEqual(spy.log[0].opts, {
            consistency: 'strong'
          }, bad);
          assert.strictEqual(
            spy.log.some(function (entry) { return entry.op === 'set'; }),
            false,
            bad
          );
        }
      });
    });

    await test('RD14b malformed CIK in pointer -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const badPointers = [
          JSON.stringify({ cik: '123' }),
          JSON.stringify({ cik: 'not-numeric' }),
          JSON.stringify({ cik: '00018006670' }),
          JSON.stringify({ cik: ' 0001800667' }),
          JSON.stringify({ cik: '' }),
          JSON.stringify({ cik: 1234567890 })
        ];

        for (const bad of badPointers) {
          const seed = {};
          seed[pointerKey(TICKER)] = bad;

          const spy = makeSpyStore({ seed: seed });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 200, bad);
          assert.deepStrictEqual(parsedBody(out), {
            status: 'DEGRADED',
            reason: 'STORE_RECORD_INVALID',
            ticker: TICKER
          }, bad);

          assert.strictEqual(spy.log.length, 1, bad);
          assert.strictEqual(spy.log[0].op, 'get', bad);
          assert.deepStrictEqual(spy.log[0].opts, {
            consistency: 'strong'
          }, bad);
          assert.strictEqual(
            spy.log.some(function (entry) { return entry.op === 'set'; }),
            false,
            bad
          );
        }
      });
    });

    await test('RD15 pointer present, facts record missing -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);

        const spy = makeSpyStore({ seed: seed });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_RECORD_INVALID',
          ticker: TICKER
        });

        assert.strictEqual(spy.log.length, 2);
        assert.deepStrictEqual(
          spy.log.map(function (entry) { return entry.op; }),
          ['get', 'get']
        );
        assert.deepStrictEqual(spy.log[0].opts, {
          consistency: 'strong'
        });
        assert.deepStrictEqual(spy.log[1].opts, {
          consistency: 'strong'
        });
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false
        );
      });
    });

    await test('RD16 malformed facts JSON -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);
        seed[factsKey(CIK)] = 'not-json{{';

        const spy = makeSpyStore({ seed: seed });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_RECORD_INVALID',
          ticker: TICKER
        });

        assert.strictEqual(spy.log.length, 2);
        assert.deepStrictEqual(
          spy.log.map(function (entry) { return entry.op; }),
          ['get', 'get']
        );
        assert.deepStrictEqual(spy.log[0].opts, {
          consistency: 'strong'
        });
        assert.deepStrictEqual(spy.log[1].opts, {
          consistency: 'strong'
        });
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false
        );
      });
    });

    await test('RD17 facts-record field mismatches -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const overridesList = [
          { cik: '9999999999' },
          { ticker: 'AAPL' },
          { contractVersion: 'wrong-version' },
          { sourceTier: 'wrong-tier' },
          { provider: 'wrong-provider' },
          { fetchedAt: 'not-a-date' },
          { fetchedAt: 123 },
          { runId: 'not-a-number' },
          { verificationStatus: 'unverified' },
          { confidence: 0.5 }
        ];

        for (const overrides of overridesList) {
          const record = validRecord(TICKER, CIK, overrides);
          const seed = {};
          seed[pointerKey(TICKER)] = validPointer(CIK);
          seed[factsKey(CIK)] = JSON.stringify(record);

          const spy = makeSpyStore({ seed: seed });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 200, JSON.stringify(overrides));
          assert.deepStrictEqual(parsedBody(out), {
            status: 'DEGRADED',
            reason: 'STORE_RECORD_INVALID',
            ticker: TICKER
          }, JSON.stringify(overrides));

          assert.strictEqual(
            spy.log.length,
            2,
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log.map(function (entry) { return entry.op; }),
            ['get', 'get'],
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log[0].opts,
            { consistency: 'strong' },
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log[1].opts,
            { consistency: 'strong' },
            JSON.stringify(overrides)
          );
          assert.strictEqual(
            spy.log.some(function (entry) { return entry.op === 'set'; }),
            false,
            JSON.stringify(overrides)
          );
        }
      });
    });

    await test('RD18 malformed series/gaps shape -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const badSeries = fullSeries();
        delete badSeries.shares;

        const badFact = fullSeries();
        badFact.revenue = { conceptUsed: 'x', facts: [{ concept: 'x' }] };

        const badGaps = ['ok', 123];

        const overridesList = [
          { series: badSeries },
          { series: badFact },
          { gaps: badGaps },
          { gaps: 'not-an-array' }
        ];

        for (const overrides of overridesList) {
          const record = validRecord(TICKER, CIK, overrides);
          const seed = {};
          seed[pointerKey(TICKER)] = validPointer(CIK);
          seed[factsKey(CIK)] = JSON.stringify(record);

          const spy = makeSpyStore({ seed: seed });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 200, JSON.stringify(overrides));
          assert.deepStrictEqual(parsedBody(out), {
            status: 'DEGRADED',
            reason: 'STORE_RECORD_INVALID',
            ticker: TICKER
          }, JSON.stringify(overrides));

          assert.strictEqual(
            spy.log.length,
            2,
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log.map(function (entry) { return entry.op; }),
            ['get', 'get'],
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log[0].opts,
            { consistency: 'strong' },
            JSON.stringify(overrides)
          );
          assert.deepStrictEqual(
            spy.log[1].opts,
            { consistency: 'strong' },
            JSON.stringify(overrides)
          );
          assert.strictEqual(
            spy.log.some(function (entry) { return entry.op === 'set'; }),
            false,
            JSON.stringify(overrides)
          );
        }
      });
    });

    await test('RD19 derived-metric method/shape violations -> STORE_RECORD_INVALID', async function () {
      await withEnv(readArmedEnv(), async function () {
        const validGrowth = { method: 'yoy_quarterly', valuePct: 10, basis: ['revenue:2026Q1'], computedAt: RUN_ID };
        const validBss = { method: 'balance_sheet_numerics', netCash: 100, debtToEquity: 0.5, basis: ['cash:2026Q1'], computedAt: RUN_ID };

        const overridesList = [
          { derived: fullDerived({ revenueGrowth: Object.assign({}, validGrowth, { method: 'wrong_method' }) }) },
          { derived: fullDerived({ netMargin: Object.assign({}, validGrowth, { method: 'net_margin', extra: 1 }) }) },
          { derived: fullDerived({ freeCashFlow: { method: 'cfo_minus_capex', valueNumeric: 1, basis: [] } }) },
          { derived: fullDerived({ balanceSheetStrength: Object.assign({}, validBss, { method: 'wrong_method' }) }) },
          { derived: fullDerived({ revenueGrowth: 'not-an-object' }) }
        ];

        for (const overrides of overridesList) {
          const record = validRecord(TICKER, CIK, overrides);
          const seed = {};
          seed[pointerKey(TICKER)] = validPointer(CIK);
          seed[factsKey(CIK)] = JSON.stringify(record);

          const spy = makeSpyStore({ seed: seed });
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));

          assert.strictEqual(out.statusCode, 200, JSON.stringify(overrides));
          assert.deepStrictEqual(parsedBody(out), {
            status: 'DEGRADED',
            reason: 'STORE_RECORD_INVALID',
            ticker: TICKER
          }, JSON.stringify(overrides));

          assert.deepStrictEqual(
            spy.log.map(function (entry) { return entry.op; }),
            ['get', 'get'],
            JSON.stringify(overrides)
          );
          assert.strictEqual(
            spy.log.some(function (entry) { return entry.op === 'set'; }),
            false,
            JSON.stringify(overrides)
          );
        }
      });
    });

    await test('RD20 full 14-field OK projection from a real-core-driven fixture', async function () {
      const providerRecord = validRecord(TICKER, CIK, {
        derived: fullDerived({
          revenueGrowth: { method: 'yoy_quarterly', valuePct: 25, basis: ['revenue:2026Q1', 'revenue:2025Q1'], computedAt: RUN_ID }
        })
      });

      const writeStore = makeSpyStore({ seed: {} });
      let actualWrittenKeys;

      await withEnv(writeArmedEnv(), async function () {
        const wr = await writeCore.handler(makeWriteEvent({
          auth: 'Bearer ' + WRITE_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: writeStore,
          providerImpl: async function () { return { cik: CIK, record: providerRecord }; }
        }));
        const wbody = JSON.parse(wr.body);
        assert.strictEqual(wbody.status, 'WRITE');
        actualWrittenKeys = wbody.writtenKeys;
      });

      const readStore = makeSpyStore({ seed: writeStore.data });

      let out;
      await withEnv(readArmedEnv(), async function () {
        out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: readStore
        }));
      });

      assert.strictEqual(out.statusCode, 200);
      const body = parsedBody(out);

      assert.deepStrictEqual(Object.keys(body), [
        'status', 'readContractVersion', 'ticker', 'cik', 'contractVersion',
        'sourceTier', 'provider', 'fetchedAt', 'verificationStatus', 'confidence',
        'series', 'derived', 'gaps', 'freshness'
      ]);

      assert.strictEqual(body.status, 'OK');
      assert.strictEqual(body.readContractVersion, 'fund-facts-read-v1');
      assert.strictEqual(body.ticker, TICKER);
      assert.strictEqual(body.cik, CIK);
      assert.strictEqual(body.contractVersion, CONTRACT_VERSION);
      assert.strictEqual(body.sourceTier, SOURCE_TIER);
      assert.strictEqual(body.provider, PROVIDER_ID);
      assert.strictEqual(body.fetchedAt, NOW_ISO);
      assert.strictEqual(body.verificationStatus, 'verified');
      assert.strictEqual(body.confidence, null);
      assert.deepStrictEqual(body.series, providerRecord.series);
      assert.deepStrictEqual(body.gaps, providerRecord.gaps);

      assert.deepStrictEqual(body.derived.revenueGrowth, { method: 'yoy_quarterly', valuePct: 25, basis: ['revenue:2026Q1', 'revenue:2025Q1'] });
      assert.strictEqual(body.derived.netMargin, null);
      assert.strictEqual(body.derived.freeCashFlow, null);
      assert.strictEqual(body.derived.balanceSheetStrength, null);
      assert.strictEqual(JSON.stringify(body).indexOf('computedAt'), -1, 'computedAt stripped everywhere');

      assert.deepStrictEqual(Object.keys(body.freshness), [
        'state', 'ageDays', 'asOf', 'timestampSource', 'usedFetchedAtFallback', 'reason', 'checkedAt', 'windowTableVersion'
      ]);
      assert.strictEqual(body.freshness.timestampSource, 'fetchedAt');
      assert.strictEqual(body.freshness.usedFetchedAtFallback, true);
      assert.strictEqual(body.freshness.reason, null);
    });

    await test('RD21 unknown extra field on the stored record is never echoed', async function () {
      await withEnv(readArmedEnv(), async function () {
        const record = validRecord(TICKER, CIK, { unexpectedField: 'should-not-appear' });
        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);
        seed[factsKey(CIK)] = JSON.stringify(record);

        const spy = makeSpyStore({ seed: seed });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'DEGRADED',
          reason: 'STORE_RECORD_INVALID',
          ticker: TICKER
        });
      });
    });

    await test('RD22 full OK envelope is byte-exact stringify-equal, key order normative', async function () {
      const providerRecord = validRecord(TICKER, CIK, {});
      const seed = {};
      seed[pointerKey(TICKER)] = validPointer(CIK);
      seed[factsKey(CIK)] = JSON.stringify(providerRecord);

      const spy = makeSpyStore({ seed: seed });

      let out;
      await withEnv(readArmedEnv(), async function () {
        out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));
      });

      assert.strictEqual(out.statusCode, 200);

      const expectedSeries = {
        revenue: {
          conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax',
          facts: [{
            concept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
            unit: 'USD',
            fiscalYear: 2026,
            fiscalPeriod: 'Q1',
            periodStart: '2026-01-01',
            periodEnd: '2026-03-31',
            valueNumeric: 125000000,
            form: '10-Q',
            accessionNumber: '0001800667-26-000042',
            filingUrl: 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/',
            filed: '2026-05-08'
          }]
        },
        netIncome: { conceptUsed: null, facts: [] },
        eps: { conceptUsed: null, facts: [] },
        cfo: { conceptUsed: null, facts: [] },
        capex: { conceptUsed: null, facts: [] },
        cash: { conceptUsed: null, facts: [] },
        debt: { conceptUsed: null, facts: [] },
        equity: { conceptUsed: null, facts: [] },
        shares: { conceptUsed: null, facts: [] }
      };

      const expectedGaps = ['debt: no concept present'];

      const expected = {
        status: 'OK',
        readContractVersion: 'fund-facts-read-v1',
        ticker: TICKER,
        cik: CIK,
        contractVersion: CONTRACT_VERSION,
        sourceTier: SOURCE_TIER,
        provider: PROVIDER_ID,
        fetchedAt: NOW_ISO,
        verificationStatus: 'verified',
        confidence: null,
        series: expectedSeries,
        derived: { revenueGrowth: null, netMargin: null, freeCashFlow: null, balanceSheetStrength: null },
        gaps: expectedGaps,
        freshness: {
          state: 'fresh',
          ageDays: 0,
          asOf: NOW_ISO,
          timestampSource: 'fetchedAt',
          usedFetchedAtFallback: true,
          reason: null,
          checkedAt: NOW_MS,
          windowTableVersion: 'eg25c1-spec-v1'
        }
      };

      assert.strictEqual(out.body, JSON.stringify(expected));

      assert.strictEqual(spy.log.length, 2);
      assert.deepStrictEqual(
        spy.log.map(function (entry) { return entry.op; }),
        ['get', 'get']
      );
      assert.deepStrictEqual(spy.log[0].opts, {
        consistency: 'strong'
      });
      assert.deepStrictEqual(spy.log[1].opts, {
        consistency: 'strong'
      });
      assert.strictEqual(
        spy.log.some(function (entry) { return entry.op === 'set'; }),
        false
      );
    });

    await test('RD23a freshness boundary: fresh (60d) to aging (61d)', async function () {
      const DAY_MS = 86400000;
      const cases = [
        { deltaMs: 60 * DAY_MS + (DAY_MS - 1), expectedState: 'fresh', expectedAgeDays: 60 },
        { deltaMs: 61 * DAY_MS, expectedState: 'aging', expectedAgeDays: 61 }
      ];

      for (const c of cases) {
        const expectedFetchedAt = new Date(NOW_MS - c.deltaMs).toISOString();
        const record = validRecord(TICKER, CIK, { fetchedAt: expectedFetchedAt });
        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);
        seed[factsKey(CIK)] = JSON.stringify(record);

        const spy = makeSpyStore({ seed: seed });

        let out;
        await withEnv(readArmedEnv(), async function () {
          out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));
        });

        assert.strictEqual(out.statusCode, 200, JSON.stringify(c));

        const expectedSeries = {
          revenue: {
            conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax',
            facts: [{
              concept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
              unit: 'USD',
              fiscalYear: 2026,
              fiscalPeriod: 'Q1',
              periodStart: '2026-01-01',
              periodEnd: '2026-03-31',
              valueNumeric: 125000000,
              form: '10-Q',
              accessionNumber: '0001800667-26-000042',
              filingUrl: 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/',
              filed: '2026-05-08'
            }]
          },
          netIncome: { conceptUsed: null, facts: [] },
          eps: { conceptUsed: null, facts: [] },
          cfo: { conceptUsed: null, facts: [] },
          capex: { conceptUsed: null, facts: [] },
          cash: { conceptUsed: null, facts: [] },
          debt: { conceptUsed: null, facts: [] },
          equity: { conceptUsed: null, facts: [] },
          shares: { conceptUsed: null, facts: [] }
        };

        const expectedGaps = ['debt: no concept present'];

        const expected = {
          status: 'OK',
          readContractVersion: 'fund-facts-read-v1',
          ticker: TICKER,
          cik: CIK,
          contractVersion: CONTRACT_VERSION,
          sourceTier: SOURCE_TIER,
          provider: PROVIDER_ID,
          fetchedAt: expectedFetchedAt,
          verificationStatus: 'verified',
          confidence: null,
          series: expectedSeries,
          derived: { revenueGrowth: null, netMargin: null, freeCashFlow: null, balanceSheetStrength: null },
          gaps: expectedGaps,
          freshness: {
            state: c.expectedState,
            ageDays: c.expectedAgeDays,
            asOf: expectedFetchedAt,
            timestampSource: 'fetchedAt',
            usedFetchedAtFallback: true,
            reason: null,
            checkedAt: NOW_MS,
            windowTableVersion: 'eg25c1-spec-v1'
          }
        };

        assert.strictEqual(
          out.body,
          JSON.stringify(expected),
          JSON.stringify(c)
        );

        assert.strictEqual(spy.log.length, 2, JSON.stringify(c));
        assert.deepStrictEqual(
          spy.log.map(function (entry) { return entry.op; }),
          ['get', 'get'],
          JSON.stringify(c)
        );
        assert.deepStrictEqual(
          spy.log[0].opts,
          { consistency: 'strong' },
          JSON.stringify(c)
        );
        assert.deepStrictEqual(
          spy.log[1].opts,
          { consistency: 'strong' },
          JSON.stringify(c)
        );
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false,
          JSON.stringify(c)
        );
      }
    });

    await test('RD23b freshness boundary: aging (121d) to stale (122d)', async function () {
      const DAY_MS = 86400000;
      const cases = [
        { deltaMs: 121 * DAY_MS + (DAY_MS - 1), expectedState: 'aging', expectedAgeDays: 121 },
        { deltaMs: 122 * DAY_MS, expectedState: 'stale', expectedAgeDays: 122 }
      ];

      for (const c of cases) {
        const expectedFetchedAt = new Date(NOW_MS - c.deltaMs).toISOString();
        const record = validRecord(TICKER, CIK, { fetchedAt: expectedFetchedAt });
        const seed = {};
        seed[pointerKey(TICKER)] = validPointer(CIK);
        seed[factsKey(CIK)] = JSON.stringify(record);

        const spy = makeSpyStore({ seed: seed });

        let out;
        await withEnv(readArmedEnv(), async function () {
          out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: TICKER }),
            store: spy
          }));
        });

        assert.strictEqual(out.statusCode, 200, JSON.stringify(c));

        const expectedSeries = {
          revenue: {
            conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax',
            facts: [{
              concept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
              unit: 'USD',
              fiscalYear: 2026,
              fiscalPeriod: 'Q1',
              periodStart: '2026-01-01',
              periodEnd: '2026-03-31',
              valueNumeric: 125000000,
              form: '10-Q',
              accessionNumber: '0001800667-26-000042',
              filingUrl: 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/',
              filed: '2026-05-08'
            }]
          },
          netIncome: { conceptUsed: null, facts: [] },
          eps: { conceptUsed: null, facts: [] },
          cfo: { conceptUsed: null, facts: [] },
          capex: { conceptUsed: null, facts: [] },
          cash: { conceptUsed: null, facts: [] },
          debt: { conceptUsed: null, facts: [] },
          equity: { conceptUsed: null, facts: [] },
          shares: { conceptUsed: null, facts: [] }
        };

        const expectedGaps = ['debt: no concept present'];

        const expected = {
          status: 'OK',
          readContractVersion: 'fund-facts-read-v1',
          ticker: TICKER,
          cik: CIK,
          contractVersion: CONTRACT_VERSION,
          sourceTier: SOURCE_TIER,
          provider: PROVIDER_ID,
          fetchedAt: expectedFetchedAt,
          verificationStatus: 'verified',
          confidence: null,
          series: expectedSeries,
          derived: { revenueGrowth: null, netMargin: null, freeCashFlow: null, balanceSheetStrength: null },
          gaps: expectedGaps,
          freshness: {
            state: c.expectedState,
            ageDays: c.expectedAgeDays,
            asOf: expectedFetchedAt,
            timestampSource: 'fetchedAt',
            usedFetchedAtFallback: true,
            reason: null,
            checkedAt: NOW_MS,
            windowTableVersion: 'eg25c1-spec-v1'
          }
        };

        assert.strictEqual(
          out.body,
          JSON.stringify(expected),
          JSON.stringify(c)
        );

        assert.strictEqual(spy.log.length, 2, JSON.stringify(c));
        assert.deepStrictEqual(
          spy.log.map(function (entry) { return entry.op; }),
          ['get', 'get'],
          JSON.stringify(c)
        );
        assert.deepStrictEqual(
          spy.log[0].opts,
          { consistency: 'strong' },
          JSON.stringify(c)
        );
        assert.deepStrictEqual(
          spy.log[1].opts,
          { consistency: 'strong' },
          JSON.stringify(c)
        );
        assert.strictEqual(
          spy.log.some(function (entry) { return entry.op === 'set'; }),
          false,
          JSON.stringify(c)
        );
      }
    });

    await test('RD24 fetchedAt loose-but-not-strict-ISO: OK response, freshness degrades gracefully to CONTRACT_INVALID', async function () {
      const looseFetchedAt = '2026-07-24T00:00:00';
      const record = validRecord(TICKER, CIK, { fetchedAt: looseFetchedAt });
      const seed = {};
      seed[pointerKey(TICKER)] = validPointer(CIK);
      seed[factsKey(CIK)] = JSON.stringify(record);

      const spy = makeSpyStore({ seed: seed });

      let out;
      await withEnv(readArmedEnv(), async function () {
        out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));
      });

      assert.strictEqual(out.statusCode, 200);

      const expectedSeries = {
        revenue: {
          conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax',
          facts: [{
            concept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
            unit: 'USD',
            fiscalYear: 2026,
            fiscalPeriod: 'Q1',
            periodStart: '2026-01-01',
            periodEnd: '2026-03-31',
            valueNumeric: 125000000,
            form: '10-Q',
            accessionNumber: '0001800667-26-000042',
            filingUrl: 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/',
            filed: '2026-05-08'
          }]
        },
        netIncome: { conceptUsed: null, facts: [] },
        eps: { conceptUsed: null, facts: [] },
        cfo: { conceptUsed: null, facts: [] },
        capex: { conceptUsed: null, facts: [] },
        cash: { conceptUsed: null, facts: [] },
        debt: { conceptUsed: null, facts: [] },
        equity: { conceptUsed: null, facts: [] },
        shares: { conceptUsed: null, facts: [] }
      };

      const expectedGaps = ['debt: no concept present'];

      const expected = {
        status: 'OK',
        readContractVersion: 'fund-facts-read-v1',
        ticker: TICKER,
        cik: CIK,
        contractVersion: CONTRACT_VERSION,
        sourceTier: SOURCE_TIER,
        provider: PROVIDER_ID,
        fetchedAt: looseFetchedAt,
        verificationStatus: 'verified',
        confidence: null,
        series: expectedSeries,
        derived: { revenueGrowth: null, netMargin: null, freeCashFlow: null, balanceSheetStrength: null },
        gaps: expectedGaps,
        freshness: {
          state: 'degraded',
          ageDays: null,
          asOf: null,
          timestampSource: null,
          usedFetchedAtFallback: false,
          reason: 'CONTRACT_INVALID',
          checkedAt: NOW_MS,
          windowTableVersion: 'eg25c1-spec-v1'
        }
      };

      assert.strictEqual(out.body, JSON.stringify(expected));

      assert.strictEqual(spy.log.length, 2);
      assert.deepStrictEqual(
        spy.log.map(function (entry) { return entry.op; }),
        ['get', 'get']
      );
      assert.deepStrictEqual(spy.log[0].opts, {
        consistency: 'strong'
      });
      assert.deepStrictEqual(spy.log[1].opts, {
        consistency: 'strong'
      });
      assert.strictEqual(
        spy.log.some(function (entry) { return entry.op === 'set'; }),
        false
      );
    });

    await test('RD-A1 COLLISION_KEYS is exactly the frozen 4-element array', async function () {
      assert.deepStrictEqual(readPreflight.COLLISION_KEYS, [
        'PT_FUND_FACTS_TOKEN',
        'PT_SEC_EVIDENCE_PULL_TOKEN',
        'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
        'PT_OWNER_TOKEN'
      ]);
    });

    await test('RD-A2 PT_FUND_FACTS_TOKEN never appears in the read core or route source', async function () {
      const fs = require('fs');
      const coreSrc = fs.readFileSync(READ_CORE_PATH, 'utf8');
      const routeSrc = fs.readFileSync(path.resolve(__dirname, '..', 'netlify', 'functions', 'fund-facts-read.mjs'), 'utf8');

      assert.strictEqual(coreSrc.indexOf('PT_FUND_FACTS_TOKEN'), -1, 'read core');
      assert.strictEqual(routeSrc.indexOf('PT_FUND_FACTS_TOKEN'), -1, 'route');
    });

    await test('RD-A3 write token value is never accepted as a read credential', async function () {
      const env = readArmedEnv();
      env.PT_FUND_FACTS_TOKEN = WRITE_TOKEN;

      await withEnv(env, async function () {
        const spy = makeSpyStore({ seed: {} });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + WRITE_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));

        assert.strictEqual(out.statusCode, 401);
        assert.deepStrictEqual(parsedBody(out), {
          status: 'UNAUTHORIZED',
          reason: 'UNAUTHORIZED'
        });
        assert.strictEqual(spy.log.length, 0);
      });
    });

    await test('RD-LOCKSTEP read core requests exactly the real write core\'s actual store writes, reversed order, for two independent tickers', async function () {
      const cases = [
        { ticker: TICKER, cik: CIK },
        { ticker: TICKER_2, cik: CIK_2 }
      ];

      for (const c of cases) {
        const providerRecord = validRecord(c.ticker, c.cik, {});
        const writeStore = makeSpyStore({ seed: {} });
        let actualWrittenKeys;

        await withEnv(writeArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL' }), async function () {
          const wr = await writeCore.handler(makeWriteEvent({
            auth: 'Bearer ' + WRITE_TOKEN,
            body: JSON.stringify({ ticker: c.ticker }),
            store: writeStore,
            providerImpl: async function () { return { cik: c.cik, record: providerRecord }; }
          }));

          assert.strictEqual(wr.statusCode, 200, c.ticker);

          const wbody = JSON.parse(wr.body);
          assert.strictEqual(wbody.status, 'WRITE', c.ticker);

          const writeSetEntries = writeStore.log.filter(function (entry) {
            return entry.op === 'set';
          });
          assert.strictEqual(writeSetEntries.length, 2, c.ticker);

          actualWrittenKeys = writeSetEntries.map(function (entry) {
            return entry.key;
          });

          assert.deepStrictEqual(
            wbody.writtenKeys,
            actualWrittenKeys,
            'write response must report the keys actually written, ' + c.ticker
          );
        });

        const readStore = makeSpyStore({ seed: writeStore.data });

        await withEnv(readArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL' }), async function () {
          const out = await readCore.handler(makeReadEvent({
            auth: 'Bearer ' + READ_TOKEN,
            body: JSON.stringify({ ticker: c.ticker }),
            store: readStore
          }));

          assert.strictEqual(out.statusCode, 200, c.ticker);
          assert.strictEqual(JSON.parse(out.body).status, 'OK', c.ticker);
        });

        assert.strictEqual(readStore.log.length, 2, c.ticker);
        assert.deepStrictEqual(
          readStore.log.map(function (entry) { return entry.op; }),
          ['get', 'get'],
          c.ticker
        );
        assert.deepStrictEqual(
          readStore.log[0].opts,
          { consistency: 'strong' },
          c.ticker
        );
        assert.deepStrictEqual(
          readStore.log[1].opts,
          { consistency: 'strong' },
          c.ticker
        );
        assert.strictEqual(
          readStore.log.some(function (entry) { return entry.op === 'set'; }),
          false,
          c.ticker
        );

        const readGetKeys = readStore.log.map(function (entry) {
          return entry.key;
        });

        assert.deepStrictEqual(
          readGetKeys,
          [actualWrittenKeys[1], actualWrittenKeys[0]],
          'exact reversed read order vs actual real-core store writes, ' + c.ticker
        );
      }
    });

    await test('RD-LOCKSTEP-SHORTCIRCUIT pointer absent: only the genuine pointer key is read, genuine facts key never requested', async function () {
      const providerRecord = validRecord(TICKER, CIK, {});
      const writeStore = makeSpyStore({ seed: {} });
      let actualWrittenKeys;

      await withEnv(writeArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL' }), async function () {
        const wr = await writeCore.handler(makeWriteEvent({
          auth: 'Bearer ' + WRITE_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: writeStore,
          providerImpl: async function () { return { cik: CIK, record: providerRecord }; }
        }));

        assert.strictEqual(wr.statusCode, 200);
        const wbody = JSON.parse(wr.body);
        assert.strictEqual(wbody.status, 'WRITE');

        const writeSetEntries = writeStore.log.filter(function (entry) {
          return entry.op === 'set';
        });
        assert.strictEqual(writeSetEntries.length, 2);

        actualWrittenKeys = writeSetEntries.map(function (entry) {
          return entry.key;
        });
        assert.deepStrictEqual(wbody.writtenKeys, actualWrittenKeys);
      });

      const genuineFactsKey = actualWrittenKeys[0];
      const genuinePointerKey = actualWrittenKeys[1];

      const emptyReadStore = makeSpyStore({ seed: {} });

      await withEnv(readArmedEnv({ PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL' }), async function () {
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: emptyReadStore
        }));

        assert.strictEqual(out.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(out.body), {
          status: 'NOT_AVAILABLE',
          reason: 'NO_RECORD',
          ticker: TICKER
        });
      });

      assert.strictEqual(emptyReadStore.log.length, 1);
      assert.strictEqual(emptyReadStore.log[0].op, 'get');
      assert.strictEqual(emptyReadStore.log[0].key, genuinePointerKey);
      assert.deepStrictEqual(emptyReadStore.log[0].opts, { consistency: 'strong' });
      assert.strictEqual(
        emptyReadStore.log.some(function (entry) { return entry.key === genuineFactsKey; }),
        false,
        'genuine facts key never requested'
      );
    });

    await test('RD35 DISABLED is byte-exact stringify-equal, key order normative', async function () {
      await withEnv({}, async function () {
        const out = await readCore.handler(makeReadEvent({ method: 'GET' }));
        assert.strictEqual(out.statusCode, 200);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'DISABLED',
          reason: 'SERVER_DISABLED'
        }));
      });
    });

    await test('RD36 METHOD_NOT_ALLOWED is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const out = await readCore.handler(makeReadEvent({
          method: 'GET',
          auth: 'Bearer ' + READ_TOKEN
        }));
        assert.strictEqual(out.statusCode, 405);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'METHOD_NOT_ALLOWED',
          reason: 'METHOD_NOT_ALLOWED'
        }));
      });
    });

    await test('RD37 UNAUTHORIZED is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const out = await readCore.handler(makeReadEvent({
          body: JSON.stringify({ ticker: TICKER })
        }));
        assert.strictEqual(out.statusCode, 401);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'UNAUTHORIZED',
          reason: 'UNAUTHORIZED'
        }));
      });
    });

    await test('RD38 CONFIGURATION_MISSING is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv({ PT_FUND_FACTS_TOKEN: READ_TOKEN }), async function () {
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER })
        }));
        assert.strictEqual(out.statusCode, 500);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'CONFIGURATION_MISSING',
          reason: 'TOKEN_COLLISION'
        }));
      });
    });

    await test('RD39 INVALID_JSON is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: 'not-json{{'
        }));
        assert.strictEqual(out.statusCode, 400);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'INVALID_JSON',
          reason: 'INVALID_JSON'
        }));
      });
    });

    await test('RD40 INVALID_TICKER is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: 'frog' })
        }));
        assert.strictEqual(out.statusCode, 400);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'INVALID_TICKER',
          reason: 'TICKER_INVALID'
        }));
      });
    });

    await test('RD41 NOT_AVAILABLE is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const spy = makeSpyStore({ seed: {} });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));
        assert.strictEqual(out.statusCode, 200);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'NOT_AVAILABLE',
          reason: 'NO_RECORD',
          ticker: TICKER
        }));
      });
    });

    await test('RD42 DEGRADED is byte-exact stringify-equal, key order normative', async function () {
      await withEnv(readArmedEnv(), async function () {
        const seed = {};
        seed[pointerKey(TICKER)] = 'not-json{{';
        const spy = makeSpyStore({ seed: seed });
        const out = await readCore.handler(makeReadEvent({
          auth: 'Bearer ' + READ_TOKEN,
          body: JSON.stringify({ ticker: TICKER }),
          store: spy
        }));
        assert.strictEqual(out.statusCode, 200);
        assert.strictEqual(out.body, JSON.stringify({
          status: 'DEGRADED',
          reason: 'STORE_RECORD_INVALID',
          ticker: TICKER
        }));
      });
    });

    // __RD_TESTS__
  } finally {
    global.fetch = originalFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 1;
});
