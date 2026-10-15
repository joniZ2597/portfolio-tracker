'use strict';

/*
 * qa/fund_facts_token_collision_offline.js
 *
 * fund-facts-token-collision-1 - the fund-facts WRITE preflight refuses a token
 * equal to the READ token (PT_FUND_FACTS_READ_TOKEN): offline QA.
 *
 * Before this task the separation check was one-directional: the read preflight
 * refused a read token equal to PT_FUND_FACTS_TOKEN, while the write preflight's
 * COLLISION_KEYS listed only the two SEC tokens. This suite pins the write side.
 *
 * Pure and in-process: both preflight modules are required directly with injected
 * env objects (the same way qa/fund_facts_preflight_offline.js does). A throwing
 * globalThis.fetch guard proves nothing leaves the process. FC-N1 mutates a TEMP
 * COPY of the production source, never this test.
 *
 * Coverage:
 *   FC-1  write token == non-empty READ token -> TOKEN_COLLISION (read key first in COLLISION_KEYS)
 *   FC-2  read token absent / empty / different -> { ok: true, ticker } as today
 *   FC-3  the existing two SEC-token collisions still return TOKEN_COLLISION
 *   FC-4  order unchanged: gate off -> FUND_FACTS_SERVER_DISABLED; bad auth -> UNAUTHORIZED (equal tokens set)
 *   FC-5  PT_OWNER_TOKEN equal -> still { ok: true } (write-side spec unchanged)
 *   FC-6  read side unchanged: a read token equal to PT_FUND_FACTS_TOKEN -> TOKEN_COLLISION
 *   FC-N1 planted negative: the new key removed from a temp copy -> FC-1 fails
 *
 * Run: node qa/fund_facts_token_collision_offline.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify', 'functions', 'lib');
const WRITE_SRC = path.join(LIB, 'fund-facts-preflight.js');
const READ_SRC = path.join(LIB, 'fund-facts-read-preflight.js');

// ── env key names ─────────────────────────────────────────────────────────────
const GATE        = 'PT_ENABLE_FUND_FACTS_SERVER';
const TOKEN       = 'PT_FUND_FACTS_TOKEN';
const READ_GATE   = 'PT_ENABLE_FUND_FACTS_READ_SERVER';
const READ_KEY    = 'PT_FUND_FACTS_READ_TOKEN';
const UA_KEY      = 'SEC_USER_AGENT';
const ALLOW_KEY   = 'PT_FUND_FACTS_ALLOWED_TICKERS';
const PULL_TOKEN  = 'PT_SEC_EVIDENCE_PULL_TOKEN';
const WRITE_TOKEN = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const OWNER_TOKEN = 'PT_OWNER_TOKEN';

const GOOD_TOKEN = 'fundfacts-token-ffcc1111';
const GOOD_UA    = 'PulseFFTokenCollision/1.0 qa@example.com';
const GOOD_AUTH  = 'Bearer ' + GOOD_TOKEN;
const COLLIDE    = { ok: false, reason: 'TOKEN_COLLISION' };

// A fully valid write-side env: standalone, no comparison tokens present.
function baseEnv(overrides) {
  const e = {};
  e[GATE]      = 'true';
  e[TOKEN]     = GOOD_TOKEN;
  e[UA_KEY]    = GOOD_UA;
  e[ALLOW_KEY] = 'AAPL, MSFT NVDA';
  return Object.assign(e, overrides || {});
}
function only(key, value) { const o = {}; o[key] = value; return o; }
function run(M, env, authorization, ticker) {
  return M.evaluateFundFactsPreflight({ env: env, authorization: authorization, ticker: ticker });
}

// ── tiny runner (mirrors qa/fund_facts_preflight_offline.js) ──────────────────
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

// The FC-1 assertion as a function of the module under test, so FC-N1 can run the
// very same check against a mutated copy.
function assertWriteRefusesReadToken(M) {
  const env = baseEnv(only(READ_KEY, GOOD_TOKEN));
  assert.deepStrictEqual(run(M, env, GOOD_AUTH, 'AAPL'), COLLIDE, 'write token == read token must be TOKEN_COLLISION');
}

async function runTests() {
  process.stdout.write('\n=== fund-facts-token-collision-1 - write preflight refuses the read token (offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error.
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  let tmpDir = null;
  try {
    const W = require(WRITE_SRC);
    const R = require(READ_SRC);

    // ── FC-1 ─────────────────────────────────────────────────────────────────
    await test('FC-1: write token == non-empty PT_FUND_FACTS_READ_TOKEN -> TOKEN_COLLISION (read key is the first COLLISION_KEYS entry)', async function () {
      assertWriteRefusesReadToken(W);
      const src = fs.readFileSync(WRITE_SRC, 'utf8');
      assert.ok(/const COLLISION_KEYS = \[\s*'PT_FUND_FACTS_READ_TOKEN',/.test(src), 'the read token must be the first COLLISION_KEYS entry');
    });

    // ── FC-2 ─────────────────────────────────────────────────────────────────
    await test('FC-2: read token absent / empty / different -> { ok: true, ticker } as today', async function () {
      const ok = { ok: true, ticker: 'AAPL' };
      assert.deepStrictEqual(run(W, baseEnv(), GOOD_AUTH, 'AAPL'), ok, 'absent');
      assert.deepStrictEqual(run(W, baseEnv(only(READ_KEY, undefined)), GOOD_AUTH, 'AAPL'), ok, 'undefined');
      assert.deepStrictEqual(run(W, baseEnv(only(READ_KEY, '')), GOOD_AUTH, 'AAPL'), ok, 'empty');
      assert.deepStrictEqual(run(W, baseEnv(only(READ_KEY, 'a-different-read-token')), GOOD_AUTH, 'AAPL'), ok, 'different');
      // proceeding means the later checks still run: an unlisted ticker is still refused
      assert.strictEqual(run(W, baseEnv(only(READ_KEY, 'a-different-read-token')), GOOD_AUTH, 'TSLA').reason, 'TICKER_NOT_ALLOWED');
    });

    // ── FC-3 ─────────────────────────────────────────────────────────────────
    await test('FC-3: the existing two SEC-token collisions still return TOKEN_COLLISION', async function () {
      [PULL_TOKEN, WRITE_TOKEN].forEach(function (key) {
        assert.deepStrictEqual(run(W, baseEnv(only(key, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), COLLIDE, key);
        // with a different read token present, the older keys are still caught
        const both = baseEnv(only(key, GOOD_TOKEN));
        both[READ_KEY] = 'a-different-read-token';
        assert.deepStrictEqual(run(W, both, GOOD_AUTH, 'AAPL'), COLLIDE, key + ' + different read token');
      });
    });

    // ── FC-4 ─────────────────────────────────────────────────────────────────
    await test('FC-4: order unchanged - gate off -> FUND_FACTS_SERVER_DISABLED, bad auth -> UNAUTHORIZED (equal tokens set)', async function () {
      const colliding = only(READ_KEY, GOOD_TOKEN);
      ['false', '', 'True', undefined].forEach(function (g) {
        const env = baseEnv(colliding); env[GATE] = g;
        assert.strictEqual(run(W, env, GOOD_AUTH, 'AAPL').reason, 'FUND_FACTS_SERVER_DISABLED', 'gate ' + String(g));
        assert.strictEqual(run(W, env, 'Bearer nope', 'AAPL').reason, 'FUND_FACTS_SERVER_DISABLED', 'gate ' + String(g) + ' + bad bearer');
      });
      [undefined, '', 'Bearer nope', GOOD_TOKEN, 'bearer ' + GOOD_TOKEN].forEach(function (a) {
        assert.strictEqual(run(W, baseEnv(colliding), a, 'AAPL').reason, 'UNAUTHORIZED', 'auth ' + String(a));
      });
      // a missing write token is UNAUTHORIZED, not a collision, even if a read token exists
      const noWrite = baseEnv(colliding); delete noWrite[TOKEN];
      assert.strictEqual(run(W, noWrite, GOOD_AUTH, 'AAPL').reason, 'UNAUTHORIZED');
      // a collision still wins over the later checks (UA, allowlist, ticker, membership)
      const noUa = baseEnv(colliding); delete noUa[UA_KEY];
      assert.deepStrictEqual(run(W, noUa, GOOD_AUTH, 'AAPL'), COLLIDE, 'missing SEC_USER_AGENT');
      const noAllow = baseEnv(colliding); delete noAllow[ALLOW_KEY];
      assert.deepStrictEqual(run(W, noAllow, GOOD_AUTH, 'AAPL'), COLLIDE, 'missing allowlist');
      assert.deepStrictEqual(run(W, baseEnv(colliding), GOOD_AUTH, 'lower'), COLLIDE, 'invalid ticker');
      assert.deepStrictEqual(run(W, baseEnv(colliding), GOOD_AUTH, 'TSLA'), COLLIDE, 'unlisted ticker');
    });

    // ── FC-5 ─────────────────────────────────────────────────────────────────
    await test('FC-5: a write token equal to PT_OWNER_TOKEN is still NOT a write-side collision', async function () {
      assert.deepStrictEqual(run(W, baseEnv(only(OWNER_TOKEN, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), { ok: true, ticker: 'AAPL' });
    });

    // ── FC-6 ─────────────────────────────────────────────────────────────────
    await test('FC-6: read side unchanged - a read token equal to PT_FUND_FACTS_TOKEN -> TOKEN_COLLISION', async function () {
      const readAuth = 'Bearer ' + GOOD_TOKEN;
      const readEnv = function (overrides) {
        const e = {};
        e[READ_GATE] = 'true';
        e[READ_KEY]  = GOOD_TOKEN;
        e[ALLOW_KEY] = 'AAPL, MSFT NVDA';
        return Object.assign(e, overrides || {});
      };
      const collide = R.evaluateFundFactsReadPreflight({ env: readEnv(only(TOKEN, GOOD_TOKEN)), authorization: readAuth, ticker: 'AAPL' });
      assert.deepStrictEqual(collide, COLLIDE);
      // control: a distinct write token does not collide - the request is let through
      const ctrl = R.evaluateFundFactsReadPreflight({ env: readEnv(only(TOKEN, 'a-distinct-write-token')), authorization: readAuth, ticker: 'AAPL' });
      assert.strictEqual(ctrl.ok, true, 'distinct tokens must pass the read preflight');
    });

    // ── FC-N1: planted negative on a temp copy of the production source ──────
    await test('FC-N1: planted negative - the new key removed from a temp copy (anchor exactly once) makes FC-1 fail', async function () {
      const src = fs.readFileSync(WRITE_SRC, 'utf8');
      const anchor = /(const COLLISION_KEYS = \[\s*)'PT_FUND_FACTS_READ_TOKEN',\s*/g;
      const hits = src.match(anchor) || [];
      assert.strictEqual(hits.length, 1, 'anchor must occur exactly once in the production source');
      const mutated = src.replace(anchor, '$1');
      assert.notStrictEqual(mutated, src, 'mutation must change the source');
      assert.ok(!/const COLLISION_KEYS = \[[^\]]*PT_FUND_FACTS_READ_TOKEN/.test(mutated), 'the read-token key is removed from the COLLISION_KEYS array of the copy');

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-fund-facts-token-collision-'));
      const copy = path.join(tmpDir, 'fund-facts-preflight.js');
      fs.writeFileSync(copy, mutated);
      const M = require(copy);

      // the check FC-1 runs must now fail, and for the right reason: the request is let through
      assert.throws(function () { assertWriteRefusesReadToken(M); }, assert.AssertionError, 'FC-1 must fail on the mutated copy');
      assert.deepStrictEqual(run(M, baseEnv(only(READ_KEY, GOOD_TOKEN)), GOOD_AUTH, 'AAPL'), { ok: true, ticker: 'AAPL' });
      // and the mutation is otherwise minimal: the two SEC collisions still hold
      [PULL_TOKEN, WRITE_TOKEN].forEach(function (key) {
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
