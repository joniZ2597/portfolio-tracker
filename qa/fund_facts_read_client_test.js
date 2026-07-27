'use strict';

/*
 * S6 Batch A — permanent offline QA for services/fund-facts-read-client.js.
 *
 * Pure Node, no network, no browser, no live services: every fetch is an
 * injected spy. Covers, per the accepted S6 plan (2026-07-27 rulings):
 *   RC01-RC10  the ten shipped validators
 *   RC11       _ffrValidErrorEnvelope direct
 *   RC12       every server status x reason through the normalizer
 *   RC13       OK happy path + result key order
 *   RC14       request/response ticker correlation (match / omit / mismatch)
 *   RC15       exact HTTP<->status pairing enforcement
 *   RC16       malformed bodies, forbidden-field leak, bad normalizer inputs
 *   RC17       requestedTicker programming-error guard
 *   RC18       executor local-input validation (zero fetch calls) + verbatim token
 *   RC19       executor happy path: url/method/headers/body/signal/endpoint
 *   RC20       executor server-status passthrough + wrong-pair rejection
 *   RC21       FETCH_UNAVAILABLE (no global fetch; non-function fetchImpl)
 *   RC22       fetchImpl sync throw / rejected promise -> FETCH_FAILED
 *   RC23       malformed response objects and body-read failures
 *   RC24       real timer timeout vs unrelated AbortError; slow-success control
 *   RC25       never-rejects sweep (allSettled over the full nasty matrix)
 *   RC26       zero storage contact; token non-echo and non-persistence
 *   RC27       static forbidden-surface scan of the service source
 *   RC28       exact CommonJS export surface
 *   RC29       supplied non-function fetchImpl fails closed (no global fetch fallback)
 *   RC30       AbortController/setTimeout setup failures resolve FETCH_FAILED
 *   RC31       canonical/inline drift guard (index.html verbatim copy)
 *   RC32       strict client gate — static (index.html + run-offline registration)
 *   RC33       gate behavior — no request unless strictly true; token cleared first
 *   RC34       token hygiene in card template and rendered output
 *   RC35       renderer accepts only fully valid normalized results; malformed matrix
 *   RC36       isolation — forbidden surface and zero network in the UI block
 *   RC37       unexpected request rejection fails closed (fixed view, no leak)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const client = require('../services/fund-facts-read-client.js');

const SERVICE_PATH = path.join(__dirname, '..', 'services', 'fund-facts-read-client.js');
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const RUN_OFFLINE_PATH = path.join(__dirname, 'run-offline.js');

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

// ── fixtures (exact contract key order everywhere) ───────────────────────────

function makeFact(over) {
  over = over || {};
  const f = {
    concept: 'Revenues',
    unit: 'USD',
    fiscalYear: 2026,
    fiscalPeriod: 'Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    valueNumeric: 1000,
    form: '10-Q',
    accessionNumber: '0000320193-26-000001',
    filingUrl: 'https://www.sec.gov/Archives/x',
    filed: '2026-04-30'
  };
  for (const k of Object.keys(over)) { f[k] = over[k]; }
  return f;
}

function makeMember(facts) {
  return { conceptUsed: facts && facts.length ? 'us-gaap:Revenues' : null, facts: facts || [] };
}

function makeSeries() {
  return {
    revenue: makeMember([makeFact()]),
    netIncome: makeMember([makeFact({ concept: 'NetIncomeLoss' })]),
    eps: makeMember([]),
    cfo: makeMember([]),
    capex: makeMember([]),
    cash: makeMember([]),
    debt: makeMember([]),
    equity: makeMember([]),
    shares: makeMember([])
  };
}

function makeDerived() {
  return {
    revenueGrowth: { method: 'yoy_quarterly', valuePct: 12.5, basis: ['fy2026q1', 'fy2025q1'] },
    netMargin: { method: 'net_margin', valuePct: 20.25, basis: [] },
    freeCashFlow: { method: 'cfo_minus_capex', valueNumeric: 350, basis: ['cfo', 'capex'] },
    balanceSheetStrength: { method: 'balance_sheet_numerics', netCash: 120, debtToEquity: 0.42, basis: [] }
  };
}

function makeFreshness(o) {
  o = o || {};
  return {
    state: 'state' in o ? o.state : 'fresh',
    ageDays: 'ageDays' in o ? o.ageDays : 3,
    asOf: 'asOf' in o ? o.asOf : '2026-07-20',
    timestampSource: 'timestampSource' in o ? o.timestampSource : 'filed',
    usedFetchedAtFallback: 'usedFetchedAtFallback' in o ? o.usedFetchedAtFallback : false,
    reason: 'reason' in o ? o.reason : null,
    checkedAt: 'checkedAt' in o ? o.checkedAt : 1753574400000,
    windowTableVersion: 'windowTableVersion' in o ? o.windowTableVersion : 'fw-v1'
  };
}

function makeOkEnvelope(ticker, over) {
  over = over || {};
  const env = {
    status: 'OK',
    readContractVersion: 'fund-facts-read-v1',
    ticker: ticker || 'AAPL',
    cik: '0000320193',
    contractVersion: 'fund-contract-v1',
    sourceTier: 'sec_xbrl_primary',
    provider: 'j1-sec-facts@job-model-v1',
    fetchedAt: '2026-07-20T06:30:00.000Z',
    verificationStatus: 'verified',
    confidence: null,
    series: makeSeries(),
    derived: makeDerived(),
    gaps: [],
    freshness: makeFreshness()
  };
  for (const k of Object.keys(over)) { env[k] = over[k]; }
  return env;
}

function reorderKeys(obj, keys) {
  const out = {};
  for (const k of keys) { out[k] = obj[k]; }
  return out;
}

function errBody(status, reason, ticker) {
  if (arguments.length > 2) { return { status: status, reason: reason, ticker: ticker }; }
  return { status: status, reason: reason };
}

function norm(httpStatus, body, requestedTicker) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return client.normalizeFundFactsReadResponse(httpStatus, raw, requestedTicker);
}

const RESULT_KEYS = ['kind', 'status', 'reason', 'ticker', 'envelope'];

function expectResult(r, kind, status, reason, ticker, label) {
  eq(Object.keys(r), RESULT_KEYS, label + ': result key order');
  eq(r.kind, kind, label + ': kind');
  eq(r.status, status, label + ': status');
  eq(r.reason, reason, label + ': reason');
  eq(r.ticker, ticker, label + ': ticker');
}

function expectInvalidResponse(r, label) {
  expectResult(r, 'client', 'CLIENT_INVALID_RESPONSE', 'RESPONSE_INVALID', 'AAPL', label);
  eq(r.envelope, null, label + ': envelope null');
}

function noLeak(r, markers, label) {
  const s = JSON.stringify(r);
  for (const m of markers) {
    ok(s.indexOf(m) === -1, label + ': leak of ' + JSON.stringify(m));
  }
}

// ── fetch spies ──────────────────────────────────────────────────────────────

function spy(plan) {
  const calls = [];
  function impl(url, init) {
    calls.push({ url: url, init: init });
    return plan(url, init, calls.length);
  }
  impl.calls = calls;
  return impl;
}

function respond(status, body) {
  return Promise.resolve({
    status: status,
    text: function () {
      return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body));
    }
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

(async function main() {
  console.log('fund_facts_read_client_test - offline, spy-injected fetch only');

  await test('RC01: _ffrIsNonEmptyString', function () {
    ok(client._ffrIsNonEmptyString('x') === true, 'plain string');
    ok(client._ffrIsNonEmptyString(' x ') === true, 'padded string');
    ok(client._ffrIsNonEmptyString('') === false, 'empty');
    ok(client._ffrIsNonEmptyString('   ') === false, 'whitespace only');
    ok(client._ffrIsNonEmptyString(3) === false, 'number');
    ok(client._ffrIsNonEmptyString(null) === false, 'null');
    ok(client._ffrIsNonEmptyString(undefined) === false, 'undefined');
  });

  await test('RC02: _ffrHasExactKeys', function () {
    ok(client._ffrHasExactKeys({ a: 1, b: 2 }, ['a', 'b']) === true, 'exact order');
    ok(client._ffrHasExactKeys({ b: 2, a: 1 }, ['a', 'b']) === false, 'reordered');
    ok(client._ffrHasExactKeys({ a: 1 }, ['a', 'b']) === false, 'missing key');
    ok(client._ffrHasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b']) === false, 'extra key');
    ok(client._ffrHasExactKeys([], []) === false, 'array rejected');
    ok(client._ffrHasExactKeys(null, []) === false, 'null rejected');
    ok(client._ffrHasExactKeys(Object.create(null), []) === false, 'null-prototype rejected');
    ok(client._ffrHasExactKeys(JSON.parse('{"a":1,"b":2}'), ['a', 'b']) === true, 'JSON.parse object accepted');
  });

  await test('RC03: _ffrValidFact', function () {
    ok(client._ffrValidFact(makeFact()) === true, 'canonical fact');
    ok(client._ffrValidFact(makeFact({ periodStart: null, form: null, accessionNumber: null, filingUrl: null, filed: null })) === true, 'nullable fields null');
    ok(client._ffrValidFact(makeFact({ concept: '' })) === false, 'empty concept');
    ok(client._ffrValidFact(makeFact({ fiscalYear: 2026.5 })) === false, 'non-integer fiscalYear');
    ok(client._ffrValidFact(makeFact({ valueNumeric: 'x' })) === false, 'string valueNumeric');
    ok(client._ffrValidFact(makeFact({ periodEnd: null })) === false, 'null periodEnd');
    const f = makeFact();
    delete f.filed;
    ok(client._ffrValidFact(f) === false, 'missing field');
    const g = makeFact();
    g.extra = 1;
    ok(client._ffrValidFact(g) === false, 'extra field');
    ok(client._ffrValidFact(reorderKeys(makeFact(), ['unit', 'concept', 'fiscalYear', 'fiscalPeriod', 'periodStart', 'periodEnd', 'valueNumeric', 'form', 'accessionNumber', 'filingUrl', 'filed'])) === false, 'reordered fact');
  });

  await test('RC04: _ffrValidSeries', function () {
    ok(client._ffrValidSeries(makeSeries()) === true, 'canonical series');
    const s1 = makeSeries();
    s1.revenue = { conceptUsed: null, facts: [] };
    ok(client._ffrValidSeries(s1) === true, 'empty member valid');
    const s2 = makeSeries();
    delete s2.shares;
    ok(client._ffrValidSeries(s2) === false, 'missing member');
    const s3 = makeSeries();
    s3.revenue = { conceptUsed: 'x' };
    ok(client._ffrValidSeries(s3) === false, 'member missing facts');
    const s4 = makeSeries();
    s4.revenue.facts = [makeFact({ concept: '' })];
    ok(client._ffrValidSeries(s4) === false, 'bad fact inside member');
    const s5 = makeSeries();
    s5.revenue.facts = 'x';
    ok(client._ffrValidSeries(s5) === false, 'facts not array');
  });

  await test('RC05: _ffrValidDerived', function () {
    ok(client._ffrValidDerived(makeDerived()) === true, 'canonical derived');
    ok(client._ffrValidDerived({ revenueGrowth: null, netMargin: null, freeCashFlow: null, balanceSheetStrength: null }) === true, 'all-null derived');
    const d1 = makeDerived();
    d1.revenueGrowth.method = 'other';
    ok(client._ffrValidDerived(d1) === false, 'wrong method literal');
    const d2 = makeDerived();
    d2.netMargin.basis = [1];
    ok(client._ffrValidDerived(d2) === false, 'non-string basis entry');
    const d3 = makeDerived();
    d3.freeCashFlow.valueNumeric = 'x';
    ok(client._ffrValidDerived(d3) === false, 'non-numeric freeCashFlow');
    const d4 = makeDerived();
    d4.balanceSheetStrength.netCash = null;
    d4.balanceSheetStrength.debtToEquity = null;
    ok(client._ffrValidDerived(d4) === true, 'nullable balance-sheet numerics');
    const d5 = makeDerived();
    d5.revenueGrowth.computedAt = 5;
    ok(client._ffrValidDerived(d5) === false, 'leaked computedAt field');
    const d6 = makeDerived();
    delete d6.netMargin;
    ok(client._ffrValidDerived(d6) === false, 'missing metric');
  });

  await test('RC06: _ffrValidGaps', function () {
    ok(client._ffrValidGaps([]) === true, 'empty gaps');
    ok(client._ffrValidGaps(['a', '']) === true, 'strings incl. empty');
    ok(client._ffrValidGaps([1]) === false, 'number entry');
    ok(client._ffrValidGaps('x') === false, 'non-array');
    ok(client._ffrValidGaps(null) === false, 'null');
  });

  await test('RC07: _ffrForbiddenFieldsAbsent', function () {
    ok(client._ffrForbiddenFieldsAbsent(makeOkEnvelope()) === true, 'clean envelope');
    ok(client._ffrForbiddenFieldsAbsent(null) === true, 'null');
    ok(client._ffrForbiddenFieldsAbsent(7) === true, 'primitive');
    ok(client._ffrForbiddenFieldsAbsent({ a: [{ b: { runId: 1 } }] }) === false, 'nested runId');
    ok(client._ffrForbiddenFieldsAbsent({ a: { filings: [] } }) === false, 'nested filings');
    ok(client._ffrForbiddenFieldsAbsent([{ secRequests: 0 }]) === false, 'array-nested secRequests');
    ok(client._ffrForbiddenFieldsAbsent({ computedAt: 1 }) === false, 'top-level computedAt');
  });

  await test('RC08: _ffrValidStamp', function () {
    ok(client._ffrValidStamp('2026-02-28') === true, 'calendar date');
    ok(client._ffrValidStamp('2024-02-29') === true, 'leap day valid year');
    ok(client._ffrValidStamp('2023-02-29') === false, 'leap day invalid year');
    ok(client._ffrValidStamp('2026-02-30') === false, 'impossible day');
    ok(client._ffrValidStamp('2026-13-01') === false, 'impossible month');
    ok(client._ffrValidStamp('2026-1-05') === false, 'unpadded month');
    ok(client._ffrValidStamp('2026-07-20T06:30:00Z') === true, 'UTC datetime');
    ok(client._ffrValidStamp('2026-07-20T06:30:00.123Z') === true, 'UTC datetime millis');
    ok(client._ffrValidStamp('2026-07-20T24:00:00Z') === false, 'hour 24');
    ok(client._ffrValidStamp('2026-07-20T06:30:00+03:00') === false, 'offset rejected');
    ok(client._ffrValidStamp(20260720) === false, 'non-string');
  });

  await test('RC09: _ffrValidFreshness reason-shape matrix', function () {
    ok(client._ffrValidFreshness(makeFreshness()) === true, 'fresh');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'aging', ageDays: 40 })) === true, 'aging');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'stale', ageDays: 400 })) === true, 'stale');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'missing', reason: 'RECORD_UNREADABLE', ageDays: null, timestampSource: null, asOf: null })) === true, 'missing RECORD_UNREADABLE');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'missing', reason: 'OTHER', ageDays: null, timestampSource: null, asOf: null })) === false, 'missing wrong reason');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'TIMESTAMP_AHEAD_OF_CLOCK', ageDays: -2 })) === true, 'degraded ahead-of-clock negative age');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'TIMESTAMP_AHEAD_OF_CLOCK', ageDays: 2 })) === false, 'ahead-of-clock non-negative age');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'CHECKED_AT_INVALID', ageDays: null, checkedAt: null })) === true, 'degraded CHECKED_AT_INVALID');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'NO_TIMESTAMP', ageDays: null, timestampSource: null, asOf: null })) === true, 'degraded NO_TIMESTAMP');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'MALFORMED_SNAPSHOT', ageDays: null, timestampSource: null, asOf: null, checkedAt: null })) === true, 'degraded MALFORMED_SNAPSHOT null checkedAt');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'CONTRACT_INVALID', ageDays: null, timestampSource: null, asOf: null })) === true, 'degraded CONTRACT_INVALID');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'UNKNOWN_FAMILY', ageDays: null, timestampSource: null, asOf: null })) === true, 'degraded UNKNOWN_FAMILY');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'degraded', reason: 'NO_TIMESTAMP', ageDays: null, timestampSource: null, asOf: null, checkedAt: null })) === false, 'NO_TIMESTAMP with null checkedAt rejected');
    ok(client._ffrValidFreshness(makeFreshness({ reason: 'X' })) === false, 'fresh with reason');
    ok(client._ffrValidFreshness(makeFreshness({ usedFetchedAtFallback: true })) === false, 'fallback flag mismatch');
    ok(client._ffrValidFreshness(makeFreshness({ timestampSource: 'fetchedAt', usedFetchedAtFallback: true, asOf: '2026-07-19' })) === true, 'fetchedAt fallback consistent');
    ok(client._ffrValidFreshness(makeFreshness({ asOf: null })) === false, 'asOf null with source set');
    ok(client._ffrValidFreshness(makeFreshness({ windowTableVersion: ' fw ' })) === false, 'untrimmed windowTableVersion');
    ok(client._ffrValidFreshness(makeFreshness({ state: 'bogus' })) === false, 'unknown state');
    ok(client._ffrValidFreshness(reorderKeys(makeFreshness(), ['ageDays', 'state', 'asOf', 'timestampSource', 'usedFetchedAtFallback', 'reason', 'checkedAt', 'windowTableVersion'])) === false, 'reordered freshness');
    const FRESHNESS_REASONS = [
      'RECORD_UNREADABLE',
      'TIMESTAMP_AHEAD_OF_CLOCK',
      'CHECKED_AT_INVALID',
      'NO_TIMESTAMP',
      'MALFORMED_SNAPSHOT',
      'UNKNOWN_FAMILY',
      'CONTRACT_INVALID'
    ];
    eq(FRESHNESS_REASONS.length, 7, 'exactly seven pinned freshness reasons');
    const canonicalByReason = {
      RECORD_UNREADABLE: { state: 'missing', reason: 'RECORD_UNREADABLE', ageDays: null, timestampSource: null, asOf: null },
      TIMESTAMP_AHEAD_OF_CLOCK: { state: 'degraded', reason: 'TIMESTAMP_AHEAD_OF_CLOCK', ageDays: -1 },
      CHECKED_AT_INVALID: { state: 'degraded', reason: 'CHECKED_AT_INVALID', ageDays: null, checkedAt: null },
      NO_TIMESTAMP: { state: 'degraded', reason: 'NO_TIMESTAMP', ageDays: null, timestampSource: null, asOf: null },
      MALFORMED_SNAPSHOT: { state: 'degraded', reason: 'MALFORMED_SNAPSHOT', ageDays: null, timestampSource: null, asOf: null },
      UNKNOWN_FAMILY: { state: 'degraded', reason: 'UNKNOWN_FAMILY', ageDays: null, timestampSource: null, asOf: null },
      CONTRACT_INVALID: { state: 'degraded', reason: 'CONTRACT_INVALID', ageDays: null, timestampSource: null, asOf: null }
    };
    eq(Object.keys(canonicalByReason).sort(), FRESHNESS_REASONS.slice().sort(), 'canonical shapes cover the exact reason set');
    for (const reason of FRESHNESS_REASONS) {
      ok(client._ffrValidFreshness(makeFreshness(canonicalByReason[reason])) === true, 'canonical valid shape for ' + reason);
    }
  });

  await test('RC10: _ffrValidOkEnvelope', function () {
    ok(client._ffrValidOkEnvelope(makeOkEnvelope()) === true, 'canonical envelope');
    ok(client._ffrValidOkEnvelope(JSON.parse(JSON.stringify(makeOkEnvelope()))) === true, 'JSON round-trip');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { readContractVersion: 'v2' })) === false, 'wrong readContractVersion');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { contractVersion: 'x' })) === false, 'wrong contractVersion');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { sourceTier: 'x' })) === false, 'wrong sourceTier');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { provider: 'x' })) === false, 'wrong provider');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { verificationStatus: 'unverified' })) === false, 'wrong verificationStatus');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { confidence: 0.5 })) === false, 'non-null confidence');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('aapl')) === false, 'lowercase ticker');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { cik: '320193' })) === false, 'short cik');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { fetchedAt: 'garbage' })) === false, 'unparseable fetchedAt');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { gaps: [1] })) === false, 'bad gaps');
    const extra = makeOkEnvelope('AAPL', { zz: 1 });
    ok(client._ffrValidOkEnvelope(extra) === false, 'extra top-level key');
    const top = Object.keys(makeOkEnvelope());
    const swapped = top.slice();
    swapped[2] = top[3];
    swapped[3] = top[2];
    ok(client._ffrValidOkEnvelope(reorderKeys(makeOkEnvelope(), swapped)) === false, 'reordered top-level keys');
    ok(client._ffrValidOkEnvelope(makeOkEnvelope('AAPL', { status: 'DISABLED' })) === false, 'non-OK status');
  });

  await test('RC11: _ffrValidErrorEnvelope direct', function () {
    for (const status of Object.keys(client.FUND_FACTS_READ_ERROR_REASONS)) {
      for (const reason of client.FUND_FACTS_READ_ERROR_REASONS[status]) {
        ok(client._ffrValidErrorEnvelope(errBody(status, reason), 'AAPL') === true, status + '/' + reason + ' two-key');
      }
    }
    ok(client._ffrValidErrorEnvelope(errBody('NOT_AVAILABLE', 'NO_RECORD', 'AAPL'), 'AAPL') === true, 'NOT_AVAILABLE ticker echo match');
    ok(client._ffrValidErrorEnvelope(errBody('DEGRADED', 'STORE_UNAVAILABLE', 'AAPL'), 'AAPL') === true, 'DEGRADED ticker echo match');
    ok(client._ffrValidErrorEnvelope(errBody('NOT_AVAILABLE', 'NO_RECORD', 'MSFT'), 'AAPL') === false, 'echo mismatch rejected');
    ok(client._ffrValidErrorEnvelope(errBody('DISABLED', 'SERVER_DISABLED', 'AAPL'), 'AAPL') === false, 'echo on non-echo status');
    ok(client._ffrValidErrorEnvelope(errBody('DISABLED', 'UNAUTHORIZED'), 'AAPL') === false, 'wrong reason');
    ok(client._ffrValidErrorEnvelope(errBody('WEIRD', 'X'), 'AAPL') === false, 'unknown status');
    ok(client._ffrValidErrorEnvelope(errBody('OK', 'SERVER_DISABLED'), 'AAPL') === false, 'OK not an error status');
    ok(client._ffrValidErrorEnvelope({ reason: 'SERVER_DISABLED', status: 'DISABLED' }, 'AAPL') === false, 'reordered keys');
    ok(client._ffrValidErrorEnvelope({ status: 'DISABLED', reason: 'SERVER_DISABLED', extra: 1 }, 'AAPL') === false, 'extra key');
    ok(client._ffrValidErrorEnvelope(errBody('__proto__', 'X'), 'AAPL') === false, 'prototype-name status');
  });

  await test('RC12: normalizer accepts every server status x reason on its pinned HTTP code', function () {
    for (const status of Object.keys(client.FUND_FACTS_READ_ERROR_REASONS)) {
      const http = client.FUND_FACTS_READ_HTTP_BY_STATUS[status];
      for (const reason of client.FUND_FACTS_READ_ERROR_REASONS[status]) {
        const r = norm(http, errBody(status, reason), 'AAPL');
        expectResult(r, 'server', status, reason, 'AAPL', status + '/' + reason);
        eq(r.envelope, null, status + '/' + reason + ': envelope null');
      }
    }
  });

  await test('RC13: normalizer OK happy path', function () {
    const body = makeOkEnvelope('AAPL');
    const r = norm(200, body, 'AAPL');
    expectResult(r, 'ok', 'OK', null, 'AAPL', 'OK happy');
    eq(r.envelope, JSON.parse(JSON.stringify(body)), 'OK happy: envelope verbatim');
  });

  await test('RC14: request/response ticker correlation', function () {
    const wrongOk = norm(200, makeOkEnvelope('MSFT'), 'AAPL');
    expectInvalidResponse(wrongOk, 'OK envelope for different ticker');
    const okMatch = norm(200, makeOkEnvelope('AAPL'), 'AAPL');
    eq(okMatch.status, 'OK', 'OK envelope matching ticker accepted');

    const naMatch = norm(200, errBody('NOT_AVAILABLE', 'NO_RECORD', 'AAPL'), 'AAPL');
    expectResult(naMatch, 'server', 'NOT_AVAILABLE', 'NO_RECORD', 'AAPL', 'NOT_AVAILABLE echo match');
    const naOmit = norm(200, errBody('NOT_AVAILABLE', 'NO_RECORD'), 'AAPL');
    expectResult(naOmit, 'server', 'NOT_AVAILABLE', 'NO_RECORD', 'AAPL', 'NOT_AVAILABLE echo omitted');
    const naWrong = norm(200, errBody('NOT_AVAILABLE', 'NO_RECORD', 'MSFT'), 'AAPL');
    expectInvalidResponse(naWrong, 'NOT_AVAILABLE echo mismatch');

    const dgMatch = norm(200, errBody('DEGRADED', 'STORE_RECORD_INVALID', 'AAPL'), 'AAPL');
    expectResult(dgMatch, 'server', 'DEGRADED', 'STORE_RECORD_INVALID', 'AAPL', 'DEGRADED echo match');
    const dgOmit = norm(200, errBody('DEGRADED', 'STORE_UNAVAILABLE'), 'AAPL');
    expectResult(dgOmit, 'server', 'DEGRADED', 'STORE_UNAVAILABLE', 'AAPL', 'DEGRADED echo omitted');
    const dgWrong = norm(200, errBody('DEGRADED', 'STORE_UNAVAILABLE', 'MSFT'), 'AAPL');
    expectInvalidResponse(dgWrong, 'DEGRADED echo mismatch');

    const echoOnDisabled = norm(200, errBody('DISABLED', 'SERVER_DISABLED', 'AAPL'), 'AAPL');
    expectInvalidResponse(echoOnDisabled, 'ticker echo on DISABLED');
  });

  await test('RC15: HTTP<->status pairing enforced for all 9 statuses', function () {
    const wrongHttp = {
      OK: 500,
      DISABLED: 401,
      NOT_AVAILABLE: 400,
      DEGRADED: 405,
      UNAUTHORIZED: 200,
      CONFIGURATION_MISSING: 200,
      INVALID_TICKER: 200,
      INVALID_JSON: 405,
      METHOD_NOT_ALLOWED: 200
    };
    for (const status of client.FUND_FACTS_READ_SERVER_STATUSES) {
      const body = status === 'OK'
        ? makeOkEnvelope('AAPL')
        : errBody(status, client.FUND_FACTS_READ_ERROR_REASONS[status][0]);
      const r = norm(wrongHttp[status], body, 'AAPL');
      expectInvalidResponse(r, status + ' on HTTP ' + wrongHttp[status]);
      const r2 = norm(client.FUND_FACTS_READ_HTTP_BY_STATUS[status], body, 'AAPL');
      ok(r2.status === status, status + ' on pinned HTTP accepted (control)');
    }
  });

  await test('RC16: malformed bodies and bad normalizer inputs', function () {
    expectInvalidResponse(norm(200, '{not json', 'AAPL'), 'unparseable JSON');
    expectInvalidResponse(norm(200, 'null', 'AAPL'), 'JSON null');
    expectInvalidResponse(norm(200, 'true', 'AAPL'), 'JSON boolean');
    expectInvalidResponse(norm(200, '42', 'AAPL'), 'JSON number');
    expectInvalidResponse(norm(200, '"x"', 'AAPL'), 'JSON string');
    expectInvalidResponse(norm(200, '[]', 'AAPL'), 'JSON array');
    expectInvalidResponse(norm(200, '', 'AAPL'), 'empty body');
    expectInvalidResponse(client.normalizeFundFactsReadResponse(200, 42, 'AAPL'), 'non-string rawBodyText');
    expectInvalidResponse(client.normalizeFundFactsReadResponse(NaN, '{}', 'AAPL'), 'NaN httpStatus');
    expectInvalidResponse(client.normalizeFundFactsReadResponse('200', '{}', 'AAPL'), 'string httpStatus');
    expectInvalidResponse(norm(200, errBody('WEIRD', 'X'), 'AAPL'), 'unknown status');
    expectInvalidResponse(norm(200, { status: 'DISABLED', reason: 'SERVER_DISABLED', extra: 1 }, 'AAPL'), 'extra key');
    expectInvalidResponse(norm(200, { reason: 'SERVER_DISABLED', status: 'DISABLED' }, 'AAPL'), 'reordered error keys');
    const leakTop = makeOkEnvelope('AAPL', { runId: 7 });
    expectInvalidResponse(norm(200, leakTop, 'AAPL'), 'top-level runId leak');
    const leakDeep = JSON.parse(JSON.stringify(makeOkEnvelope('AAPL')));
    leakDeep.derived.revenueGrowth.computedAt = 123;
    expectInvalidResponse(norm(200, leakDeep, 'AAPL'), 'deep computedAt leak');
    const badEnv = makeOkEnvelope('AAPL', { verificationStatus: 'unverified' });
    expectInvalidResponse(norm(200, badEnv, 'AAPL'), 'invalid OK envelope');
  });

  await test('RC17: requestedTicker programming-error guard', function () {
    for (const bad of [undefined, null, 42, '', 'aapl', 'BRK.B', 'TOOLONGTICKR']) {
      const r = client.normalizeFundFactsReadResponse(200, JSON.stringify(makeOkEnvelope()), bad);
      expectResult(r, 'client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, 'guard ' + JSON.stringify(bad));
      eq(r.envelope, null, 'guard envelope null ' + JSON.stringify(bad));
    }
  });

  await test('RC18: executor local-input validation, zero fetch calls, verbatim token', async function () {
    for (const bad of [undefined, null, 42, '', '   ', 'BRK.B', 'TOOLONGTICKR', 'abc def']) {
      const s = spy(function () { return respond(200, makeOkEnvelope()); });
      const r = await client.requestFundFactsRead({ ticker: bad, token: 'tok', fetchImpl: s });
      expectResult(r, 'client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', null, 'ticker ' + JSON.stringify(bad));
      eq(s.calls.length, 0, 'zero fetch calls for ticker ' + JSON.stringify(bad));
    }
    for (const bad of [undefined, null, 42, '', '   ', {}]) {
      const s = spy(function () { return respond(200, makeOkEnvelope()); });
      const r = await client.requestFundFactsRead({ ticker: 'AAPL', token: bad, fetchImpl: s });
      expectResult(r, 'client', 'CLIENT_INVALID_INPUT', 'TOKEN_INVALID', null, 'token ' + JSON.stringify(bad));
      eq(s.calls.length, 0, 'zero fetch calls for token ' + JSON.stringify(bad));
    }
    const s2 = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
    const r2 = await client.requestFundFactsRead({ ticker: '  aapl ', token: ' tok en ', fetchImpl: s2 });
    eq(r2.status, 'OK', 'normalized lowercase/padded ticker succeeds');
    eq(s2.calls.length, 1, 'exactly one fetch call');
    eq(s2.calls[0].init.body, '{"ticker":"AAPL"}', 'request body carries normalized ticker');
    eq(s2.calls[0].init.headers.Authorization, 'Bearer  tok en ', 'token sent verbatim, untrimmed');
  });

  await test('RC19: executor happy path request shape', async function () {
    const s = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
    const r = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: s });
    expectResult(r, 'ok', 'OK', null, 'AAPL', 'happy path');
    eq(r.envelope, JSON.parse(JSON.stringify(makeOkEnvelope('AAPL'))), 'happy path envelope verbatim');
    eq(s.calls[0].url, client.FUND_FACTS_READ_ENDPOINT, 'default endpoint');
    eq(s.calls[0].init.method, 'POST', 'POST method');
    eq(s.calls[0].init.headers, { 'Content-Type': 'application/json', 'Authorization': 'Bearer T' }, 'exact headers');
    if (typeof AbortController === 'function') {
      ok(s.calls[0].init.signal !== undefined && s.calls[0].init.signal !== null, 'abort signal attached');
    }
    const s2 = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
    await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: s2, endpoint: '/custom-endpoint' });
    eq(s2.calls[0].url, '/custom-endpoint', 'endpoint override respected');
  });

  await test('RC20: executor server-status passthrough and wrong-pair rejection', async function () {
    const cases = [
      [401, errBody('UNAUTHORIZED', 'UNAUTHORIZED'), 'UNAUTHORIZED', 'UNAUTHORIZED'],
      [200, errBody('DISABLED', 'SERVER_DISABLED'), 'DISABLED', 'SERVER_DISABLED'],
      [200, errBody('NOT_AVAILABLE', 'NO_RECORD', 'AAPL'), 'NOT_AVAILABLE', 'NO_RECORD'],
      [500, errBody('CONFIGURATION_MISSING', 'TOKEN_COLLISION'), 'CONFIGURATION_MISSING', 'TOKEN_COLLISION']
    ];
    for (const c of cases) {
      const s = spy(function () { return respond(c[0], c[1]); });
      const r = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: s });
      expectResult(r, 'server', c[2], c[3], 'AAPL', 'passthrough ' + c[2]);
      eq(r.envelope, null, 'passthrough envelope null ' + c[2]);
    }
    const sBad = spy(function () { return respond(200, errBody('UNAUTHORIZED', 'UNAUTHORIZED')); });
    const rBad = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: sBad });
    expectInvalidResponse(rBad, 'UNAUTHORIZED body on HTTP 200 via executor');
  });

  await test('RC21: FETCH_UNAVAILABLE without usable fetch', async function () {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
    const saved = globalThis.fetch;
    try {
      try { delete globalThis.fetch; } catch (e) { /* fall through */ }
      if (typeof globalThis.fetch === 'function') { globalThis.fetch = undefined; }
      const r1 = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T' });
      expectResult(r1, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', 'AAPL', 'missing fetch');
      const r2 = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: 42 });
      expectResult(r2, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', 'AAPL', 'non-function fetchImpl');
    } finally {
      if (had) { globalThis.fetch = saved; } else { try { delete globalThis.fetch; } catch (e) { /* noop */ } }
    }
  });

  await test('RC22: fetchImpl sync throw and rejected promise -> FETCH_FAILED', async function () {
    const rSync = await client.requestFundFactsRead({
      ticker: 'AAPL', token: 'T',
      fetchImpl: function () { throw new Error('BOOM_SYNC_FETCH_7f3a'); }
    });
    expectResult(rSync, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', 'AAPL', 'sync throw');
    noLeak(rSync, ['BOOM_SYNC_FETCH_7f3a'], 'sync throw');
    const rAsync = await client.requestFundFactsRead({
      ticker: 'AAPL', token: 'T',
      fetchImpl: function () { return Promise.reject(new Error('BOOM_ASYNC_FETCH_9c1d')); }
    });
    expectResult(rAsync, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', 'AAPL', 'rejected promise');
    noLeak(rAsync, ['BOOM_ASYNC_FETCH_9c1d'], 'rejected promise');
  });

  await test('RC23: malformed response objects and body-read failures -> RESPONSE_INVALID', async function () {
    const shapes = [
      ['response null', function () { return Promise.resolve(null); }],
      ['response number', function () { return Promise.resolve(42); }],
      ['non-thenable return', function () { return 42; }],
      ['non-thenable object return', function () { return { status: 200 }; }],
      ['missing status', function () { return Promise.resolve({ text: function () { return Promise.resolve('{}'); } }); }],
      ['string status', function () { return Promise.resolve({ status: '200', text: function () { return Promise.resolve('{}'); } }); }],
      ['NaN status', function () { return Promise.resolve({ status: NaN, text: function () { return Promise.resolve('{}'); } }); }],
      ['missing text', function () { return Promise.resolve({ status: 200 }); }],
      ['non-function text', function () { return Promise.resolve({ status: 200, text: 5 }); }],
      ['text sync throw', function () { return Promise.resolve({ status: 200, text: function () { throw new Error('BOOM_TEXT_SYNC_2e'); } }); }],
      ['text non-thenable', function () { return Promise.resolve({ status: 200, text: function () { return 42; } }); }],
      ['text rejects', function () { return Promise.resolve({ status: 200, text: function () { return Promise.reject(new Error('BOOM_TEXT_ASYNC_5b')); } }); }]
    ];
    for (const c of shapes) {
      const r = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: c[1] });
      expectInvalidResponse(r, c[0]);
      noLeak(r, ['BOOM_TEXT_SYNC_2e', 'BOOM_TEXT_ASYNC_5b'], c[0]);
    }
  });

  await test('RC24: real timeout vs unrelated AbortError; slow-success control', async function () {
    const sHang = spy(function (url, init) {
      return new Promise(function (resolve, reject) {
        if (init.signal) {
          init.signal.addEventListener('abort', function () {
            const e = new Error('aborted by controller');
            e.name = 'AbortError';
            reject(e);
          });
        }
      });
    });
    const rTimeout = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: sHang, timeoutMs: 25 });
    expectResult(rTimeout, 'client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', 'AAPL', 'timer fired');
    noLeak(rTimeout, ['aborted by controller'], 'timer fired');

    const rAbort = await client.requestFundFactsRead({
      ticker: 'AAPL', token: 'T',
      fetchImpl: function () {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
    });
    expectResult(rAbort, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', 'AAPL', 'AbortError without our timer');
    ok(rAbort.status !== 'CLIENT_TIMEOUT', 'unrelated AbortError never classified as timeout');

    const sSlow = spy(function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ status: 200, text: function () { return Promise.resolve(JSON.stringify(makeOkEnvelope('AAPL'))); } });
        }, 10);
      });
    });
    const rSlow = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: sSlow, timeoutMs: 5000 });
    eq(rSlow.status, 'OK', 'slow-but-in-budget response still succeeds');
  });

  await test('RC25: never-rejects sweep across the nasty matrix', async function () {
    const thunks = [
      function () { return client.requestFundFactsRead(); },
      function () { return client.requestFundFactsRead(null); },
      function () { return client.requestFundFactsRead('x'); },
      function () { return client.requestFundFactsRead({}); },
      function () { return client.requestFundFactsRead({ ticker: 'BRK.B', token: 'T' }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: '  ' }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { throw new Error('X1'); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return Promise.reject(new Error('X2')); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return 42; } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return Promise.resolve(null); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return Promise.resolve({ status: 200, text: function () { return Promise.reject(new Error('X3')); } }); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return Promise.resolve({ status: 200, text: function () { return Promise.resolve('{bad'); } }); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return respond(500, makeOkEnvelope('AAPL')); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return respond(200, makeOkEnvelope('MSFT')); } }); },
      function () { return client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: function () { return respond(200, makeOkEnvelope('AAPL')); } }); }
    ];
    const settled = await Promise.allSettled(thunks.map(function (t) { return t(); }));
    for (let i = 0; i < settled.length; i++) {
      eq(settled[i].status, 'fulfilled', 'thunk ' + i + ' resolved (never rejects)');
      eq(Object.keys(settled[i].value), RESULT_KEYS, 'thunk ' + i + ' result key order');
    }
  });

  await test('RC26: zero storage contact; token non-echo and non-persistence', async function () {
    function storageSpy() {
      const calls = [];
      return {
        calls: calls,
        getItem: function () { calls.push('get'); return null; },
        setItem: function () { calls.push('set'); },
        removeItem: function () { calls.push('remove'); },
        clear: function () { calls.push('clear'); }
      };
    }
    const TOKEN = 'SECRET_TOKEN_e5f6a7b8';
    const hadLs = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
    const hadSs = Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage');
    const savedLs = globalThis.localStorage;
    const savedSs = globalThis.sessionStorage;
    const ls = storageSpy();
    const ss = storageSpy();
    globalThis.localStorage = ls;
    globalThis.sessionStorage = ss;
    try {
      const s = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
      const results = [];
      results.push(await client.requestFundFactsRead({ ticker: 'AAPL', token: TOKEN, fetchImpl: s }));
      results.push(await client.requestFundFactsRead({ ticker: 'AAPL', token: TOKEN, fetchImpl: spy(function () { return respond(401, errBody('UNAUTHORIZED', 'UNAUTHORIZED')); }) }));
      results.push(await client.requestFundFactsRead({ ticker: 'AAPL', token: TOKEN, fetchImpl: function () { throw new Error('BOOM_STORAGE_CASE'); } }));
      results.push(await client.requestFundFactsRead({ ticker: 'BRK.B', token: TOKEN }));
      results.push(client.normalizeFundFactsReadResponse(200, JSON.stringify(makeOkEnvelope('AAPL')), 'AAPL'));
      eq(ls.calls.length, 0, 'zero localStorage calls');
      eq(ss.calls.length, 0, 'zero sessionStorage calls');
      for (let i = 0; i < results.length; i++) {
        noLeak(results[i], [TOKEN, 'Bearer'], 'result ' + i + ' token hygiene');
      }
      eq(s.calls[0].init.headers.Authorization, 'Bearer ' + TOKEN, 'request itself carries the exact Bearer header');
    } finally {
      if (hadLs) { globalThis.localStorage = savedLs; } else { delete globalThis.localStorage; }
      if (hadSs) { globalThis.sessionStorage = savedSs; } else { delete globalThis.sessionStorage; }
    }
    eq(Object.prototype.hasOwnProperty.call(globalThis, 'localStorage'), hadLs, 'localStorage presence restored');
    eq(Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage'), hadSs, 'sessionStorage presence restored');
    if (hadLs) { ok(globalThis.localStorage === savedLs, 'localStorage value restored'); }
    if (hadSs) { ok(globalThis.sessionStorage === savedSs, 'sessionStorage value restored'); }
  });

  await test('RC27: static forbidden-surface scan of the service source', function () {
    const src = fs.readFileSync(SERVICE_PATH, 'utf8');
    const forbidden = [
      [/localStorage/, 'localStorage'],
      [/sessionStorage/, 'sessionStorage'],
      [/document\./, 'document.'],
      [/window\./, 'window.'],
      [/XMLHttpRequest/, 'XMLHttpRequest'],
      [/\borchestrate\s*\(/, 'orchestrate('],
      [/analyzeChunk/, 'analyzeChunk'],
      [/enforceScoreConsistency/, 'enforceScoreConsistency'],
      [/_techCache/, '_techCache'],
      [/pt_results/, 'pt_results'],
      [/pt_tickers/, 'pt_tickers'],
      [/pt_holdings/, 'pt_holdings'],
      [/console\.(log|warn|error)/, 'console output (token-leak channel)']
    ];
    for (const f of forbidden) {
      ok(!f[0].test(src), 'service source contains forbidden token: ' + f[1]);
    }
    ok(/'use strict';/.test(src), 'service source keeps strict mode');
  });

  await test('RC28: exact CommonJS export surface', function () {
    const expected = [
      'FUND_FACTS_READ_ENDPOINT',
      'FUND_FACTS_READ_TIMEOUT_MS',
      'FUND_FACTS_READ_SERVER_STATUSES',
      'FUND_FACTS_READ_ERROR_REASONS',
      'FUND_FACTS_READ_HTTP_BY_STATUS',
      'FUND_FACTS_READ_TICKER_ECHO_STATUSES',
      'FUND_FACTS_READ_CLIENT_REASONS',
      'normalizeFundFactsReadResponse',
      'requestFundFactsRead',
      '_ffrIsNonEmptyString',
      '_ffrHasExactKeys',
      '_ffrValidFact',
      '_ffrValidSeries',
      '_ffrValidDerived',
      '_ffrValidGaps',
      '_ffrForbiddenFieldsAbsent',
      '_ffrValidStamp',
      '_ffrValidFreshness',
      '_ffrValidOkEnvelope',
      '_ffrValidErrorEnvelope'
    ];
    eq(Object.keys(client).sort(), expected.slice().sort(), 'export key set');
    ok(typeof client.normalizeFundFactsReadResponse === 'function', 'normalizer exported as function');
    ok(typeof client.requestFundFactsRead === 'function', 'executor exported as function');
    eq(client.FUND_FACTS_READ_ENDPOINT, '/.netlify/functions/fund-facts-read', 'endpoint constant');
    eq(client.FUND_FACTS_READ_TIMEOUT_MS, 12000, 'timeout constant');
  });

  await test('RC29: supplied non-function fetchImpl fails closed (no global fetch fallback)', async function () {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
    const saved = globalThis.fetch;
    let globalCalls = 0;
    globalThis.fetch = function () { globalCalls += 1; return respond(200, makeOkEnvelope('AAPL')); };
    try {
      const r = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: 42 });
      expectResult(r, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', 'AAPL', 'fetchImpl 42 with live global fetch spy');
      eq(globalCalls, 0, 'global fetch spy never called for supplied non-function fetchImpl');
      const rU = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: undefined });
      expectResult(rU, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_UNAVAILABLE', 'AAPL', 'explicit undefined fetchImpl counts as supplied');
      eq(globalCalls, 0, 'global fetch spy still never called');
      const rOk = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T' });
      eq(rOk.status, 'OK', 'absent fetchImpl key uses the global fetch');
      eq(globalCalls, 1, 'global fetch spy called exactly once for the absent-key case');
    } finally {
      if (had) { globalThis.fetch = saved; } else { delete globalThis.fetch; }
    }
    eq(Object.prototype.hasOwnProperty.call(globalThis, 'fetch'), had, 'global fetch presence restored');
    if (had) { ok(globalThis.fetch === saved, 'global fetch value restored'); }
  });

  await test('RC30: AbortController/setTimeout setup failures resolve FETCH_FAILED', async function () {
    const hadAC = Object.prototype.hasOwnProperty.call(globalThis, 'AbortController');
    const savedAC = globalThis.AbortController;
    const sAc = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
    globalThis.AbortController = function () { throw new Error('BOOM_ABORTCTRL_4d'); };
    let rAc;
    try {
      rAc = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: sAc });
    } finally {
      if (hadAC) { globalThis.AbortController = savedAC; } else { delete globalThis.AbortController; }
    }
    expectResult(rAc, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', 'AAPL', 'AbortController constructor throws');
    noLeak(rAc, ['BOOM_ABORTCTRL_4d'], 'AbortController constructor throws');
    eq(sAc.calls.length, 0, 'no fetch call after AbortController setup failure');
    eq(Object.prototype.hasOwnProperty.call(globalThis, 'AbortController'), hadAC, 'AbortController presence restored');
    if (hadAC) { ok(globalThis.AbortController === savedAC, 'AbortController value restored'); }

    const hadST = Object.prototype.hasOwnProperty.call(globalThis, 'setTimeout');
    const savedST = globalThis.setTimeout;
    const sSt = spy(function () { return respond(200, makeOkEnvelope('AAPL')); });
    globalThis.setTimeout = function () { throw new Error('BOOM_SETTIMEOUT_8a'); };
    let rSt;
    try {
      rSt = await client.requestFundFactsRead({ ticker: 'AAPL', token: 'T', fetchImpl: sSt });
    } finally {
      if (hadST) { globalThis.setTimeout = savedST; } else { delete globalThis.setTimeout; }
    }
    expectResult(rSt, 'client', 'CLIENT_NETWORK_ERROR', 'FETCH_FAILED', 'AAPL', 'setTimeout throws during timer setup');
    noLeak(rSt, ['BOOM_SETTIMEOUT_8a'], 'setTimeout throws during timer setup');
    eq(sSt.calls.length, 0, 'no fetch call after setTimeout setup failure');
    eq(Object.prototype.hasOwnProperty.call(globalThis, 'setTimeout'), hadST, 'setTimeout presence restored');
    ok(globalThis.setTimeout === savedST, 'setTimeout value restored');
  });

  // ── S6-B helpers: index.html extraction + fake DOM ──────────────────────────

  function extractFn(source, name) {
    const sig = 'function ' + name + '(';
    const start = source.indexOf(sig);
    if (start === -1) { return null; }
    const isAsync = source.slice(Math.max(0, start - 6), start) === 'async ';
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < source.length; i += 1) {
      if (source[i] === '{') { depth += 1; }
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { return (isAsync ? 'async ' : '') + source.slice(start, i + 1); }
      }
    }
    return null;
  }

  // Real-DOM semantics for the one mutation the renderer relies on:
  // assigning textContent removes all existing children.
  function fakeEl(tag) {
    const el = {
      tag: tag, className: '', disabled: false, value: '',
      children: [],
      appendChild: function (c) { this.children.push(c); return c; }
    };
    let ownText = '';
    Object.defineProperty(el, 'textContent', {
      get: function () { return ownText; },
      set: function (v) { ownText = String(v); el.children.length = 0; }
    });
    return el;
  }

  function fakeDom(ids) {
    return {
      getElementById: function (id) { return Object.prototype.hasOwnProperty.call(ids, id) ? ids[id] : null; },
      createElement: function (tag) { return fakeEl(tag); }
    };
  }

  function treeText(el) {
    let s = String(el.className || '') + '|' + String(el.textContent || '') + '|' + String(el.value || '');
    for (const c of el.children || []) { s += '||' + treeText(c); }
    return s;
  }

  // The UI functions reference the canonical inlined validators/constants as
  // page globals; the sandbox supplies them from the required service module
  // (plus the pinned ticker grammar, drift-guarded by RC31).
  const FFR_TICKER_RE = /^[A-Z]{1,10}$/;

  function ffrApi(html, win, doc, requestSpy) {
    const names = ['_ffrValidNormalizedResult', '_ffrStatusMsg', '_ffrFmtNum', '_ffrOkRows', '_ffrViewForResult', '_ffrRenderPanel', '_runFundFactsCard'];
    const srcs = names.map(function (n) { return extractFn(html, n); });
    for (let i = 0; i < srcs.length; i += 1) { ok(srcs[i] !== null, 'extracted ' + names[i] + ' from index.html'); }
    const body = srcs.join('\n') +
      '\nreturn { valid: _ffrValidNormalizedResult, msg: _ffrStatusMsg, fmt: _ffrFmtNum, view: _ffrViewForResult, render: _ffrRenderPanel, run: _runFundFactsCard };';
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'window', 'document', 'requestFundFactsRead',
      '_ffrHasExactKeys', 'FUND_FACTS_READ_TICKER_RE', '_ffrValidOkEnvelope',
      'FUND_FACTS_READ_ERROR_REASONS', 'FUND_FACTS_READ_CLIENT_REASONS',
      body
    );
    return factory(
      win, doc, requestSpy,
      client._ffrHasExactKeys, FFR_TICKER_RE, client._ffrValidOkEnvelope,
      client.FUND_FACTS_READ_ERROR_REASONS, client.FUND_FACTS_READ_CLIENT_REASONS
    );
  }

  // Exact five-key normalized result, in pinned order.
  function res(kind, status, reason, ticker, envelope) {
    return { kind: kind, status: status, reason: reason, ticker: ticker, envelope: envelope };
  }

  await test('RC31: canonical/inline drift guard', function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const service = fs.readFileSync(SERVICE_PATH, 'utf8');
    const BEGIN = '// ═══ BEGIN-VERBATIM services/fund-facts-read-client.js ═══';
    const END = '// ═══ END-VERBATIM services/fund-facts-read-client.js ═══';
    eq(html.split(BEGIN).length - 1, 1, 'exactly one BEGIN marker');
    eq(html.split(END).length - 1, 1, 'exactly one END marker');
    const bAt = html.indexOf(BEGIN);
    const eAt = html.indexOf(END);
    ok(bAt < eAt, 'BEGIN precedes END');
    const afterBegin = html.indexOf('\n', bAt) + 1;
    const extracted = html.slice(afterBegin, eAt).replace(/\r\n/g, '\n');
    const canonical = service.replace(/\r\n/g, '\n');
    ok(extracted === canonical, 'inline block equals the canonical service after LF normalization');
    ok(extracted.indexOf("if (typeof module !== 'undefined' && module.exports)") !== -1, 'module guard included in the inline copy');
    ok(extracted.indexOf("'use strict';") === 0, 'inline copy starts with the full service file');
  });

  await test('RC32: strict client gate — static', function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const ro = fs.readFileSync(RUN_OFFLINE_PATH, 'utf8');
    ok(html.indexOf('window.PT_ENABLE_FUND_FACTS_READ_CLIENT === true') !== -1, 'render entry strict === true check present');
    ok(html.indexOf('window.PT_ENABLE_FUND_FACTS_READ_CLIENT !== true') !== -1, 'request entry strict !== true check present');
    ok(!/window\.PT_ENABLE_FUND_FACTS_READ_CLIENT\s*=[^=]/.test(html), 'gate is never assigned or initialized');
    ok(!/pt_enable_fund_facts/.test(html), 'gate has no lowercase storage-key form anywhere');
    eq(ro.split("'PT_ENABLE_FUND_FACTS_READ_CLIENT'").length - 1, 1, 'gate registered exactly once in CLIENT_GATES');
    ok(ro.indexOf('10 known client gates') !== -1, 'stale gate-count comment updated to 10');
    ok(ro.indexOf('fund_facts_read_offline.js') === -1, 'unrelated read-endpoint suite not registered');
    ok(ro.indexOf('news_catalysts_provider_offline.js') === -1, 'unrelated news suite not registered');
  });

  await test('RC33: gate behavior — no request unless strictly true; token cleared first', async function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    function setup(gateValue) {
      const btn = fakeEl('button');
      const input = fakeEl('input');
      input.value = 'tok-123';
      const panel = fakeEl('div');
      const ids = { 'ffr-btn-AAPL': btn, 'ffr-token-AAPL': input, 'ffr-panel-AAPL': panel };
      const calls = [];
      const spyReq = function (opts) {
        calls.push({
          opts: opts,
          inputValueAtCall: input.value,
          loadingShownAtCall: panel.children.length === 1 &&
            String(panel.children[0].className).indexOf('ffr-state-loading') !== -1
        });
        return Promise.resolve(res('ok', 'OK', null, 'AAPL', makeOkEnvelope('AAPL')));
      };
      const win = {};
      if (gateValue !== undefined) { win.PT_ENABLE_FUND_FACTS_READ_CLIENT = gateValue; }
      const api = ffrApi(html, win, fakeDom(ids), spyReq);
      return { api: api, calls: calls, btn: btn, input: input, panel: panel };
    }
    let s = setup(undefined);
    await s.api.run('AAPL');
    eq(s.calls.length, 0, 'gate absent: zero requests');
    s = setup(false);
    await s.api.run('AAPL');
    eq(s.calls.length, 0, 'gate false: zero requests');
    s = setup('true');
    await s.api.run('AAPL');
    eq(s.calls.length, 0, "gate string 'true': zero requests (strict boolean)");
    s = setup(1);
    await s.api.run('AAPL');
    eq(s.calls.length, 0, 'gate truthy non-boolean: zero requests');
    s = setup(true);
    await s.api.run('AAPL');
    eq(s.calls.length, 1, 'gate strictly true: exactly one request');
    eq(s.calls[0].opts, { ticker: 'AAPL', token: 'tok-123' }, 'request carries ticker and token');
    eq(s.calls[0].inputValueAtCall, '', 'token input cleared BEFORE the request runs');
    eq(s.calls[0].loadingShownAtCall, true, 'loading state is on screen at the moment the request is invoked');
    eq(s.input.value, '', 'input remains cleared after the run');
    eq(s.btn.disabled, false, 'button restored after the run');
    eq(s.panel.children.length, 1, 'final panel holds only the result view (loading tree replaced)');
    ok(String(s.panel.children[0].className).indexOf('ffr-state-ok') !== -1, 'final view is the OK state');
    const btnless = (function () {
      const input = fakeEl('input');
      input.value = 't';
      const ids = { 'ffr-token-AAPL': input, 'ffr-panel-AAPL': fakeEl('div') };
      const calls = [];
      const api = ffrApi(html, { PT_ENABLE_FUND_FACTS_READ_CLIENT: true }, fakeDom(ids), function () { calls.push(1); return Promise.resolve(null); });
      return { api: api, calls: calls };
    })();
    await btnless.api.run('AAPL');
    eq(btnless.calls.length, 0, 'missing button element: zero requests (no stale-DOM bypass)');
  });

  await test('RC34: token hygiene in card template and rendered output', async function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    ok(html.indexOf('<input type="password" class="ffr-token-input" id="ffr-token-${item.ticker}" placeholder="read token" autocomplete="off"') !== -1,
      'password-type token input with autocomplete off, pinned to the ffr token id');
    const runSrc = extractFn(html, '_runFundFactsCard');
    const clearAt = runSrc.indexOf("input.value = ''");
    const callAt = runSrc.indexOf('requestFundFactsRead({');
    ok(clearAt !== -1 && callAt !== -1 && clearAt < callAt, 'input cleared before requestFundFactsRead in source order');
    const btn = fakeEl('button');
    const input = fakeEl('input');
    input.value = 'SECRET_UI_TOKEN_91b2';
    const panel = fakeEl('div');
    const ids = { 'ffr-btn-MSFT': btn, 'ffr-token-MSFT': input, 'ffr-panel-MSFT': panel };
    const api = ffrApi(html, { PT_ENABLE_FUND_FACTS_READ_CLIENT: true }, fakeDom(ids), function () {
      return Promise.resolve(res('server', 'UNAUTHORIZED', 'UNAUTHORIZED', 'MSFT', null));
    });
    await api.run('MSFT');
    ok(treeText(panel).indexOf('SECRET_UI_TOKEN_91b2') === -1, 'token never appears anywhere in the rendered tree');
    eq(input.value, '', 'token input cleared');
  });

  await test('RC35: renderer accepts only fully valid normalized results; malformed matrix', function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const api = ffrApi(html, {}, fakeDom({}), function () { return Promise.resolve(null); });
    const FALLBACK = 'Unexpected result — nothing was rendered.';

    // Genuinely valid results per status: correct kind, pinned reason,
    // correlated ticker rules (CLIENT_INVALID_INPUT -> null ticker).
    const validCases = [];
    for (const st of Object.keys(client.FUND_FACTS_READ_ERROR_REASONS)) {
      validCases.push([st, res('server', st, client.FUND_FACTS_READ_ERROR_REASONS[st][0], 'AAPL', null)]);
    }
    for (const st of Object.keys(client.FUND_FACTS_READ_CLIENT_REASONS)) {
      const ticker = st === 'CLIENT_INVALID_INPUT' ? null : 'AAPL';
      validCases.push([st, res('client', st, client.FUND_FACTS_READ_CLIENT_REASONS[st][0], ticker, null)]);
    }
    eq(validCases.length, 12, 'eight server + four client statuses covered');
    const msgs = new Set();
    for (const c of validCases) {
      const v = api.view(c[1]);
      eq(v.rows.length, 1, c[0] + ': single message row');
      ok(typeof v.rows[0].value === 'string' && v.rows[0].value.length > 0, c[0] + ': non-empty fixed message');
      ok(v.rows[0].value !== FALLBACK, c[0] + ': valid result never gets the fallback view');
      msgs.add(v.rows[0].value);
      const expectedKind = (c[0] === 'DISABLED' || c[0] === 'NOT_AVAILABLE') ? 'neutral' : 'error';
      eq(v.kind, expectedKind, c[0] + ': kind is ' + expectedKind);
    }
    eq(msgs.size, validCases.length, 'all 12 non-OK messages are distinct');
    eq(api.view('loading').kind, 'loading', 'loading state present');
    const okv = api.view(res('ok', 'OK', null, 'AAPL', makeOkEnvelope('AAPL')));
    eq(okv.kind, 'ok', 'OK state present and distinct');
    ok(okv.rows.length >= 8, 'OK renders the validated envelope rows');
    ok(okv.rows[0].value.indexOf('AAPL') !== -1, 'OK identity row shows the correlated requested ticker');

    // Malformed-result matrix: every case must not throw, must be kind
    // 'error' with the exact fixed fallback message, and must render no
    // envelope-derived value.
    const envMissing = makeOkEnvelope('AAPL');
    delete envMissing.freshness;
    const reordered = { status: 'OK', kind: 'ok', reason: null, ticker: 'AAPL', envelope: makeOkEnvelope('AAPL') };
    const nullProto = Object.assign(Object.create(null), res('server', 'DISABLED', 'SERVER_DISABLED', 'AAPL', null));
    const malformed = [
      ['OK with empty envelope', res('ok', 'OK', null, 'AAPL', {})],
      ['OK with missing envelope fields', res('ok', 'OK', null, 'AAPL', envMissing)],
      ['OK with ticker/envelope mismatch', res('ok', 'OK', null, 'AAPL', makeOkEnvelope('MSFT'))],
      ['OK with wrong kind', res('server', 'OK', null, 'AAPL', makeOkEnvelope('AAPL'))],
      ['OK with non-null reason', res('ok', 'OK', 'X', 'AAPL', makeOkEnvelope('AAPL'))],
      ['missing result key', { kind: 'server', status: 'DISABLED', reason: 'SERVER_DISABLED', ticker: 'AAPL' }],
      ['extra result key', { kind: 'server', status: 'DISABLED', reason: 'SERVER_DISABLED', ticker: 'AAPL', envelope: null, zz: 1 }],
      ['reordered result keys', reordered],
      ['server status with wrong kind', res('client', 'DISABLED', 'SERVER_DISABLED', 'AAPL', null)],
      ['server status with wrong reason', res('server', 'DISABLED', 'UNAUTHORIZED', 'AAPL', null)],
      ['server status with null ticker', res('server', 'DISABLED', 'SERVER_DISABLED', null, null)],
      ['server status with invalid ticker', res('server', 'DISABLED', 'SERVER_DISABLED', 'brk.b', null)],
      ['server status with non-null envelope', res('server', 'NOT_AVAILABLE', 'NO_RECORD', 'AAPL', {})],
      ['client status with wrong reason', res('client', 'CLIENT_TIMEOUT', 'FETCH_FAILED', 'AAPL', null)],
      ['CLIENT_INVALID_INPUT with non-null ticker', res('client', 'CLIENT_INVALID_INPUT', 'TICKER_INVALID', 'AAPL', null)],
      ['other CLIENT_* with null ticker', res('client', 'CLIENT_TIMEOUT', 'REQUEST_TIMEOUT', null, null)],
      ['array result', ['x']],
      ['null-prototype result', nullProto],
      ['null result', null],
      ['number result', 42],
      ['string result', 'OK'],
      ['empty object result', {}],
      ['legacy status-only object', { status: 'OK', envelope: null }]
    ];
    for (const m of malformed) {
      const v = api.view(m[1]);
      eq(v.kind, 'error', m[0] + ': fails safely to error kind');
      eq(v.rows.length, 1, m[0] + ': single fallback row');
      eq(v.rows[0].value, FALLBACK, m[0] + ': exact fixed fallback message');
    }
    ok(JSON.stringify(api.view(res('ok', 'OK', null, 'AAPL', makeOkEnvelope('MSFT')))).indexOf('MSFT') === -1,
      'mismatched envelope contributes nothing to the rendered view');
    ok(api.view(res('server', 'CONFIGURATION_MISSING', 'TOKEN_COLLISION', 'AAPL', null)).rows[0].value.indexOf('TOKEN_COLLISION') === -1,
      'no server-reason echo in messages');
    ok(api.msg('DEGRADED') !== api.msg('NOT_AVAILABLE'), 'DEGRADED and NOT_AVAILABLE distinguishable');
    ok(api.valid(res('ok', 'OK', null, 'AAPL', makeOkEnvelope('AAPL'))) === true, '_ffrValidNormalizedResult accepts the canonical OK result');
    ok(api.valid(res('ok', 'OK', null, 'AAPL', {})) === false, '_ffrValidNormalizedResult rejects an empty envelope');
  });

  await test('RC36: isolation — forbidden surface and zero network in the UI block', function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const START = '// ── S6-B: Fund Facts gated manual UI';
    const STOP = '// ── end S6-B Fund Facts handlers';
    eq(html.split(START).length - 1, 1, 'one UI block start marker');
    eq(html.split(STOP).length - 1, 1, 'one UI block end marker');
    const block = html.slice(html.indexOf(START), html.indexOf(STOP));
    const forbidden = [/localStorage/, /sessionStorage/, /innerHTML/, /\bdataset\b/, /console\./, /XMLHttpRequest/, /pt_results/, /pt_tickers/, /pt_holdings/, /\borchestrate\s*\(/, /analyzeChunk/, /enforceScoreConsistency/, /_techCache/, /\beval\s*\(/, /new\s+Function/];
    for (const re of forbidden) { ok(!re.test(block), 'UI block contains forbidden token: ' + re); }
    const cAt = html.indexOf('<!-- FUND FACTS (SEC XBRL');
    ok(cAt !== -1, 'card template present');
    const cEnd = html.indexOf("` : ''}", cAt);
    ok(cEnd !== -1, 'card template closes');
    const card = html.slice(cAt, cEnd);
    eq(card.split('onclick=').length - 1, 1, 'exactly one onclick in the card');
    ok(card.indexOf('_runFundFactsCard') !== -1, 'onclick wired to the gated handler');
    ok(!/localStorage|sessionStorage|innerHTML/.test(card), 'card template clean');
    let netCalls = 0;
    const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
    const savedFetch = globalThis.fetch;
    globalThis.fetch = function () { netCalls += 1; return Promise.reject(new Error('no network in render')); };
    try {
      const api = ffrApi(html, {}, fakeDom({}), function () { netCalls += 1; return Promise.resolve(null); });
      const panel = fakeEl('div');
      api.render(panel, api.view(res('ok', 'OK', null, 'AAPL', makeOkEnvelope('AAPL'))));
      api.render(panel, api.view('loading'));
      eq(netCalls, 0, 'zero network calls during view/render');
    } finally {
      if (hadFetch) { globalThis.fetch = savedFetch; } else { delete globalThis.fetch; }
    }
  });

  await test('RC37: unexpected request rejection fails closed (fixed view, no leak)', async function () {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const btn = fakeEl('button');
    const input = fakeEl('input');
    input.value = 'SECRET_TOKEN_R37_x1';
    const panel = fakeEl('div');
    const ids = { 'ffr-btn-AAPL': btn, 'ffr-token-AAPL': input, 'ffr-panel-AAPL': panel };
    const api = ffrApi(html, { PT_ENABLE_FUND_FACTS_READ_CLIENT: true }, fakeDom(ids), function () {
      return Promise.reject(new Error('SECRET_REJECTION_MARKER_c4d9'));
    });
    await api.run('AAPL'); // must resolve — a rejection here fails the test
    eq(panel.children.length, 1, 'final panel holds a single view');
    ok(String(panel.children[0].className).indexOf('ffr-state-error') !== -1, 'final view is the error state');
    const rendered = treeText(panel);
    ok(rendered.indexOf('Server response failed validation') !== -1, 'fixed CLIENT_INVALID_RESPONSE message rendered');
    ok(rendered.indexOf('SECRET_REJECTION_MARKER_c4d9') === -1, 'exception marker absent from the rendered tree');
    ok(rendered.indexOf('SECRET_TOKEN_R37_x1') === -1, 'token absent from the rendered tree');
    eq(input.value, '', 'input remains empty');
    eq(btn.disabled, false, 'button restored');
    eq(btn.textContent, '↺ Load Fund Facts', 'button label restored');
  });

  console.log('');
  console.log('fund_facts_read_client_test: ' + testsPassed + ' passed, ' + testsFailed + ' failed, ' + assertions + ' assertions');
  if (testsFailed > 0) { process.exit(1); }
})();
