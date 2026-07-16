'use strict';

/*
 * qa/fund_facts_preflight_offline.js
 *
 * EG-25C-1 · C1-S2 — J1 SEC Financial Facts preflight + allowlist: FP-series offline QA.
 *
 * Exercises the PURE, DORMANT helper (netlify/functions/lib/fund-facts-preflight.js)
 * with ZERO real network / Blob / env / store / DOM / production. Every case injects
 * an env object + authorization + ticker; nothing ambient is read. A throwing
 * globalThis.fetch guard is installed throughout to prove the module never touches
 * the real network (it must not, being pure).
 *
 * Per the C1-S2 ruling: the local /^[A-Z]{1,10}$/ ticker rule is validated by DIRECT
 * fixtures only — NO evidence-writer import, NO FP-DRIFT / cross-module oracle.
 * Cross-module drift validation is deferred to C1-S4.
 *
 * Coverage:
 *   FP01 import inertness (zero fetch on require; both entrypoints exposed)
 *   FP02 full valid env + allowlisted ticker -> { ok:true, ticker } (exact keys)
 *   FP03 gate strict === 'true' -> FUND_FACTS_SERVER_DISABLED (before token)
 *   FP04 inbound token + exact untrimmed Bearer; missing/mismatch -> UNAUTHORIZED
 *   FP05 whitespace-only token is present; exact untrimmed match authenticates
 *   FP06 collision vs exactly PULL/WRITE tokens; absent/empty/unrelated != collision
 *   FP07 SEC_USER_AGENT missing/empty/ws/non-string -> SEC_USER_AGENT_MISSING
 *   FP08 allowlist reasons surfaced through the preflight
 *   FP09 request ticker strict, non-normalized -> TICKER_INVALID
 *   FP10 Unicode + non-string tickers -> TICKER_INVALID
 *   FP11 membership: valid unlisted -> TICKER_NOT_ALLOWED; listed -> ok
 *   FP12 first-failure ordering chain (spec §2.1)
 *   FP13 exact key sets across success and every failure reason
 *   FP14 input non-mutation; frozen env; ticker verbatim
 *   FP15 reason vocabulary confined to the approved eight
 *   FP20 parseAllowedTickers missing/blank/delimiter-only vs non-string (exact shapes)
 *   FP21 delimiters, uppercase normalization, dedupe (exact shapes)
 *   FP22 malformed entry rejects the whole list (fail-closed-loud)
 *   FP23 distinct-size boundary 25/26
 *   FP24 raw-token boundary 100/101 (before dedupe)
 *   FP25 raw character-length guard (>2048)
 *   FP26 DIRECT ticker fixtures (format rule isolated; no cross-module oracle)
 *   FP40 static purity of the TARGET module (scan the module, not this harness)
 *
 * Run: node qa/fund_facts_preflight_offline.js
 * (QA seam: FUND_FACTS_PREFLIGHT_PATH overrides the module under test for a
 *  candidate build; defaults to the installed lib path.)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = process.env.FUND_FACTS_PREFLIGHT_PATH
  ? path.resolve(process.env.FUND_FACTS_PREFLIGHT_PATH)
  : path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-preflight.js');

// The helper is loaded UNDER the network guard inside FP01 (import-inertness
// proof), then reused by the remaining tests.
let FF = null;

// ── env key names ─────────────────────────────────────────────────────────────
const GATE        = 'PT_ENABLE_FUND_FACTS_SERVER';
const TOKEN       = 'PT_FUND_FACTS_TOKEN';
const UA_KEY      = 'SEC_USER_AGENT';
const ALLOW_KEY   = 'PT_FUND_FACTS_ALLOWED_TICKERS';
const PULL_TOKEN  = 'PT_SEC_EVIDENCE_PULL_TOKEN';
const WRITE_TOKEN = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';

const GOOD_TOKEN = 'fundfacts-token-cccc3333';
const GOOD_UA    = 'PulseC1S2Test/1.0 qa@example.com';
const GOOD_AUTH  = 'Bearer ' + GOOD_TOKEN;

// The approved eight-reason vocabulary (spec §2.1 / C1-S2 contract).
const REASON_VOCAB = [
  'FUND_FACTS_SERVER_DISABLED', 'UNAUTHORIZED', 'TOKEN_COLLISION',
  'SEC_USER_AGENT_MISSING', 'ALLOWLIST_MISSING', 'ALLOWLIST_INVALID',
  'TICKER_INVALID', 'TICKER_NOT_ALLOWED'
];

// A fully valid env (all checks pass for an allowlisted ticker). Standalone by
// default: NO comparison tokens present (fund-facts is deployable without the
// pull/writer stack). Overrides replace individual keys.
function baseEnv(overrides) {
  const e = {};
  e[GATE]      = 'true';
  e[TOKEN]     = GOOD_TOKEN;
  e[UA_KEY]    = GOOD_UA;
  e[ALLOW_KEY] = 'AAPL, MSFT NVDA';
  return Object.assign(e, overrides || {});
}
function delEnv(env, key) { const e = Object.assign({}, env); delete e[key]; return e; }

// ── tiny runner (mirrors qa/evidence_pull_preflight_offline.js) ───────────────
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
  process.stdout.write('\n=== EG-25C-1 · C1-S2 — fund-facts preflight + allowlist (offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error. The helper
  // is pure and must never touch it. Restored in the finally below.
  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── FP01: import inertness ────────────────────────────────────────────────
    await test('FP01: module import is inert (no network / no throw) and exposes both entrypoints', async function () {
      const before = realFetchCalls;
      FF = require(SRC);
      assert.strictEqual(typeof FF.evaluateFundFactsPreflight, 'function', 'evaluateFundFactsPreflight missing');
      assert.strictEqual(typeof FF.parseAllowedTickers, 'function', 'parseAllowedTickers missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    // ── FP02: all-pass -> exact { ok:true, ticker } ───────────────────────────
    await test('FP02: full valid env + allowlisted ticker -> { ok:true, ticker } (exact key set)', async function () {
      const r = FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' });
      assert.deepStrictEqual(r, { ok: true, ticker: 'AAPL' });
      assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'ticker']);
    });

    // ── FP03: single gate strict === 'true' ───────────────────────────────────
    await test('FP03: gate strict === "true"; non-"true"/missing -> FUND_FACTS_SERVER_DISABLED (before token)', async function () {
      const bad = ['1', 'false', 'True', 'TRUE', ' true', 'true ', '', 'yes'];
      for (const v of bad) {
        const env = baseEnv(); env[GATE] = v;
        const r = FF.evaluateFundFactsPreflight({ env: env, authorization: 'garbage-not-a-bearer', ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'FUND_FACTS_SERVER_DISABLED', 'gate value ' + JSON.stringify(v));
      }
      const missing = delEnv(baseEnv(), GATE);
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: missing, authorization: 'garbage', ticker: 'AAPL' }).reason, 'FUND_FACTS_SERVER_DISABLED');
    });

    // ── FP04: inbound token + exact untrimmed Bearer syntax ───────────────────
    await test('FP04: token present + exact Bearer; missing and mismatch both -> UNAUTHORIZED (no oracle)', async function () {
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: delEnv(baseEnv(), TOKEN), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [TOKEN]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      const auths = [undefined, null, '', 'Bearer wrong', 'bearer ' + GOOD_TOKEN, 'BEARER ' + GOOD_TOKEN, GOOD_TOKEN,
        'Bearer  ' + GOOD_TOKEN, 'Bearer ' + GOOD_TOKEN + ' ', ' Bearer ' + GOOD_TOKEN];
      for (const a of auths) {
        const r = FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: a, ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'UNAUTHORIZED', 'authorization ' + JSON.stringify(a));
      }
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── FP05: whitespace-only token is "present" (non-empty), exact match works
    await test('FP05: whitespace-only token counts as present; exact untrimmed match authenticates', async function () {
      const env = baseEnv({ [TOKEN]: '   ' });
      const okR = FF.evaluateFundFactsPreflight({ env: env, authorization: 'Bearer    ', ticker: 'AAPL' });
      assert.deepStrictEqual(okR, { ok: true, ticker: 'AAPL' });
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: env, authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
    });

    // ── FP06: collision only vs the two named domain tokens ───────────────────
    await test('FP06: collision only vs PULL/WRITE tokens; absent/empty/unrelated are not collisions', async function () {
      // collision with the pull token
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'TOKEN_COLLISION');
      // collision with the write token
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [WRITE_TOKEN]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'TOKEN_COLLISION');
      // both comparison tokens absent -> no collision (reaches ok)
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // comparison tokens present but different -> ok
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: 'other-1', [WRITE_TOKEN]: 'other-2' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // empty-string comparison tokens -> not a collision
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: '', [WRITE_TOKEN]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // an UNRELATED token env var equal to the fund token must NOT collide
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ PT_OWNER_TOKEN: GOOD_TOKEN, PT_SOME_OTHER_TOKEN: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
      // collision is checked BEFORE UA — it preempts a missing UA
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: delEnv(baseEnv({ [PULL_TOKEN]: GOOD_TOKEN }), UA_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'TOKEN_COLLISION');
    });

    // ── FP07: SEC_USER_AGENT present only if non-empty after trim ─────────────
    await test('FP07: SEC_USER_AGENT missing / empty / whitespace-only / non-string -> SEC_USER_AGENT_MISSING; valid passes', async function () {
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: delEnv(baseEnv(), UA_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING');
      for (const v of ['', '   ', '\t\n ']) {
        assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [UA_KEY]: v }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING', 'ua ' + JSON.stringify(v));
      }
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [UA_KEY]: 123 }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING');
      // valid non-empty UA passes this step (reaches ok for an allowlisted ticker)
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [UA_KEY]: 'X/1.0 a@b.co' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── FP08: allowlist reasons surfaced through the preflight ────────────────
    await test('FP08: allowlist absent -> ALLOWLIST_MISSING; malformed -> ALLOWLIST_INVALID (via preflight)', async function () {
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: '   ' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL,aa-pl' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_INVALID');
    });

    // ── FP09: request ticker strict + non-normalized ──────────────────────────
    await test('FP09: request ticker strict, NON-normalized -> lowercase/padded/punct is TICKER_INVALID (not membership)', async function () {
      for (const t of ['aapl', ' AAPL', 'AAPL ', '123', 'ABCDEFGHIJK', 'AA.PL', 'AA-PL', 'AA_PL', 'AAP1']) {
        assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'ticker ' + JSON.stringify(t));
      }
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── FP10: Unicode + non-string tickers -> TICKER_INVALID ──────────────────
    await test('FP10: Unicode and non-string request tickers -> TICKER_INVALID', async function () {
      const unicode = ['AAPÉ', 'ААPL', 'AAPL​', 'ＡＡPL']; // accent, Cyrillic A, ZWSP, fullwidth
      for (const t of unicode) {
        assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'unicode ' + JSON.stringify(t));
      }
      for (const t of [123, null, undefined, {}, [], true, NaN]) {
        assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'non-string ' + String(t));
      }
    });

    // ── FP11: membership — valid but unlisted -> TICKER_NOT_ALLOWED ────────────
    await test('FP11: valid ticker not in allowlist -> TICKER_NOT_ALLOWED; listed -> ok', async function () {
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
      // case-insensitive allowlist entries: a lowercase env entry still matches an uppercase request
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'tsla' }), authorization: GOOD_AUTH, ticker: 'TSLA' }).ok, true);
    });

    // ── FP12: explicit first-failure ordering chain (spec §2.1) ───────────────
    await test('FP12: first-failure ordering — each earlier failure preempts all later ones', async function () {
      // 1 gate off preempts everything
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [GATE]: 'x', [PULL_TOKEN]: GOOD_TOKEN, [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: 'nope', ticker: 'lower' }).reason, 'FUND_FACTS_SERVER_DISABLED');
      // 2 unauthorized (gate on, bad auth) preempts collision/UA/allowlist/ticker
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: GOOD_TOKEN, [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: 'nope', ticker: 'lower' }).reason, 'UNAUTHORIZED');
      // 3 collision (authed) preempts UA/allowlist/ticker
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: GOOD_TOKEN, [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'TOKEN_COLLISION');
      // 4 UA missing (no collision) preempts allowlist/ticker
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'SEC_USER_AGENT_MISSING');
      // 5 allowlist invalid preempts ticker
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'ALLOWLIST_INVALID');
      // 6 ticker invalid preempts membership
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'TICKER_INVALID');
      // 7 not allowed (last)
      assert.strictEqual(FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
    });

    // ── FP13: exact key sets across success and every failure reason ──────────
    await test('FP13: every result is exactly { ok:true, ticker } or { ok:false, reason }', async function () {
      const results = [
        FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }),                    // ok
        FF.evaluateFundFactsPreflight({ env: baseEnv({ [GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: 'no', ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv({ [PULL_TOKEN]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv({ [UA_KEY]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'lower' }),
        FF.evaluateFundFactsPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' })
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

    // ── FP14: input non-mutation ──────────────────────────────────────────────
    await test('FP14: evaluateFundFactsPreflight mutates none of its inputs; returns ticker verbatim', async function () {
      const env = baseEnv({ [PULL_TOKEN]: 'other-1' });
      const envSnap = JSON.stringify(env);
      const input = { env: env, authorization: GOOD_AUTH, ticker: 'AAPL' };
      const inputSnap = JSON.stringify({ authorization: input.authorization, ticker: input.ticker });
      const r = FF.evaluateFundFactsPreflight(input);
      assert.strictEqual(r.ticker, input.ticker, 'ticker returned verbatim');
      assert.strictEqual(JSON.stringify(env), envSnap, 'env mutated');
      assert.strictEqual(JSON.stringify({ authorization: input.authorization, ticker: input.ticker }), inputSnap, 'input mutated');
      const frozen = Object.freeze(baseEnv());
      assert.doesNotThrow(function () { FF.evaluateFundFactsPreflight({ env: frozen, authorization: GOOD_AUTH, ticker: 'AAPL' }); });
    });

    // ── FP15: reason vocabulary is confined to the approved eight ─────────────
    await test('FP15: every failure reason is confined to the approved eight-reason vocabulary (all eight reachable)', async function () {
      const battery = [
        { env: baseEnv({ [GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv(), authorization: 'nope', ticker: 'AAPL' },
        { env: baseEnv({ [PULL_TOKEN]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv({ [WRITE_TOKEN]: GOOD_TOKEN }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv({ [UA_KEY]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'AAPL' },
        { env: baseEnv(), authorization: GOOD_AUTH, ticker: 'lower' },
        { env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }
      ];
      const seen = new Set();
      for (const inp of battery) {
        const r = FF.evaluateFundFactsPreflight(inp);
        assert.strictEqual(r.ok, false);
        assert.ok(REASON_VOCAB.indexOf(r.reason) !== -1, 'reason outside vocabulary: ' + r.reason);
        seen.add(r.reason);
      }
      assert.strictEqual(seen.size, REASON_VOCAB.length, 'battery did not cover all reasons: ' + Array.from(seen).sort().join(','));
    });

    // ── FP20: parseAllowedTickers — missing vs invalid vs shapes ──────────────
    await test('FP20: parseAllowedTickers missing/blank/delimiter-only -> ALLOWLIST_MISSING; non-string -> ALLOWLIST_INVALID', async function () {
      for (const raw of [undefined, null, '', '   ', '\t\n', ',', ', ,', ' , , ']) {
        assert.strictEqual(FF.parseAllowedTickers(raw).reason, 'ALLOWLIST_MISSING', 'missing raw ' + JSON.stringify(raw));
      }
      for (const raw of [123, 0, {}, [], true, false, function () {}]) {
        const r = FF.parseAllowedTickers(raw);
        assert.strictEqual(r.reason, 'ALLOWLIST_INVALID', 'non-string raw ' + String(raw));
        assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'reason']);
      }
    });

    // ── FP21: parseAllowedTickers — delimiters, normalization, dedupe ─────────
    await test('FP21: mixed delimiters parse; lowercase uppercased; duplicates dedupe (exact shapes)', async function () {
      const mixed = FF.parseAllowedTickers('AAPL, MSFT\tNVDA\nTSLA GOOG');
      assert.strictEqual(mixed.ok, true);
      assert.deepStrictEqual(Object.keys(mixed).sort(), ['ok', 'tickers']);
      assert.strictEqual(mixed.tickers.size, 5);
      assert.ok(mixed.tickers.has('AAPL') && mixed.tickers.has('GOOG'));

      const lower = FF.parseAllowedTickers('aapl, msft');
      assert.strictEqual(lower.ok, true);
      assert.deepStrictEqual(Array.from(lower.tickers).sort(), ['AAPL', 'MSFT']);

      const dup = FF.parseAllowedTickers('AAPL,AAPL,aapl , AAPL');
      assert.strictEqual(dup.ok, true);
      assert.strictEqual(dup.tickers.size, 1);
      assert.ok(dup.tickers.has('AAPL'));
    });

    // ── FP22: parseAllowedTickers — malformed entries reject the whole list ────
    await test('FP22: any malformed entry rejects the whole list (fail-closed-loud), incl. Unicode case-fold expansion', async function () {
      for (const raw of ['AAPL,aa-pl', 'AAPL1', 'ABCDEFGHIJK', 'AAPL,MSFT.', 'AA PL!', 'AAPL,,MS_FT']) {
        assert.strictEqual(FF.parseAllowedTickers(raw).reason, 'ALLOWLIST_INVALID', 'malformed raw ' + JSON.stringify(raw));
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
          FF.parseAllowedTickers(u),
          { ok: false, reason: 'ALLOWLIST_INVALID' }
        );
      }
      // a valid ASCII ticker mixed with a Unicode token rejects the WHOLE list
      assert.deepStrictEqual(
        FF.parseAllowedTickers('AAPL,' + sharpS),
        { ok: false, reason: 'ALLOWLIST_INVALID' }
      );
      assert.deepStrictEqual(
        FF.parseAllowedTickers(ligatureFF + ' AAPL'),
        { ok: false, reason: 'ALLOWLIST_INVALID' }
      );
      // regression: lowercase ASCII still normalizes to uppercase and is accepted
      const low = FF.parseAllowedTickers('aapl');
      assert.strictEqual(low.ok, true);
      assert.ok(low.tickers.has('AAPL'));
      // regression: valid ASCII dedupe still works after normalization
      const dup = FF.parseAllowedTickers('AAPL,aapl,AAPL');
      assert.strictEqual(dup.ok, true);
      assert.strictEqual(dup.tickers.size, 1);
      assert.ok(dup.tickers.has('AAPL'));
    });

    // ── FP23: distinct-size boundary 25/26 ────────────────────────────────────
    await test('FP23: distinct allowlist size boundary — 25 ok, 26 -> ALLOWLIST_INVALID', async function () {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const twentyFive = FF.parseAllowedTickers(L.slice(0, 25).join(','));
      assert.strictEqual(twentyFive.ok, true);
      assert.strictEqual(twentyFive.tickers.size, 25);
      assert.strictEqual(FF.parseAllowedTickers(L.join(',')).reason, 'ALLOWLIST_INVALID'); // 26 distinct
    });

    // ── FP24: raw-token boundary 100/101 (measured BEFORE dedupe) ─────────────
    await test('FP24: raw token count boundary — 100 ok, 101 -> ALLOWLIST_INVALID (before dedupe)', async function () {
      const hundred = FF.parseAllowedTickers(new Array(100).fill('AAPL').join(','));
      assert.strictEqual(hundred.ok, true);
      assert.strictEqual(hundred.tickers.size, 1); // dedupes to 1 distinct, but 100 raw is allowed
      assert.strictEqual(FF.parseAllowedTickers(new Array(101).fill('AAPL').join(',')).reason, 'ALLOWLIST_INVALID');
    });

    // ── FP25: raw character-length guard ──────────────────────────────────────
    await test('FP25: pathological over-length raw string -> ALLOWLIST_INVALID (char guard)', async function () {
      assert.strictEqual(FF.parseAllowedTickers('A'.repeat(3000)).reason, 'ALLOWLIST_INVALID');
      assert.strictEqual(FF.parseAllowedTickers('AAPL, MSFT, NVDA').ok, true);
    });

    // ── FP26: DIRECT ticker fixtures — isolate the format rule, no oracle ──────
    await test('FP26: DIRECT ticker fixtures isolate the /^[A-Z]{1,10}$/ format rule (no cross-module oracle)', async function () {
      // The allowlist contains every FORMAT-valid entry below, so a format-valid
      // ticker reaches ok / TICKER_NOT_ALLOWED (never TICKER_INVALID) — isolating
      // format (step 6) from membership (step 7) with NO writer/drift oracle.
      const allow = 'AAPL A ABCDEFGHIJ BRKB';
      const cases = [
        { t: 'AAPL', valid: true },
        { t: 'A', valid: true },
        { t: 'ABCDEFGHIJ', valid: true },   // 10 chars, upper bound
        { t: 'BRKB', valid: true },
        { t: 'ZZZZZ', valid: true },         // format-valid, not listed -> NOT_ALLOWED
        { t: 'aapl', valid: false },         // lowercase
        { t: ' AAPL', valid: false },        // leading space
        { t: 'AAPL ', valid: false },        // trailing space
        { t: '', valid: false },             // empty
        { t: 'AA.PL', valid: false },        // punctuation
        { t: 'AA-PL', valid: false },        // hyphen
        { t: 'AA_PL', valid: false },        // underscore
        { t: 'AAP1', valid: false },         // digit
        { t: '1AAPL', valid: false },        // leading digit
        { t: 'ABCDEFGHIJK', valid: false },  // 11 chars, over bound
        { t: 'AAPL!', valid: false }         // punctuation
      ];
      for (const c of cases) {
        const r = FF.evaluateFundFactsPreflight({ env: baseEnv({ [ALLOW_KEY]: allow }), authorization: GOOD_AUTH, ticker: c.t });
        const formatValid = (r.ok === true) || (r.ok === false && r.reason !== 'TICKER_INVALID');
        assert.strictEqual(formatValid, c.valid, 'format-validity mismatch for ticker ' + JSON.stringify(c.t));
      }
    });

    // ── FP40: static purity of the TARGET module (comment-stripped scan) ──────
    await test('FP40: preflight module is static-pure (comment-stripped scan: no process.env / require / I/O / handler / storage / scoring)', async function () {
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
      // exposes exactly the two pure entrypoints
      assert.ok(/module\.exports\s*=\s*\{\s*evaluateFundFactsPreflight\s*,\s*parseAllowedTickers\s*\}/.test(code), 'exact export set missing');
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
