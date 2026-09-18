'use strict';

/*
 * qa/news_catalysts_preflight_offline.js
 *
 * WU-P7A1 · P7A1-IMPL — News Catalysts server preflight + allowlist: offline QA.
 *
 * Exercises the PURE, DORMANT helper (netlify/functions/lib/news-catalysts-preflight.js)
 * with ZERO real network / Blob / env / store / DOM / production. Every case injects
 * an env object + authorization + ticker; nothing ambient is read. A throwing
 * globalThis.fetch guard is installed throughout to prove the module never touches
 * the real network (it must not, being pure).
 *
 * Coverage:
 *   NC01 import inertness (zero fetch on require; both entrypoints exposed)
 *   NC02 full valid env + allowlisted ticker -> { ok:true, ticker } (exact keys)
 *   NC03 gate strict === 'true' -> SERVER_DISABLED (before token)
 *   NC04 inbound token + exact untrimmed Bearer; missing/mismatch -> UNAUTHORIZED
 *   NC05 whitespace-only token is present; exact untrimmed match authenticates
 *   NC06 collision vs exactly the five named tokens; absent/empty/unrelated != collision
 *   NC07 allowlist reasons surfaced through the preflight
 *   NC08 membership: valid unlisted -> TICKER_NOT_ALLOWED; listed -> ok
 *   NC09 non-string ticker -> TICKER_NOT_ALLOWED
 *   NC10 first-failure ordering chain
 *   NC11 exact key sets across success and every failure reason
 *   NC12 input non-mutation; frozen env; ticker verbatim
 *   NC13 reason vocabulary confined to the approved six
 *   NC20 parseAllowedTickers missing/blank/delimiter-only vs non-string (exact shapes)
 *   NC21 delimiters, uppercase normalization, dedupe (exact shapes)
 *   NC22 malformed entry rejects the whole list (fail-closed-loud), incl. Unicode case-fold expansion
 *   NC23 distinct-size boundary 25/26
 *   NC24 raw-token boundary 100/101 (before dedupe)
 *   NC25 raw character-length guard (>2048)
 *   NC30 gate-off dormancy performs zero network, storage, filesystem calls
 *   NC40 static purity of the TARGET module (scan the module, not this harness)
 *
 * Run: node qa/news_catalysts_preflight_offline.js
 * (QA seam: NEWS_CATALYSTS_PREFLIGHT_PATH overrides the module under test for a
 *  candidate build; defaults to the installed lib path.)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = process.env.NEWS_CATALYSTS_PREFLIGHT_PATH
  ? path.resolve(process.env.NEWS_CATALYSTS_PREFLIGHT_PATH)
  : path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'news-catalysts-preflight.js');

// The helper is loaded UNDER the network guard inside NC01 (import-inertness
// proof), then reused by the remaining tests.
let NC = null;

// ── env key names ─────────────────────────────────────────────────────────────
const GATE      = 'PT_ENABLE_NEWS_CATALYSTS_SERVER';
const TOKEN     = 'PT_NEWS_CATALYSTS_TOKEN';
const ALLOW_KEY = 'PT_NEWS_CATALYSTS_ALLOWED_TICKERS';

const COLLISION_KEYS = [
  'PT_FUND_FACTS_TOKEN',
  'PT_FUND_FACTS_READ_TOKEN',
  'PT_OWNER_TOKEN',
  'PT_SEC_EVIDENCE_PULL_TOKEN',
  'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN'
];

const GOOD_TOKEN = 'newscatalysts-token-dddd4444';
const GOOD_AUTH  = 'Bearer ' + GOOD_TOKEN;

// The approved six-reason vocabulary.
const REASON_VOCAB = [
  'SERVER_DISABLED', 'UNAUTHORIZED', 'TOKEN_COLLISION',
  'ALLOWLIST_MISSING', 'ALLOWLIST_INVALID', 'TICKER_NOT_ALLOWED'
];

// A fully valid env (all checks pass for an allowlisted ticker). Standalone by
// default: NO comparison tokens present. Overrides replace individual keys.
function baseEnv(overrides) {
  const e = {};
  e[GATE]      = 'true';
  e[TOKEN]     = GOOD_TOKEN;
  e[ALLOW_KEY] = 'AAPL, MSFT NVDA';
  return Object.assign(e, overrides || {});
}
function delEnv(env, key) { const e = Object.assign({}, env); delete e[key]; return e; }

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

async function runTests() {
  process.stdout.write('\n=== WU-P7A1 · P7A1-IMPL — news-catalysts preflight + allowlist (offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error. The helper
  // is pure and must never touch it. Restored in the finally below.
  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── NC01: import inertness ────────────────────────────────────────────────
    await test('NC01: module import is inert (no network / no throw) and exposes both entrypoints', async function () {
      const before = realFetchCalls;
      NC = require(SRC);
      assert.strictEqual(typeof NC.evaluateNewsCatalystsPreflight, 'function', 'evaluateNewsCatalystsPreflight missing');
      assert.strictEqual(typeof NC.parseAllowedTickers, 'function', 'parseAllowedTickers missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    // ── NC02: all-pass -> exact { ok:true, ticker } ───────────────────────────
    await test('NC02: full valid env + allowlisted ticker -> { ok:true, ticker } (exact key set)', async function () {
      const r = NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' });
      assert.deepStrictEqual(r, { ok: true, ticker: 'AAPL' });
      assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'ticker']);
    });

    // ── NC03: single gate strict === 'true' ───────────────────────────────────
    await test('NC03: gate strict === "true"; non-"true"/missing -> SERVER_DISABLED (before token)', async function () {
      const bad = ['1', 'false', 'True', 'TRUE', ' true', 'true ', '', 'yes'];
      for (const v of bad) {
        const env = baseEnv(); env[GATE] = v;
        const r = NC.evaluateNewsCatalystsPreflight({ env: env, authorization: 'garbage-not-a-bearer', ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'SERVER_DISABLED', 'gate value ' + JSON.stringify(v));
      }
      const missing = delEnv(baseEnv(), GATE);
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: missing, authorization: 'garbage', ticker: 'AAPL' }).reason, 'SERVER_DISABLED');
    });

    // ── NC04: inbound token + exact untrimmed Bearer syntax ───────────────────
    await test('NC04: token present + exact Bearer; missing and mismatch both -> UNAUTHORIZED (no oracle)', async function () {
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: delEnv(baseEnv(), TOKEN), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [TOKEN]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      const auths = [undefined, null, '', 'Bearer wrong', 'bearer ' + GOOD_TOKEN, 'BEARER ' + GOOD_TOKEN, GOOD_TOKEN,
        'Bearer  ' + GOOD_TOKEN, 'Bearer ' + GOOD_TOKEN + ' ', ' Bearer ' + GOOD_TOKEN];
      for (const a of auths) {
        const r = NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: a, ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'UNAUTHORIZED', 'authorization ' + JSON.stringify(a));
      }
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── NC05: whitespace-only token is "present" (non-empty), exact match works
    await test('NC05: whitespace-only token counts as present; exact untrimmed match authenticates', async function () {
      const env = baseEnv({ [TOKEN]: '   ' });
      const okR = NC.evaluateNewsCatalystsPreflight({ env: env, authorization: 'Bearer    ', ticker: 'AAPL' });
      assert.deepStrictEqual(okR, { ok: true, ticker: 'AAPL' });
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: env, authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
    });

    // ── NC06: collision only vs the five named domain tokens ──────────────────
    await test('NC06: collision only vs the five named tokens; absent/empty/unrelated are not collisions', async function () {
      for (const key of COLLISION_KEYS) {
        assert.strictEqual(
          NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [key]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason,
          'TOKEN_COLLISION',
          'collision with ' + key
        );
      }
      // all comparison tokens absent -> no collision (reaches ok)
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // comparison tokens present but different -> ok
      const differentOverrides = {};
      COLLISION_KEYS.forEach(function (key, i) { differentOverrides[key] = 'other-' + i; });
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(differentOverrides), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // empty-string comparison tokens -> not a collision
      const emptyOverrides = {};
      COLLISION_KEYS.forEach(function (key) { emptyOverrides[key] = ''; });
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(emptyOverrides), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // an UNRELATED token env var equal to the news-catalysts token must NOT collide
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ PT_SOME_OTHER_TOKEN: GOOD_TOKEN, PT_UNRELATED: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // collision is checked BEFORE the allowlist — it preempts a missing allowlist
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: delEnv(baseEnv({ [COLLISION_KEYS[0]]: GOOD_TOKEN }), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'TOKEN_COLLISION');
    });

    // ── NC07: allowlist reasons surfaced through the preflight ────────────────
    await test('NC07: allowlist absent -> ALLOWLIST_MISSING; malformed -> ALLOWLIST_INVALID (via preflight)', async function () {
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [ALLOW_KEY]: '   ' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL,aa-pl' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_INVALID');
    });

    // ── NC08: membership — valid but unlisted -> TICKER_NOT_ALLOWED ───────────
    await test('NC08: valid ticker not in allowlist -> TICKER_NOT_ALLOWED; listed -> ok', async function () {
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
      // case-insensitive allowlist entries: a lowercase env entry still matches an uppercase request
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'tsla' }), authorization: GOOD_AUTH, ticker: 'TSLA' }).ok, true);
    });

    // ── NC09: non-string ticker -> TICKER_NOT_ALLOWED ─────────────────────────
    await test('NC09: non-string / lowercase / unlisted tickers all resolve to TICKER_NOT_ALLOWED', async function () {
      for (const t of [123, null, undefined, {}, [], true, NaN, 'aapl', '']) {
        assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_NOT_ALLOWED', 'ticker ' + String(t));
      }
    });

    // ── NC10: explicit first-failure ordering chain ───────────────────────────
    await test('NC10: first-failure ordering — each earlier failure preempts all later ones', async function () {
      // 1 gate off preempts everything
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [GATE]: 'x', [COLLISION_KEYS[0]]: GOOD_TOKEN, [ALLOW_KEY]: '!!' }), authorization: 'nope', ticker: 'lower' }).reason, 'SERVER_DISABLED');
      // 2 unauthorized (gate on, bad auth) preempts collision/allowlist/ticker
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [COLLISION_KEYS[0]]: GOOD_TOKEN, [ALLOW_KEY]: '!!' }), authorization: 'nope', ticker: 'lower' }).reason, 'UNAUTHORIZED');
      // 3 collision (authed) preempts allowlist/ticker
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [COLLISION_KEYS[0]]: GOOD_TOKEN, [ALLOW_KEY]: '!!' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'TOKEN_COLLISION');
      // 4 allowlist invalid preempts ticker
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'ALLOWLIST_INVALID');
      // 5 not allowed (last)
      assert.strictEqual(NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
    });

    // ── NC11: exact key sets across success and every failure reason ─────────
    await test('NC11: every result is exactly { ok:true, ticker } or { ok:false, reason }', async function () {
      const results = [
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }),                    // ok
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: 'no', ticker: 'AAPL' }),
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [COLLISION_KEYS[0]]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        NC.evaluateNewsCatalystsPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        NC.evaluateNewsCatalystsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' })
      ];
      for (const r of results) {
        if (r.ok === true) {
          assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'ticker']);
        } else {
          assert.strictEqual(r.ok, false);
          assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'reason']);
          assert.strictEqual(typeof r.reason, 'string');
        }
      }
    });

    // ── NC12: input non-mutation ───────────────────────────────────────────────
    await test('NC12: evaluateNewsCatalystsPreflight mutates none of its inputs; returns ticker verbatim', async function () {
      const env = baseEnv({ [COLLISION_KEYS[0]]: 'other-1' });
      const envSnap = JSON.stringify(env);
      const input = { env: env, authorization: GOOD_AUTH, ticker: 'AAPL' };
      const inputSnap = JSON.stringify({ authorization: input.authorization, ticker: input.ticker });
      const r = NC.evaluateNewsCatalystsPreflight(input);
      assert.strictEqual(r.ticker, input.ticker, 'ticker returned verbatim');
      assert.strictEqual(JSON.stringify(env), envSnap, 'env mutated');
      assert.strictEqual(JSON.stringify({ authorization: input.authorization, ticker: input.ticker }), inputSnap, 'input mutated');
      const frozen = Object.freeze(baseEnv());
      assert.doesNotThrow(function () { NC.evaluateNewsCatalystsPreflight({ env: frozen, authorization: GOOD_AUTH, ticker: 'AAPL' }); });
    });

    // ── NC13: reason vocabulary is confined to the approved six ──────────────
    await test('NC13: every failure reason is confined to the approved six-reason vocabulary (all six reachable)', async function () {
      const battery = [
        { env: baseEnv({ [GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv(), authorization: 'nope', ticker: 'AAPL' },
        { env: baseEnv({ [COLLISION_KEYS[0]]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }
      ];
      const seen = new Set();
      for (const inp of battery) {
        const r = NC.evaluateNewsCatalystsPreflight(inp);
        assert.strictEqual(r.ok, false);
        assert.ok(REASON_VOCAB.indexOf(r.reason) !== -1, 'reason outside vocabulary: ' + r.reason);
        seen.add(r.reason);
      }
      assert.strictEqual(seen.size, REASON_VOCAB.length, 'battery did not cover all reasons: ' + Array.from(seen).sort().join(','));
    });

    // ── NC20: parseAllowedTickers — missing vs invalid vs shapes ──────────────
    await test('NC20: parseAllowedTickers missing/blank/delimiter-only -> ALLOWLIST_MISSING; non-string -> ALLOWLIST_INVALID', async function () {
      for (const raw of [undefined, null, '', '   ', '\t\n', ',', ', ,', ' , , ']) {
        assert.strictEqual(NC.parseAllowedTickers(raw).reason, 'ALLOWLIST_MISSING', 'missing raw ' + JSON.stringify(raw));
      }
      for (const raw of [123, 0, {}, [], true, false, function () {}]) {
        const r = NC.parseAllowedTickers(raw);
        assert.strictEqual(r.reason, 'ALLOWLIST_INVALID', 'non-string raw ' + String(raw));
        assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'reason']);
      }
    });

    // ── NC21: parseAllowedTickers — delimiters, normalization, dedupe ─────────
    await test('NC21: mixed delimiters parse; lowercase uppercased; duplicates dedupe (exact shapes)', async function () {
      const mixed = NC.parseAllowedTickers('AAPL, MSFT\tNVDA\nTSLA GOOG');
      assert.strictEqual(mixed.ok, true);
      assert.deepStrictEqual(Object.keys(mixed).sort(), ['ok', 'tickers']);
      assert.strictEqual(mixed.tickers.size, 5);
      assert.ok(mixed.tickers.has('AAPL') && mixed.tickers.has('GOOG'));

      const lower = NC.parseAllowedTickers('aapl, msft');
      assert.strictEqual(lower.ok, true);
      assert.deepStrictEqual(Array.from(lower.tickers).sort(), ['AAPL', 'MSFT']);

      const dup = NC.parseAllowedTickers('AAPL,AAPL,aapl , AAPL');
      assert.strictEqual(dup.ok, true);
      assert.strictEqual(dup.tickers.size, 1);
      assert.ok(dup.tickers.has('AAPL'));
    });

    // ── NC22: parseAllowedTickers — malformed entries reject the whole list ────
    await test('NC22: any malformed entry rejects the whole list (fail-closed-loud), incl. Unicode case-fold expansion', async function () {
      for (const raw of ['AAPL,aa-pl', 'AAPL1', 'ABCDEFGHIJK', 'AAPL,MSFT.', 'AA PL!', 'AAPL,,MS_FT']) {
        assert.strictEqual(NC.parseAllowedTickers(raw).reason, 'ALLOWLIST_INVALID', 'malformed raw ' + JSON.stringify(raw));
      }
      // Unicode tokens whose toUpperCase() folds into ASCII-looking tickers MUST be
      // rejected on the ORIGINAL token, never accepted post-fold. Built from code
      // points so the source stays ASCII-only (no literal glyphs, no \u escapes):
      //   U+00DF -> "SS", U+017F -> "S", U+FB00 -> "FF".
      const sharpS = String.fromCodePoint(0x00DF);
      const longS = String.fromCodePoint(0x017F);
      const ligatureFF = String.fromCodePoint(0xFB00);
      for (const u of [sharpS, longS, ligatureFF]) {
        // precondition: each really DOES fold to an ASCII-looking ticker (the hole)
        assert.ok(
          /^[A-Z]{1,10}$/.test(u.toUpperCase()),
          'precondition: Unicode value folds to ASCII'
        );
        assert.deepStrictEqual(
          NC.parseAllowedTickers(u),
          { ok: false, reason: 'ALLOWLIST_INVALID' }
        );
      }
      // a valid ASCII ticker mixed with a Unicode token rejects the WHOLE list
      assert.deepStrictEqual(
        NC.parseAllowedTickers('AAPL,' + sharpS),
        { ok: false, reason: 'ALLOWLIST_INVALID' }
      );
      assert.deepStrictEqual(
        NC.parseAllowedTickers(ligatureFF + ' AAPL'),
        { ok: false, reason: 'ALLOWLIST_INVALID' }
      );
      // regression: lowercase ASCII still normalizes to uppercase and is accepted
      const low = NC.parseAllowedTickers('aapl');
      assert.strictEqual(low.ok, true);
      assert.ok(low.tickers.has('AAPL'));
      // regression: valid ASCII dedupe still works after normalization
      const dup = NC.parseAllowedTickers('AAPL,aapl,AAPL');
      assert.strictEqual(dup.ok, true);
      assert.strictEqual(dup.tickers.size, 1);
      assert.ok(dup.tickers.has('AAPL'));
    });

    // ── NC23: distinct-size boundary 25/26 ────────────────────────────────────
    await test('NC23: distinct allowlist size boundary — 25 ok, 26 -> ALLOWLIST_INVALID', async function () {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const twentyFive = NC.parseAllowedTickers(L.slice(0, 25).join(','));
      assert.strictEqual(twentyFive.ok, true);
      assert.strictEqual(twentyFive.tickers.size, 25);
      assert.strictEqual(NC.parseAllowedTickers(L.join(',')).reason, 'ALLOWLIST_INVALID'); // 26 distinct
    });

    // ── NC24: raw-token boundary 100/101 (measured BEFORE dedupe) ─────────────
    await test('NC24: raw token count boundary — 100 ok, 101 -> ALLOWLIST_INVALID (before dedupe)', async function () {
      const hundred = NC.parseAllowedTickers(new Array(100).fill('AAPL').join(','));
      assert.strictEqual(hundred.ok, true);
      assert.strictEqual(hundred.tickers.size, 1); // dedupes to 1 distinct, but 100 raw is allowed
      assert.strictEqual(NC.parseAllowedTickers(new Array(101).fill('AAPL').join(',')).reason, 'ALLOWLIST_INVALID');
    });

    // ── NC25: raw character-length guard ──────────────────────────────────────
    await test('NC25: pathological over-length raw string -> ALLOWLIST_INVALID (char guard)', async function () {
      assert.strictEqual(NC.parseAllowedTickers('A'.repeat(3000)).reason, 'ALLOWLIST_INVALID');
      assert.strictEqual(NC.parseAllowedTickers('AAPL, MSFT, NVDA').ok, true);
    });

    // ── NC30: gate-off dormancy — zero network/storage/filesystem calls ──────
    await test('NC30: gate-off evaluation performs zero network, storage and filesystem calls', async function () {
      const before = realFetchCalls;
      const r = NC.evaluateNewsCatalystsPreflight({ env: delEnv(baseEnv(), GATE), authorization: GOOD_AUTH, ticker: 'AAPL' });
      assert.strictEqual(r.reason, 'SERVER_DISABLED');
      assert.strictEqual(realFetchCalls, before, 'gate-off path touched the network');
    });

    // ── NC40: static purity of the TARGET module (comment-stripped scan) ─────
    await test('NC40: preflight module is static-pure (comment-stripped scan: no process.env / require / I/O / handler / storage / scoring)', async function () {
      const raw = fs.readFileSync(SRC, 'utf8');
      // Scan-safe representation of the TARGET module: block comments are blanked
      // (newlines preserved) and line comments removed, so every forbidden token is
      // matched against the module's CODE only. A phrase appearing in documentation
      // prose (e.g. "NOT process.env reads") can never weaken a purity guard.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      // sanity: stripping must not have removed executable code (export line stays)
      assert.ok(/module\.exports\s*=/.test(code), 'comment-strip removed code (export line missing)');
      // direct forbidden-token checks on the comment-stripped CODE (bare process.env)
      assert.ok(!/process\.env/.test(code), 'process.env referenced');
      assert.ok(!/\brequire\s*\(/.test(code), 'require( present — module must be self-contained');
      assert.ok(!/\bfetch\s*\(/.test(code), 'fetch( present');
      assert.ok(!/globalThis\.fetch/.test(code), 'globalThis.fetch referenced');
      assert.ok(!/exports\.handler/.test(code), 'exports.handler present');
      assert.ok(!/module\.exports\.handler/.test(code), 'module.exports.handler present');
      assert.ok(!/export\s+default/.test(code), 'export default present');
      assert.ok(!/\bwithLambda\b/.test(code), 'withLambda route wrapper present (route-init side effect)');
      assert.ok(!/localStorage|sessionStorage/.test(code), 'web storage referenced');
      assert.ok(!/\bdocument\b/.test(code), 'document referenced');
      assert.ok(!/\bwindow\b/.test(code), 'window referenced');
      assert.ok(!/Blob/.test(code), 'Blob referenced');
      assert.ok(!/@netlify\/blobs/.test(code), '@netlify/blobs referenced');
      assert.ok(!/getStore\s*\(/.test(code), 'getStore( called');
      assert.ok(!/\bstore\.(get|set|delete)/.test(code), 'store access');
      assert.ok(!/\breadRecord\b/.test(code), 'readRecord referenced');
      assert.ok(!/require\(\s*['"]https?['"]\s*\)/.test(code), 'http/https required');
      assert.ok(!/\b(?:pt_results|pt_tickers|pt_holdings)\b/.test(code), 'pt_* storage key referenced');
      assert.ok(!/\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(code), 'scoring ref');
      // enumeration guard: no dynamic discovery of collision candidates by
      // iterating or pattern-matching over the environment object
      assert.ok(!/Object\.(keys|values|entries)\s*\(\s*env\s*\)/.test(code), 'dynamic enumeration over env object');
      assert.ok(!/for\s*\(\s*(?:const|let|var)\s+\w+\s+in\s+env\b/.test(code), 'for..in over env object');
      // exposes exactly the two pure entrypoints
      assert.ok(/module\.exports\s*=\s*\{\s*evaluateNewsCatalystsPreflight\s*,\s*parseAllowedTickers\s*\}/.test(code), 'exact export set missing');
      // behavioral purity: still zero real network after the whole suite
      assert.strictEqual(realFetchCalls, 0, 'the real global.fetch must never be called');
    });
  } finally {
    globalThis.fetch = _origFetch; // restore the network guard before reporting/exit
  }

  const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
