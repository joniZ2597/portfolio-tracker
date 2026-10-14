'use strict';

/*
 * qa/news_token_collision_offline.js
 *
 * news-token-collision-1 - the news-catalysts WRITE preflight refuses a token
 * equal to the READ token (PT_NEWS_CATALYSTS_READ_TOKEN): offline QA.
 *
 * Before this task the separation check was one-directional: the read route
 * refused a read token equal to the write token, while the write preflight did
 * not list the read token in COLLISION_KEYS. This suite pins the write side.
 *
 * Pure and in-process: the preflight module is required directly with injected
 * env objects (the same way qa/news_catalysts_preflight_offline.js does). TC-5
 * drives the read core's handler under a save/restore of process.env with a
 * poisoned store. A throwing globalThis.fetch guard proves nothing leaves the
 * process. TC-N1 mutates a TEMP COPY of the production source, never this test.
 *
 * Coverage:
 *   TC-1  write token == non-empty READ token -> TOKEN_COLLISION (read key first in COLLISION_KEYS)
 *   TC-2  read token absent / empty / different / non-string -> no collision, request proceeds
 *   TC-3  the existing five collisions still return TOKEN_COLLISION
 *   TC-4  order unchanged: SERVER_DISABLED, then UNAUTHORIZED, then TOKEN_COLLISION before the allowlist
 *   TC-5  read side unchanged: read-core still refuses a read token equal to the write token
 *   TC-N1 planted negative: the new key removed from a temp copy -> TC-1 fails
 *
 * Run: node qa/news_token_collision_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PREFLIGHT_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-preflight.js');
const READ_CORE_SRC = path.join(ROOT, 'netlify', 'functions', 'lib', 'news-catalysts-read-core.js');

// ── env key names ─────────────────────────────────────────────────────────────
const GATE      = 'PT_ENABLE_NEWS_CATALYSTS_SERVER';
const TOKEN     = 'PT_NEWS_CATALYSTS_TOKEN';
const READ_KEY  = 'PT_NEWS_CATALYSTS_READ_TOKEN';
const ALLOW_KEY = 'PT_NEWS_CATALYSTS_ALLOWED_TICKERS';

// The five collision keys the write preflight already refused before this task.
const EXISTING_KEYS = [
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

const GOOD_TOKEN = 'newscatalysts-token-eeee5555';
const GOOD_AUTH  = 'Bearer ' + GOOD_TOKEN;
const COLLIDE    = { ok: false, reason: 'TOKEN_COLLISION' };

// A fully valid write-side env: standalone, no comparison tokens present.
function baseEnv(overrides) {
  const e = {};
  e[GATE]      = 'true';
  e[TOKEN]     = GOOD_TOKEN;
  e[ALLOW_KEY] = 'AAPL, MSFT NVDA';
  return Object.assign(e, overrides || {});
}
function only(key, value) { const o = {}; o[key] = value; return o; }
function run(M, env, authorization, ticker) {
  return M.evaluateNewsCatalystsPreflight({ env: env, authorization: authorization, ticker: ticker });
}

// ── tiny runner (mirrors qa/news_catalysts_preflight_offline.js) ──────────────
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

// The TC-1 assertion as a function of the module under test, so TC-N1 can run the
// very same check against a mutated copy.
function assertWriteRefusesReadToken(M) {
  const env = baseEnv(only(READ_KEY, GOOD_TOKEN));
  assert.deepStrictEqual(run(M, env, GOOD_AUTH, 'AAPL'), COLLIDE, 'write token == read token must be TOKEN_COLLISION');
}

// ── process.env management for TC-5 (the read core reads process.env) ─────────
const ENV_KEYS = [
  'PT_ENABLE_NEWS_CATALYSTS_READ_SERVER', READ_KEY, TOKEN, GATE, ALLOW_KEY,
  'PERPLEXITY_API_KEY', 'PT_FUND_FACTS_TOKEN', 'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];
function withProcessEnv(envObj, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(envObj).forEach(function (k) { process.env[k] = envObj[k]; });
  return Promise.resolve().then(fn).finally(function () {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    });
  });
}
function poisonedStore(state) {
  const boom = async function () { state.touched = true; throw new Error('POISONED_STORE_TOUCHED'); };
  return { get: boom, set: boom, list: boom };
}

async function runTests() {
  process.stdout.write('\n=== news-token-collision-1 - write preflight refuses the read token (offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error.
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  let tmpDir = null;
  try {
    const P = require(PREFLIGHT_SRC);

    // ── TC-1 ─────────────────────────────────────────────────────────────────
    await test('TC-1: write token == non-empty PT_NEWS_CATALYSTS_READ_TOKEN -> TOKEN_COLLISION (read key is the first COLLISION_KEYS entry)', async function () {
      assertWriteRefusesReadToken(P);
      const src = fs.readFileSync(PREFLIGHT_SRC, 'utf8');
      assert.ok(/const COLLISION_KEYS = \[\s*'PT_NEWS_CATALYSTS_READ_TOKEN',/.test(src), 'the read token must be the first COLLISION_KEYS entry');
    });

    // ── TC-2 ─────────────────────────────────────────────────────────────────
    await test('TC-2: read token absent / empty / different / non-string -> no collision; the request proceeds as today', async function () {
      const ok = { ok: true, ticker: 'AAPL' };
      assert.deepStrictEqual(run(P, baseEnv(), GOOD_AUTH, 'AAPL'), ok, 'absent');
      assert.deepStrictEqual(run(P, baseEnv(only(READ_KEY, undefined)), GOOD_AUTH, 'AAPL'), ok, 'undefined');
      assert.deepStrictEqual(run(P, baseEnv(only(READ_KEY, '')), GOOD_AUTH, 'AAPL'), ok, 'empty');
      assert.deepStrictEqual(run(P, baseEnv(only(READ_KEY, 'a-different-read-token')), GOOD_AUTH, 'AAPL'), ok, 'different');
      assert.deepStrictEqual(run(P, baseEnv(only(READ_KEY, 12345)), GOOD_AUTH, 'AAPL'), ok, 'non-string');
      // proceeding means the later checks still run: unlisted ticker is still refused
      assert.strictEqual(run(P, baseEnv(only(READ_KEY, 'a-different-read-token')), GOOD_AUTH, 'TSLA').reason, 'TICKER_NOT_ALLOWED');
    });

    // ── TC-3 ─────────────────────────────────────────────────────────────────
    await test('TC-3: the existing five collisions still return TOKEN_COLLISION', async function () {
      assert.strictEqual(EXISTING_KEYS.length, 5);
      EXISTING_KEYS.forEach(function (key) {
        assert.deepStrictEqual(run(P, baseEnv(only(key, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), COLLIDE, key);
        // with the read token present and different, the older keys are still caught
        const both = baseEnv(only(key, GOOD_TOKEN));
        both[READ_KEY] = 'a-different-read-token';
        assert.deepStrictEqual(run(P, both, GOOD_AUTH, 'AAPL'), COLLIDE, key + ' + different read token');
      });
    });

    // ── TC-4 ─────────────────────────────────────────────────────────────────
    await test('TC-4: order unchanged - SERVER_DISABLED, then UNAUTHORIZED, then TOKEN_COLLISION before the allowlist', async function () {
      const colliding = only(READ_KEY, GOOD_TOKEN);
      // disabled gate wins over a collision (and over a bad bearer)
      ['false', '', 'True', undefined].forEach(function (g) {
        const env = baseEnv(colliding); env[GATE] = g;
        assert.strictEqual(run(P, env, GOOD_AUTH, 'AAPL').reason, 'SERVER_DISABLED', 'gate ' + String(g));
        assert.strictEqual(run(P, env, 'Bearer nope', 'AAPL').reason, 'SERVER_DISABLED', 'gate ' + String(g) + ' + bad bearer');
      });
      // unauthorized wins over a collision
      [undefined, '', 'Bearer nope', GOOD_TOKEN, 'bearer ' + GOOD_TOKEN].forEach(function (a) {
        assert.strictEqual(run(P, baseEnv(colliding), a, 'AAPL').reason, 'UNAUTHORIZED', 'auth ' + String(a));
      });
      // a missing write token is UNAUTHORIZED, not a collision, even if a read token exists
      const noWrite = baseEnv(colliding); delete noWrite[TOKEN];
      assert.strictEqual(run(P, noWrite, GOOD_AUTH, 'AAPL').reason, 'UNAUTHORIZED');
      // a collision still wins over the allowlist and membership checks
      const badAllow = baseEnv(colliding); badAllow[ALLOW_KEY] = '!!';
      assert.deepStrictEqual(run(P, badAllow, GOOD_AUTH, 'lower'), COLLIDE, 'invalid allowlist');
      const noAllow = baseEnv(colliding); delete noAllow[ALLOW_KEY];
      assert.deepStrictEqual(run(P, noAllow, GOOD_AUTH, 'AAPL'), COLLIDE, 'missing allowlist');
      assert.deepStrictEqual(run(P, baseEnv(colliding), GOOD_AUTH, 'TSLA'), COLLIDE, 'unlisted ticker');
    });

    // ── TC-5 ─────────────────────────────────────────────────────────────────
    await test('TC-5: read side unchanged - read-core still refuses a read token equal to the write token', async function () {
      const core = require(READ_CORE_SRC);
      const armed = {
        PT_ENABLE_NEWS_CATALYSTS_READ_SERVER: 'true',
        PT_NEWS_CATALYSTS_ALLOWED_TICKERS: 'FROG,AAPL'
      };
      const SHARED = 'shared-secret-qa-tc5';
      const event = function (state, body) {
        return { httpMethod: 'POST', headers: { authorization: 'Bearer ' + SHARED }, body: body, _testStore: poisonedStore(state) };
      };
      await withProcessEnv(Object.assign({}, armed, only(READ_KEY, SHARED), only(TOKEN, SHARED)), async function () {
        const state = {};
        const r = await core.handler(event(state, '{{{'));
        assert.strictEqual(r.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(r.body), { status: 'CONFIGURATION_MISSING', reason: 'TOKEN_COLLISION' });
        assert.ok(!state.touched, 'store untouched');
      });
      // control: a distinct write token does not collide - the handler proceeds to body parsing
      await withProcessEnv(Object.assign({}, armed, only(READ_KEY, SHARED), only(TOKEN, 'a-distinct-write-token')), async function () {
        const state = {};
        const r = await core.handler(event(state, '{{{'));
        assert.strictEqual(r.statusCode, 400);
        assert.deepStrictEqual(JSON.parse(r.body), { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
        assert.ok(!state.touched, 'store untouched');
      });
    });

    // ── TC-N1: planted negative on a temp copy of the production source ──────
    await test('TC-N1: planted negative - the new key removed from a temp copy (anchor exactly once) makes TC-1 fail', async function () {
      const src = fs.readFileSync(PREFLIGHT_SRC, 'utf8');
      const anchor = /^[ \t]*'PT_NEWS_CATALYSTS_READ_TOKEN',[ \t]*\r?\n/gm;
      const hits = src.match(anchor) || [];
      assert.strictEqual(hits.length, 1, 'anchor must occur exactly once in the production source');
      const mutated = src.replace(anchor, '');
      assert.notStrictEqual(mutated, src, 'mutation must change the source');
      assert.ok(mutated.indexOf("'PT_NEWS_CATALYSTS_READ_TOKEN'") === -1, 'the read-token key is fully removed from the copy');

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-news-token-collision-'));
      const copy = path.join(tmpDir, 'news-catalysts-preflight.js');
      fs.writeFileSync(copy, mutated);
      const M = require(copy);

      // the check TC-1 runs must now fail, and for the right reason: the request is let through
      assert.throws(function () { assertWriteRefusesReadToken(M); }, assert.AssertionError, 'TC-1 must fail on the mutated copy');
      assert.deepStrictEqual(run(M, baseEnv(only(READ_KEY, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), { ok: true, ticker: 'AAPL' });
      // and the mutation is otherwise minimal: the original five collisions still hold
      EXISTING_KEYS.forEach(function (key) {
        assert.deepStrictEqual(run(M, baseEnv(only(key, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), COLLIDE, key);
      });
    });
  } finally {
    globalThis.fetch = _origFetch;
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stdout.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
