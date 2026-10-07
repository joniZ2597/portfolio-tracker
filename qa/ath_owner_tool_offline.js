'use strict';

/*
 * qa/ath_owner_tool_offline.js
 *
 * R-1 Slice B (B3) — owner-run ATH verification CLI (AR-6).
 *
 * Exercises tools/ath-verify-owner.js through its exported main(argv, io) seam with:
 *   - an INJECTED fetch spy (io.fetchImpl) — a throwing globalThis.fetch guard proves the real
 *     network is never reached;
 *   - a scripted prompt queue (io.ask) standing in for the operator;
 *   - snapshot fixtures in a mkdtemp directory outside the repository; the write token is an
 *     injected environment (io.env) whose reads are counted.
 *
 * Fixtures are modelled on the POC: NICE.TA / ESLT.TA (corrupt bars inside TradingView's
 * history) and TEVA.TA (corrupt bar before it). No live Yahoo, no Netlify, no Blob store.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOOL_PATH = path.join(ROOT, 'tools', 'ath-verify-owner.js');
const tool = require(TOOL_PATH);

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

const NOW_MS = Date.parse('2026-10-07T10:00:00.000Z');
const DEFAULT_BASE = 'https://branch-dev--portfoliotrk.netlify.app';
const WRITE_ROUTE = '/.netlify/functions/ath-write';

let tmpDir = null;
function fixture(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

function snapshotOf(entries) { return JSON.stringify({ schemaVersion: 1, tickers: entries }); }
function snap(ticker, tv, currency, unit) { return { ticker: ticker, tradingViewSymbol: tv, currency: currency, unit: unit }; }
const SNAP_AAPL = snap('AAPL', 'NASDAQ:AAPL', 'USD', 'USD');
const SNAP_TEVA = snap('TEVA.TA', 'TASE:TEVA', 'ILS', 'ILA');
const SNAP_NICE = snap('NICE.TA', 'TASE:NICE', 'ILS', 'ILA');
const SNAP_ESLT = snap('ESLT.TA', 'TASE:ESLT', 'ILS', 'ILA');

// ── io harness ────────────────────────────────────────────────────────────────
function makeSink() {
  const chunks = [];
  return { write: function (s) { chunks.push(String(s)); }, text: function () { return chunks.join(''); } };
}

function makeAsk(answers) {
  const queue = answers.slice();
  const asked = [];
  const fn = async function (question) {
    asked.push(question);
    if (queue.length === 0) { throw new Error('ASK_EXHAUSTED at: ' + question); }
    return queue.shift();
  };
  fn.asked = asked;
  fn.left = function () { return queue.length; };
  return fn;
}

function throwingFetch() { throw new Error('INJECTED_FETCH_MUST_NOT_RUN'); }

// The write token comes from the environment only, and only in WRITE / TEARDOWN mode. This env
// counts how often the token is read, so "never read" is a measured fact and not an assumption.
const TOKEN_VALUE = 'tok-ath-write-qa';
function makeSpyEnv(value) {
  const spy = { reads: 0 };
  Object.defineProperty(spy, 'PT_ATH_WRITE_TOKEN', { enumerable: true, get: function () { spy.reads += 1; return value; } });
  return spy;
}

function makeFetchSpy(handler) {
  const spy = { calls: [] };
  spy.fn = async function (url, options) {
    spy.calls.push({ url: url, options: options });
    return handler(url, options, spy.calls.length);
  };
  return spy;
}

function yahooResponse(currency, rows) {
  const body = {
    chart: {
      result: [{
        meta: { currency: currency, symbol: 'X' },
        timestamp: rows.map(function (r) { return Math.floor(Date.parse(r[0] + 'T12:00:00Z') / 1000); }),
        indicators: { quote: [{ high: rows.map(function (r) { return r[1]; }) }] }
      }]
    }
  };
  return { status: 200, json: async function () { return body; } };
}

function jsonResponse(status, body) { return { status: status, json: async function () { return body; } }; }

async function run(argv, o) {
  o = o || {};
  const stdout = makeSink();
  const stderr = makeSink();
  const r = await tool.main(argv, {
    fetchImpl: o.fetchImpl || throwingFetch,
    env: o.env || {},
    ask: o.ask || makeAsk([]),
    stdout: stdout,
    stderr: stderr,
    nowMs: NOW_MS
  });
  return { exitCode: r.exitCode, result: r.result, stdout: stdout.text(), stderr: stderr.text() };
}

// Yahoo fixtures (rows are [isoDate, high])
const AAPL_ROWS = [['2026-09-20', 340], ['2026-09-22', 345.34], ['2026-10-01', 330]];
// Every series ends within the writer's recency window of the injected clock (2026-10-07).
const NICE_ROWS = [['2007-07-30', 2290075.5], ['2007-07-31', 6620085.5], ['2015-05-04', 60000], ['2021-11-11', 99480], ['2026-10-01', 40000]];
const TEVA_ROWS = [['2003-08-06', 121500], ['2015-07-27', 27590], ['2026-10-01', 12000]];

const ARGS_BASE = ['--allowed', 'AAPL,TEVA.TA,NICE.TA,ESLT.TA'];

// ── tests ─────────────────────────────────────────────────────────────────────
async function main() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ath-owner-tool-'));
  const realFetch = globalThis.fetch;
  let realFetchCalls = 0;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('REAL_FETCH_FORBIDDEN'); };
  try {
    const snapAll = fixture('snap-all.json', snapshotOf([SNAP_TEVA, SNAP_AAPL, SNAP_NICE]));
    const snapAapl = fixture('snap-aapl.json', snapshotOf([SNAP_AAPL]));
    const snapTeva = fixture('snap-teva.json', snapshotOf([SNAP_TEVA]));
    const snapNice = fixture('snap-nice.json', snapshotOf([SNAP_NICE]));

    await test('AR-6a default mode is a PLAN: zero network, token never read, sorted allowlist value printed', async function () {
      const planEnv = makeSpyEnv(TOKEN_VALUE);
      const r = await run(['--snapshot', snapAll], { env: planEnv });
      ok(planEnv.reads === 0, 'PLAN never reads the token');
      ok(r.exitCode === 0 && r.result.ok === true && r.result.stage === 'PLAN', 'PLAN');
      ok(JSON.stringify(r.result.tickers) === JSON.stringify(['AAPL', 'NICE.TA', 'TEVA.TA']), 'sorted tickers');
      ok(r.result.allowedValue === 'AAPL,NICE.TA,TEVA.TA', 'allowlist value to arm');
      ok(r.result.base === DEFAULT_BASE, 'default base');
      ok(r.stdout.indexOf('AAPL,NICE.TA,TEVA.TA') !== -1, 'plan printed');
    });

    await test('AR-6b dry-run (--verify without --write) fetches Yahoo daily history and writes nothing', async function () {
      const spy = makeFetchSpy(function () { return yahooResponse('USD', AAPL_ROWS); });
      const ask = makeAsk(['345.3', '', '1980-12-01', 'off', '']);
      const dryEnv = makeSpyEnv(TOKEN_VALUE);
      const r = await run(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: ask, env: dryEnv });
      ok(dryEnv.reads === 0, 'a dry-run never reads the write token');
      ok(r.exitCode === 0 && r.result.stage === 'DONE' && r.result.mode === 'verify', 'DONE verify');
      ok(spy.calls.length === 1, 'exactly one fetch: ' + spy.calls.length);
      const u = spy.calls[0].url;
      ok(u.indexOf('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?') === 0, 'yahoo chart url');
      ok(u.indexOf('interval=1d') !== -1 && u.indexOf('period1=0') !== -1 && u.indexOf('period2=' + Math.floor(NOW_MS / 1000)) !== -1, 'daily bars from the beginning to now');
      ok(u.indexOf('range=max') === -1, 'never range=max (it returns coarse bars)');
      ok(!spy.calls.some(function (c) { return /netlify/.test(c.url); }), 'no write call');
      const e = r.result.results[0];
      ok(e.ticker === 'AAPL' && e.status === 'verified' && e.written === false, 'verified, not written');
      ok(r.stdout.indexOf('MATCH') !== -1 && r.stdout.indexOf('345.34') !== -1, 'match printed');
      ok(ask.left() === 0, 'every scripted answer consumed');
      const fields = ['tradingViewHigh', 'tradingViewUnit', 'tradingViewFirstBarDate', 'tradingViewAdjSetting', 'searchValue'];
      ok(fields.every(function (f, i) { return ask.asked[i].indexOf(f) === 0; }), 'prompt order');
    });

    await test('AR-6c NICE.TA: corrupt bars inside TradingView history are listed as covered; verified; nothing dropped', async function () {
      const spy = makeFetchSpy(function () { return yahooResponse('ILA', NICE_ROWS); });
      const ask = makeAsk(['99480', 'ILA', '2007-07-01', 'off', '']);
      const r = await run(['--snapshot', snapNice, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: ask });
      ok(r.result.results[0].status === 'verified', 'verified');
      ok(/HIGHER 2007-07-30 2290075.5 covered/.test(r.stdout) && /HIGHER 2007-07-31 6620085.5 covered/.test(r.stdout), 'both higher bars listed');
      ok(r.stdout.indexOf('independent') === -1 && ask.asked.every(function (q) { return q.indexOf('independent') !== 0; }), 'no independent prompt needed');
    });

    await test('AR-6d TEVA.TA: an uncovered bar asks for independent evidence; skipping leaves it unresolved, a valid ath-claim verifies', async function () {
      const spy1 = makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); });
      const skip = makeAsk(['27590', 'ILA', '2007-07-01', 'off', 'skip', '']);
      const r1 = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: spy1.fn, ask: skip });
      ok(r1.result.results[0].status === 'unresolved' && r1.result.results[0].reason === 'UNCOVERED_HIGHER_BAR_UNRESOLVED', 'unresolved without independent evidence');
      ok(/HIGHER 2003-08-06 121500 uncovered/.test(r1.stdout), 'the spike is listed as uncovered');
      ok(skip.asked.some(function (q) { return q.indexOf('independentKind') === 0; }), 'independent kind was asked');
      const spy2 = makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); });
      const claim = makeAsk(['27590', 'ILA', '2007-07-01', 'off', 'ath-claim', 'Example Statistics Bureau', 'https://example.org/ath/teva', '', '27590', '2015-07-27', '2002-08-12', '']);
      const r2 = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: spy2.fn, ask: claim });
      ok(r2.result.results[0].status === 'verified', 'verified with an independent ath-claim');
      ok(claim.left() === 0, 'every answer consumed');
      const rejected = makeAsk(['27590', 'ILA', '2007-07-01', 'off', 'ath-claim', 'Yahoo', 'https://finance.yahoo.com/quote/TEVA.TA', '', '27590', '2015-07-27', '2002-08-12', '']);
      const r3 = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); }).fn, ask: rejected });
      ok(r3.result.results[0].status === 'invalid' && r3.result.results[0].reason === 'INDEPENDENT_SOURCE_FORBIDDEN', 'a Yahoo-hosted independent source is refused');
    });

    await test('AR-6e a TradingView High matching no Yahoo bar within 0.5% is NO_CLEAN_MATCH (unresolved), with the top bars listed', async function () {
      const spy = makeFetchSpy(function () { return yahooResponse('USD', AAPL_ROWS); });
      const r = await run(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['360', 'USD', '1980-12-01', 'off', '']) });
      ok(r.result.results[0].status === 'unresolved' && r.result.results[0].reason === 'NO_CLEAN_MATCH', 'no clean match');
      ok(/TOP 2026-09-22 345.34/.test(r.stdout), 'top Yahoo bars listed for the operator');
    });

    await test('AR-6f agorot handling: a shekel High is converted to agorot; incompatible or mismatched units stop', async function () {
      const spy = makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); });
      const shek = makeAsk(['275.90', 'ILS', '2007-07-01', 'off', 'skip', '']);
      const r = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: shek });
      ok(r.result.results[0].matchedHigh === 27590 || /MATCH 2015-07-27 27590/.test(r.stdout), 'ILS 275.90 matched the agorot bar 27590');
      const usd = makeAsk(['275.90', 'USD', '2007-07-01', 'off']);
      const r2 = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); }).fn, ask: usd });
      ok(r2.exitCode === 2 && r2.result.reason === 'UNIT_INCOMPATIBLE', 'USD against agorot stops');
      const mism = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('USD', TEVA_ROWS); }).fn, ask: makeAsk([]) });
      ok(mism.exitCode === 2 && mism.result.reason === 'UNIT_MISMATCH', 'Yahoo currency differs from the snapshot unit');
    });

    await test('AR-6g allowlist: the snapshot is refused with zero requests if any symbol is outside --allowed', async function () {
      const r = await run(['--snapshot', snapAll, '--verify', '--allowed', 'AAPL,NICE.TA']);
      ok(r.exitCode === 1 && r.result.stage === 'CONFIG' && r.result.reason === 'SYMBOL_NOT_IN_ALLOWLIST', 'refused');
      const miss = await run(['--snapshot', snapAll, '--verify']);
      ok(miss.exitCode === 1 && miss.result.reason === 'ALLOWED_FLAG_MISSING', 'allowed flag required for --verify');
      const bad = await run(['--snapshot', snapAll, '--verify', '--allowed', 'AAPL,TCH-F34.TA']);
      ok(bad.exitCode === 1 && bad.result.reason === 'ALLOWED_INVALID', 'allowed value validated by the shared parser');
      const plan = await run(['--snapshot', snapAll, '--allowed', 'AAPL']);
      ok(plan.exitCode === 1 && plan.result.reason === 'SYMBOL_NOT_IN_ALLOWLIST', 'plan mode checks --allowed when given');
    });

    await test('AR-6h snapshot validation (fail closed, zero requests)', async function () {
      const cases = [
        [path.join(tmpDir, 'nope.json'), 'SNAPSHOT_FILE_NOT_FOUND'],
        [fixture('bad-json.json', '{not json'), 'SNAPSHOT_JSON_INVALID'],
        [fixture('dup.json', snapshotOf([SNAP_AAPL, SNAP_AAPL])), 'SNAPSHOT_DUPLICATE_TICKER'],
        [fixture('bad-ticker.json', snapshotOf([snap('tch-f34', 'TASE:TCH.F34', 'ILS', 'ILA')])), 'SNAPSHOT_TICKER_INVALID'],
        [fixture('bad-unit.json', snapshotOf([snap('AAPL', 'NASDAQ:AAPL', 'USD', 'ILA')])), 'SNAPSHOT_UNIT_INVALID'],
        [fixture('bad-tv.json', snapshotOf([snap('AAPL', 'nasdaq aapl', 'USD', 'USD')])), 'SNAPSHOT_TV_SYMBOL_INVALID'],
        [fixture('extra-key.json', snapshotOf([Object.assign({ note: 'x' }, SNAP_AAPL)])), 'SNAPSHOT_SHAPE_INVALID'],
        [fixture('empty.json', snapshotOf([])), 'SNAPSHOT_SHAPE_INVALID'],
        [fixture('wrong-version.json', JSON.stringify({ schemaVersion: 2, tickers: [SNAP_AAPL] })), 'SNAPSHOT_SHAPE_INVALID']
      ];
      for (const c of cases) {
        const r = await run(['--snapshot', c[0]]);
        ok(r.exitCode === 1 && r.result.stage === 'INPUT' && r.result.reason === c[1], c[1] + ' got ' + JSON.stringify(r.result));
      }
    });

    await test('AR-6i flag parsing is strict', async function () {
      const cases = [
        [[], 'SNAPSHOT_FLAG_MISSING'],
        [['--snapshot'], 'FLAG_VALUE_MISSING'],
        [['--snapshot', snapAapl, '--bogus'], 'UNKNOWN_FLAG'],
        [['--snapshot', snapAapl, '--write'], 'WRITE_REQUIRES_VERIFY'],
        [['--snapshot', snapAapl, '--verify', '--write'].concat(ARGS_BASE), 'TOKEN_ENV_MISSING'],
        [['--snapshot', snapAapl, '--teardown'].concat(ARGS_BASE), 'TOKEN_ENV_MISSING'],
        [['--snapshot', snapAapl, '--teardown', '--verify'].concat(ARGS_BASE), 'MODE_CONFLICT'],
        [['--snapshot', snapAapl, '--verify', '--write', '--token-file', 'token.txt'].concat(ARGS_BASE), 'UNKNOWN_FLAG'],
        [['--snapshot', snapAapl, '--verify', '--base', 'http://example.org'].concat(ARGS_BASE), 'BASE_URL_INVALID'],
        [['--snapshot', snapAapl, '--verify', '--base', 'https://portfoliotrk.netlify.app'].concat(ARGS_BASE), 'PROD_TARGET_FORBIDDEN'],
        [['--snapshot', snapAapl, '--verify', '--base', 'https://portfoliotrk.netlify.app.'].concat(ARGS_BASE), 'PROD_TARGET_FORBIDDEN'],
        [['--snapshot', snapAapl, '--verify', '--base', 'https://attacker.example'].concat(ARGS_BASE), 'BASE_HOST_NOT_APPROVED']
      ];
      for (const c of cases) {
        const r = await run(c[0]);
        ok(r.exitCode === 1 && r.result.reason === c[1], c[1] + ' got ' + JSON.stringify(r.result));
      }
      // An empty token in the environment is the same as a missing one, and nothing is fetched.
      const empty = await run(['--snapshot', snapAapl, '--verify', '--write'].concat(ARGS_BASE), { env: { PT_ATH_WRITE_TOKEN: '' } });
      ok(empty.exitCode === 1 && empty.result.reason === 'TOKEN_ENV_MISSING', 'empty token');
    });

    await test('AR-6j --write posts the recomputable attempt with the Bearer token read from the environment; token never printed', async function () {
      const spy = makeFetchSpy(function (url) {
        if (url.indexOf('query1.finance.yahoo.com') !== -1) { return yahooResponse('USD', AAPL_ROWS); }
        return jsonResponse(200, { status: 'WRITE', ticker: 'AAPL', recordStatus: 'verified', key: 'ath:v1:AAPL' });
      });
      const r = await run(['--snapshot', snapAapl, '--verify', '--write'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), env: { PT_ATH_WRITE_TOKEN: TOKEN_VALUE } });
      ok(r.exitCode === 0 && r.result.results[0].written === true && r.result.results[0].writeStatus === 'WRITE', 'written');
      ok(spy.calls.length === 2, 'one Yahoo fetch then one write');
      const w = spy.calls[1];
      ok(w.url === DEFAULT_BASE + WRITE_ROUTE && w.options.method === 'POST', 'POST to the branch-dev write route');
      ok(w.options.headers.authorization === 'Bearer tok-ath-write-qa', 'exact Bearer header, newline stripped');
      const sent = JSON.parse(w.options.body);
      ok(Object.keys(sent).sort().join() === 'attempt,ticker' && sent.ticker === 'AAPL', 'body keys');
      // F1 (Option B): the attempt carries the FULL Yahoo daily series; the writer derives the rest.
      ok(Object.keys(sent.attempt).sort().join() === 'bars,currency,independent,searchValue,tradingViewAdjSetting,tradingViewFirstBarDate,tradingViewHigh,tradingViewSymbol,unit', 'attempt keys: ' + Object.keys(sent.attempt).sort().join());
      ok(sent.attempt.tradingViewHigh === 345.34, 'TradingView reading');
      ok(Array.isArray(sent.attempt.bars) && sent.attempt.bars.length === AAPL_ROWS.length && sent.attempt.bars.every(function (b, i) {
        return Object.keys(b).sort().join() === 'date,high' && b.date === AAPL_ROWS[i][0] && b.high === AAPL_ROWS[i][1];
      }), 'every Yahoo bar is submitted, unchanged and in order');
      ok(['matchedBar', 'higherBars', 'yahooBarCount', 'yahooFirstBarDate', 'status'].every(function (k) { return sent.attempt[k] === undefined; }), 'the tool sends no verdict, matched bar or higher-bar list of its own');
      ok((r.stdout + r.stderr).indexOf('tok-ath-write-qa') === -1, 'token never printed');
    });

    // F4: the write token may only ever reach this project's DEV branch deploy.
    const BAD_BASES = [
      ['https://attacker.example', 'BASE_HOST_NOT_APPROVED'],
      ['https://portfoliotrk.netlify.app', 'PROD_TARGET_FORBIDDEN'],
      ['https://portfoliotrk.netlify.app.', 'PROD_TARGET_FORBIDDEN'],
      ['https://www.portfoliotrk.netlify.app', 'BASE_HOST_NOT_APPROVED'],
      ['https://deploy-preview-1--portfoliotrk.netlify.app', 'BASE_HOST_NOT_APPROVED'],
      ['https://other-branch--portfoliotrk.netlify.app', 'BASE_HOST_NOT_APPROVED'],
      ['https://branch-dev--portfoliotrk.netlify.app.evil.example', 'BASE_HOST_NOT_APPROVED'],
      ['https://evil.example/branch-dev--portfoliotrk.netlify.app', 'BASE_URL_INVALID'],
      ['https://evil.example@branch-dev--portfoliotrk.netlify.app', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app@evil.example', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app:8443', 'BASE_URL_INVALID'],
      ['http://branch-dev--portfoliotrk.netlify.app', 'BASE_URL_INVALID'],
      ['not a url', 'BASE_URL_INVALID'],
      // Exactness: the approved host, but spelled any other way, is not the approved host.
      ['https://branch-dev--portfoliotrk.netlify.app.', 'BASE_HOST_NOT_APPROVED'],
      ['https://branch-dev--portfoliotrk.netlify.app./anything?x#y', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app/some/path', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app/?x=1', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app/#frag', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app\\@evil.example', 'BASE_URL_INVALID'],
      ['https://BRANCH-DEV--PORTFOLIOTRK.NETLIFY.APP', 'BASE_URL_INVALID'],
      ['  https://branch-dev--portfoliotrk.netlify.app', 'BASE_URL_INVALID'],
      ['https://branch-dev--portfoliotrk.netlify.app  ', 'BASE_URL_INVALID'],
      ['//branch-dev--portfoliotrk.netlify.app', 'BASE_URL_INVALID']
    ];

    async function tokenNeverLeaves(mod) {
      for (const b of BAD_BASES) {
        for (const extra of [['--verify', '--write'], ['--teardown']]) {
          const spy = makeFetchSpy(function () { return jsonResponse(200, { status: 'WRITE' }); });
          const io = { fetchImpl: spy.fn, env: { PT_ATH_WRITE_TOKEN: TOKEN_VALUE }, ask: makeAsk([]), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS };
          const r = await mod.main(['--snapshot', snapAapl].concat(extra).concat(['--base', b[0]]).concat(ARGS_BASE), io);
          const sentToken = spy.calls.some(function (c) { return JSON.stringify(c.options || {}).indexOf(TOKEN_VALUE) !== -1; });
          if (r.exitCode !== 1 || r.result.reason !== b[1] || spy.calls.length !== 0 || sentToken) { return false; }
        }
      }
      return true;
    }

    await test('AR-6p F4: the write token is never sent to an unapproved host (zero requests, every bad base, write and teardown)', async function () {
      ok(await tokenNeverLeaves(tool), 'refused before any request');
      // Exactly the DEV origin, with or without one trailing slash, and nothing else.
      const okBases = ['https://branch-dev--portfoliotrk.netlify.app', 'https://branch-dev--portfoliotrk.netlify.app/'];
      for (const b of okBases) {
        const spy = makeFetchSpy(function (url) {
          if (url.indexOf('query1.finance.yahoo.com') !== -1) { return yahooResponse('USD', AAPL_ROWS); }
          return jsonResponse(200, { status: 'WRITE', ticker: 'AAPL', recordStatus: 'verified', key: 'ath:v1:AAPL' });
        });
        const r = await run(['--snapshot', snapAapl, '--verify', '--write', '--base', b].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), env: { PT_ATH_WRITE_TOKEN: TOKEN_VALUE } });
        ok(r.exitCode === 0 && spy.calls[1].url === DEFAULT_BASE + WRITE_ROUTE, 'approved base ' + b + ' posts to the canonical DEV origin only: ' + (spy.calls[1] && spy.calls[1].url));
      }
    });

    await test('AR-6k a rejected or failed write stops the batch (no retry, ledger kept)', async function () {
      const snapTwo = fixture('snap-two.json', snapshotOf([SNAP_AAPL, SNAP_NICE]));
      const spy = makeFetchSpy(function (url) {
        if (url.indexOf('query1.finance.yahoo.com') !== -1) { return yahooResponse('USD', AAPL_ROWS); }
        return jsonResponse(400, { status: 'INVALID_SUBMISSION', reason: 'ATTEMPT_INVALID' });
      });
      const r = await run(['--snapshot', snapTwo, '--verify', '--write'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), env: { PT_ATH_WRITE_TOKEN: TOKEN_VALUE } });
      ok(r.exitCode === 2 && r.result.stage === 'WRITE' && r.result.reason === 'INVALID_SUBMISSION', 'stopped');
      ok(spy.calls.length === 2, 'no second ticker, no retry');
      const down = makeFetchSpy(function (url) {
        if (url.indexOf('query1.finance.yahoo.com') !== -1) { throw new Error('NETWORK_DOWN'); }
        return jsonResponse(200, {});
      });
      const r2 = await run(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: down.fn, ask: makeAsk([]) });
      ok(r2.exitCode === 2 && r2.result.reason === 'YAHOO_FETCH_FAILED', 'transport failure stops');
      const bad = makeFetchSpy(function () { return { status: 200, json: async function () { throw new Error('not json'); } }; });
      const r3 = await run(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: bad.fn, ask: makeAsk([]) });
      ok(r3.exitCode === 2 && r3.result.reason === 'YAHOO_BODY_INVALID', 'non-JSON body stops');
      const empty = makeFetchSpy(function () { return yahooResponse('USD', []); });
      const r4 = await run(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: empty.fn, ask: makeAsk([]) });
      ok(r4.exitCode === 2 && r4.result.reason === 'YAHOO_NO_BARS', 'no bars stops');
    });

    await test('AR-6l --teardown deletes only the snapshot keys through the writer, never mixes with verify', async function () {
      const spy = makeFetchSpy(function (url, options) {
        const b = JSON.parse(options.body);
        return jsonResponse(200, { status: 'DELETED', ticker: b.ticker, key: 'ath:v1:' + b.ticker });
      });
      const r = await run(['--snapshot', snapAll, '--teardown'].concat(ARGS_BASE), { fetchImpl: spy.fn, env: { PT_ATH_WRITE_TOKEN: TOKEN_VALUE } });
      ok(r.exitCode === 0 && r.result.mode === 'teardown' && r.result.results.length === 3, 'three deletes');
      ok(spy.calls.every(function (c) { return c.url === DEFAULT_BASE + WRITE_ROUTE && JSON.parse(c.options.body).action === 'DELETE'; }), 'DELETE actions');
      ok(JSON.stringify(spy.calls.map(function (c) { return JSON.parse(c.options.body).ticker; })) === JSON.stringify(['AAPL', 'NICE.TA', 'TEVA.TA']), 'sorted, only snapshot tickers');
    });

    await test('AR-6m no plausibility annotation, ratio or flag in any output (spike fixtures)', async function () {
      const outs = [];
      const a = await run(['--snapshot', snapTeva, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('ILA', TEVA_ROWS); }).fn, ask: makeAsk(['27590', 'ILA', '2007-07-01', 'off', 'skip', '']) });
      const b = await run(['--snapshot', snapNice, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('ILA', NICE_ROWS); }).fn, ask: makeAsk(['99480', 'ILA', '2007-07-01', 'off', '']) });
      outs.push(a.stdout, a.stderr, b.stdout, b.stderr);
      ok(outs.every(function (o) { return !/plausib|outlier|suspicious|implausible|anomal|\bratio\b|looks wrong|corrupt/i.test(o); }), 'no plausibility vocabulary');
    });

    await test('AR-6n static surface: no env reads, no storage, no range=max, fixed requires, require.main guard', async function () {
      const raw = fs.readFileSync(TOOL_PATH, 'utf8');
      // `//` after a quote or colon is part of a string / URL, not a comment.
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');
      // The environment is injected (io.env). The only process.env use is the entry point handing
      // it over, and the only key read from it is PT_ATH_WRITE_TOKEN.
      ok((code.match(/process\.env/g) || []).length === 1 && /env:\s*process\.env,/.test(code), 'process.env appears only as the entry-point hand-over');
      const envKeys = (code.match(/\benv\.([A-Za-z0-9_]+)/g) || []).map(function (m) { return m.slice(4); });
      ok(envKeys.length >= 1 && envKeys.every(function (k) { return k === 'PT_ATH_WRITE_TOKEN'; }), 'only PT_ATH_WRITE_TOKEN is read from the environment: ' + envKeys.join(','));
      ok(!/token-file|tokenFile|readFileSync\(\s*tokenPath/.test(code), 'no token file or token flag');
      ok(!/localStorage|document\.|window\./.test(code), 'no web storage or DOM');
      ok(!/range=max/.test(code), 'never range=max');
      ok(!/\beval\s*\(|new Function/.test(code), 'no dynamic code');
      const reqs = (code.match(/require\(['"][^'"]+['"]\)/g) || []).sort();
      ok(JSON.stringify(reqs) === JSON.stringify(["require('../netlify/functions/lib/ath-preflight')", "require('../netlify/functions/lib/ath-record')", "require('fs')"].sort()), 'requires: ' + reqs.join(' '));
      ok(/require\.main === module/.test(code), 'require.main guard');
      ok((code.match(/portfoliotrk\.netlify\.app/g) || []).length === 2, 'the production host appears only as the rejection constant (+ the default branch-dev origin)');
    });

    await test('AR-6o the real fetch was never called', async function () {
      ok(realFetchCalls === 0, 'real fetch calls: ' + realFetchCalls);
    });

    // ── planted negatives ───────────────────────────────────────────────────
    async function killed(name, mutations, predicate) {
      await test('PN ' + name + ' is killed', async function () {
        const mutant = loadMutated(TOOL_PATH, mutations);
        // Killed only by the predicate RETURNING false; a throw would hide a broken predicate.
        let survived;
        try { survived = (await predicate(mutant)) === true; } catch (e) { throw new Error('predicate threw instead of returning false: ' + (e && e.message)); }
        ok(!survived, 'mutant survived: the predicate still passes');
      });
    }

    async function dryRunWritesNothing(mod) {
      const spy = makeFetchSpy(function () { return yahooResponse('USD', AAPL_ROWS); });
      await mod.main(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS });
      return spy.calls.length === 1;
    }

    await killed('dry-run performs a write (AR-6)', [['if (args.write) {', 'if (true) {']], dryRunWritesNothing);
    await killed('yahoo fetch switched to range=max (AR-6)', [['interval=1d&period1=0&period2=', 'interval=1d&range=max&x=']], async function (mod) {
      const spy = makeFetchSpy(function () { return yahooResponse('USD', AAPL_ROWS); });
      await mod.main(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: spy.fn, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS });
      return spy.calls.length === 1 && spy.calls[0].url.indexOf('range=max') === -1 && spy.calls[0].url.indexOf('period1=0') !== -1;
    });
    await killed('the token is read in a dry-run (AR-6)', [['if (args.write || args.teardown) {', 'if (true) {']], async function (mod) {
      const spyEnv = makeSpyEnv(TOKEN_VALUE);
      await mod.main(['--snapshot', snapAapl, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('USD', AAPL_ROWS); }).fn, env: spyEnv, ask: makeAsk(['345.34', 'USD', '1980-12-01', 'off', '']), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS });
      return spyEnv.reads === 0;
    });
    await killed('allowlist refusal removed (AR-6)', [['if (!allow.tickers.has(entry.ticker)) {', 'if (false) {']], async function (mod) {
      const r = await mod.main(['--snapshot', snapAll, '--verify', '--allowed', 'AAPL,NICE.TA'], { fetchImpl: throwingFetch, ask: makeAsk([]), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS });
      return r.exitCode === 1 && r.result.reason === 'SYMBOL_NOT_IN_ALLOWLIST';
    });
    await killed('an arbitrary HTTPS host accepted as the write target (F4)', [['if (DEV_HOSTS.indexOf(url.hostname) === -1) {', 'if (false) {']], tokenNeverLeaves);
    await killed('a trailing-dot spelling of the DEV host accepted (F4)', [['if (DEV_HOSTS.indexOf(url.hostname) === -1) {', 'if (DEV_HOSTS.indexOf(url.hostname.replace(/\\.+$/, \'\')) === -1) {']], tokenNeverLeaves);
    await killed('the typed-string exactness check removed (F4)', [['if (raw !== \'https://\' + url.hostname && raw !== \'https://\' + url.hostname + \'/\') {', 'if (false) {']], tokenNeverLeaves);
    await killed('a base with a path accepted (F4)', [['url.pathname !== \'/\' || url.search !== \'\' || url.hash !== \'\') {', 'false) {']], tokenNeverLeaves);
    await killed('the DEV host list widened to a wildcard (F4)', [['const DEV_HOSTS = Object.freeze([DEV_HOST]);', 'const DEV_HOSTS = Object.freeze([DEV_HOST, \'attacker.example\']);']], tokenNeverLeaves);
    await killed('production host accepted as a target (AR-6)', [['if (url.hostname.replace(/\\.+$/, \'\') === PROD_HOSTNAME) {', 'if (false) {']], async function (mod) {
      const r = await mod.main(['--snapshot', snapAapl, '--verify', '--base', 'https://portfoliotrk.netlify.app'].concat(ARGS_BASE), { fetchImpl: throwingFetch, ask: makeAsk([]), stdout: makeSink(), stderr: makeSink(), nowMs: NOW_MS });
      return r.exitCode === 1 && r.result.reason === 'PROD_TARGET_FORBIDDEN';
    });
    await killed('a plausibility annotation is printed (AR-8)',
      [['(b.covered ? \'covered\' : \'uncovered\')', '(b.covered ? \'covered\' : \'uncovered\') + (b.high > 5 * matched.high ? \' implausible\' : \'\')']], async function (mod) {
        const out = makeSink();
        await mod.main(['--snapshot', snapNice, '--verify'].concat(ARGS_BASE), { fetchImpl: makeFetchSpy(function () { return yahooResponse('ILA', NICE_ROWS); }).fn, ask: makeAsk(['99480', 'ILA', '2007-07-01', 'off', '']), stdout: out, stderr: makeSink(), nowMs: NOW_MS });
        return !/plausib/i.test(out.text());
      });
  } finally {
    globalThis.fetch = realFetch;
    if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exitCode = 1; }
}

main().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 1;
});
