'use strict';

/*
 * qa/fund_facts_route_offline.js
 *
 * C1-S4 — FR-series offline QA for the fund-facts route wrapper
 * (netlify/functions/fund-facts.mjs).
 *
 * Proves the .mjs route entry with ZERO real network / Blob / production
 * contact, following the qa/sec_evidence_pull_endpoint_offline.js EP33–EP42
 * idiom with one strengthening taken from the C1-S4 lab evidence: the REAL
 * module is driven (dynamic import of the actual .mjs and its real withLambda
 * default export) instead of a reconstructed chain. Every behavioral test is a
 * PARITY pair: the same request is issued to the C1-S3 core handler (event
 * form) and to the route export (Request form), and status, body (byte-equal
 * AND deep-equal), and every core-declared header must match. A throwing
 * global.fetch guard covers the whole suite, including the wrapper import.
 *
 * Coverage:
 *   FR01  pinned wrapper pattern (withLambda default export, no config, no twin)
 *   FR02  exactly one side-effect '@netlify/blobs' import, no bindings
 *   FR03  no console.* output
 *   FR04  no duplicated gate/auth/parse/store/provider logic (comment-stripped)
 *   FR05  import allowlist (exactly 3), no dynamic import() / require()
 *   FR06  .mjs syntax (node --check) + endpoint-exposure pin — BASELINE-
 *         SPECIFIC: exactly the 12 function-eligible entries of branch-dev
 *         baseline 93bcfb0 plus the new fund-facts.mjs, and NOTHING else
 *   FR07  import-inert: a clean child imports the .mjs under a throwing fetch
 *         guard — zero network/store/provider activity at import time
 *   FR08  OPTIONS -> 204 empty body, CORS parity
 *   FR09  gate OFF (absent / 'TRUE' / '1' / 'false') -> exact DISABLED parity
 *   FR10  gate ON, non-POST methods -> 405 parity
 *   FR11  auth-first through the wrapper: missing/wrong token -> 401; malformed
 *         body + wrong auth -> 401 (never 400); capitalized Authorization
 *         header is normalized and accepted
 *   FR12  post-auth failure families: INVALID_JSON / INVALID_TICKER /
 *         TICKER_NOT_ALLOWED / CONFIGURATION_MISSING (agent + collision) parity
 *   FR13  gate ON, full valid env, NO blobs context -> 200 DEGRADED /
 *         STORE_UNAVAILABLE fail-closed BEFORE any provider fetch (EP41 idiom)
 *   FR14  zero real global.fetch calls across the entire suite
 *
 * Run: node qa/fund_facts_route_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const MJS_REL = 'netlify/functions/fund-facts.mjs';
const MJS_ABS = path.join(ROOT, MJS_REL);
const CORE_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'fund-facts-core.js');
const core = require(CORE_SRC);

const ROUTE = 'https://qa.local/.netlify/functions/fund-facts';
const TOKEN = 'tok-fund-facts-route-qa-1';
const AUTH = 'Bearer ' + TOKEN;
const ALLOWED_IMPORTS = ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/fund-facts-core.js'];

// FR06 exposure pin — BASELINE-SPECIFIC. This exact 13-entry list is pinned to
// branch-dev baseline 93bcfb0 (the 12 function-eligible top-level entries
// shipped there) plus the new fund-facts.mjs route added by C1-S4. Its job is
// to DETECT UNEXPECTED ROUTE EXPOSURE: any other file in netlify/functions is
// an accidental endpoint and a hard failure. A future INTENTIONAL function
// addition therefore requires explicit re-baselining of this test — updating
// the pin is a deliberate, reviewed act, never an incidental edit.
const EXPECTED_FUNCTIONS = [
  'anthropic-proxy.js',
  'av-proxy.js',
  'capital-returns.js',
  'edgar-form4.js',
  'finance-search.js',
  'fund-facts.mjs',
  'market-data.js',
  'perplexity-proxy.js',
  'portfolio-sync.js',
  'research-evidence.js',
  'sec-evidence-pull.mjs',
  'sec-evidence-store-writer.mjs',
  'sec-evidence-store.js'
];

// ── env management (the core reads process.env at its boundary) ──────────────
const ENV_KEYS = [
  'PT_ENABLE_FUND_FACTS_SERVER',
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_ALLOWED_TICKERS',
  'SEC_USER_AGENT',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN',
  'NETLIFY_BLOBS_CONTEXT'
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

function armedEnv(extra) {
  return Object.assign({
    PT_ENABLE_FUND_FACTS_SERVER: 'true',
    PT_FUND_FACTS_TOKEN: TOKEN,
    PT_FUND_FACTS_ALLOWED_TICKERS: 'FROG,AAPL',
    SEC_USER_AGENT: 'PulseC1S4RouteQA/1.0 qa@example.com'
  }, extra || {});
}

// ── source helpers (EP-series idiom) ─────────────────────────────────────────
function readMjs() { return fs.readFileSync(MJS_ABS, 'utf8').replace(/\r\n/g, '\n'); }
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); }

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      process.stdout.write('  PASS  ' + name + '\n');
    } catch (err) {
      failed += 1;
      process.stdout.write('  FAIL  ' + name + '\n        ' + (err && err.message ? err.message : err) + '\n');
    }
  }

  // Throwing network guard for the WHOLE suite — installed before the wrapper
  // module graph (and @netlify/blobs) is imported.
  const _origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = function () { fetchCalls += 1; throw new Error('NETWORK_FORBIDDEN'); };

  let wrapped = null;

  try {
    // ── FR01: pinned wrapper pattern ─────────────────────────────────────────
    await test('FR01 wrapper is the pinned pattern (withLambda default export, core import, no config, no .js twin)', async function () {
      const src = readMjs();
      assert.ok(/@netlify\/aws-lambda-compat/.test(src), 'compat import missing');
      assert.ok(/\.\/lib\/fund-facts-core\.js/.test(src), 'core import missing');
      assert.ok(/export default withLambda\(/.test(src), 'export default withLambda missing');
      assert.ok(!/export\s+const\s+config/.test(src), 'config export would change routing');
      assert.ok(!fs.existsSync(path.join(ROOT, 'netlify/functions/fund-facts.js')),
        'legacy .js entry present — duplicate endpoint risk');
    });

    // ── FR02: exactly one side-effect blobs import, no bindings ──────────────
    await test('FR02 exactly one side-effect import of @netlify/blobs with no bindings', async function () {
      const src = readMjs();
      const matches = src.match(/^import '@netlify\/blobs';$/gm) || [];
      assert.strictEqual(matches.length, 1, 'expected exactly one side-effect import of @netlify/blobs');
      assert.ok(!/import\s*\{[^}]*\}\s*from\s*['"]@netlify\/blobs['"]/.test(src), 'blobs import must have no named bindings');
      assert.ok(!/import\s+[\w*]+\s+from\s+['"]@netlify\/blobs['"]/.test(src), 'blobs import must have no default/namespace binding');
    });

    // ── FR03: no console output ──────────────────────────────────────────────
    await test('FR03 wrapper has no console.* output', async function () {
      assert.ok(!/console\./.test(readMjs()), 'console.* in the route wrapper');
    });

    // ── FR04: no duplicated logic (comment-stripped) ─────────────────────────
    await test('FR04 wrapper has no duplicated gate/auth/parse/store/provider logic', async function () {
      const code = stripComments(readMjs());
      ['PT_ENABLE', 'PT_FUND_FACTS', 'evaluateFundFactsPreflight', 'getFundFactsWithCik',
        'Bearer', 'JSON.parse', 'process.env', 'getStore', 'onlyIfNew', 'fundstore', 'httpMethod']
        .forEach(function (tok) { assert.ok(code.indexOf(tok) === -1, 'wrapper must not contain logic token: ' + tok); });
    });

    // ── FR05: import allowlist; no dynamic import()/require() ────────────────
    await test('FR05 wrapper imports exactly the three allowed modules; no dynamic import() / require()', async function () {
      const code = stripComments(readMjs());
      const specs = [];
      let m;
      const reFrom = /import\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g;
      while ((m = reFrom.exec(code)) !== null) { specs.push(m[1]); }
      const reBare = /import\s+['"]([^'"]+)['"]/g;
      while ((m = reBare.exec(code)) !== null) { specs.push(m[1]); }
      assert.ok(!/\bimport\s*\(/.test(code), 'no dynamic import() allowed in the wrapper');
      assert.ok(!/\brequire\s*\(/.test(code), 'no require() allowed in the ESM wrapper');
      const set = new Set(specs);
      assert.strictEqual(set.size, ALLOWED_IMPORTS.length, 'unexpected import set: ' + JSON.stringify(specs));
      ALLOWED_IMPORTS.forEach(function (s) { assert.ok(set.has(s), 'missing allowed import: ' + s); });
    });

    // ── FR06: syntax + baseline-specific endpoint-exposure pin ───────────────
    await test('FR06 .mjs parses (node --check); netlify/functions exposes ONLY the 13 pinned entries (baseline 93bcfb0 + fund-facts.mjs; intentional additions require re-baselining)', async function () {
      const r = spawnSync(process.execPath, ['--check', MJS_ABS], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, 'node --check failed: ' + ((r.stderr || '') + (r.stdout || '')).trim());
      const eligible = fs.readdirSync(path.join(ROOT, 'netlify/functions'), { withFileTypes: true })
        .filter(function (e) { return e.isFile() && /\.(js|mjs|cjs|ts|mts|cts)$/.test(e.name); })
        .map(function (e) { return e.name; })
        .sort();
      assert.deepStrictEqual(eligible, EXPECTED_FUNCTIONS.slice().sort(),
        'unexpected route exposure — function-eligible set drifted from the 93bcfb0+fund-facts.mjs pin: ' + JSON.stringify(eligible));
    });

    // ── FR07: import-inert in a clean child ──────────────────────────────────
    await test('FR07 import-inert: clean child imports the .mjs under a throwing fetch guard, zero calls', async function () {
      const script =
        "globalThis.__fc = 0;" +
        "globalThis.fetch = function () { globalThis.__fc++; throw new Error('NETWORK_FORBIDDEN'); };" +
        "import(" + JSON.stringify(pathToFileURL(MJS_ABS).href) + ").then(function (ns) {" +
        "  if (typeof ns.default !== 'function') { process.exit(2); }" +
        "  if (globalThis.__fc !== 0) { process.exit(4); }" +
        "  process.exit(0);" +
        "}).catch(function (err) { console.error(err && err.message); process.exit(3); });";
      const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: ROOT });
      assert.strictEqual(r.status, 0, 'clean import: exit ' + r.status + ' ' + ((r.stderr || '') + (r.stdout || '')).trim());
    });

    // ── behavioral: import the REAL module once, under the suite guard ───────
    const ns = await import(pathToFileURL(MJS_ABS).href);
    wrapped = ns.default;
    assert.strictEqual(typeof wrapped, 'function', 'route default export must be a function');

    // Parity engine: one request, two paths — the C1-S3 core handler (event
    // form, headers lowercased exactly as the lambda-compat rebuild does) and
    // the REAL route export (Request form). Status, body (byte-equal AND
    // deep-equal), and every core-declared header must match.
    async function drivePair(label, opts) {
      const evHeaders = {};
      Object.keys(opts.headers || {}).forEach(function (k) { evHeaders[k.toLowerCase()] = opts.headers[k]; });
      const event = { httpMethod: opts.method, headers: evHeaders, body: opts.body === undefined ? null : opts.body };
      const coreRes = await core.handler(event);

      const init = { method: opts.method, headers: opts.headers || {} };
      if (opts.body !== undefined && opts.method !== 'GET' && opts.method !== 'HEAD') { init.body = opts.body; }
      const resp = await wrapped(new Request(ROUTE, init), {});
      const text = await resp.text();

      assert.strictEqual(resp.status, coreRes.statusCode, label + ': status parity (' + resp.status + ' vs ' + coreRes.statusCode + ')');
      const coreBody = coreRes.body === undefined ? '' : coreRes.body;
      assert.strictEqual(text, coreBody, label + ': body byte parity (' + text + ' vs ' + coreBody + ')');
      if (coreBody !== '') {
        assert.deepStrictEqual(JSON.parse(text), JSON.parse(coreBody), label + ': body deep parity');
      }
      Object.keys(coreRes.headers || {}).forEach(function (h) {
        assert.strictEqual(resp.headers.get(h.toLowerCase()), coreRes.headers[h], label + ': header parity: ' + h);
      });
      return { status: resp.status, text: text };
    }

    // ── FR08: OPTIONS parity ─────────────────────────────────────────────────
    await test('FR08 OPTIONS -> 204, empty body, CORS parity', async function () {
      await withEnv({}, async function () {
        const r = await drivePair('OPTIONS', { method: 'OPTIONS' });
        assert.strictEqual(r.status, 204);
        assert.strictEqual(r.text, '', 'no body on a 204');
      });
    });

    // ── FR09: gate OFF exact DISABLED parity (strict === "true") ─────────────
    await test('FR09 gate OFF (absent/TRUE/1/false) -> exact 200 DISABLED parity, zero fetch', async function () {
      const before = fetchCalls;
      const variants = [{}, { PT_ENABLE_FUND_FACTS_SERVER: 'TRUE' }, { PT_ENABLE_FUND_FACTS_SERVER: '1' }, { PT_ENABLE_FUND_FACTS_SERVER: 'false' }];
      for (const env of variants) {
        await withEnv(env, async function () {
          const r = await drivePair('gate-off', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: AUTH },
            body: JSON.stringify({ ticker: 'FROG' })
          });
          assert.strictEqual(r.status, 200);
          assert.strictEqual(r.text, '{"status":"DISABLED","reason":"SERVER_DISABLED"}', 'exact DISABLED body');
        });
      }
      assert.strictEqual(fetchCalls, before, 'gate-off must not fetch');
    });

    // ── FR10: method matrix parity ───────────────────────────────────────────
    await test('FR10 gate ON, GET/PUT/DELETE -> 405 parity', async function () {
      await withEnv(armedEnv(), async function () {
        for (const method of ['GET', 'PUT', 'DELETE']) {
          const r = await drivePair(method, { method: method, headers: { authorization: AUTH } });
          assert.strictEqual(r.status, 405, method + ' must be 405');
        }
      });
    });

    // ── FR11: auth-first through the wrapper ─────────────────────────────────
    await test('FR11 auth-first: missing/wrong -> 401; malformed body + wrong auth -> 401 not 400; header case normalized', async function () {
      await withEnv(armedEnv(), async function () {
        const before = fetchCalls;
        let r = await drivePair('no-auth', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ticker":"FROG"}'
        });
        assert.strictEqual(r.status, 401);
        r = await drivePair('wrong-auth', {
          method: 'POST', headers: { authorization: 'Bearer nope' }, body: '{"ticker":"FROG"}'
        });
        assert.strictEqual(r.status, 401);
        r = await drivePair('malformed+wrong-auth', {
          method: 'POST', headers: { authorization: 'Bearer nope' }, body: '{not valid json'
        });
        assert.strictEqual(r.status, 401, 'malformed body + wrong auth must be 401, not 400');
        assert.ok(r.text.indexOf('UNAUTHORIZED') !== -1, 'reason UNAUTHORIZED');
        // Capitalized Authorization header must be normalized by the compat
        // rebuild: auth passes, the not-allowlisted ticker is then refused.
        r = await drivePair('capitalized-auth', {
          method: 'POST', headers: { Authorization: AUTH }, body: '{"ticker":"MSFT"}'
        });
        assert.strictEqual(r.status, 403, 'capitalized Authorization must authenticate (then 403 allowlist)');
        assert.strictEqual(fetchCalls, before, 'auth-first paths must not fetch');
      });
    });

    // ── FR12: post-auth failure families parity ──────────────────────────────
    await test('FR12 post-auth: INVALID_JSON / INVALID_TICKER / TICKER_NOT_ALLOWED / CONFIGURATION_MISSING parity', async function () {
      await withEnv(armedEnv(), async function () {
        let r = await drivePair('invalid-json', {
          method: 'POST', headers: { authorization: AUTH }, body: '{not valid json'
        });
        assert.strictEqual(r.status, 400);
        assert.ok(r.text.indexOf('INVALID_JSON') !== -1);
        r = await drivePair('non-string-ticker', {
          method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":123}'
        });
        assert.strictEqual(r.status, 400);
        assert.ok(r.text.indexOf('TICKER_INVALID') !== -1);
        r = await drivePair('lowercase-ticker', {
          method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":"frog"}'
        });
        assert.strictEqual(r.status, 400, 'strict non-normalized ticker: lowercase rejected');
        r = await drivePair('not-allowlisted', {
          method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":"MSFT"}'
        });
        assert.strictEqual(r.status, 403);
        assert.ok(r.text.indexOf('TICKER_NOT_ALLOWED') !== -1);
      });
      await withEnv((function () { const e = armedEnv(); delete e.SEC_USER_AGENT; return e; })(), async function () {
        const r = await drivePair('agent-missing', {
          method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":"FROG"}'
        });
        assert.strictEqual(r.status, 500);
        assert.ok(r.text.indexOf('SEC_USER_AGENT_MISSING') !== -1);
      });
      await withEnv(armedEnv({ PT_SEC_EVIDENCE_PULL_TOKEN: TOKEN }), async function () {
        const r = await drivePair('token-collision', {
          method: 'POST', headers: { authorization: AUTH }, body: '{"ticker":"FROG"}'
        });
        assert.strictEqual(r.status, 500);
        assert.ok(r.text.indexOf('TOKEN_COLLISION') !== -1);
      });
    });

    // ── FR13: gate ON, valid path, NO blobs context (EP41 idiom) ─────────────
    await test('FR13 gate ON valid path, no blobs context -> 200 DEGRADED/STORE_UNAVAILABLE before any provider fetch', async function () {
      await withEnv(armedEnv(), async function () {
        const before = fetchCalls;
        const r = await drivePair('no-blobs-context', {
          method: 'POST', headers: { 'Content-Type': 'application/json', authorization: AUTH },
          body: '{"ticker":"FROG"}'
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.text, '{"status":"DEGRADED","reason":"STORE_UNAVAILABLE"}',
          'exact fail-closed store envelope');
        assert.strictEqual(fetchCalls, before, 'must fail closed before any provider fetch');
      });
    });

    // ── FR14: zero real fetch across the suite ───────────────────────────────
    await test('FR14 zero real global.fetch calls across the entire suite', async function () {
      assert.strictEqual(fetchCalls, 0, 'the throwing guard must never have been reached');
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
