'use strict';

/*
 * S3-M2 — permanent offline QA for services/news-catalysts-client.js.
 *
 * Pure Node, no network, no browser, no live services: every fetch is an
 * injected spy. Covers the brief's CL-1..CL-15 plus the request contract:
 *   CL-1   happy path: exactly the 19 frozen fields per record, persisted order
 *   CL-2   an absent key is unreadable, never null
 *   CL-3   contractVersion mismatch rejects the record before any other field is read
 *   CL-4   conditional-null rules (direction, subType)
 *   CL-5   subType is opaque text — never branched on
 *   CL-6   unknown / reordered keys are rejected, not ignored
 *   CL-7   DEGRADED is a server result, verbatim, three-key envelope
 *   CL-8   NOT_AVAILABLE keeps omitted / asOf / window; omitted 0 vs >0 distinguishable
 *   CL-9   no write, no storage, no pt_* key
 *   CL-10  no skippedItems consumption
 *   CL-11  all 16 HTTP + status + reason combinations across 13 statuses
 *   CL-12  unknown status / reason / wrong HTTP -> the one pinned client result
 *   CL-13  any invalid record fails the whole OK response closed; no drop/repair/count
 *   CL-14  token safety over the adapter source and every returned object
 *   CL-15  exact envelope shape per status (four shapes, key for key)
 *   RQ-1   request contract: POST, Bearer header, body exactly { ticker, asOf }
 *   RQ-2   local input validation before any fetch
 *   RQ-3   failure modes and timeout: the executor never rejects
 *   RQ-4   no wall-clock dependency; asOf is injected
 *   RQ-5   exact CommonJS export surface
 *   RQ-6   request/response ticker and asOf correlation
 *   RQ-7   result-shape sweep: only ok / server / client kinds, pinned key order
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const client = require('../services/news-catalysts-client.js');

const SERVICE_PATH = path.join(__dirname, '..', 'services', 'news-catalysts-client.js');
const SERVICE_SRC = fs.readFileSync(SERVICE_PATH, 'utf8');

let testsPassed = 0;
let testsFailed = 0;
let assertions = 0;

async function test(name, fn) {
  try {
    await fn();
    testsPassed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    testsFailed += 1;
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : String(e)));
  }
}

function ok(cond, label) {
  assertions += 1;
  if (!cond) { throw new Error('assert failed: ' + label); }
}

function eq(actual, expected, label) {
  assertions += 1;
  assert.deepStrictEqual(actual, expected, label);
}

// ── independent pins (deliberately NOT imported from the module) ─────────────

const ASOF = '2026-09-24T12:00:00.000Z';
const WINDOW = { from: '2026-08-25', to: '2026-09-24' };
const TOKEN = 'TOKEN_SENTINEL_m2_7f3a91';

const RECORD_FIELDS = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType', 'sourceTier', 'contractVersion'
];

// [http, status, reason] — the 16 valid combinations of the 13 statuses.
const COMBOS = [
  [200, 'OK', null],
  [200, 'NOT_AVAILABLE', 'NO_RECORD'],
  [200, 'DEGRADED', 'STORE_UNAVAILABLE'],
  [200, 'DEGRADED', 'STORE_RECORD_INVALID'],
  [200, 'DISABLED', 'SERVER_DISABLED'],
  [400, 'INVALID_JSON', 'INVALID_JSON'],
  [400, 'INVALID_REQUEST', 'UNKNOWN_BODY_KEY'],
  [400, 'INVALID_INSTANT', 'INSTANT_INVALID'],
  [400, 'INVALID_TICKER', 'TICKER_INVALID'],
  [401, 'UNAUTHORIZED', 'UNAUTHORIZED'],
  [403, 'TICKER_NOT_ALLOWED', 'TICKER_NOT_ALLOWED'],
  [405, 'METHOD_NOT_ALLOWED', 'METHOD_NOT_ALLOWED'],
  [500, 'CONFIGURATION_MISSING', 'TOKEN_COLLISION'],
  [500, 'CONFIGURATION_MISSING', 'ALLOWLIST_MISSING'],
  [500, 'CONFIGURATION_MISSING', 'ALLOWLIST_INVALID'],
  [500, 'ERROR', 'PREFLIGHT_UNMAPPED']
];
const STATUSES = COMBOS.map(function (c) { return c[1]; })
  .filter(function (s, i, a) { return a.indexOf(s) === i; });
const HTTP_CODES = [200, 400, 401, 403, 405, 500];
const TICKER_STATUSES = ['OK', 'NOT_AVAILABLE', 'DEGRADED'];
const PLAIN_STATUSES = STATUSES.filter(function (s) { return TICKER_STATUSES.indexOf(s) === -1; });

const PINNED = {
  kind: 'client',
  status: 'CLIENT_INVALID_RESPONSE',
  reason: 'RESPONSE_INVALID',
  ticker: 'AAPL',
  envelope: null
};

// ── fixtures (exact contract key order everywhere) ───────────────────────────

function makeRecord(over) {
  const r = {
    ticker: 'AAPL',
    eventDate: '2026-09-20',
    category: 'guidance_update',
    direction: 'positive',
    sourceUrl: 'https://Example.com/a?x=1#frag',
    normalizedSourceUrl: 'https://example.com/a?x=1',
    sourceDomain: 'example.com',
    provider: 'j3-news-catalysts@job-model-v1',
    retrievedAt: '2026-09-23T10:00:00.000Z',
    identityHash: 'a'.repeat(64),
    provenance: 'retrieval_unverified',
    confidence: null,
    requiresVerification: true,
    scoringImpact: 'none',
    eventType: 'catalyst',
    relevanceScope: 'company',
    subType: null,
    sourceTier: 'perplexity_retrieval',
    contractVersion: 'news-contract-v1'
  };
  Object.keys(over || {}).forEach(function (k) { r[k] = over[k]; });
  return r;
}

function makeOther() {
  return makeRecord({ category: 'other_catalyst', subType: 'buyback_authorization', identityHash: 'b'.repeat(64) });
}

function makeUpcoming() {
  return makeRecord({ eventType: 'upcoming_event', direction: null, identityHash: 'c'.repeat(64) });
}

function makeOk(over) {
  const b = {
    status: 'OK',
    readContractVersion: 'news-catalysts-read-v1',
    ticker: 'AAPL',
    asOf: ASOF,
    window: { from: WINDOW.from, to: WINDOW.to },
    records: [makeRecord()],
    omitted: 0
  };
  Object.keys(over || {}).forEach(function (k) { b[k] = over[k]; });
  return b;
}

function makeNA(over) {
  const b = {
    status: 'NOT_AVAILABLE',
    reason: 'NO_RECORD',
    ticker: 'AAPL',
    asOf: ASOF,
    window: { from: WINDOW.from, to: WINDOW.to },
    omitted: 0
  };
  Object.keys(over || {}).forEach(function (k) { b[k] = over[k]; });
  return b;
}

function bodyFor(status, reason) {
  if (status === 'OK') { return makeOk(); }
  if (status === 'NOT_AVAILABLE') { return makeNA({ reason: reason }); }
  if (status === 'DEGRADED') { return { status: status, reason: reason, ticker: 'AAPL' }; }
  return { status: status, reason: reason };
}

// Normalizer call with the default requested ticker / asOf.
function norm(http, body, ticker, asOf) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return client.normalizeNewsCatalystsReadResponse(http, raw, ticker === undefined ? 'AAPL' : ticker, asOf === undefined ? ASOF : asOf);
}

function isPinned(result, label) {
  eq(result, PINNED, label);
}

function fakeResponse(status, bodyText) {
  return { status: status, text: function () { return Promise.resolve(bodyText); } };
}

function spyFetch(status, body) {
  const calls = [];
  const f = function (url, init) {
    calls.push({ url: url, init: init });
    return Promise.resolve(fakeResponse(status, typeof body === 'string' ? body : JSON.stringify(body)));
  };
  f.calls = calls;
  return f;
}

function req(over, fetchImpl) {
  const o = { ticker: 'AAPL', asOf: ASOF, token: TOKEN, fetchImpl: fetchImpl };
  Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
  return client.requestNewsCatalystsRead(o);
}

// Source with comments removed, for static scans of executable code only.
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}
const SERVICE_CODE = codeOnly(SERVICE_SRC);

(async function main() {
  console.log('news_catalysts_client_test');

  // ── CL-1 ───────────────────────────────────────────────────────────────────
  await test('CL-1: happy path returns exactly the 19 frozen fields per record, in persisted order', function () {
    const body = makeOk({ records: [makeRecord(), makeOther(), makeUpcoming()], omitted: 2 });
    const r = norm(200, body);
    eq(r.kind, 'ok', 'kind ok');
    eq(r.status, 'OK', 'status OK');
    eq(r.reason, null, 'reason null');
    eq(r.ticker, 'AAPL', 'requested ticker');
    eq(r.envelope, body, 'validated envelope returned unchanged');
    eq(Object.keys(r.envelope), ['status', 'readContractVersion', 'ticker', 'asOf', 'window', 'records', 'omitted'], 'envelope key order');
    eq(r.envelope.records.length, 3, 'all records returned');
    r.envelope.records.forEach(function (rec, i) {
      eq(Object.keys(rec), RECORD_FIELDS, 'record ' + i + ' has exactly the 19 fields in order');
    });
    eq(Object.keys(r), ['kind', 'status', 'reason', 'ticker', 'envelope'], 'result key order');
  });

  // ── CL-2 ───────────────────────────────────────────────────────────────────
  await test('CL-2: an absent key is unreadable, never treated as null', function () {
    RECORD_FIELDS.forEach(function (field) {
      const rec = makeRecord();
      delete rec[field];
      isPinned(norm(200, makeOk({ records: [rec] })), 'absent ' + field);
    });
    // The three legitimately-null fields: absent must still be rejected.
    const up = makeUpcoming();
    delete up.direction;
    isPinned(norm(200, makeOk({ records: [up] })), 'absent direction on upcoming_event');
    ok(client._nccValidRecord(makeRecord(), 'AAPL') === true, 'control: complete record valid');
  });

  // ── CL-3 ───────────────────────────────────────────────────────────────────
  await test('CL-3: contractVersion mismatch rejects the record before any other field is interpreted', function () {
    ['news-contract-v2', '', null, 1, undefined].forEach(function (v) {
      const rec = makeRecord({ contractVersion: v });
      if (v === undefined) { delete rec.contractVersion; }
      isPinned(norm(200, makeOk({ records: [rec] })), 'contractVersion ' + String(v));
    });
    // No other field may be read once contractVersion mismatches.
    let touched = 0;
    const probe = {};
    RECORD_FIELDS.forEach(function (f) {
      if (f === 'contractVersion') { probe[f] = 'news-contract-v2'; return; }
      Object.defineProperty(probe, f, { enumerable: true, get: function () { touched += 1; return null; } });
    });
    eq(client._nccValidRecord(probe, 'AAPL'), false, 'mismatched record invalid');
    eq(touched, 0, 'no other field was read');
  });

  // ── CL-4 ───────────────────────────────────────────────────────────────────
  await test('CL-4: conditional-null rules — direction null iff upcoming_event; subType non-empty iff other_catalyst', function () {
    const bad = function (rec, label) { isPinned(norm(200, makeOk({ records: [rec] })), label); };
    bad(makeRecord({ direction: null }), 'catalyst with null direction');
    bad(makeRecord({ direction: 'sideways' }), 'catalyst with unknown direction');
    bad(makeRecord({ direction: undefined }), 'catalyst with undefined direction (dropped by JSON)');
    bad(makeRecord({ eventType: 'upcoming_event', direction: 'positive' }), 'upcoming_event with a direction');
    bad(makeRecord({ eventType: 'upcoming_event', direction: 'neutral' }), 'upcoming_event with neutral');
    bad(makeRecord({ category: 'other_catalyst', subType: null }), 'other_catalyst with null subType');
    bad(makeRecord({ category: 'other_catalyst', subType: '' }), 'other_catalyst with empty subType');
    bad(makeRecord({ category: 'other_catalyst', subType: '   ' }), 'other_catalyst with blank subType');
    bad(makeRecord({ category: 'other_catalyst', subType: 5 }), 'other_catalyst with non-string subType');
    bad(makeRecord({ subType: 'x' }), 'non-other category carrying a subType');
    bad(makeRecord({ subType: '' }), 'non-other category carrying an empty subType');
    ['positive', 'neutral', 'negative'].forEach(function (d) {
      eq(norm(200, makeOk({ records: [makeRecord({ direction: d })] })).kind, 'ok', 'catalyst direction ' + d);
    });
    eq(norm(200, makeOk({ records: [makeUpcoming()] })).kind, 'ok', 'upcoming_event with null direction');
    eq(norm(200, makeOk({ records: [makeOther()] })).kind, 'ok', 'other_catalyst with subType');
  });

  // ── CL-5 ───────────────────────────────────────────────────────────────────
  await test('CL-5: subType is opaque text — every non-empty value accepted verbatim, no branch on its value', function () {
    ['buyback_authorization', 'value_from_a_future_vocabulary', 'a b', 'ＦＯＯ', 'x', 'UPPER', '  padded  '].forEach(function (v) {
      const r = norm(200, makeOk({ records: [makeRecord({ category: 'other_catalyst', subType: v })] }));
      eq(r.kind, 'ok', 'subType accepted: ' + v);
      eq(r.envelope.records[0].subType, v, 'subType preserved verbatim: ' + v);
    });
    const scan = SERVICE_CODE.replace(/typeof\s+[\w.]*subType/g, 'typeof_');
    ok(scan.indexOf('subType') !== -1, 'scan still sees the subType rules');
    ok(!/subType\s*[!=]==?\s*['"]/.test(scan), 'no comparison of subType to a literal');
    ok(!/['"][^'"]*['"]\s*[!=]==?\s*[\w.]*subType/.test(scan), 'no comparison of a literal to subType');
    ok(!/switch\s*\([^)]*subType/.test(scan), 'no switch on subType');
    ok(!/(indexOf|includes|test|match)\s*\([^)]*subType/.test(scan), 'no lookup keyed on subType');
    ok(!/subType\s*\.\s*(indexOf|includes|match|startsWith|endsWith|toLowerCase|toUpperCase)/.test(scan), 'no value inspection of subType');
  });

  // ── CL-6 ───────────────────────────────────────────────────────────────────
  await test('CL-6: unknown or reordered keys are rejected, not ignored', function () {
    const ok1 = makeOk(); ok1.extra = 1;
    isPinned(norm(200, ok1), 'extra key on OK envelope');
    const rec = makeRecord(); rec.extra = 'x';
    isPinned(norm(200, makeOk({ records: [rec] })), 'extra key on a record');
    const w = makeOk(); w.window.extra = 1;
    isPinned(norm(200, w), 'extra key on window');
    const na = makeNA(); na.extra = 1;
    isPinned(norm(200, na), 'extra key on NOT_AVAILABLE');
    isPinned(norm(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'AAPL', extra: 1 }), 'extra key on DEGRADED');
    isPinned(norm(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED', extra: 1 }), 'extra key on a plain error');
    // Reordered record keys.
    const reordered = {};
    RECORD_FIELDS.slice().reverse().forEach(function (f) { reordered[f] = makeRecord()[f]; });
    isPinned(norm(200, makeOk({ records: [reordered] })), 'reordered record keys');
    const env = makeOk();
    const swapped = { readContractVersion: env.readContractVersion, status: env.status, ticker: env.ticker, asOf: env.asOf, window: env.window, records: env.records, omitted: env.omitted };
    isPinned(norm(200, swapped), 'reordered envelope keys');
    isPinned(norm(200, { window: { to: WINDOW.to, from: WINDOW.from }, status: 'OK' }), 'garbage envelope');
    const rw = makeOk(); rw.window = { to: WINDOW.to, from: WINDOW.from };
    isPinned(norm(200, rw), 'reordered window keys');
  });

  // ── CL-7 ───────────────────────────────────────────────────────────────────
  await test('CL-7: DEGRADED is a server result, verbatim — never ok, never empty; three-key envelope', function () {
    ['STORE_UNAVAILABLE', 'STORE_RECORD_INVALID'].forEach(function (reason) {
      const r = norm(200, { status: 'DEGRADED', reason: reason, ticker: 'AAPL' });
      eq(r, { kind: 'server', status: 'DEGRADED', reason: reason, ticker: 'AAPL', envelope: null }, 'DEGRADED ' + reason);
      ok(r.kind !== 'ok', 'never ok');
    });
    isPinned(norm(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }), 'DEGRADED without ticker');
    isPinned(norm(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'MSFT' }), 'DEGRADED with foreign ticker');
    isPinned(norm(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'AAPL', asOf: ASOF, window: WINDOW, omitted: 0 }), 'DEGRADED carrying OK metadata');
    isPinned(norm(500, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'AAPL' }), 'DEGRADED on HTTP 500');
    isPinned(norm(200, { status: 'DEGRADED', reason: 'NO_RECORD', ticker: 'AAPL' }), 'DEGRADED with a foreign reason');
  });

  // ── CL-8 ───────────────────────────────────────────────────────────────────
  await test('CL-8: NOT_AVAILABLE retains omitted / asOf / window; omitted 0 vs >0 distinguishable', function () {
    const clean = norm(200, makeNA({ omitted: 0 }));
    const rejected = norm(200, makeNA({ omitted: 3 }));
    eq(clean.kind, 'server', 'clean kind');
    eq(rejected.kind, 'server', 'omitted kind');
    eq(clean.status, 'NOT_AVAILABLE', 'status verbatim');
    eq(clean.reason, 'NO_RECORD', 'reason verbatim');
    eq(clean.envelope, makeNA({ omitted: 0 }), 'clean envelope retained whole');
    eq(rejected.envelope, makeNA({ omitted: 3 }), 'omitted envelope retained whole');
    eq(clean.envelope.omitted, 0, 'omitted 0');
    eq(rejected.envelope.omitted, 3, 'omitted 3');
    ok(clean.envelope.omitted !== rejected.envelope.omitted, 'the two are distinguishable');
    eq(rejected.envelope.asOf, ASOF, 'asOf retained');
    eq(rejected.envelope.window, WINDOW, 'window retained');
    eq(Object.keys(rejected.envelope), ['status', 'reason', 'ticker', 'asOf', 'window', 'omitted'], 'six keys in order');
    [-1, 1.5, '3', null, undefined, NaN, Infinity].forEach(function (bad) {
      const b = makeNA({ omitted: bad });
      isPinned(norm(200, b), 'omitted ' + String(bad));
    });
  });

  // ── CL-9 ───────────────────────────────────────────────────────────────────
  await test('CL-9: no write, no pt_* key, no storage access', async function () {
    ok(!/localStorage|sessionStorage|indexedDB|\bdocument\b|\bglobalThis\b|\bwindow\s*\.\s*(local|session|indexed|document)/.test(SERVICE_CODE), 'no storage/DOM/global reference in code');
    ok(!/['"`]pt_/.test(SERVICE_SRC), 'no pt_* key anywhere in the source');
    ok(!/\b(setItem|removeItem|getItem|writeFile|appendFile|require\s*\()/.test(SERVICE_CODE), 'no storage/file/require call');
    // Runtime: a tripwire on every storage global across normalizer + executor.
    const names = ['localStorage', 'sessionStorage', 'indexedDB'];
    const saved = {};
    let touches = 0;
    names.forEach(function (n) {
      saved[n] = Object.getOwnPropertyDescriptor(globalThis, n);
      Object.defineProperty(globalThis, n, { configurable: true, get: function () { touches += 1; return {}; } });
    });
    try {
      norm(200, makeOk());
      norm(200, makeNA());
      const f = spyFetch(200, makeOk());
      await req({}, f);
      eq(f.calls.length, 1, 'exactly one request');
      eq(f.calls[0].init.method, 'POST', 'the only request is a POST');
    } finally {
      names.forEach(function (n) {
        if (saved[n]) { Object.defineProperty(globalThis, n, saved[n]); } else { delete globalThis[n]; }
      });
    }
    eq(touches, 0, 'zero storage accesses');
  });

  // ── CL-10 ──────────────────────────────────────────────────────────────────
  await test('CL-10: no skippedItems consumption', function () {
    ok(SERVICE_SRC.indexOf('skippedItems') === -1, 'the source never names skippedItems');
    const a = makeOk(); a.skippedItems = [];
    isPinned(norm(200, a), 'skippedItems on the OK envelope');
    const n = makeNA(); n.skippedItems = [{ reason: 'x' }];
    isPinned(norm(200, n), 'skippedItems on NOT_AVAILABLE');
    const rec = makeRecord(); rec.skippedItems = [];
    isPinned(norm(200, makeOk({ records: [rec] })), 'skippedItems on a record');
    const clean = norm(200, makeOk());
    ok(JSON.stringify(clean).indexOf('skipped') === -1, 'valid result carries no skipped surface');
  });

  // ── CL-11 ──────────────────────────────────────────────────────────────────
  await test('CL-11: all 16 HTTP + status + reason combinations across 13 statuses are recognized verbatim', function () {
    eq(COMBOS.length, 16, '16 combinations pinned');
    eq(STATUSES.length, 13, '13 statuses pinned');
    COMBOS.forEach(function (c) {
      const r = norm(c[0], bodyFor(c[1], c[2]));
      eq(r.status, c[1], 'status verbatim ' + c[1]);
      eq(r.reason, c[2], 'reason verbatim ' + c[1] + '/' + c[2]);
      eq(r.kind, c[1] === 'OK' ? 'ok' : 'server', 'kind for ' + c[1]);
      eq(r.ticker, 'AAPL', 'requested ticker');
    });
    // The exported vocabulary agrees with the independent pin.
    eq(client.NEWS_CATALYSTS_READ_SERVER_STATUSES.slice().sort(), STATUSES.slice().sort(), 'exported status list');
    let n = 0;
    STATUSES.forEach(function (s) {
      const reasons = client.NEWS_CATALYSTS_READ_ERROR_REASONS[s] || [];
      n += s === 'OK' ? 1 : reasons.length;
      eq(client.NEWS_CATALYSTS_READ_HTTP_BY_STATUS[s], COMBOS.filter(function (c) { return c[1] === s; })[0][0], 'exported http for ' + s);
    });
    eq(n, 16, 'exported vocabulary spans 16 combinations');
  });

  // ── CL-12 ──────────────────────────────────────────────────────────────────
  await test('CL-12: unknown status / unknown reason / wrong HTTP -> the pinned client result, nothing propagated', function () {
    ['WEIRD', '', 'ok', 'Ok', '__proto__', 'constructor', 'toString', 'hasOwnProperty', null, 5, true].forEach(function (s) {
      const r = norm(200, { status: s, reason: 'X' });
      isPinned(r, 'unknown status ' + String(s));
      ok(JSON.stringify(r).indexOf('WEIRD') === -1, 'unknown status not propagated');
    });
    COMBOS.forEach(function (c) {
      if (c[1] === 'OK') { return; }
      const body = bodyFor(c[1], 'SOME_UNKNOWN_REASON_ZZ');
      const r = norm(c[0], body);
      isPinned(r, 'unknown reason under ' + c[1]);
      ok(JSON.stringify(r).indexOf('SOME_UNKNOWN_REASON_ZZ') === -1, 'unknown reason not propagated');
      const other = STATUSES.filter(function (s) { return s !== 'OK'; });
      // a reason that belongs to a DIFFERENT status
      const foreign = COMBOS.filter(function (x) { return x[1] !== c[1] && x[1] !== 'OK'; })[0][2];
      isPinned(norm(c[0], bodyFor(c[1], foreign)), 'foreign reason under ' + c[1]);
      ok(other.length === 12, 'twelve non-OK statuses');
    });
    COMBOS.forEach(function (c) {
      HTTP_CODES.forEach(function (code) {
        const valid = COMBOS.some(function (x) { return x[0] === code && x[1] === c[1] && x[2] === c[2]; });
        if (valid) { return; }
        const r = norm(code, bodyFor(c[1], c[2]));
        isPinned(r, 'wrong HTTP ' + code + ' for ' + c[1] + '/' + c[2]);
      });
    });
    ['abc', null, undefined, NaN, Infinity, '200', {}].forEach(function (code) {
      isPinned(client.normalizeNewsCatalystsReadResponse(code, JSON.stringify(makeOk()), 'AAPL', ASOF), 'non-numeric HTTP ' + String(code));
    });
    ok(client.normalizeNewsCatalystsReadResponse(200, undefined, 'AAPL', ASOF).status === 'CLIENT_INVALID_RESPONSE', 'non-string body');
    // A mismatched combination is never treated as the status it claims.
    const claim = norm(500, bodyFor('OK'));
    ok(claim.kind !== 'ok' && claim.kind === 'client', 'OK body on HTTP 500 is not ok');
    eq(claim.envelope, null, 'envelope not propagated');
  });

  // ── CL-13 ──────────────────────────────────────────────────────────────────
  await test('CL-13: any invalid record fails the WHOLE OK response closed; no drop, repair or omitted count', function () {
    isPinned(norm(200, makeOk({ readContractVersion: 'news-catalysts-read-v2' })), 'readContractVersion mismatch');
    isPinned(norm(200, makeOk({ readContractVersion: 'news-contract-v1' })), 'record version used as read version');
    isPinned(norm(200, makeOk({ readContractVersion: undefined })), 'readContractVersion absent');
    // One bad record among valid ones: the whole response fails.
    const good = [makeRecord(), makeOther(), makeUpcoming()];
    const variants = {
      'absent key': (function () { const r = makeRecord({ identityHash: 'd'.repeat(64) }); delete r.sourceUrl; return r; }()),
      'contractVersion': makeRecord({ contractVersion: 'news-contract-v0', identityHash: 'd'.repeat(64) }),
      'category vocabulary': makeRecord({ category: 'rumour', identityHash: 'd'.repeat(64) }),
      'eventType vocabulary': makeRecord({ eventType: 'maybe', identityHash: 'd'.repeat(64) }),
      'relevanceScope vocabulary': makeRecord({ relevanceScope: 'galaxy', identityHash: 'd'.repeat(64) }),
      'provider drift': makeRecord({ provider: 'other@v1', identityHash: 'd'.repeat(64) }),
      'provenance drift': makeRecord({ provenance: 'verified', identityHash: 'd'.repeat(64) }),
      'confidence not null': makeRecord({ confidence: 0.9, identityHash: 'd'.repeat(64) }),
      'requiresVerification false': makeRecord({ requiresVerification: false, identityHash: 'd'.repeat(64) }),
      'requiresVerification truthy': makeRecord({ requiresVerification: 1, identityHash: 'd'.repeat(64) }),
      'scoringImpact drift': makeRecord({ scoringImpact: 'low', identityHash: 'd'.repeat(64) }),
      'sourceTier drift': makeRecord({ sourceTier: 'sec_xbrl_primary', identityHash: 'd'.repeat(64) }),
      'sourceUrl not https': makeRecord({ sourceUrl: 'http://example.com/a', identityHash: 'd'.repeat(64) }),
      'sourceUrl bare scheme': makeRecord({ sourceUrl: 'https://', identityHash: 'd'.repeat(64) }),
      'normalizedSourceUrl not https': makeRecord({ normalizedSourceUrl: 'ftp://x', identityHash: 'd'.repeat(64) }),
      'sourceDomain empty': makeRecord({ sourceDomain: '', identityHash: 'd'.repeat(64) }),
      'identityHash short': makeRecord({ identityHash: 'abc' }),
      'identityHash uppercase': makeRecord({ identityHash: 'A'.repeat(64) }),
      'eventDate malformed': makeRecord({ eventDate: '2026-9-20', identityHash: 'd'.repeat(64) }),
      'retrievedAt malformed': makeRecord({ retrievedAt: 'yesterday', identityHash: 'd'.repeat(64) }),
      'ticker mismatch': makeRecord({ ticker: 'MSFT', identityHash: 'd'.repeat(64) }),
      'null record': null,
      'string record': 'record',
      'array record': [makeRecord()]
    };
    Object.keys(variants).forEach(function (label) {
      isPinned(norm(200, makeOk({ records: good.concat([variants[label]]), omitted: 1 })), 'bad record (' + label + ') fails the whole response');
      isPinned(norm(200, makeOk({ records: [variants[label]] })), 'sole bad record (' + label + ') fails closed');
    });
    isPinned(norm(200, makeOk({ records: [] })), 'empty records on OK');
    isPinned(norm(200, makeOk({ records: null })), 'records null');
    isPinned(norm(200, makeOk({ records: {} })), 'records object');
    isPinned(norm(200, makeOk({ records: 'x' })), 'records string');
    isPinned(norm(200, makeOk({ omitted: -1 })), 'negative omitted');
    isPinned(norm(200, makeOk({ omitted: 1.5 })), 'fractional omitted');
    isPinned(norm(200, makeOk({ omitted: '1' })), 'string omitted');
    // No drop, no repair, no client-side count: a conforming response is returned
    // exactly as the server sent it, with the server's own omitted value.
    const sent = makeOk({ records: good, omitted: 7 });
    const raw = JSON.stringify(sent);
    const r = client.normalizeNewsCatalystsReadResponse(200, raw, 'AAPL', ASOF);
    eq(r.envelope, JSON.parse(raw), 'records returned unchanged');
    eq(r.envelope.records.length, 3, 'no record dropped');
    eq(r.envelope.omitted, 7, 'omitted is the server value, never recomputed');
    // The failure result carries no omitted / records surface at all.
    const failed = norm(200, makeOk({ records: good.concat([variants['category vocabulary']]), omitted: 4 }));
    eq(Object.keys(failed), ['kind', 'status', 'reason', 'ticker', 'envelope'], 'failure shape');
    ok(JSON.stringify(failed).indexOf('omitted') === -1, 'no omitted in the failure result');
    ok(!/omitted\s*(\+\+|\+=|=[^=])/.test(SERVICE_CODE), 'the adapter never assigns or increments omitted');
    ok(!/\.(filter|splice|pop|shift|push)\s*\(/.test(SERVICE_CODE), 'the adapter never filters or mutates arrays');
  });

  // ── CL-14 ──────────────────────────────────────────────────────────────────
  await test('CL-14: token safety — source and every returned object', async function () {
    // Source: every code line naming the token is one of the allowed shapes.
    const allowed = [
      /^\s*var token = opts\.token;\s*$/,
      /^\s*if \(typeof token !== 'string' \|\| token\.trim\(\)\.length === 0\) \{\s*$/,
      /^\s*'Authorization': 'Bearer ' \+ token\s*$/
    ];
    SERVICE_CODE.split('\n').forEach(function (line) {
      if (!/\btoken\b/i.test(line)) { return; }
      ok(allowed.some(function (re) { return re.test(line); }), 'token line is an allowed shape: ' + line.trim());
    });
    ok(!/console\s*\./.test(SERVICE_CODE), 'no console use in code');
    ok(!/\bthrow\b/.test(SERVICE_CODE), 'the adapter throws nothing');
    ok(SERVICE_SRC.indexOf(TOKEN) === -1, 'sentinel is not in the source');
    // Runtime: console spy + every result shape.
    const logged = [];
    const saved = {};
    ['log', 'info', 'warn', 'error', 'debug', 'trace'].forEach(function (m) {
      saved[m] = console[m];
      console[m] = function () { logged.push(Array.prototype.slice.call(arguments).join(' ')); };
    });
    const results = [];
    try {
      results.push(await req({}, spyFetch(200, makeOk())));
      results.push(await req({}, spyFetch(200, makeNA({ omitted: 2 }))));
      results.push(await req({}, spyFetch(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'AAPL' })));
      results.push(await req({}, spyFetch(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' })));
      results.push(await req({}, spyFetch(200, 'not json')));
      results.push(await req({}, spyFetch(500, bodyFor('OK'))));
      results.push(await req({}, function () { throw new Error('boom ' + TOKEN); }));
      results.push(await req({}, function () { return Promise.reject(new Error('reject ' + TOKEN)); }));
      results.push(await req({}, function () { return { then: 5, message: TOKEN }; }));
      results.push(await req({}, function () { return Promise.resolve({ status: 200, text: function () { return Promise.reject(new Error(TOKEN)); } }); }));
      results.push(await req({ timeoutMs: 20 }, function () { return new Promise(function () {}); }));
      results.push(await req({ ticker: 'bad1' }, spyFetch(200, makeOk())));
      results.push(await req({ asOf: 'bad' }, spyFetch(200, makeOk())));
      results.push(await req({ token: '' }, spyFetch(200, makeOk())));
      results.push(await req({ fetchImpl: 5 }));
      results.push(client.normalizeNewsCatalystsReadResponse(200, TOKEN, 'AAPL', ASOF));
    } finally {
      Object.keys(saved).forEach(function (m) { console[m] = saved[m]; });
    }
    results.forEach(function (r, i) {
      ok(JSON.stringify(r).indexOf(TOKEN) === -1, 'token absent from result ' + i);
    });
    eq(logged.length, 0, 'nothing was logged');
    // The token reaches exactly one place: the Authorization header of the one request.
    const f = spyFetch(200, makeOk());
    await req({}, f);
    eq(f.calls[0].init.headers.Authorization, 'Bearer ' + TOKEN, 'header carries the token');
    ok(f.calls[0].url.indexOf(TOKEN) === -1, 'token not in the URL');
    ok(f.calls[0].init.body.indexOf(TOKEN) === -1, 'token not in the body');
  });

  // ── CL-15 ──────────────────────────────────────────────────────────────────
  await test('CL-15: exact shape per status — the four shapes, key for key', function () {
    COMBOS.forEach(function (c) {
      const label = c[1] + '/' + c[2];
      const body = bodyFor(c[1], c[2]);
      eq(norm(c[0], body).kind === 'ok' || norm(c[0], body).kind === 'server', true, 'canonical ' + label);
      // extra key
      const withExtra = JSON.parse(JSON.stringify(body)); withExtra.zzz = 1;
      isPinned(norm(c[0], withExtra), 'extra key on ' + label);
      // each key removed
      Object.keys(body).forEach(function (k) {
        const cut = JSON.parse(JSON.stringify(body)); delete cut[k];
        isPinned(norm(c[0], cut), 'missing ' + k + ' on ' + label);
      });
    });
    // A ticker on any of the ten { status, reason } responses.
    eq(PLAIN_STATUSES.length, 10, 'ten plain statuses');
    COMBOS.forEach(function (c) {
      if (PLAIN_STATUSES.indexOf(c[1]) === -1) { return; }
      const withTicker = { status: c[1], reason: c[2], ticker: 'AAPL' };
      isPinned(norm(c[0], withTicker), 'ticker on ' + c[1]);
      isPinned(norm(c[0], { status: c[1], reason: c[2], ticker: 'MSFT' }), 'foreign ticker on ' + c[1]);
    });
    // OK must not carry a reason; NOT_AVAILABLE must carry one.
    const okReason = makeOk(); okReason.reason = 'X';
    isPinned(norm(200, okReason), 'reason on OK');
    // Non-object bodies.
    ['[]', 'null', '5', '"x"', 'true', '', '{', '{"status":"OK"}', 'NaN'].forEach(function (raw) {
      isPinned(client.normalizeNewsCatalystsReadResponse(200, raw, 'AAPL', ASOF), 'body text ' + raw);
    });
  });

  // ── RQ-1 ───────────────────────────────────────────────────────────────────
  await test('RQ-1: request contract — POST, Bearer header, body exactly { ticker, asOf }', async function () {
    const f = spyFetch(200, makeOk());
    const r = await req({ ticker: ' aapl ' }, f);
    eq(r.kind, 'ok', 'result ok');
    eq(f.calls.length, 1, 'single-shot');
    const call = f.calls[0];
    eq(call.url, '/.netlify/functions/news-catalysts-read', 'default endpoint');
    eq(call.init.method, 'POST', 'POST');
    eq(Object.keys(call.init.headers), ['Content-Type', 'Authorization'], 'exactly two headers');
    eq(call.init.headers['Content-Type'], 'application/json', 'content type');
    eq(call.init.headers.Authorization, 'Bearer ' + TOKEN, 'bearer token verbatim');
    eq(call.init.body, JSON.stringify({ ticker: 'AAPL', asOf: ASOF }), 'body exactly { ticker, asOf }');
    eq(Object.keys(JSON.parse(call.init.body)), ['ticker', 'asOf'], 'no additional body key');
    ok(call.init.signal && typeof call.init.signal.aborted === 'boolean', 'abort signal supplied');
    const f2 = spyFetch(200, makeOk());
    await req({ endpoint: '/custom/path' }, f2);
    eq(f2.calls[0].url, '/custom/path', 'endpoint override');
    // The token is sent byte-exact (never trimmed).
    const f3 = spyFetch(200, makeOk());
    await req({ token: '  spaced token  ' }, f3);
    eq(f3.calls[0].init.headers.Authorization, 'Bearer   spaced token  ', 'token verbatim');
    // asOf is sent as injected, not normalized.
    const f4 = spyFetch(200, makeOk({ asOf: '2026-09-24T12:00:00Z' }));
    const r4 = await req({ asOf: '2026-09-24T12:00:00Z' }, f4);
    eq(JSON.parse(f4.calls[0].init.body).asOf, '2026-09-24T12:00:00Z', 'asOf verbatim');
    eq(r4.kind, 'ok', 'echo of the injected asOf accepted');
  });

  // ── RQ-2 ───────────────────────────────────────────────────────────────────
  await test('RQ-2: local input validation — no fetch for a bad ticker, token or asOf', async function () {
    const cases = [
      [{ ticker: undefined }, 'TICKER_INVALID'], [{ ticker: 5 }, 'TICKER_INVALID'], [{ ticker: '' }, 'TICKER_INVALID'],
      [{ ticker: 'AAPL1' }, 'TICKER_INVALID'], [{ ticker: 'TOOLONGTICKER' }, 'TICKER_INVALID'], [{ ticker: 'A-B' }, 'TICKER_INVALID'],
      [{ token: undefined }, 'TOKEN_INVALID'], [{ token: '' }, 'TOKEN_INVALID'], [{ token: '   ' }, 'TOKEN_INVALID'], [{ token: 5 }, 'TOKEN_INVALID'],
      [{ asOf: undefined }, 'ASOF_INVALID'], [{ asOf: 5 }, 'ASOF_INVALID'], [{ asOf: '' }, 'ASOF_INVALID'],
      [{ asOf: '2026-09-24' }, 'ASOF_INVALID'], [{ asOf: '2026-09-24T12:00:00+00:00' }, 'ASOF_INVALID'],
      [{ asOf: '2026-02-30T12:00:00Z' }, 'ASOF_INVALID'], [{ asOf: '2026-09-24T25:00:00Z' }, 'ASOF_INVALID'],
      [{ asOf: '2026-09-24T12:00:00.1234Z' }, 'ASOF_INVALID'], [{ asOf: ' 2026-09-24T12:00:00Z' }, 'ASOF_INVALID']
    ];
    for (let i = 0; i < cases.length; i++) {
      const f = spyFetch(200, makeOk());
      const r = await req(cases[i][0], f);
      eq(r, { kind: 'client', status: 'CLIENT_INVALID_INPUT', reason: cases[i][1], ticker: null, envelope: null }, 'input ' + JSON.stringify(cases[i][0]));
      eq(f.calls.length, 0, 'zero fetch calls for ' + JSON.stringify(cases[i][0]));
    }
    for (let j = 0; j < 4; j++) {
      const bad = [undefined, null, 'str', [1]][j];
      const r = await client.requestNewsCatalystsRead(bad);
      eq(r.status, 'CLIENT_INVALID_INPUT', 'non-object options ' + String(bad));
    }
    // Normalizer-level guard: a bad requested ticker / asOf is a caller bug, body not evaluated.
    eq(client.normalizeNewsCatalystsReadResponse(200, JSON.stringify(makeOk()), 'aapl', ASOF).status, 'CLIENT_INVALID_INPUT', 'lowercase requested ticker');
    eq(client.normalizeNewsCatalystsReadResponse(200, JSON.stringify(makeOk()), 'AAPL', 'bad').reason, 'ASOF_INVALID', 'bad requested asOf');
  });

  // ── RQ-3 ───────────────────────────────────────────────────────────────────
  await test('RQ-3: failure modes and timeout — the executor never rejects', async function () {
    // No global fetch and no fetchImpl key.
    const savedFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    try {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: undefined });
      eq((await client.requestNewsCatalystsRead({ ticker: 'AAPL', asOf: ASOF, token: TOKEN })).reason, 'FETCH_UNAVAILABLE', 'no global fetch');
      // A supplied fetchImpl is authoritative: a non-function must not fall back to the global.
      Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: function () { throw new Error('global fetch must not be called'); } });
      eq((await req({ fetchImpl: 5 })).reason, 'FETCH_UNAVAILABLE', 'non-function fetchImpl');
      eq((await client.requestNewsCatalystsRead({ ticker: 'AAPL', asOf: ASOF, token: TOKEN, fetchImpl: undefined })).reason, 'FETCH_UNAVAILABLE', 'explicit undefined fetchImpl');
    } finally {
      if (savedFetch) { Object.defineProperty(globalThis, 'fetch', savedFetch); } else { delete globalThis.fetch; }
    }
    const res = function (fn) { return req({}, fn); };
    eq((await res(function () { throw new Error('x'); })).reason, 'FETCH_FAILED', 'sync throw');
    eq((await res(function () { return Promise.reject(new Error('x')); })).reason, 'FETCH_FAILED', 'rejection');
    eq((await res(function () { return 5; })).reason, 'RESPONSE_INVALID', 'non-thenable');
    eq((await res(function () { return Promise.resolve(null); })).reason, 'RESPONSE_INVALID', 'null response');
    eq((await res(function () { return Promise.resolve({ status: 'x', text: function () {} }); })).reason, 'RESPONSE_INVALID', 'bad status');
    eq((await res(function () { return Promise.resolve({ status: 200 }); })).reason, 'RESPONSE_INVALID', 'no text()');
    eq((await res(function () { return Promise.resolve({ status: 200, text: function () { throw new Error('x'); } }); })).reason, 'RESPONSE_INVALID', 'text() throws');
    eq((await res(function () { return Promise.resolve({ status: 200, text: function () { return 5; } }); })).reason, 'RESPONSE_INVALID', 'text() non-thenable');
    eq((await res(function () { return Promise.resolve({ status: 200, text: function () { return Promise.reject(new Error('x')); } }); })).reason, 'RESPONSE_INVALID', 'text() rejects');
    eq((await res(function () { return Promise.resolve(fakeResponse(200, 'not json')); })).status, 'CLIENT_INVALID_RESPONSE', 'unparseable body');
    // Timeout: real timer, abort signal fired, never a network error.
    let aborted = false;
    const hang = function (url, init) {
      init.signal.addEventListener('abort', function () { aborted = true; });
      return new Promise(function () {});
    };
    const t = await req({ timeoutMs: 25 }, hang);
    eq(t, { kind: 'client', status: 'CLIENT_TIMEOUT', reason: 'REQUEST_TIMEOUT', ticker: 'AAPL', envelope: null }, 'timeout result');
    ok(aborted, 'request aborted on timeout');
    const rejectingOnAbort = function (url, init) {
      return new Promise(function (resolve, reject) {
        init.signal.addEventListener('abort', function () { reject(new Error('AbortError')); });
      });
    };
    eq((await req({ timeoutMs: 25 }, rejectingOnAbort)).status, 'CLIENT_TIMEOUT', 'abort echo is a timeout, not a network error');
    // Slow success under a generous timeout.
    const slow = function () { return new Promise(function (resolve) { setTimeout(function () { resolve(fakeResponse(200, JSON.stringify(makeOk()))); }, 10); }); };
    eq((await req({ timeoutMs: 1000 }, slow)).kind, 'ok', 'slow success');
    // Timer setup failure resolves, never throws.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = function () { throw new Error('no timers'); };
    try {
      eq((await req({}, spyFetch(200, makeOk()))).reason, 'FETCH_FAILED', 'timer setup failure');
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    // Never-rejects sweep.
    const nasty = [undefined, null, 5, 'x', [], {}, { ticker: {} }, { ticker: 'AAPL', asOf: ASOF, token: TOKEN, fetchImpl: 5, timeoutMs: 'x', endpoint: 5 }];
    const settled = await Promise.allSettled(nasty.map(function (o) { return client.requestNewsCatalystsRead(o); }));
    settled.forEach(function (s, i) { eq(s.status, 'fulfilled', 'sweep ' + i + ' fulfilled'); });
  });

  // ── RQ-4 ───────────────────────────────────────────────────────────────────
  await test('RQ-4: no wall-clock dependency — asOf is injected', async function () {
    ok(!/Date\s*\.\s*now\b|new\s+Date\s*\(\s*\)|performance\s*\.\s*now|hrtime|Date\s*\(\s*\)/.test(SERVICE_CODE), 'no clock read in the source');
    ok(!/Math\s*\.\s*random/.test(SERVICE_CODE), 'no randomness');
    // Two very different fake clocks must give identical results.
    const realNow = Date.now;
    const outs = [];
    try {
      [0, 4102444800000].forEach(function (t) {
        Date.now = function () { return t; };
        outs.push(JSON.stringify([norm(200, makeOk()), norm(200, makeNA()), norm(200, makeOk({ asOf: '2026-09-25T00:00:00.000Z' }))]));
      });
      Date.now = function () { throw new Error('clock read'); };
      const r = await req({}, spyFetch(200, makeOk()));
      eq(r.kind, 'ok', 'executor never touches Date.now');
    } finally {
      Date.now = realNow;
    }
    eq(outs[0], outs[1], 'results independent of the wall clock');
    // asOf 2026-09-25 with the 2026-09-24 window is a correlation failure, not a clock comparison.
    isPinned(norm(200, makeOk({ asOf: '2026-09-25T00:00:00.000Z' })), 'envelope asOf different from the injected one');
  });

  // ── RQ-5 ───────────────────────────────────────────────────────────────────
  await test('RQ-5: exact CommonJS export surface', function () {
    eq(Object.keys(client).sort(), [
      'NEWS_CATALYSTS_READ_CLIENT_REASONS',
      'NEWS_CATALYSTS_READ_ENDPOINT',
      'NEWS_CATALYSTS_READ_ERROR_REASONS',
      'NEWS_CATALYSTS_READ_HTTP_BY_STATUS',
      'NEWS_CATALYSTS_READ_SERVER_STATUSES',
      'NEWS_CATALYSTS_READ_TIMEOUT_MS',
      '_nccHasExactKeys',
      '_nccValidInstant',
      '_nccValidRecord',
      'normalizeNewsCatalystsReadResponse',
      'requestNewsCatalystsRead'
    ], 'export keys');
    eq(client.NEWS_CATALYSTS_READ_CLIENT_REASONS, {
      CLIENT_INVALID_INPUT: ['TICKER_INVALID', 'TOKEN_INVALID', 'ASOF_INVALID'],
      CLIENT_TIMEOUT: ['REQUEST_TIMEOUT'],
      CLIENT_NETWORK_ERROR: ['FETCH_UNAVAILABLE', 'FETCH_FAILED'],
      CLIENT_INVALID_RESPONSE: ['RESPONSE_INVALID']
    }, 'client-side tokens');
    // Client tokens can never collide with a server status.
    Object.keys(client.NEWS_CATALYSTS_READ_CLIENT_REASONS).forEach(function (s) {
      ok(STATUSES.indexOf(s) === -1, 'client status not a server status: ' + s);
    });
    ok(client._nccHasExactKeys({ a: 1, b: 2 }, ['a', 'b']) === true, 'exact keys helper true');
    ok(client._nccHasExactKeys({ b: 2, a: 1 }, ['a', 'b']) === false, 'exact keys helper order-sensitive');
    ok(client._nccHasExactKeys([], []) === false, 'exact keys helper rejects arrays');
    ok(client._nccHasExactKeys(Object.create(null), []) === false, 'exact keys helper rejects non-plain');
    ok(client._nccValidInstant(ASOF) === true && client._nccValidInstant('2026-02-30T00:00:00Z') === false, 'instant helper');
  });

  // ── RQ-6 ───────────────────────────────────────────────────────────────────
  await test('RQ-6: request/response correlation — ticker, asOf, window', function () {
    isPinned(norm(200, makeOk({ ticker: 'MSFT' })), 'OK envelope for a different ticker');
    isPinned(norm(200, makeNA({ ticker: 'MSFT' })), 'NOT_AVAILABLE for a different ticker');
    isPinned(norm(200, makeOk({ asOf: '2026-09-24T12:00:01.000Z' })), 'OK asOf not the injected one');
    isPinned(norm(200, makeNA({ asOf: '2026-09-23T12:00:00.000Z' })), 'NOT_AVAILABLE asOf not the injected one');
    const badWindows = [
      { from: '2026-08-24', to: '2026-09-24' },
      { from: '2026-08-26', to: '2026-09-24' },
      { from: '2026-08-25', to: '2026-09-23' },
      { from: '2026-09-24', to: '2026-08-25' },
      { from: '2026-8-25', to: '2026-09-24' },
      { from: '2026-02-30', to: '2026-09-24' },
      { from: 5, to: 6 },
      { from: null, to: null },
      null, [], 'x'
    ];
    badWindows.forEach(function (w, i) {
      isPinned(norm(200, makeOk({ window: w })), 'bad window ' + i + ' on OK');
      isPinned(norm(200, makeNA({ window: w })), 'bad window ' + i + ' on NOT_AVAILABLE');
    });
    // The window is 31 UTC dates across a month and a year boundary, by pure calendar math.
    const jan = '2027-01-10T00:00:00.000Z';
    eq(norm(200, makeOk({ asOf: jan, window: { from: '2026-12-11', to: '2027-01-10' } }), 'AAPL', jan).kind, 'ok', 'year boundary window');
    const leap = '2028-03-01T23:59:59.999Z';
    eq(norm(200, makeOk({ asOf: leap, window: { from: '2028-01-31', to: '2028-03-01' } }), 'AAPL', leap).kind, 'ok', 'leap-year window');
    // Record tickers must equal the requested ticker (D-S3-1 field 1).
    isPinned(norm(200, makeOk({ records: [makeRecord({ ticker: 'MSFT' })] })), 'record for a different ticker');
    // Requested ticker MSFT works symmetrically.
    const msft = norm(200, makeOk({ ticker: 'MSFT', records: [makeRecord({ ticker: 'MSFT' })] }), 'MSFT');
    eq(msft.kind, 'ok', 'symmetric for another ticker');
    eq(msft.ticker, 'MSFT', 'requested ticker echoed from the request, not the body');
  });

  // ── RQ-7 ───────────────────────────────────────────────────────────────────
  await test('RQ-7: only ok / server / client kinds; server statuses only the 13; pinned key order', async function () {
    const clientStatuses = Object.keys(client.NEWS_CATALYSTS_READ_CLIENT_REASONS);
    const results = [];
    COMBOS.forEach(function (c) {
      results.push(norm(c[0], bodyFor(c[1], c[2])));
      HTTP_CODES.forEach(function (code) { results.push(norm(code, bodyFor(c[1], c[2]))); });
      results.push(norm(c[0], bodyFor(c[1], 'ZZZ')));
    });
    results.push(await req({ ticker: 'x1' }), await req({}, spyFetch(200, 'zz')), await req({ timeoutMs: 10 }, function () { return new Promise(function () {}); }));
    results.forEach(function (r, i) {
      eq(Object.keys(r), ['kind', 'status', 'reason', 'ticker', 'envelope'], 'key order ' + i);
      ok(['ok', 'server', 'client'].indexOf(r.kind) !== -1, 'kind vocabulary ' + i + ': ' + r.kind);
      if (r.kind === 'client') {
        ok(clientStatuses.indexOf(r.status) !== -1, 'client status pinned ' + i + ': ' + r.status);
        eq(r.envelope, null, 'client envelope null ' + i);
      } else {
        ok(STATUSES.indexOf(r.status) !== -1, 'server status is one of the 13 ' + i + ': ' + r.status);
        eq(r.kind, r.status === 'OK' ? 'ok' : 'server', 'kind matches status ' + i);
      }
    });
    // Preserved verbatim: only NOT_AVAILABLE and OK ever carry an envelope.
    results.forEach(function (r) {
      if (r.envelope !== null) { ok(r.status === 'OK' || r.status === 'NOT_AVAILABLE', 'envelope only for OK / NOT_AVAILABLE'); }
    });
    // No second semantic vocabulary: no client-side renaming or grouping table exists.
    ok(!/(EMPTY|NO_CATALYST|UNAVAILABLE_STATE|isEmpty|GROUP|CATEGORY_OF_STATUS)/.test(SERVICE_CODE), 'no invented state vocabulary');
    ok(SERVICE_SRC.indexOf('index.html') === -1, 'the adapter does not touch index.html');
  });

  console.log('');
  console.log('news_catalysts_client_test: ' + testsPassed + ' passed, ' + testsFailed + ' failed, ' + assertions + ' assertions');
  if (testsFailed > 0) { process.exit(1); }
})();
