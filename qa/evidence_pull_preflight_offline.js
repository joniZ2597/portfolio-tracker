'use strict';

/*
 * qa/evidence_pull_preflight_offline.js
 *
 * Real Portfolio Evidence Pull — Slice 2E preflight + allowlist offline harness
 * (PF-series). Exercises the PURE, DORMANT helper
 * (netlify/functions/lib/evidence-pull-preflight.js) with ZERO real
 * network / Blob / env / production. Every case injects an env object +
 * authorization + ticker; nothing ambient is read.
 *
 * It also cross-checks the local ticker rule against the downstream write-path
 * validator (evidence-writer.js validateWritePayload) — the PF-DRIFT test —
 * used ONLY as an equivalence oracle, never wired to any live path.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { validateWritePayload } = require('../netlify/functions/lib/evidence-writer');

const ROOT = path.resolve(__dirname, '..');
const MODULE_REL = 'netlify/functions/lib/evidence-pull-preflight.js';

// The helper is loaded UNDER the network guard inside PF01 (import-inertness
// proof), then reused by the remaining tests.
let PF = null;

// ── env key names ─────────────────────────────────────────────────────────────
const PULL_GATE   = 'PT_ENABLE_SEC_EVIDENCE_PULL_SERVER';
const WRITER_GATE = 'PT_ENABLE_SEC_EVIDENCE_STORE_WRITER_SERVER';
const PULL_TOKEN  = 'PT_SEC_EVIDENCE_PULL_TOKEN';
const WRITE_TOKEN = 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN';
const UA_KEY      = 'SEC_USER_AGENT';
const ALLOW_KEY   = 'PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS';

const GOOD_PULL_TOKEN  = 'pull-token-aaaa1111';
const GOOD_WRITE_TOKEN = 'write-token-bbbb2222';
const GOOD_UA          = 'PulseSlice2ETest/1.0 qa@example.com';
const GOOD_AUTH        = 'Bearer ' + GOOD_PULL_TOKEN;

// A fully valid env (all nine checks pass for an allowlisted ticker). Overrides
// replace individual keys; passing undefined via a delete-style override is done
// by the caller with delEnv().
function baseEnv(overrides) {
  const e = {};
  e[PULL_GATE]   = 'true';
  e[WRITER_GATE] = 'true';
  e[PULL_TOKEN]  = GOOD_PULL_TOKEN;
  e[WRITE_TOKEN] = GOOD_WRITE_TOKEN;
  e[UA_KEY]      = GOOD_UA;
  e[ALLOW_KEY]   = 'AAPL, MSFT NVDA';
  return Object.assign(e, overrides || {});
}
function delEnv(env, key) { const e = Object.assign({}, env); delete e[key]; return e; }

// ── PF-DRIFT oracle payload (mirrors what validateWritePayload accepts) ───────
const VALID_ITEM = {
  evidenceId: 'eid-drift-001',
  category: 'sec10q',
  claim: 'Drift oracle claim',
  direction: 'positive',
  confidence: null,
  requiresVerification: true,
  scoringImpact: 'none'
};
const VALID_CIK = '0000320193';
function writerAcceptsTicker(t) {
  return validateWritePayload({ ticker: t, cik: VALID_CIK, evidenceItems: [VALID_ITEM] }).ok === true;
}

// ── tiny runner (mirrors qa/run-writer-offline.js) ────────────────────────────
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
  process.stdout.write('\n=== Real Portfolio Evidence Pull — Slice 2E (preflight + allowlist, offline) ===\n\n');

  // Behavioral network guard: any real global.fetch is a hard error. The helper
  // is pure and must never touch it. Restored in the finally below.
  let realFetchCalls = 0;
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function () { realFetchCalls += 1; throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  try {
    // ── PF01: import inertness ────────────────────────────────────────────────
    await test('PF01: module import is inert (no network / no throw) and exposes both entrypoints', async function () {
      const before = realFetchCalls;
      PF = require('../netlify/functions/lib/evidence-pull-preflight');
      assert.strictEqual(typeof PF.evaluatePullPreflight, 'function', 'evaluatePullPreflight missing');
      assert.strictEqual(typeof PF.parseAllowedTickers, 'function', 'parseAllowedTickers missing');
      assert.strictEqual(realFetchCalls, before, 'import performed a network fetch');
    });

    // ── PF02: all-pass → exact { ok: true, ticker } ───────────────────────────
    await test('PF02: full valid env + allowlisted ticker -> { ok: true, ticker } (exact key set)', async function () {
      const r = PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' });
      assert.deepStrictEqual(r, { ok: true, ticker: 'AAPL' });
      assert.deepStrictEqual(Object.keys(r).sort(), ['ok', 'ticker']);
    });

    // ── PF03: pull gate strict — only the string 'true' succeeds ──────────────
    await test('PF03: pull gate is strict === "true"; non-"true" -> PULL_SERVER_DISABLED (before token)', async function () {
      const bad = ['1', 'false', 'True', 'TRUE', ' true', 'true ', '', 'yes'];
      for (const v of bad) {
        const env = baseEnv(); env[PULL_GATE] = v;
        const r = PF.evaluatePullPreflight({ env: env, authorization: 'garbage-not-a-bearer', ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'PULL_SERVER_DISABLED', 'pull gate value ' + JSON.stringify(v));
      }
      const missing = delEnv(baseEnv(), PULL_GATE);
      assert.strictEqual(PF.evaluatePullPreflight({ env: missing, authorization: 'garbage', ticker: 'AAPL' }).reason, 'PULL_SERVER_DISABLED');
    });

    // ── PF04: writer gate strict, checked before the token ────────────────────
    await test('PF04: writer gate strict === "true"; off -> WRITER_SERVER_DISABLED (before token)', async function () {
      for (const v of ['1', 'false', '', 'TRUE']) {
        const env = baseEnv(); env[WRITER_GATE] = v;
        const r = PF.evaluatePullPreflight({ env: env, authorization: 'garbage', ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'WRITER_SERVER_DISABLED', 'writer gate value ' + JSON.stringify(v));
      }
      const missing = delEnv(baseEnv(), WRITER_GATE);
      assert.strictEqual(PF.evaluatePullPreflight({ env: missing, authorization: 'garbage', ticker: 'AAPL' }).reason, 'WRITER_SERVER_DISABLED');
    });

    // ── PF05: inbound token + exact untrimmed Bearer syntax ───────────────────
    await test('PF05: token present + exact Bearer; missing and mismatch both -> UNAUTHORIZED (no oracle)', async function () {
      // token env missing / empty
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv(), PULL_TOKEN), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [PULL_TOKEN]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
      // authorization variants that must all fail (exact, untrimmed)
      const auths = [undefined, null, '', 'Bearer wrong', 'bearer ' + GOOD_PULL_TOKEN, GOOD_PULL_TOKEN,
        'Bearer  ' + GOOD_PULL_TOKEN, 'Bearer ' + GOOD_PULL_TOKEN + ' ', ' Bearer ' + GOOD_PULL_TOKEN];
      for (const a of auths) {
        const r = PF.evaluatePullPreflight({ env: baseEnv(), authorization: a, ticker: 'AAPL' });
        assert.strictEqual(r.reason, 'UNAUTHORIZED', 'authorization ' + JSON.stringify(a));
      }
      // exact match passes step 3 (reaches ok)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── PF06: whitespace-only token is "present" (non-empty), exact match works
    await test('PF06: whitespace-only pull token counts as present; exact untrimmed match authenticates', async function () {
      const env = baseEnv({ [PULL_TOKEN]: '   ' });
      // exact Bearer + 3 spaces authenticates and (allowlisted ticker) -> ok
      const okR = PF.evaluatePullPreflight({ env: env, authorization: 'Bearer    ', ticker: 'AAPL' });
      assert.deepStrictEqual(okR, { ok: true, ticker: 'AAPL' });
      // a non-matching auth against the whitespace token -> UNAUTHORIZED
      assert.strictEqual(PF.evaluatePullPreflight({ env: env, authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
    });

    // ── PF07: writer token presence (after inbound auth) ──────────────────────
    await test('PF07: write token missing/empty -> WRITER_TOKEN_MISSING (auth still checked first)', async function () {
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv(), WRITE_TOKEN), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'WRITER_TOKEN_MISSING');
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [WRITE_TOKEN]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'WRITER_TOKEN_MISSING');
      // precedence: bad auth + missing write token -> UNAUTHORIZED wins
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv(), WRITE_TOKEN), authorization: 'nope', ticker: 'AAPL' }).reason, 'UNAUTHORIZED');
    });

    // ── PF08: token collision ─────────────────────────────────────────────────
    await test('PF08: pull token === write token -> TOKEN_COLLISION', async function () {
      const env = baseEnv({ [PULL_TOKEN]: 'shared-secret', [WRITE_TOKEN]: 'shared-secret' });
      const r = PF.evaluatePullPreflight({ env: env, authorization: 'Bearer shared-secret', ticker: 'AAPL' });
      assert.strictEqual(r.reason, 'TOKEN_COLLISION');
      // collision even preempts a missing UA (checked after collision)
      const env2 = delEnv(baseEnv({ [PULL_TOKEN]: 'shared-secret', [WRITE_TOKEN]: 'shared-secret' }), UA_KEY);
      assert.strictEqual(PF.evaluatePullPreflight({ env: env2, authorization: 'Bearer shared-secret', ticker: 'AAPL' }).reason, 'TOKEN_COLLISION');
    });

    // ── PF09: SEC_USER_AGENT present only if non-empty after trim ─────────────
    await test('PF09: SEC_USER_AGENT missing / empty / whitespace-only / non-string -> SEC_USER_AGENT_MISSING', async function () {
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv(), UA_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING');
      for (const v of ['', '   ', '\t\n ']) {
        assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [UA_KEY]: v }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING', 'ua ' + JSON.stringify(v));
      }
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [UA_KEY]: 123 }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'SEC_USER_AGENT_MISSING');
    });

    // ── PF10: allowlist reasons surfaced through the preflight ────────────────
    await test('PF10: allowlist absent -> ALLOWLIST_MISSING; malformed -> ALLOWLIST_INVALID (via preflight)', async function () {
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: '   ' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_MISSING');
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL,aa-pl' }), authorization: GOOD_AUTH, ticker: 'AAPL' }).reason, 'ALLOWLIST_INVALID');
    });

    // ── PF11: request ticker strict + non-normalized ──────────────────────────
    await test('PF11: request ticker strict, NON-normalized -> lowercase/padded is TICKER_INVALID (not membership)', async function () {
      // allowlist has AAPL, but a lowercase/padded request is INVALID, not NOT_ALLOWED
      for (const t of ['aapl', ' AAPL', 'AAPL ', '123', 'ABCDEFGHIJK', 'AA.PL', 'AA-PL']) {
        assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'ticker ' + JSON.stringify(t));
      }
      // valid + allowlisted passes
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }).ok, true);
    });

    // ── PF12: Unicode + non-string tickers -> TICKER_INVALID ──────────────────
    await test('PF12: Unicode and non-string request tickers -> TICKER_INVALID', async function () {
      const unicode = ['AAPÉ', 'ААPL', 'AAPL​', 'ＡＡPL']; // accent, Cyrillic A, ZWSP, fullwidth
      for (const t of unicode) {
        assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'unicode ' + JSON.stringify(t));
      }
      for (const t of [123, null, undefined, {}, [], true, NaN]) {
        assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: t }).reason, 'TICKER_INVALID', 'non-string ' + String(t));
      }
    });

    // ── PF13: membership — valid but unlisted -> TICKER_NOT_ALLOWED ───────────
    await test('PF13: valid ticker not in allowlist -> TICKER_NOT_ALLOWED; listed -> ok', async function () {
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
      // case-insensitive allowlist entries: a lowercase env entry still matches an uppercase request
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: 'tsla' }), authorization: GOOD_AUTH, ticker: 'TSLA' }).ok, true);
    });

    // ── PF14: explicit first-failure ordering chain ───────────────────────────
    await test('PF14: first-failure ordering — each earlier failure preempts all later ones', async function () {
      const allBad = { authorization: 'nope', ticker: 'lower' };
      // 1 pull gate off preempts everything
      assert.strictEqual(PF.evaluatePullPreflight(Object.assign({ env: baseEnv({ [PULL_GATE]: 'x', [WRITER_GATE]: 'x', [ALLOW_KEY]: '!!' }) }, allBad)).reason, 'PULL_SERVER_DISABLED');
      // 2 writer gate off (pull on)
      assert.strictEqual(PF.evaluatePullPreflight(Object.assign({ env: baseEnv({ [WRITER_GATE]: 'x', [ALLOW_KEY]: '!!' }) }, allBad)).reason, 'WRITER_SERVER_DISABLED');
      // 3 unauthorized (gates on)
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv({ [ALLOW_KEY]: '!!', [UA_KEY]: '' }), WRITE_TOKEN), authorization: 'nope', ticker: 'lower' }).reason, 'UNAUTHORIZED');
      // 4 writer token missing (authed)
      assert.strictEqual(PF.evaluatePullPreflight({ env: delEnv(baseEnv({ [ALLOW_KEY]: '!!', [UA_KEY]: '' }), WRITE_TOKEN), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'WRITER_TOKEN_MISSING');
      // 5 collision (before UA/allowlist/ticker)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [PULL_TOKEN]: 's', [WRITE_TOKEN]: 's', [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: 'Bearer s', ticker: 'lower' }).reason, 'TOKEN_COLLISION');
      // 6 UA missing (before allowlist/ticker)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [UA_KEY]: '', [ALLOW_KEY]: '!!' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'SEC_USER_AGENT_MISSING');
      // 7 allowlist invalid (before ticker)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'ALLOWLIST_INVALID');
      // 8 ticker invalid (before membership)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'lower' }).reason, 'TICKER_INVALID');
      // 9 not allowed (last)
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' }).reason, 'TICKER_NOT_ALLOWED');
    });

    // ── PF15: exact key sets across success and every failure reason ──────────
    await test('PF15: every result is exactly { ok:true, ticker } or { ok:false, reason }', async function () {
      const results = [
        PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'AAPL' }),                 // ok
        PF.evaluatePullPreflight({ env: baseEnv({ [PULL_GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv({ [WRITER_GATE]: 'x' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv(), authorization: 'no', ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: delEnv(baseEnv(), WRITE_TOKEN), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv({ [PULL_TOKEN]: 's', [WRITE_TOKEN]: 's' }), authorization: 'Bearer s', ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv({ [UA_KEY]: '' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: delEnv(baseEnv(), ALLOW_KEY), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: 'AAPL1' }), authorization: GOOD_AUTH, ticker: 'AAPL' }),
        PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'lower' }),
        PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 'TSLA' })
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

    // ── PF16: input non-mutation ──────────────────────────────────────────────
    await test('PF16: evaluatePullPreflight mutates none of its inputs; returns ticker verbatim', async function () {
      const env = baseEnv();
      const envSnap = JSON.stringify(env);
      const input = { env: env, authorization: GOOD_AUTH, ticker: 'AAPL' };
      const inputSnap = JSON.stringify({ authorization: input.authorization, ticker: input.ticker });
      const r = PF.evaluatePullPreflight(input);
      assert.strictEqual(r.ticker, input.ticker, 'ticker returned verbatim');
      assert.strictEqual(JSON.stringify(env), envSnap, 'env mutated');
      assert.strictEqual(JSON.stringify({ authorization: input.authorization, ticker: input.ticker }), inputSnap, 'input mutated');
      // a frozen env must not throw (no writes attempted)
      const frozen = Object.freeze(baseEnv());
      assert.doesNotThrow(function () { PF.evaluatePullPreflight({ env: frozen, authorization: GOOD_AUTH, ticker: 'AAPL' }); });
    });

    // ── PF20: parseAllowedTickers — missing vs invalid vs ok ──────────────────
    await test('PF20: parseAllowedTickers missing/blank/zero-token -> ALLOWLIST_MISSING; non-string -> ALLOWLIST_INVALID', async function () {
      for (const raw of [undefined, null, '', '   ', '\t\n', ',', ', ,', ' , , ']) {
        assert.strictEqual(PF.parseAllowedTickers(raw).reason, 'ALLOWLIST_MISSING', 'missing raw ' + JSON.stringify(raw));
      }
      for (const raw of [123, 0, {}, [], true, false, function () {}]) {
        assert.strictEqual(PF.parseAllowedTickers(raw).reason, 'ALLOWLIST_INVALID', 'non-string raw ' + String(raw));
      }
    });

    // ── PF21: parseAllowedTickers — delimiters, normalization, dedupe ─────────
    await test('PF21: mixed delimiters parse; lowercase uppercased; duplicates dedupe', async function () {
      const mixed = PF.parseAllowedTickers('AAPL, MSFT\tNVDA\nTSLA GOOG');
      assert.strictEqual(mixed.ok, true);
      assert.strictEqual(mixed.tickers.size, 5);
      assert.ok(mixed.tickers.has('AAPL') && mixed.tickers.has('GOOG'));

      const lower = PF.parseAllowedTickers('aapl, msft');
      assert.strictEqual(lower.ok, true);
      assert.deepStrictEqual(Array.from(lower.tickers).sort(), ['AAPL', 'MSFT']);

      const dup = PF.parseAllowedTickers('AAPL,AAPL,aapl , AAPL');
      assert.strictEqual(dup.ok, true);
      assert.strictEqual(dup.tickers.size, 1);
      assert.ok(dup.tickers.has('AAPL'));
    });

    // ── PF22: parseAllowedTickers — malformed entries -> ALLOWLIST_INVALID ─────
    await test('PF22: any malformed entry rejects the whole list (fail-closed-loud)', async function () {
      for (const raw of ['AAPL,aa-pl', 'AAPL1', 'ABCDEFGHIJK', 'AAPL,MSFT.', 'AA PL!', 'AAPL,,MS_FT']) {
        assert.strictEqual(PF.parseAllowedTickers(raw).reason, 'ALLOWLIST_INVALID', 'malformed raw ' + JSON.stringify(raw));
      }
    });

    // ── PF23: distinct-size boundary 25/26 ────────────────────────────────────
    await test('PF23: distinct allowlist size boundary — 25 ok, 26 -> ALLOWLIST_INVALID', async function () {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const twentyFive = PF.parseAllowedTickers(L.slice(0, 25).join(','));
      assert.strictEqual(twentyFive.ok, true);
      assert.strictEqual(twentyFive.tickers.size, 25);
      assert.strictEqual(PF.parseAllowedTickers(L.join(',')).reason, 'ALLOWLIST_INVALID'); // 26 distinct
    });

    // ── PF24: raw-token boundary 100/101 (measured BEFORE dedup) ──────────────
    await test('PF24: raw token count boundary — 100 ok, 101 -> ALLOWLIST_INVALID (before dedup)', async function () {
      const hundred = PF.parseAllowedTickers(new Array(100).fill('AAPL').join(','));
      assert.strictEqual(hundred.ok, true);
      assert.strictEqual(hundred.tickers.size, 1); // dedupes to 1 distinct, but 100 raw is allowed
      assert.strictEqual(PF.parseAllowedTickers(new Array(101).fill('AAPL').join(',')).reason, 'ALLOWLIST_INVALID');
    });

    // ── PF25: raw character-length guard ──────────────────────────────────────
    await test('PF25: pathological over-length raw string -> ALLOWLIST_INVALID (char guard)', async function () {
      assert.strictEqual(PF.parseAllowedTickers('A'.repeat(3000)).reason, 'ALLOWLIST_INVALID');
      // a normal-length valid list is unaffected
      assert.strictEqual(PF.parseAllowedTickers('AAPL, MSFT, NVDA').ok, true);
    });

    // ── PF30: PF-DRIFT — preflight ticker acceptance == writer acceptance ──────
    await test('PF30: PF-DRIFT — ticker-format acceptance matches evidence-writer validateWritePayload', async function () {
      const table = ['AAPL', 'A', 'ABCDEFGHIJ', 'MSFT', 'aapl', '123', ' AAPL', 'ABCDEFGHIJK', '', 'AA.PL', 'ZZZZZZZZZZ'];
      // allowlist contains every FORMAT-valid entry so a valid ticker reaches ok /
      // NOT_ALLOWED (never TICKER_INVALID) — isolating step 8 (format) from step 9.
      const allow = 'AAPL A ABCDEFGHIJ MSFT ZZZZZZZZZZ';
      for (const t of table) {
        const pf = PF.evaluatePullPreflight({ env: baseEnv({ [ALLOW_KEY]: allow }), authorization: GOOD_AUTH, ticker: t });
        const preflightFormatValid = pf.ok === true || (pf.ok === false && pf.reason !== 'TICKER_INVALID');
        assert.strictEqual(preflightFormatValid, writerAcceptsTicker(t), 'PF-DRIFT mismatch for ticker ' + JSON.stringify(t));
      }
      // non-string ticker: both reject
      assert.strictEqual(PF.evaluatePullPreflight({ env: baseEnv(), authorization: GOOD_AUTH, ticker: 123 }).reason, 'TICKER_INVALID');
      assert.strictEqual(writerAcceptsTicker(123), false);
    });

    // ── PF31: every parsed allowlist member is writer-acceptable ──────────────
    await test('PF31: every parsed allowlist member passes validateWritePayload ticker rule', async function () {
      const parsed = PF.parseAllowedTickers('aapl, msft NVDA, brkb TSLA');
      assert.strictEqual(parsed.ok, true);
      for (const tk of parsed.tickers) {
        assert.ok(writerAcceptsTicker(tk), 'allowlist member not writer-acceptable: ' + tk);
      }
    });

    // ── PF40: static purity of the TARGET module (scan module, not this harness)
    await test('PF40: preflight module is static-pure (no process.env / require / I/O / handler / storage / scoring)', async function () {
      const src = fs.readFileSync(path.join(ROOT, MODULE_REL), 'utf8');
      assert.ok(!/process\.env/.test(src), 'process.env referenced');
      assert.ok(!/\brequire\s*\(/.test(src), 'require( present — module must be self-contained');
      assert.ok(!/@netlify\/blobs/.test(src), '@netlify/blobs referenced');
      assert.ok(!/getStore\s*\(/.test(src), 'getStore( called');
      assert.ok(!/\bstore\.(get|set|delete)/.test(src), 'store access');
      assert.ok(!/\breadRecord\b/.test(src), 'readRecord referenced');
      assert.ok(!/\bfetch\s*\(/.test(src), 'fetch( present');
      assert.ok(!/require\(\s*['"]https?['"]\s*\)/.test(src), 'http/https required');
      assert.ok(!/exports\.handler|module\.exports\.handler|export default/.test(src), 'handler/default export present — no invocation surface allowed');
      assert.ok(!/localStorage|sessionStorage/.test(src), 'web storage referenced');
      assert.ok(!/\b(?:pt_results|pt_tickers|pt_holdings)\b/.test(src), 'pt_* storage key referenced');
      assert.ok(!/\b(?:orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/.test(src), 'scoring ref');
      // exposes exactly the two pure entrypoints
      assert.ok(/module\.exports\s*=\s*\{\s*evaluatePullPreflight\s*,\s*parseAllowedTickers\s*\}/.test(src), 'exact export set missing');
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
