'use strict';

/*
 * qa/portfolio_ticker_source_offline.js
 *
 * EG-21B — portfolio batch ticker source offline harness (BTS-series).
 * Exercises netlify/functions/lib/portfolio-ticker-source.js with ZERO real
 * network / Blob / Netlify env / endpoint / production. A throwing
 * globalThis.fetch guard makes any real network a hard error; no persistence
 * handle is ever constructed and no process.env is read.
 *
 * Coverage:
 *   - valid doc -> deduped, lexicographically sorted holdings keys (D1)
 *   - raw GET envelope rejection (D3) + non-plain-object doc rejection
 *   - strict schemaVersion === 1 / plain-object holdings shape gates
 *   - whole-list reject on any strict-invalid symbol (no normalization)
 *   - empty holdings / >25-distinct hard reject (D2)
 *   - dedupe honesty (plain-object keys cannot duplicate; defensive Set)
 *   - determinism (insertion-order independence) + input non-mutation
 *     (deep-freeze, snapshot, result freshness, keys-only value trap)
 *   - drift pins vs the pull preflight (behavioral + source literals), the
 *     batch driver rule and portfolio-sync SYMBOL_RE (source-scan only)
 *   - static scan of the MODULE source (no env / fetch / blobs / storage /
 *     DOM / require / route) — scans the TARGET file, never this suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { extractBatchTickers } = require('../netlify/functions/lib/portfolio-ticker-source');
const { evaluatePullPreflight, parseAllowedTickers } =
  require('../netlify/functions/lib/evidence-pull-preflight');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'netlify/functions/lib/portfolio-ticker-source.js';
const PREFLIGHT_REL = 'netlify/functions/lib/evidence-pull-preflight.js';
const BATCH_QA_REL = 'qa/sec_evidence_pull_batch_driver_offline.js';
const SYNC_REL = 'netlify/functions/portfolio-sync.js';

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

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stripComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
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
  process.stdout.write('\n=== EG-21B — portfolio batch ticker source (offline) ===\n\n');

  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    await test('BTS01: valid doc -> sorted exact symbols; whitelisted extras + opts inert', function () {
      const r = extractBatchTickers(makeDoc(['MSFT', 'AAPL', 'NVDA']));
      assert.deepStrictEqual(r, { ok: true, tickers: ['AAPL', 'MSFT', 'NVDA'] });
      assert.deepStrictEqual(Object.keys(r), ['ok', 'tickers'], 'exact result key set');
      // optional whitelisted doc fields must not affect extraction
      const full = makeDoc(['MSFT', 'AAPL', 'NVDA']);
      full.tickers = [{ symbol: 'AAPL' }];
      full.appBaseline = 'baseline';
      full.sourceOrigin = 'https://example.invalid';
      full.updatedAt = '2026-07-09T00:00:00.000Z';
      assert.deepStrictEqual(extractBatchTickers(full), { ok: true, tickers: ['AAPL', 'MSFT', 'NVDA'] });
      // hostile opts are completely unread (reserved param; cap/regex not weakenable)
      const hostile = extractBatchTickers(
        makeDoc(['MSFT', 'AAPL', 'NVDA']),
        { maxTickers: 100, tickerRe: /x/, dedupe: false }
      );
      assert.deepStrictEqual(hostile, { ok: true, tickers: ['AAPL', 'MSFT', 'NVDA'] });
    });

    await test('BTS02: raw GET envelope rejected; non-plain-object doc rejected', function () {
      assert.deepStrictEqual(
        extractBatchTickers({ status: 'OK', doc: makeDoc(['AAPL']) }),
        { ok: false, reason: 'RAW_ENVELOPE' }
      );
      assert.deepStrictEqual(
        extractBatchTickers({ status: 'ERROR' }),
        { ok: false, reason: 'RAW_ENVELOPE' }
      );
      // an otherwise-valid doc smuggling an envelope marker is still rejected
      const marked = makeDoc(['AAPL']);
      marked.doc = {};
      assert.deepStrictEqual(extractBatchTickers(marked), { ok: false, reason: 'RAW_ENVELOPE' });
      class Boxed {}
      [undefined, null, 'str', 42, true, [], new Map(), new Boxed()].forEach(function (bad) {
        assert.deepStrictEqual(
          extractBatchTickers(bad),
          { ok: false, reason: 'DOC_INVALID' },
          'DOC_INVALID for ' + Object.prototype.toString.call(bad)
        );
      });
    });

    await test('BTS03: schemaVersion must be exactly the number 1', function () {
      [undefined, 2, '1', 0, null, 1.5].forEach(function (v) {
        const doc = makeDoc(['AAPL']);
        if (v === undefined) { delete doc.schemaVersion; } else { doc.schemaVersion = v; }
        assert.deepStrictEqual(
          extractBatchTickers(doc),
          { ok: false, reason: 'SCHEMA_VERSION_INVALID' },
          'schemaVersion ' + JSON.stringify(v)
        );
      });
    });

    await test('BTS04: holdings must be a plain object (null-proto allowed)', function () {
      class Bag {}
      [undefined, null, [], new Map(), new Bag(), 'str', 42].forEach(function (v) {
        const doc = makeDoc(['AAPL']);
        if (v === undefined) { delete doc.holdings; } else { doc.holdings = v; }
        assert.deepStrictEqual(
          extractBatchTickers(doc),
          { ok: false, reason: 'HOLDINGS_INVALID' },
          'holdings ' + Object.prototype.toString.call(v)
        );
      });
      // null-prototype holdings are plain by the portfolio-sync rule -> accepted
      const doc = { schemaVersion: 1, holdings: Object.create(null) };
      doc.holdings.AAPL = { symbol: 'AAPL', positionSize: 5 };
      assert.deepStrictEqual(extractBatchTickers(doc), { ok: true, tickers: ['AAPL'] });
    });

    await test('BTS05: one strict-invalid symbol rejects the whole list (no normalization)', function () {
      ['aapl', 'BRK.B', 'ABCDEFGHIJK', '', ' AAPL', 'AA1'].forEach(function (bad) {
        const doc = makeDoc(['AAPL', 'MSFT', 'NVDA']);
        doc.holdings[bad] = { symbol: bad, positionSize: 5 };
        assert.deepStrictEqual(
          extractBatchTickers(doc),
          { ok: false, reason: 'TICKER_INVALID' },
          'bad symbol ' + JSON.stringify(bad)
        );
      });
    });

    await test('BTS06: empty holdings fails', function () {
      assert.deepStrictEqual(
        extractBatchTickers({ schemaVersion: 1, holdings: {} }),
        { ok: false, reason: 'TICKERS_EMPTY' }
      );
    });

    await test('BTS07: 25 distinct ok (boundary); 26 distinct hard reject; cap not overridable', function () {
      const ok25 = extractBatchTickers(makeDoc(manyTickers(25)));
      assert.strictEqual(ok25.ok, true);
      assert.strictEqual(ok25.tickers.length, 25);
      assert.deepStrictEqual(
        extractBatchTickers(makeDoc(manyTickers(26))),
        { ok: false, reason: 'TICKERS_TOO_MANY' }
      );
      assert.deepStrictEqual(
        extractBatchTickers(makeDoc(manyTickers(26)), { maxTickers: 100 }),
        { ok: false, reason: 'TICKERS_TOO_MANY' }
      );
    });

    await test('BTS08: dedupe — duplicates unrepresentable in plain-object keys; defensive Set present', function () {
      // Plain-object keys cannot duplicate: re-assigning an existing key
      // collapses to ONE Object.keys entry before the module ever sees it,
      // so duplicate injection is not representable at the input boundary.
      const collapsed = makeDoc(['AAPL', 'MSFT']);
      collapsed.holdings.AAPL = { symbol: 'AAPL', positionSize: 3 };
      assert.deepStrictEqual(extractBatchTickers(collapsed), { ok: true, tickers: ['AAPL', 'MSFT'] });
      // output invariant: duplicate-free
      const many = extractBatchTickers(makeDoc(manyTickers(25)));
      assert.strictEqual(new Set(many.tickers).size, many.tickers.length, 'output duplicate-free');
      // structural pin: the defensive Set dedupe exists in the module source
      const code = stripComments(readSource(MODULE_REL));
      assert.ok(code.indexOf('new Set(') !== -1, 'defensive Set dedupe present in module');
    });

    await test('BTS09: insertion order never changes the output (deterministic sorted)', function () {
      const syms = ['NVDA', 'AAPL', 'ZTS', 'MSFT', 'FROG', 'AMD'];
      const a = extractBatchTickers(makeDoc(syms));
      const b = extractBatchTickers(makeDoc(syms.slice().reverse()));
      assert.deepStrictEqual(a, b, 'reversed insertion order must not change output');
      assert.deepStrictEqual(a.tickers, ['AAPL', 'AMD', 'FROG', 'MSFT', 'NVDA', 'ZTS']);
      // repeat-call determinism
      assert.deepStrictEqual(extractBatchTickers(makeDoc(syms)), a);
      // lexicographic pin (code-unit ascending)
      assert.deepStrictEqual(
        extractBatchTickers(makeDoc(['AB', 'AAA', 'AA'])).tickers,
        ['AA', 'AAA', 'AB']
      );
    });

    await test('BTS10: input doc never mutated; values never read (D1); result array fresh', function () {
      // (a) deep-frozen doc: any write attempt throws under strict mode
      const frozen = makeDoc(['MSFT', 'AAPL']);
      Object.freeze(frozen.holdings.MSFT);
      Object.freeze(frozen.holdings.AAPL);
      Object.freeze(frozen.holdings);
      Object.freeze(frozen);
      assert.deepStrictEqual(extractBatchTickers(frozen), { ok: true, tickers: ['AAPL', 'MSFT'] });

      // (b) byte-level snapshot compare on an unfrozen doc
      const doc = makeDoc(['NVDA', 'AAPL']);
      const before = JSON.stringify(doc);
      const r1 = extractBatchTickers(doc);
      assert.strictEqual(JSON.stringify(doc), before, 'doc unchanged by the call');

      // (c) result freshness: mutating the result leaks nowhere
      r1.tickers.push('ZZZZ');
      assert.strictEqual(JSON.stringify(doc), before, 'doc unchanged after result mutation');
      assert.deepStrictEqual(extractBatchTickers(doc).tickers, ['AAPL', 'NVDA'], 'second call unaffected');

      // (d) keys-only (D1): a throwing value getter proves values are never read
      const trap = { schemaVersion: 1, holdings: {} };
      Object.defineProperty(trap.holdings, 'AAPL', {
        enumerable: true,
        get: function () { throw new Error('HOLDINGS_VALUE_READ'); }
      });
      assert.deepStrictEqual(extractBatchTickers(trap), { ok: true, tickers: ['AAPL'] });
    });

    await test('BTS11: no drift vs pull preflight / batch driver / portfolio-sync ticker rule', function () {
      // (a) behavioral format equivalence vs evaluatePullPreflight step 8
      //     (raw, non-normalized). parseAllowedTickers is NOT the format
      //     oracle — it uppercases tokens before testing.
      const formatValid = ['A', 'AAPL', 'ABCDEFGHIJ'];
      const formatInvalid = ['aapl', 'ABCDEFGHIJK', '', ' AAPL', 'AA1', 'BRK.B'];
      const env = {
        PT_ENABLE_SEC_EVIDENCE_PULL_SERVER: 'true',
        PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER: 'true',
        PT_SEC_EVIDENCE_PULL_TOKEN: 'qa-dummy-pull-token',
        PT_SEC_EVIDENCE_STORE_WRITE_TOKEN: 'qa-dummy-write-token',
        SEC_USER_AGENT: 'qa-offline-harness qa@example.invalid',
        PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS: formatValid.join(',')
      };
      const auth = 'Bearer qa-dummy-pull-token';
      formatValid.forEach(function (sym) {
        const pf = evaluatePullPreflight({ env: env, authorization: auth, ticker: sym });
        assert.deepStrictEqual(pf, { ok: true, ticker: sym }, 'preflight accepts ' + sym);
        const doc = { schemaVersion: 1, holdings: {} };
        doc.holdings[sym] = { symbol: sym, positionSize: 5 };
        assert.deepStrictEqual(extractBatchTickers(doc), { ok: true, tickers: [sym] }, 'module accepts ' + sym);
      });
      formatInvalid.forEach(function (sym) {
        const pf = evaluatePullPreflight({ env: env, authorization: auth, ticker: sym });
        assert.deepStrictEqual(pf, { ok: false, reason: 'TICKER_INVALID' }, 'preflight rejects ' + JSON.stringify(sym));
        const doc = { schemaVersion: 1, holdings: {} };
        doc.holdings[sym] = { symbol: sym, positionSize: 5 };
        assert.deepStrictEqual(
          extractBatchTickers(doc),
          { ok: false, reason: 'TICKER_INVALID' },
          'module rejects ' + JSON.stringify(sym)
        );
      });

      // (b) cap equivalence at the 25/26 boundary vs parseAllowedTickers
      const t25 = manyTickers(25);
      const t26 = manyTickers(26);
      assert.strictEqual(parseAllowedTickers(t25.join(',')).ok, true, 'preflight allows 25');
      assert.strictEqual(extractBatchTickers(makeDoc(t25)).ok, true, 'module allows 25');
      assert.deepStrictEqual(parseAllowedTickers(t26.join(',')), { ok: false, reason: 'ALLOWLIST_INVALID' });
      assert.deepStrictEqual(extractBatchTickers(makeDoc(t26)), { ok: false, reason: 'TICKERS_TOO_MANY' });

      // (c) source-literal pins (indexOf on the exact constant declarations;
      //     the batch driver qa file is SCANNED, never require()d — it
      //     self-executes on require)
      const own = readSource(MODULE_REL);
      assert.ok(own.indexOf('/^[A-Z]{1,10}$/') !== -1, 'own TICKER_RE literal');
      assert.ok(own.indexOf('MAX_BATCH_TICKERS = 25') !== -1, 'own cap literal');
      const pfSrc = readSource(PREFLIGHT_REL);
      assert.ok(pfSrc.indexOf('TICKER_RE = /^[A-Z]{1,10}$/') !== -1, 'preflight TICKER_RE literal');
      assert.ok(pfSrc.indexOf('MAX_ALLOWED_TICKERS = 25') !== -1, 'preflight cap literal');
      const batchSrc = readSource(BATCH_QA_REL);
      assert.ok(batchSrc.indexOf('BATCH_TICKER_RE = /^[A-Z]{1,10}$/') !== -1, 'batch driver regex literal');
      assert.ok(batchSrc.indexOf('MAX_BATCH_TICKERS = 25') !== -1, 'batch driver cap literal');
      const syncSrc = readSource(SYNC_REL);
      assert.ok(syncSrc.indexOf('SYMBOL_RE = /^[A-Z]{1,10}$/') !== -1, 'portfolio-sync SYMBOL_RE literal');
    });

    await test('BTS12: module source static-safe (no env / fetch / blobs / storage / DOM / require / route)', function () {
      const raw = readSource(MODULE_REL);
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
      assert.ok(/extractBatchTickers/.test(code), 'exports the contract function');
      assert.strictEqual(realFetchCalls, 0, 'the real globalThis.fetch was never called');
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
