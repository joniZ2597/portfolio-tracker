'use strict';

const { evaluateFundFactsReadPreflight } = require('./fund-facts-read-preflight');
const { evaluateEvidenceFreshness, DEFAULT_WINDOW_TABLE } = require('./evidence-freshness');

const STORE_NAME = 'fund-facts-store';
const KEY_NAMESPACE = 'fundstore:v1';
const CIK_RE = /^\d{10}$/;
const STRONG = { consistency: 'strong' };

const FACTS_CONTRACT_VERSION = 'fund-contract-v1';
const FACTS_SOURCE_TIER = 'sec_xbrl_primary';
const FACTS_PROVIDER = 'j1-sec-facts@job-model-v1';
const READ_CONTRACT_VERSION = 'fund-facts-read-v1';

const SERIES_FIELDS = ['revenue', 'netIncome', 'eps', 'cfo', 'capex', 'cash', 'debt', 'equity', 'shares'];
const DERIVED_FIELDS = ['revenueGrowth', 'netMargin', 'freeCashFlow', 'balanceSheetStrength'];
const READ_GATE_KEY = 'PT_ENABLE_FUND_FACTS_READ_SERVER';

function pointerKey(ticker) { return KEY_NAMESPACE + ':cik:' + ticker; }
function factsKey(cik) { return KEY_NAMESPACE + ':facts:' + cik; }

function isNullableString(v) { return v === null || typeof v === 'string'; }
function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

function validFiscalFact(f) {
  if (!isObject(f) || Object.keys(f).length !== 11) { return false; }
  return typeof f.concept === 'string' &&
    typeof f.unit === 'string' &&
    isFiniteNumber(f.fiscalYear) &&
    typeof f.fiscalPeriod === 'string' &&
    isNullableString(f.periodStart) &&
    typeof f.periodEnd === 'string' &&
    isFiniteNumber(f.valueNumeric) &&
    isNullableString(f.form) &&
    isNullableString(f.accessionNumber) &&
    isNullableString(f.filingUrl) &&
    isNullableString(f.filed);
}

function validSeriesMember(m) {
  if (!isObject(m) || Object.keys(m).length !== 2) { return false; }
  if (!isNullableString(m.conceptUsed)) { return false; }
  return Array.isArray(m.facts) && m.facts.every(validFiscalFact);
}

function validSeries(series) {
  if (!isObject(series) || Object.keys(series).length !== SERIES_FIELDS.length) { return false; }
  return SERIES_FIELDS.every(function (f) {
    return Object.prototype.hasOwnProperty.call(series, f) && validSeriesMember(series[f]);
  });
}

function validBasis(basis) {
  return Array.isArray(basis) && basis.every(function (b) { return typeof b === 'string'; });
}

function validGrowthMetric(m, valueField, expectedMethod) {
  if (m === null) { return true; }
  if (!isObject(m) || Object.keys(m).length !== 4) { return false; }
  return m.method === expectedMethod && isFiniteNumber(m[valueField]) && validBasis(m.basis) && isFiniteNumber(m.computedAt);
}

function validBalanceSheetStrength(m) {
  if (m === null) { return true; }
  if (!isObject(m) || Object.keys(m).length !== 5) { return false; }
  const numOrNull = function (v) { return v === null || isFiniteNumber(v); };
  return m.method === 'balance_sheet_numerics' && numOrNull(m.netCash) && numOrNull(m.debtToEquity) &&
    validBasis(m.basis) && isFiniteNumber(m.computedAt);
}

function validDerived(derived) {
  if (!isObject(derived) || Object.keys(derived).length !== DERIVED_FIELDS.length) { return false; }
  return validGrowthMetric(derived.revenueGrowth, 'valuePct', 'yoy_quarterly') &&
    validGrowthMetric(derived.netMargin, 'valuePct', 'net_margin') &&
    validGrowthMetric(derived.freeCashFlow, 'valueNumeric', 'cfo_minus_capex') &&
    validBalanceSheetStrength(derived.balanceSheetStrength);
}

function validGaps(gaps) {
  return Array.isArray(gaps) && gaps.every(function (g) { return typeof g === 'string'; });
}

function parsePointer(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return { ok: false }; }
  if (!isObject(parsed)) { return { ok: false }; }
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== 'cik') { return { ok: false }; }
  if (typeof parsed.cik !== 'string' || !CIK_RE.test(parsed.cik)) { return { ok: false }; }
  return { ok: true, cik: parsed.cik };
}

const FACTS_RECORD_FIELDS = [
  'ticker',
  'cik',
  'fetchedAt',
  'sourceTier',
  'contractVersion',
  'provider',
  'runId',
  'series',
  'derived',
  'filings',
  'gaps',
  'secRequests',
  'confidence',
  'verificationStatus'
];

function hasExactFields(value, expectedFields) {
  if (!isObject(value)) { return false; }
  const actualFields = Object.keys(value);
  return actualFields.length === expectedFields.length &&
    expectedFields.every(function (field) {
      return Object.prototype.hasOwnProperty.call(value, field);
    });
}

function parseFactsRecord(raw, ticker, cik) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return { ok: false }; }
  if (!hasExactFields(parsed, FACTS_RECORD_FIELDS)) { return { ok: false }; }
  if (parsed.cik !== cik) { return { ok: false }; }
  if (parsed.ticker !== ticker) { return { ok: false }; }
  if (parsed.contractVersion !== FACTS_CONTRACT_VERSION) { return { ok: false }; }
  if (parsed.sourceTier !== FACTS_SOURCE_TIER) { return { ok: false }; }
  if (parsed.provider !== FACTS_PROVIDER) { return { ok: false }; }
  if (typeof parsed.fetchedAt !== 'string' || !isFinite(Date.parse(parsed.fetchedAt))) { return { ok: false }; }
  if (!isFiniteNumber(parsed.runId)) { return { ok: false }; }
  if (parsed.verificationStatus !== 'verified') { return { ok: false }; }
  if (parsed.confidence !== null) { return { ok: false }; }
  if (!validSeries(parsed.series)) { return { ok: false }; }
  if (!validDerived(parsed.derived)) { return { ok: false }; }
  if (!validGaps(parsed.gaps)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

function projectFact(f) {
  return {
    concept: f.concept,
    unit: f.unit,
    fiscalYear: f.fiscalYear,
    fiscalPeriod: f.fiscalPeriod,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
    valueNumeric: f.valueNumeric,
    form: f.form,
    accessionNumber: f.accessionNumber,
    filingUrl: f.filingUrl,
    filed: f.filed
  };
}

function projectSeriesMember(m) {
  return { conceptUsed: m.conceptUsed, facts: m.facts.map(projectFact) };
}

function projectSeries(series) {
  return {
    revenue: projectSeriesMember(series.revenue),
    netIncome: projectSeriesMember(series.netIncome),
    eps: projectSeriesMember(series.eps),
    cfo: projectSeriesMember(series.cfo),
    capex: projectSeriesMember(series.capex),
    cash: projectSeriesMember(series.cash),
    debt: projectSeriesMember(series.debt),
    equity: projectSeriesMember(series.equity),
    shares: projectSeriesMember(series.shares)
  };
}

function projectDerived(derived) {
  return {
    revenueGrowth: derived.revenueGrowth === null ? null : {
      method: derived.revenueGrowth.method,
      valuePct: derived.revenueGrowth.valuePct,
      basis: derived.revenueGrowth.basis
    },
    netMargin: derived.netMargin === null ? null : {
      method: derived.netMargin.method,
      valuePct: derived.netMargin.valuePct,
      basis: derived.netMargin.basis
    },
    freeCashFlow: derived.freeCashFlow === null ? null : {
      method: derived.freeCashFlow.method,
      valueNumeric: derived.freeCashFlow.valueNumeric,
      basis: derived.freeCashFlow.basis
    },
    balanceSheetStrength: derived.balanceSheetStrength === null ? null : {
      method: derived.balanceSheetStrength.method,
      netCash: derived.balanceSheetStrength.netCash,
      debtToEquity: derived.balanceSheetStrength.debtToEquity,
      basis: derived.balanceSheetStrength.basis
    }
  };
}

function mapPreflightFailure(reason, ticker) {
  switch (reason) {
    case 'READ_SERVER_DISABLED':
      return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
    case 'UNAUTHORIZED':
      return res(401, { status: 'UNAUTHORIZED', reason: 'UNAUTHORIZED' });
    case 'TOKEN_COLLISION':
      return res(500, { status: 'CONFIGURATION_MISSING', reason: 'TOKEN_COLLISION' });
    case 'ALLOWLIST_MISSING':
      return res(500, { status: 'CONFIGURATION_MISSING', reason: 'ALLOWLIST_MISSING' });
    case 'ALLOWLIST_INVALID':
      return res(500, { status: 'CONFIGURATION_MISSING', reason: 'ALLOWLIST_INVALID' });
    case 'TICKER_INVALID':
      return res(400, { status: 'INVALID_TICKER', reason: 'TICKER_INVALID' });
    case 'TICKER_NOT_ALLOWED':
      return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker });
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return { statusCode: statusCode, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(body) };
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') { return { ok: false }; }
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch (_) { return { ok: false }; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) { return { ok: false }; }
  return { ok: true, value: parsed };
}

function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

function resolveNowMs(event) {
  if (event && event._testClock && typeof event._testClock.nowMs === 'number' && isFinite(event._testClock.nowMs)) {
    return event._testClock.nowMs;
  }
  return Date.now();
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  if (process.env[READ_GATE_KEY] !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = event && event.headers && event.headers['authorization'];

  const probe = evaluateFundFactsReadPreflight({ env: process.env, authorization: authorization, ticker: undefined });
  if (!probe.ok && probe.reason !== 'TICKER_INVALID') {
    return mapPreflightFailure(probe.reason);
  }

  const parsed = parseBody(event && event.body);
  if (!parsed.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  const pf = evaluateFundFactsReadPreflight({ env: process.env, authorization: authorization, ticker: parsed.value.ticker });
  if (!pf.ok) {
    return mapPreflightFailure(pf.reason, pf.reason === 'TICKER_INVALID' ? undefined : parsed.value.ticker);
  }
  const ticker = pf.ticker;

  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker });
  }

  let pointerRaw;
  try {
    pointerRaw = await store.get(pointerKey(ticker), STRONG);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker });
  }
  if (pointerRaw === null || pointerRaw === undefined) {
    return res(200, { status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: ticker });
  }

  const pointer = parsePointer(pointerRaw);
  if (!pointer.ok) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }
  const cik = pointer.cik;

  let factsRaw;
  try {
    factsRaw = await store.get(factsKey(cik), STRONG);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: ticker });
  }
  if (factsRaw === null || factsRaw === undefined) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }

  const record = parseFactsRecord(factsRaw, ticker, cik);
  if (!record.ok) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }

  const nowMs = resolveNowMs(event);
  const snapshot = { family: 'facts', key: factsKey(cik), record: record.value, timestamps: {} };
  const report = evaluateEvidenceFreshness(
    [snapshot],
    DEFAULT_WINDOW_TABLE,
    nowMs,
    {
      ticker: ticker,
      expectedFamilies: ['facts']
    }
  );
  if (!Array.isArray(report.items) || report.items.length !== 1 || report.degradedNotes.length !== 0) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_RECORD_INVALID', ticker: ticker });
  }
  const item = report.items[0];

  return res(200, {
    status: 'OK',
    readContractVersion: READ_CONTRACT_VERSION,
    ticker: ticker,
    cik: cik,
    contractVersion: record.value.contractVersion,
    sourceTier: record.value.sourceTier,
    provider: record.value.provider,
    fetchedAt: record.value.fetchedAt,
    verificationStatus: record.value.verificationStatus,
    confidence: record.value.confidence,
    series: projectSeries(record.value.series),
    derived: projectDerived(record.value.derived),
    gaps: record.value.gaps,
    freshness: {
      state: item.state,
      ageDays: item.ageDays,
      asOf: item.asOf,
      timestampSource: item.timestampSource,
      usedFetchedAtFallback: item.usedFetchedAtFallback,
      reason: item.reason,
      checkedAt: report.checkedAt,
      windowTableVersion: report.windowTableVersion
    }
  });
};
