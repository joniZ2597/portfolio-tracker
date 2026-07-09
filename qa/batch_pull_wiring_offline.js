'use strict';

/*
 * qa/batch_pull_wiring_offline.js
 *
 * EG-21C-1 — portfolio batch wiring offline proof (WR-series).
 *
 * Composes the EG-21B extractor with the promoted EG-20D batch driver:
 *   portfolio-sync doc fixture -> extractBatchTickers(doc)
 *                              -> runBatchPull(tickers, spyCallFn)
 *
 * composeBatchFromDoc() below is the harness REFERENCE implementation of the
 * (future, separately approved) owner-run composition policy: the driver runs
 * ONLY on an { ok: true } extraction; every failure is stage-tagged and
 * fail-closed with ZERO calls. No product surface is added by this suite.
 *
 * Isolation: the callFn is a scripted in-memory spy — no endpoint core, no
 * store, no provider, no env. A throwing globalThis.fetch guard makes any real
 * network a hard error.
 *
 * Coverage:
 *   - valid doc -> sorted tickers -> full ledger run (writtenKeys verbatim)
 *   - extract failures (invalid symbol / raw envelope / empty / too-many /
 *     schemaVersion / holdings shape) -> stage EXTRACT, ZERO calls
 *   - driver-level defense (LIST_INVALID / LIST_TOO_LARGE) -> zero calls
 *   - STOP on a non-approved (status, reason) pair; later tickers never called
 *   - writtenKeys retained verbatim (incl. empty array; absent stays absent)
 *   - isContinueOutcome exact-pair matrix (direct export pin)
 *   - static scan of the promoted lib (no env/fetch/blobs/storage/DOM/require/route)
 *   - isolation scan: pull route/core/orchestrator do NOT import the new lib
 *   - zero real network across the suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { extractBatchTickers } = require('../netlify/functions/lib/portfolio-ticker-source');
const { runBatchPull, isContinueOutcome } = require('../netlify/functions/lib/batch-pull-driver');

const ROOT = path.resolve(__dirname, '..');
const LIB_REL = 'netlify/functions/lib/batch-pull-driver.js';
const CORE_REL = 'netlify/functions/lib/sec-evidence-pull-core.js';
const MJS_REL = 'netlify/functions/sec-evidence-pull.mjs';
const ORCH_REL = 'netlify/functions/lib/evidence-pull-orchestrator.js';

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stripComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// ── fixtures ──────────────────────────────────────────────────────────────────
function makeDoc(symbols) {
  const holdings = {};
  symbols.forEach(function (sym) {
    holdings[sym] = { symbol: sym, positionSize: 5 };
  });
  return { schemaVersion: 1, holdings: holdings };
}

// n distinct letters-only symbols (supports n <= 52): TA..TZ, then TAA..TAZ.
function manyTickers(n) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out = [];
  for (let i = 0; i < n && i < 26; i++) { out.push('T' + letters[i]); }
  for (let i = 26; i < n; i++) { out.push('TA' + letters[i - 26]); }
  return out;
}

// Scripted spy callFn: script is a function (ticker, callIndex) -> response,
// or an array of responses consumed in call order.
function makeSpy(script) {
  const spy = { calls: [] };
  spy.fn = async function (ticker) {
    spy.calls.push(ticker);
    if (typeof script === 'function') { return script(ticker, spy.calls.length); }
    return script[spy.calls.length - 1];
  };
  return spy;
}

function writeResponse(ticker, cik, writtenKeys) {
  return {
    statusCode: 200,
    body: { status: 'WRITE', ticker: ticker, cik: cik, itemCount: 3, writtenKeys: writtenKeys }
  };
}

const KEYS = {
  ZALPHA: ['secstore:v1:company:0001000021', 'secstore:v1:cik:ZALPHA'],
  ZBRAVO: ['secstore:v1:company:0001000022', 'secstore:v1:cik:ZBRAVO'],
  ZCHARL: ['secstore:v1:company:0001000023', 'secstore:v1:cik:ZCHARL']
};
const CIKS = { ZALPHA: '0001000021', ZBRAVO: '0001000022', ZCHARL: '0001000023' };

function writeByTicker(ticker) {
  return writeResponse(ticker, CIKS[ticker], KEYS[ticker]);
}

// ── reference composition (the future owner-run wiring must match this policy) ─
// The driver runs ONLY on an { ok: true } extraction. Failures are stage-tagged
// unions preserving both fixed vocabularies verbatim — no new per-ticker reasons.
async function composeBatchFromDoc(doc, callFn) {
  const ex = extractBatchTickers(doc);
  if (ex.ok !== true) {
    return { ok: false, stage: 'EXTRACT', reason: ex.reason, ledger: [] };
  }
  const out = await runBatchPull(ex.tickers, callFn);
  return Object.assign({ stage: 'BATCH' }, out);
}

// ── tiny runner (mirrors qa/evidence_teardown_offline.js) ─────────────────────
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

async function runTests() {
  process.stdout.write('\n=== EG-21C-1 — portfolio batch wiring proof (doc -> extract -> driver, offline) ===\n\n');

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    await test('WR01: valid doc -> sorted tickers -> full ledger run; writtenKeys verbatim', async function () {
      const doc = makeDoc(['ZCHARL', 'ZALPHA', 'ZBRAVO']); // deliberately unsorted insertion
      const spy = makeSpy(function (ticker) { return writeByTicker(ticker); });
      const out = await composeBatchFromDoc(doc, spy.fn);
      assert.strictEqual(out.stage, 'BATCH');
      assert.strictEqual(out.ok, true);
      assert.strictEqual(out.complete, true);
      assert.deepStrictEqual(spy.calls, ['ZALPHA', 'ZBRAVO', 'ZCHARL'], 'calls follow the extractor sorted order');
      assert.strictEqual(out.ledger.length, 3);
      for (let i = 0; i < out.ledger.length; i++) {
        const e = out.ledger[i];
        assert.strictEqual(e.status, 'WRITE');
        assert.deepStrictEqual(e.writtenKeys, KEYS[e.ticker], e.ticker + ' writtenKeys verbatim');
      }
    });

    await test('WR02: extract failure (one invalid symbol) -> stage EXTRACT, ZERO calls', async function () {
      const doc = makeDoc(['ZALPHA', 'ZBRAVO']);
      doc.holdings['zbad'] = { symbol: 'zbad', positionSize: 5 };
      const spy = makeSpy(function () { throw new Error('CALL_MUST_NOT_RUN'); });
      const out = await composeBatchFromDoc(doc, spy.fn);
      assert.deepStrictEqual(out, { ok: false, stage: 'EXTRACT', reason: 'TICKER_INVALID', ledger: [] });
      assert.strictEqual(spy.calls.length, 0, 'no call may fire on a rejected extraction');
    });

    await test('WR03: raw GET envelope -> stage EXTRACT RAW_ENVELOPE, ZERO calls', async function () {
      const spy = makeSpy(function () { throw new Error('CALL_MUST_NOT_RUN'); });
      const envelope = { status: 'OK', doc: makeDoc(['ZALPHA']) };
      const out = await composeBatchFromDoc(envelope, spy.fn);
      assert.deepStrictEqual(out, { ok: false, stage: 'EXTRACT', reason: 'RAW_ENVELOPE', ledger: [] });
      const err = await composeBatchFromDoc({ status: 'ERROR' }, spy.fn);
      assert.deepStrictEqual(err, { ok: false, stage: 'EXTRACT', reason: 'RAW_ENVELOPE', ledger: [] });
      assert.strictEqual(spy.calls.length, 0);
    });

    await test('WR04: empty / too-many / schema / holdings-shape all fail closed with ZERO calls; driver defense intact', async function () {
      const spy = makeSpy(function () { throw new Error('CALL_MUST_NOT_RUN'); });
      const cases = [
        [{ schemaVersion: 1, holdings: {} }, 'TICKERS_EMPTY'],
        [makeDoc(manyTickers(26)), 'TICKERS_TOO_MANY'],
        [{ schemaVersion: '1', holdings: { ZALPHA: {} } }, 'SCHEMA_VERSION_INVALID'],
        [{ schemaVersion: 1, holdings: [] }, 'HOLDINGS_INVALID'],
        [undefined, 'DOC_INVALID']
      ];
      for (let i = 0; i < cases.length; i++) {
        const out = await composeBatchFromDoc(cases[i][0], spy.fn);
        assert.deepStrictEqual(out, { ok: false, stage: 'EXTRACT', reason: cases[i][1], ledger: [] }, 'case ' + i);
      }
      assert.strictEqual(spy.calls.length, 0);
      // Driver-level defense-in-depth behind the extractor (direct calls):
      assert.deepStrictEqual(await runBatchPull([], spy.fn), { ok: false, reason: 'LIST_INVALID', ledger: [] });
      assert.deepStrictEqual(await runBatchPull(['zbad'], spy.fn), { ok: false, reason: 'LIST_INVALID', ledger: [] });
      assert.deepStrictEqual(await runBatchPull(manyTickers(26), spy.fn), { ok: false, reason: 'LIST_TOO_LARGE', ledger: [] });
      assert.strictEqual(spy.calls.length, 0, 'driver defenses also fire before any call');
    });

    await test('WR05: STOP on a non-approved (status, reason) pair; later tickers never called; ledger intact', async function () {
      const doc = makeDoc(['ZCHARL', 'ZALPHA', 'ZBRAVO']); // sorted: ZALPHA, ZBRAVO, ZCHARL
      const spy = makeSpy(function (ticker, n) {
        if (n === 1) { return writeByTicker(ticker); }
        if (n === 2) { return { statusCode: 502, body: { status: 'ERROR', reason: 'PROVIDER_FAILURE' } }; }
        throw new Error('THIRD_CALL_MUST_NOT_RUN');
      });
      const out = await composeBatchFromDoc(doc, spy.fn);
      assert.strictEqual(out.stage, 'BATCH');
      assert.strictEqual(out.ok, true);
      assert.strictEqual(out.complete, false);
      assert.strictEqual(out.stoppedAt, 'ZBRAVO');
      assert.strictEqual(out.stopStatus, 'ERROR');
      assert.strictEqual(out.stopReason, 'PROVIDER_FAILURE');
      assert.strictEqual(out.ledger.length, 2);
      assert.deepStrictEqual(out.ledger[0].writtenKeys, KEYS.ZALPHA, 'completed WRITE keys survive the stop');
      assert.deepStrictEqual(spy.calls, ['ZALPHA', 'ZBRAVO'], 'ZCHARL must never be called after the stop');
    });

    await test('WR06: writtenKeys retained verbatim (exact echo; empty stays empty; absent stays absent)', async function () {
      const doc = makeDoc(['ZALPHA', 'ZBRAVO', 'ZCHARL']);
      const spy = makeSpy([
        writeResponse('ZALPHA', '0001000021', KEYS.ZALPHA),
        { statusCode: 200, body: { status: 'WRITE', writtenKeys: [] } },
        { statusCode: 200, body: { status: 'NO_EVIDENCE', reason: 'NO_CIK' } }
      ]);
      const out = await composeBatchFromDoc(doc, spy.fn);
      assert.strictEqual(out.complete, true);
      assert.deepStrictEqual(out.ledger[0].writtenKeys, KEYS.ZALPHA, 'exact canonical echo');
      assert.deepStrictEqual(out.ledger[1].writtenKeys, [], 'empty array preserved verbatim, not dropped');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(out.ledger[2], 'writtenKeys'), false,
        'absent writtenKeys stays absent — never invented');
      assert.deepStrictEqual(out.ledger[2], { ticker: 'ZCHARL', statusCode: 200, status: 'NO_EVIDENCE', reason: 'NO_CIK' });
    });

    await test('WR07: isContinueOutcome exact-pair matrix (direct export pin)', function () {
      const continues = [
        { statusCode: 200, status: 'WRITE' },
        { statusCode: 200, status: 'SKIPPED', reason: 'ALREADY_SEEDED' },
        { statusCode: 200, status: 'NO_EVIDENCE', reason: 'NO_EVIDENCE' },
        { statusCode: 200, status: 'NO_EVIDENCE', reason: 'NO_CIK' }
      ];
      continues.forEach(function (e, i) {
        assert.strictEqual(isContinueOutcome(e), true, 'continue case ' + i);
      });
      const stops = [
        { statusCode: 200, status: 'SKIPPED', reason: 'OTHER_REASON' },
        { statusCode: 200, status: 'SKIPPED' },
        { statusCode: 200, status: 'NO_EVIDENCE', reason: 'OTHER_REASON' },
        { statusCode: 200, status: 'NO_EVIDENCE' },
        { statusCode: 200, status: 'DISABLED', reason: 'SERVER_DISABLED' },
        { statusCode: 200, status: 'DEGRADED', reason: 'STOPPED_PRE_READ_DEGRADED' },
        { statusCode: 403, status: 'TICKER_NOT_ALLOWED', reason: 'TICKER_NOT_ALLOWED' },
        { statusCode: 502, status: 'ERROR', reason: 'PROVIDER_FAILURE' },
        { statusCode: 200, status: 'WRITE_LIKE' }
      ];
      stops.forEach(function (e, i) {
        assert.strictEqual(isContinueOutcome(e), false, 'stop case ' + i);
      });
    });

    await test('WR08: promoted lib source static-safe (no env / fetch / blobs / storage / DOM / require / route)', function () {
      const raw = readSource(LIB_REL);
      const code = stripComments(raw);
      assert.ok(!/process\.env/.test(code), 'no process.env');
      assert.ok(!/\bfetch\s*\(/.test(code), 'no fetch(');
      assert.ok(!/@netlify\/blobs|getStore/.test(code), 'no blobs handle / getStore');
      assert.ok(!/localStorage|sessionStorage/.test(code), 'no web storage');
      assert.ok(!/\brequire\s*\(/.test(code), 'pure import-inert: no require()');
      assert.ok(!/\bdocument\.|\bwindow\./.test(code), 'no DOM');
      assert.ok(!/exports\.handler|export\s+default|export\s+const\s+config|withLambda/.test(code), 'no route/handler export');
      assert.ok(!/\bimport\s/.test(code), 'no ESM import');
      assert.strictEqual((code.match(/module\.exports/g) || []).length, 1, 'exactly one module.exports');
      assert.ok(/'use strict'/.test(raw), 'use strict present');
      assert.ok(/runBatchPull/.test(code) && /isContinueOutcome/.test(code), 'exports both contract functions');
      assert.ok(raw.indexOf('BATCH_TICKER_RE = /^[A-Z]{1,10}$/') !== -1, 'ratified regex literal present');
      assert.ok(raw.indexOf('MAX_BATCH_TICKERS = 25') !== -1, 'ratified cap literal present');
    });

    await test('WR09: pull route/core/orchestrator do NOT import the promoted lib', function () {
      [[CORE_REL, 'core'], [MJS_REL, 'mjs'], [ORCH_REL, 'orchestrator']].forEach(function (pair) {
        const code = stripComments(readSource(pair[0]));
        assert.ok(code.indexOf('batch-pull-driver') === -1, pair[1] + ' must not import the batch driver lib');
        assert.ok(code.indexOf('runBatchPull') === -1, pair[1] + ' must not contain the driver');
      });
    });

    await test('WR10: zero real global.fetch across the suite', function () {
      assert.strictEqual(realFetchCalls, 0, 'the real globalThis.fetch must never be called');
    });
  } finally {
    globalThis.fetch = _origFetch;
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
