'use strict';

/*
 * qa/fund_facts_provider_offline.js
 *
 * EG-25C-1 · C1-S1 — J1 SEC Financial Facts provider: FS-series offline QA.
 *
 * Proves the pure provider lib (netlify/functions/lib/fund-facts-provider.js)
 * with ZERO real network / Blob / env / store / DOM / production. Every SEC call
 * is served by an INJECTED fetch over inline companyfacts-style fixtures, and a
 * throwing global.fetch guard is installed throughout to prove the provider
 * never touches the real network.
 *
 * Coverage (spec §4.3 core set + owner QA list):
 *   FS01 full-coverage benchmark  — exact deep-equal + stringify-equal (§2.4 shape)
 *   FS02 concept fallback order    — revenue→Revenues, eps diluted→basic; conceptUsed
 *   FS03 all concepts absent       — null series + gaps, never zero
 *   FS04 true-quarter YoY pairing  — off-window YTD excluded; no prior ⇒ null
 *   FS05 derived edges             — prior≤0 ⇒ null; equity≤0 ⇒ d/e null; capex sign
 *   FS06 basis-refs mandatory      — every emitted derived carries non-empty basis
 *   FS12 zero real fetch           — injected fetch only; global.fetch guarded
 *   FS13 6-h cache                 — one companyfacts fetch per CIK within window
 *   FS14 determinism + immutability— identical output twice; input never mutated
 *   FS-M malformed input           — never throws; degrades to null/gaps
 *   FS-S surface scan              — no endpoint/route/gate/env/store/UI/scoring/live
 *
 * Run: node qa/fund_facts_provider_offline.js
 * (QA seam: FUND_FACTS_PROVIDER_PATH overrides the module under test for a
 *  candidate build; defaults to the installed lib path.)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = process.env.FUND_FACTS_PROVIDER_PATH
  ? path.resolve(process.env.FUND_FACTS_PROVIDER_PATH)
  : path.resolve(__dirname, '..', 'netlify', 'functions', 'lib', 'fund-facts-provider.js');
const provider = require(SRC);

const UA = 'PulseC1S1Test/1.0 qa@example.com';
const NOW_ISO = '2026-07-15T00:00:00.000Z';
const RUN_ID = 1700000000000;

const CIK = '0001800667';
const A0 = '0001800667-25-000012';
const A1 = '0001800667-26-000042';
const URL_A0 = 'https://www.sec.gov/Archives/edgar/data/1800667/000180066725000012/';
const URL_A1 = 'https://www.sec.gov/Archives/edgar/data/1800667/000180066726000042/';
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + CIK + '.json';

// ── fixture builders ─────────────────────────────────────────────────────────
function durEntry(start, end, val, fy, fp, form, filed, accn) {
  return { start: start, end: end, val: val, fy: fy, fp: fp, form: form, filed: filed, accn: accn };
}
function instEntry(end, val, fy, fp, form, filed, accn) {
  return { end: end, val: val, fy: fy, fp: fp, form: form, filed: filed, accn: accn };
}
function node(unit, entries) {
  var u = {};
  u[unit] = entries;
  return { units: u };
}
function companyFacts(usgaap) {
  return { cik: parseInt(CIK, 10), entityName: 'JFrog Ltd.', facts: { 'us-gaap': usgaap } };
}

// Full-coverage-except-debt us-gaap fixture used by FS01.
function usgaapFull() {
  return {
    RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
      durEntry('2025-01-01', '2025-03-31', 100000000, 2025, 'Q1', '10-Q', '2025-05-08', A0),
      durEntry('2026-01-01', '2026-03-31', 125000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    NetIncomeLoss: node('USD', [
      durEntry('2026-01-01', '2026-03-31', 20000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    EarningsPerShareDiluted: node('USD/shares', [
      durEntry('2026-01-01', '2026-03-31', 0.45, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    NetCashProvidedByUsedInOperatingActivities: node('USD', [
      durEntry('2026-01-01', '2026-03-31', 30000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    PaymentsToAcquirePropertyPlantAndEquipment: node('USD', [
      durEntry('2026-01-01', '2026-03-31', 8000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    CashAndCashEquivalentsAtCarryingValue: node('USD', [
      instEntry('2026-03-31', 60000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    StockholdersEquity: node('USD', [
      instEntry('2026-03-31', 40000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ]),
    WeightedAverageNumberOfDilutedSharesOutstanding: node('shares', [
      durEntry('2026-01-01', '2026-03-31', 95000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
    ])
    // debt concepts intentionally absent → the single gap.
  };
}

// The exact FS01 benchmark record (§2.4 shape; key order matches the builder).
function ff(concept, unit, fy, fp, ps, pe, val, form, accn, url, filed) {
  return {
    concept: concept, unit: unit, fiscalYear: fy, fiscalPeriod: fp,
    periodStart: ps, periodEnd: pe, valueNumeric: val, form: form,
    accessionNumber: accn, filingUrl: url, filed: filed
  };
}
function expectedRecordFS01() {
  return {
    ticker: 'FROG',
    cik: CIK,
    fetchedAt: NOW_ISO,
    sourceTier: 'sec_xbrl_primary',
    contractVersion: 'fund-contract-v1',
    provider: 'j1-sec-facts@job-model-v1',
    runId: RUN_ID,
    series: {
      revenue: {
        conceptUsed: 'RevenueFromContractWithCustomerExcludingAssessedTax',
        facts: [
          ff('RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', 2025, 'Q1', '2025-01-01', '2025-03-31', 100000000, '10-Q', A0, URL_A0, '2025-05-08'),
          ff('RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', 2026, 'Q1', '2026-01-01', '2026-03-31', 125000000, '10-Q', A1, URL_A1, '2026-05-08')
        ]
      },
      netIncome: {
        conceptUsed: 'NetIncomeLoss',
        facts: [ff('NetIncomeLoss', 'USD', 2026, 'Q1', '2026-01-01', '2026-03-31', 20000000, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      eps: {
        conceptUsed: 'EarningsPerShareDiluted',
        facts: [ff('EarningsPerShareDiluted', 'USD/shares', 2026, 'Q1', '2026-01-01', '2026-03-31', 0.45, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      cfo: {
        conceptUsed: 'NetCashProvidedByUsedInOperatingActivities',
        facts: [ff('NetCashProvidedByUsedInOperatingActivities', 'USD', 2026, 'Q1', '2026-01-01', '2026-03-31', 30000000, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      capex: {
        conceptUsed: 'PaymentsToAcquirePropertyPlantAndEquipment',
        facts: [ff('PaymentsToAcquirePropertyPlantAndEquipment', 'USD', 2026, 'Q1', '2026-01-01', '2026-03-31', 8000000, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      cash: {
        conceptUsed: 'CashAndCashEquivalentsAtCarryingValue',
        facts: [ff('CashAndCashEquivalentsAtCarryingValue', 'USD', 2026, 'Q1', null, '2026-03-31', 60000000, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      debt: { conceptUsed: null, facts: [] },
      equity: {
        conceptUsed: 'StockholdersEquity',
        facts: [ff('StockholdersEquity', 'USD', 2026, 'Q1', null, '2026-03-31', 40000000, '10-Q', A1, URL_A1, '2026-05-08')]
      },
      shares: {
        conceptUsed: 'WeightedAverageNumberOfDilutedSharesOutstanding',
        facts: [ff('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', 2026, 'Q1', '2026-01-01', '2026-03-31', 95000000, '10-Q', A1, URL_A1, '2026-05-08')]
      }
    },
    derived: {
      revenueGrowth: { method: 'yoy_quarterly', valuePct: 25, basis: ['revenue:2026Q1', 'revenue:2025Q1'], computedAt: RUN_ID },
      netMargin: { method: 'net_margin', valuePct: 16, basis: ['netIncome:2026Q1', 'revenue:2026Q1'], computedAt: RUN_ID },
      freeCashFlow: { method: 'cfo_minus_capex', valueNumeric: 22000000, basis: ['cfo:2026Q1', 'capex:2026Q1'], computedAt: RUN_ID },
      balanceSheetStrength: null
    },
    filings: [
      { form: '10-Q', accessionNumber: A0, filedAt: '2025-05-08', reportDate: '2025-03-31', filingUrl: URL_A0 },
      { form: '10-Q', accessionNumber: A1, filedAt: '2026-05-08', reportDate: '2026-03-31', filingUrl: URL_A1 }
    ],
    gaps: ['debt: no concept present (LongTermDebtNoncurrent, LongTermDebtCurrent, LongTermDebt, ShortTermBorrowings)'],
    secRequests: [TICKERS_URL, FACTS_URL],
    confidence: null,
    verificationStatus: 'verified'
  };
}

// ── injected fetch over fixtures (no real network) ───────────────────────────
function jsonResponse(status, body) {
  var text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status: status, headers: { get: function () { return null; } }, text: async function () { return text; } };
}
function makeFetch(usgaap, tickers) {
  var spy = { calls: [], tickersCalls: 0, factsCalls: 0 };
  spy.fn = async function (url) {
    var u = String(url);
    spy.calls.push(u);
    if (u.indexOf('company_tickers.json') !== -1) {
      spy.tickersCalls += 1;
      return jsonResponse(200, tickers || { '0': { cik_str: parseInt(CIK, 10), ticker: 'FROG', title: 'JFrog Ltd.' } });
    }
    if (u.indexOf('companyfacts/CIK') !== -1) {
      spy.factsCalls += 1;
      return jsonResponse(200, companyFacts(usgaap));
    }
    return jsonResponse(404, {});
  };
  return spy;
}
function wrapperOpts(spy, extra) {
  return Object.assign({ fetchImpl: spy.fn, userAgent: UA, nowIso: NOW_ISO, runId: RUN_ID }, extra || {});
}
function liveGuard() { throw new Error('LIVE_NETWORK_FORBIDDEN'); }

// ── runner (mirrors qa/sec10q_live_cik_seam_offline.js) ──────────────────────
var passed = 0;
var failed = 0;
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
  process.stdout.write('\n=== C1-S1 — fund-facts-provider FS-series (offline) ===\n\n');

  var _origFetch = global.fetch;
  global.fetch = liveGuard; // behavioral network guard: injected fetch only.

  // ── FS01: full-coverage benchmark, exact deep-equal + stringify-equal ───────
  await test('FS01 full-coverage record deep-equals AND stringify-equals the §2.4 benchmark', async function () {
    provider._clearCaches();
    var spy = makeFetch(usgaapFull());
    var out = await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy));
    assert.strictEqual(out.cik, CIK, 'cik');
    var expected = expectedRecordFS01();
    assert.deepStrictEqual(out.record, expected, 'record deep-equal');
    assert.strictEqual(JSON.stringify(out.record), JSON.stringify(expected), 'record stringify-equal (key order)');
    // spot pins
    assert.strictEqual(out.record.derived.revenueGrowth.valuePct, 25);
    assert.strictEqual(out.record.derived.netMargin.valuePct, 16);
    assert.strictEqual(out.record.derived.freeCashFlow.valueNumeric, 22000000);
    assert.deepStrictEqual(out.record.secRequests, [TICKERS_URL, FACTS_URL]);
    assert.strictEqual(out.record.gaps.length, 1);
  });

  // ── FS02: concept fallback order + conceptUsed recorded ─────────────────────
  await test('FS02 revenue falls back to Revenues; eps falls back to basic; conceptUsed recorded', async function () {
    var usgaap = {
      // primary revenue concept absent → second concept 'Revenues' present
      Revenues: node('USD', [durEntry('2026-01-01', '2026-03-31', 55000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)]),
      // diluted EPS absent → basic present
      EarningsPerShareBasic: node('USD/shares', [durEntry('2026-01-01', '2026-03-31', 0.30, 2026, 'Q1', '10-Q', '2026-05-08', A1)])
    };
    var rec = provider.extractFundFacts(companyFacts(usgaap), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.strictEqual(rec.series.revenue.conceptUsed, 'Revenues');
    assert.strictEqual(rec.series.revenue.facts[0].concept, 'Revenues');
    assert.strictEqual(rec.series.eps.conceptUsed, 'EarningsPerShareBasic');
    assert.strictEqual(rec.series.eps.facts[0].concept, 'EarningsPerShareBasic');
    assert.strictEqual(rec.series.eps.facts[0].unit, 'USD/shares');
  });

  // ── FS03: all concepts absent → null series + gaps, never zero ──────────────
  await test('FS03 all concepts absent → conceptUsed null, empty facts, 12 gaps (9 field + 3 derived), derived all null, never zero', async function () {
    var rec = provider.extractFundFacts(companyFacts({}), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    var fields = ['revenue', 'netIncome', 'eps', 'cfo', 'capex', 'cash', 'debt', 'equity', 'shares'];
    fields.forEach(function (f) {
      assert.strictEqual(rec.series[f].conceptUsed, null, f + ' conceptUsed null');
      assert.deepStrictEqual(rec.series[f].facts, [], f + ' facts empty (not zero)');
    });
    assert.strictEqual(rec.gaps.length, 12, '9 absent-field gaps + 3 null-derived gaps (C1-S1-A)');
    assert.ok(rec.gaps.some(function (g) { return g.indexOf('revenueGrowth: no usable true-quarter') === 0; }), 'revenueGrowth derived gap');
    assert.ok(rec.gaps.some(function (g) { return g.indexOf('netMargin: no true-quarter basis') === 0; }), 'netMargin derived gap');
    assert.ok(rec.gaps.some(function (g) { return g.indexOf('freeCashFlow: no true-quarter basis') === 0; }), 'freeCashFlow derived gap');
    assert.strictEqual(rec.derived.revenueGrowth, null);
    assert.strictEqual(rec.derived.netMargin, null);
    assert.strictEqual(rec.derived.freeCashFlow, null);
    assert.strictEqual(rec.derived.balanceSheetStrength, null);
    assert.deepStrictEqual(rec.filings, []);
    // never-zero: no numeric 0 substituted for a missing value anywhere in series
    fields.forEach(function (f) { assert.strictEqual(rec.series[f].facts.length, 0); });
  });

  // ── FS04: true-quarter YoY; off-window YTD excluded; no prior ⇒ null ────────
  await test('FS04 growth uses true-quarter YoY pair; YTD fact excluded; missing prior ⇒ null', async function () {
    var usgaap = {
      RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
        durEntry('2025-01-01', '2025-03-31', 100000000, 2025, 'Q1', '10-Q', '2025-05-08', A0),
        durEntry('2026-01-01', '2026-03-31', 130000000, 2026, 'Q1', '10-Q', '2026-05-08', A1),
        // 6-month YTD (~181 d) tagged Q2 — must be excluded from the YoY pairing
        durEntry('2026-01-01', '2026-06-30', 275000000, 2026, 'Q2', '10-Q', '2026-08-08', '0001800667-26-000055')
      ])
    };
    var rec = provider.extractFundFacts(companyFacts(usgaap), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.ok(rec.derived.revenueGrowth, 'growth computed');
    assert.deepStrictEqual(rec.derived.revenueGrowth.basis, ['revenue:2026Q1', 'revenue:2025Q1'], 'YTD not used as basis');
    assert.strictEqual(rec.derived.revenueGrowth.valuePct, 30); // (130-100)/100*100

    // no prior-year quarter ⇒ null
    var usgaap2 = {
      RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
        durEntry('2026-01-01', '2026-03-31', 130000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
      ])
    };
    var rec2 = provider.extractFundFacts(companyFacts(usgaap2), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.strictEqual(rec2.derived.revenueGrowth, null, 'no prior ⇒ null');
  });

  // ── FS05: derived edges ─────────────────────────────────────────────────────
  await test('FS05 prior≤0 ⇒ growth null; equity≤0 ⇒ debtToEquity null; capex sign normalized', async function () {
    // prior ≤ 0 revenue ⇒ growth null
    var usgaapZeroPrior = {
      RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
        durEntry('2025-01-01', '2025-03-31', 0, 2025, 'Q1', '10-Q', '2025-05-08', A0),
        durEntry('2026-01-01', '2026-03-31', 125000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)
      ])
    };
    var recZP = provider.extractFundFacts(companyFacts(usgaapZeroPrior), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.strictEqual(recZP.derived.revenueGrowth, null, 'prior 0 ⇒ null');

    // equity ≤ 0 ⇒ debtToEquity null but netCash still computable
    var usgaapEq0 = {
      CashAndCashEquivalentsAtCarryingValue: node('USD', [instEntry('2026-03-31', 60000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)]),
      LongTermDebt: node('USD', [instEntry('2026-03-31', 25000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)]),
      StockholdersEquity: node('USD', [instEntry('2026-03-31', 0, 2026, 'Q1', '10-Q', '2026-05-08', A1)])
    };
    var recEq = provider.extractFundFacts(companyFacts(usgaapEq0), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.ok(recEq.derived.balanceSheetStrength, 'bss present (netCash computable)');
    assert.strictEqual(recEq.derived.balanceSheetStrength.netCash, 35000000, 'cash 60M − debt 25M');
    assert.strictEqual(recEq.derived.balanceSheetStrength.debtToEquity, null, 'equity 0 ⇒ d/e null');
    assert.ok(recEq.derived.balanceSheetStrength.basis.length >= 2, 'bss carries basis refs');

    // capex reported negative ⇒ consumed as positive-magnitude outflow
    var usgaapCapexNeg = {
      NetCashProvidedByUsedInOperatingActivities: node('USD', [durEntry('2026-01-01', '2026-03-31', 30000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)]),
      PaymentsToAcquirePropertyPlantAndEquipment: node('USD', [durEntry('2026-01-01', '2026-03-31', -8000000, 2026, 'Q1', '10-Q', '2026-05-08', A1)])
    };
    var recCx = provider.extractFundFacts(companyFacts(usgaapCapexNeg), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.strictEqual(recCx.derived.freeCashFlow.valueNumeric, 22000000, 'FCF = CFO − |capex| = 30M − 8M');
  });

  // ── FS06: basis refs mandatory ──────────────────────────────────────────────
  await test('FS06 every emitted derived carries non-empty basis; unavailable basis ⇒ null (never basis-less)', async function () {
    provider._clearCaches();
    var spy = makeFetch(usgaapFull());
    var out = await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy));
    var d = out.record.derived;
    ['revenueGrowth', 'netMargin', 'freeCashFlow'].forEach(function (k) {
      assert.ok(d[k] && Array.isArray(d[k].basis) && d[k].basis.length > 0, k + ' has non-empty basis');
    });
    // balanceSheetStrength is null here (debt absent) — proving no basis-less object emitted
    assert.strictEqual(d.balanceSheetStrength, null, 'no basis ⇒ null, not an empty-basis object');
  });

  // ── FS12: zero real fetch — injected fetch only ─────────────────────────────
  await test('FS12 provider performs zero real network I/O; uses the injected fetch only', async function () {
    provider._clearCaches();
    assert.strictEqual(global.fetch, liveGuard, 'guard installed');
    var spy = makeFetch(usgaapFull());
    var out = await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy));
    assert.ok(out.record, 'record produced');
    assert.ok(spy.calls.length >= 2, 'the injected fetch (not global.fetch) served the requests');
    // missing SEC_USER_AGENT ⇒ fail closed BEFORE any fetch
    var spy2 = makeFetch(usgaapFull());
    var threw = '';
    try { await provider.getFundFactsWithCik({ ticker: 'FROG' }, { fetchImpl: spy2.fn, nowIso: NOW_ISO }); }
    catch (e) { threw = e && e.message; }
    assert.strictEqual(threw, 'SEC_USER_AGENT_MISSING');
    assert.strictEqual(spy2.calls.length, 0, 'no fetch before the UA gate');
  });

  // ── FS13: 6-h companyfacts cache (single fetch per CIK within window) ────────
  await test('FS13 one companyfacts fetch per CIK within 6 h; refetch after window', async function () {
    provider._clearCaches();
    var spy = makeFetch(usgaapFull());
    await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy));
    await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy));
    assert.strictEqual(spy.factsCalls, 1, 'companyfacts fetched once across two same-clock calls');
    assert.strictEqual(spy.tickersCalls, 1, 'ticker map fetched once across two same-clock calls');
    // advance the injected clock past the 6-h TTL ⇒ refetch
    var later = new Date(Date.parse(NOW_ISO) + 7 * 60 * 60 * 1000).toISOString();
    await provider.getFundFactsWithCik({ ticker: 'FROG' }, wrapperOpts(spy, { nowIso: later }));
    assert.strictEqual(spy.factsCalls, 2, 'companyfacts refetched after the 6-h window');
  });

  // ── FS14: determinism + input immutability ──────────────────────────────────
  await test('FS14 identical output on repeat; input companyFacts never mutated', async function () {
    var cf = companyFacts(usgaapFull());
    var snap = JSON.stringify(cf);
    var r1 = provider.extractFundFacts(cf, { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    var r2 = provider.extractFundFacts(cf, { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.deepStrictEqual(r1, r2, 'deterministic deep-equal');
    assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'deterministic stringify-equal');
    assert.strictEqual(JSON.stringify(cf), snap, 'input companyFacts unmutated');
  });

  // ── FS16: derived period alignment — true-quarter basis only (C1-S1-A) ──────
  await test('FS16 netMargin/FCF use true-quarter basis only; annual/YTD kept in series but excluded from derived', async function () {
    var A2 = '0001800667-26-000055';
    var A3 = '0001800667-26-000003';
    // Each field carries a 2026Q1 true quarter, a 2026 H1 YTD (181 d, later end),
    // and a FY-2025 annual. Under the pre-fix behavior the later-ending YTD would
    // be selected; the fix must pin derived to the true quarter.
    var mixed = {
      RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [
        durEntry('2026-01-01', '2026-03-31', 125000000, 2026, 'Q1', '10-Q', '2026-05-08', A1),
        durEntry('2026-01-01', '2026-06-30', 260000000, 2026, 'Q2', '10-Q', '2026-08-08', A2),
        durEntry('2025-01-01', '2025-12-31', 450000000, 2025, 'FY', '10-K', '2026-02-20', A3)
      ]),
      NetIncomeLoss: node('USD', [
        durEntry('2026-01-01', '2026-03-31', 20000000, 2026, 'Q1', '10-Q', '2026-05-08', A1),
        durEntry('2026-01-01', '2026-06-30', 45000000, 2026, 'Q2', '10-Q', '2026-08-08', A2),
        durEntry('2025-01-01', '2025-12-31', 80000000, 2025, 'FY', '10-K', '2026-02-20', A3)
      ]),
      NetCashProvidedByUsedInOperatingActivities: node('USD', [
        durEntry('2026-01-01', '2026-03-31', 30000000, 2026, 'Q1', '10-Q', '2026-05-08', A1),
        durEntry('2026-01-01', '2026-06-30', 65000000, 2026, 'Q2', '10-Q', '2026-08-08', A2),
        durEntry('2025-01-01', '2025-12-31', 110000000, 2025, 'FY', '10-K', '2026-02-20', A3)
      ]),
      PaymentsToAcquirePropertyPlantAndEquipment: node('USD', [
        durEntry('2026-01-01', '2026-03-31', 8000000, 2026, 'Q1', '10-Q', '2026-05-08', A1),
        durEntry('2026-01-01', '2026-06-30', 18000000, 2026, 'Q2', '10-Q', '2026-08-08', A2),
        durEntry('2025-01-01', '2025-12-31', 35000000, 2025, 'FY', '10-K', '2026-02-20', A3)
      ])
    };
    var rec = provider.extractFundFacts(companyFacts(mixed), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.deepStrictEqual(rec.derived.netMargin.basis, ['netIncome:2026Q1', 'revenue:2026Q1'], 'netMargin pins to the true quarter, not the later YTD/FY');
    assert.strictEqual(rec.derived.netMargin.valuePct, 16, '20M/125M (quarterly), not 45M/260M (YTD)');
    assert.deepStrictEqual(rec.derived.freeCashFlow.basis, ['cfo:2026Q1', 'capex:2026Q1'], 'FCF pins to the true quarter');
    assert.strictEqual(rec.derived.freeCashFlow.valueNumeric, 22000000, '30M − 8M (quarterly)');
    var revFps = rec.series.revenue.facts.map(function (f) { return f.fiscalPeriod; });
    assert.ok(revFps.indexOf('FY') !== -1 && revFps.indexOf('Q2') !== -1, 'FY + YTD retained in raw revenue series');
    assert.strictEqual(rec.series.revenue.facts.length, 3);

    // annual-only ⇒ no true-quarter basis ⇒ null + gap (never zero)
    var annualOnly = {
      RevenueFromContractWithCustomerExcludingAssessedTax: node('USD', [durEntry('2025-01-01', '2025-12-31', 450000000, 2025, 'FY', '10-K', '2026-02-20', A3)]),
      NetIncomeLoss: node('USD', [durEntry('2025-01-01', '2025-12-31', 80000000, 2025, 'FY', '10-K', '2026-02-20', A3)]),
      NetCashProvidedByUsedInOperatingActivities: node('USD', [durEntry('2025-01-01', '2025-12-31', 110000000, 2025, 'FY', '10-K', '2026-02-20', A3)]),
      PaymentsToAcquirePropertyPlantAndEquipment: node('USD', [durEntry('2025-01-01', '2025-12-31', 35000000, 2025, 'FY', '10-K', '2026-02-20', A3)])
    };
    var rec2 = provider.extractFundFacts(companyFacts(annualOnly), { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
    assert.strictEqual(rec2.derived.netMargin, null, 'annual-only ⇒ netMargin null');
    assert.strictEqual(rec2.derived.freeCashFlow, null, 'annual-only ⇒ FCF null');
    assert.ok(rec2.gaps.some(function (g) { return g.indexOf('netMargin: no true-quarter basis') === 0; }), 'netMargin null-derived gap');
    assert.ok(rec2.gaps.some(function (g) { return g.indexOf('freeCashFlow: no true-quarter basis') === 0; }), 'freeCashFlow null-derived gap');
    assert.strictEqual(rec2.series.revenue.facts.length, 1, 'FY revenue retained in raw series');
    assert.strictEqual(rec2.series.revenue.facts[0].fiscalPeriod, 'FY', 'raw series keeps the annual fact');
  });

  // ── FS-M: malformed input never throws ──────────────────────────────────────
  await test('FS-M malformed companyfacts never throws; degrades to null/gaps', async function () {
    var bad = [
      null,
      undefined,
      {},
      { facts: null },
      { facts: { 'us-gaap': null } },
      { facts: { 'us-gaap': { Revenues: { units: { USD: 'not-an-array' } } } } },
      { facts: { 'us-gaap': { Revenues: { units: { USD: [{ end: '2026-03-31', val: 'NaN', fy: 2026, fp: 'Q1' }] } } } } },
      { facts: { 'us-gaap': { Revenues: { units: { USD: [{ start: '2026-01-01', end: 'not-a-date', val: 5, fy: 2026, fp: 'Q1' }] } } } } },
      { facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: [{ start: '2026-01-01', end: '2026-03-31', val: 5, fy: 2026.5, fp: 'Q1' }] } } } } }
    ];
    bad.forEach(function (input, i) {
      var rec = provider.extractFundFacts(input, { ticker: 'FROG', cik: CIK, nowIso: NOW_ISO, runId: RUN_ID });
      assert.ok(rec && typeof rec === 'object', 'case ' + i + ' returns a record');
      assert.ok('series' in rec && 'derived' in rec && 'gaps' in rec, 'case ' + i + ' has full shape');
      // malformed entries never become a numeric fact
      assert.deepStrictEqual(rec.series.revenue.facts, [], 'case ' + i + ' revenue facts empty on malformed');
    });
  });

  // ── FS-S: static forbidden-surface scan of the TARGET module ────────────────
  await test('FS-S provider source has no endpoint/route/gate/env/store/UI/scoring/live surface', async function () {
    var s = fs.readFileSync(SRC, 'utf8');
    var forbidden = [
      [/exports\.handler/, 'endpoint handler'],
      [/statusCode/, 'HTTP status envelope'],
      [/process\.env/, 'env/gate runtime'],
      [/getStore/, 'blob store handle'],
      [/@netlify\/blobs/, 'blob import'],
      [/\.setJSON\s*\(/, 'blob write'],
      [/localStorage|sessionStorage/, 'web storage'],
      [/document\./, 'DOM access'],
      [/window\./, 'window/UI access'],
      [/\borchestrate\s*\(/, 'scoring: orchestrate'],
      [/\banalyzeChunk\b/, 'scoring: analyzeChunk'],
      [/\benforceScoreConsistency\b/, 'scoring: enforceScoreConsistency'],
      [/_techCache/, 'scoring: _techCache'],
      [/sentiment_score/, 'sentiment_score'],
      [/pt_results/, 'pt_results'],
      [/pt_tickers/, 'pt_tickers'],
      [/pt_holdings/, 'pt_holdings'],
      [/writtenKeys/, 'writer key list'],
      [/fundstore:/, 'fundstore key literal'],
      [/(^|[^.\w])fetch\s*\(/, 'bare fetch( call'],
      [/\brequire\s*\(/, 'require() of any module'],
      [/Date\.now\s*\(/, 'Date.now() ambient clock']
    ];
    forbidden.forEach(function (pair) {
      assert.ok(!pair[0].test(s), 'must NOT contain ' + pair[1]);
    });
    // exports present
    assert.ok(/module\.exports\s*=/.test(s), 'module.exports present');
    assert.strictEqual(typeof provider.getFundFactsWithCik, 'function', 'getFundFactsWithCik exported');
    assert.strictEqual(typeof provider.extractFundFacts, 'function', 'extractFundFacts exported');
    // injected-fetch idiom (not a bare fetch)
    assert.ok(/ctx\.fetchImpl\s*\(/.test(s), 'uses injected ctx.fetchImpl');
  });

  global.fetch = _origFetch;

  var result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
