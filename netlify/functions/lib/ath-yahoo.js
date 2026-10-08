'use strict';

/*
 * netlify/functions/lib/ath-yahoo.js
 *
 * R-1 Slice B2-auto — the ONLY ATH module allowed to make a network call. Server-side fetch and
 * parse of Yahoo's v8 daily chart. The fetch is injectable (opts.fetchImpl) so every suite runs
 * without a network. Any failure yields { ok: false, reason: 'FETCH_FAILED' | 'BODY_INVALID' |
 * 'UNSUPPORTED' } and nothing is derived. No other provider, no fallback.
 *
 * Highs are split-adjusted and not dividend-adjusted (validated 2026-10-05). Bar dates are the
 * EXCHANGE day (meta.exchangeTimezoneName), never the UTC day.
 */

const { TICKER_RE } = require('./ath-record');

const ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const TIMEOUT_MS = 12000;

function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

function buildUrl(symbol, period1, period2) {
  return ENDPOINT + encodeURIComponent(symbol) + '?interval=1d&period1=' + period1 + '&period2=' + period2 + '&events=split';
}

function dayFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_) {
    return null;
  }
}

function exchangeDay(fmt, epochSeconds) {
  const s = fmt.format(new Date(epochSeconds * 1000));
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Unit follows the instrument: ILA (agorot) for .TA, USD otherwise. Anything else is unsupported.
function unitFor(symbol, metaCurrency) {
  if (/\.TA$/.test(symbol)) { return metaCurrency === 'ILA' ? { currency: 'ILS', unit: 'ILA' } : null; }
  return metaCurrency === 'USD' ? { currency: 'USD', unit: 'USD' } : null;
}

// Pure: parse a decoded chart body for `symbol`.
//   { ok: true, currency, unit, firstTradeDate, bars: [{ date, open, high, close }], splits: [{ date, ratio }] }
function parseChart(body, symbol) {
  if (typeof symbol !== 'string' || !TICKER_RE.test(symbol)) { return { ok: false, reason: 'BODY_INVALID' }; }
  const chart = isObject(body) ? body.chart : null;
  const result = chart && Array.isArray(chart.result) ? chart.result[0] : null;
  if (!isObject(result) || !isObject(result.meta)) { return { ok: false, reason: 'BODY_INVALID' }; }
  const meta = result.meta;
  if (typeof meta.currency !== 'string' || !isFiniteNumber(meta.firstTradeDate) || typeof meta.exchangeTimezoneName !== 'string') {
    return { ok: false, reason: 'BODY_INVALID' };
  }
  const fmt = dayFormatter(meta.exchangeTimezoneName);
  if (fmt === null) { return { ok: false, reason: 'BODY_INVALID' }; }
  const cu = unitFor(symbol, meta.currency);
  if (cu === null) { return { ok: false, reason: 'UNSUPPORTED' }; }

  const q = result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
  if (!Array.isArray(result.timestamp) || !isObject(q) || !Array.isArray(q.open) || !Array.isArray(q.high) || !Array.isArray(q.close) ||
    q.open.length !== result.timestamp.length || q.high.length !== result.timestamp.length || q.close.length !== result.timestamp.length) {
    return { ok: false, reason: 'BODY_INVALID' };
  }
  const firstTradeDate = exchangeDay(fmt, meta.firstTradeDate);
  if (firstTradeDate === null) { return { ok: false, reason: 'BODY_INVALID' }; }

  const byDate = new Map();
  for (let i = 0; i < result.timestamp.length; i++) {
    const ts = result.timestamp[i];
    if (!isFiniteNumber(ts)) { return { ok: false, reason: 'BODY_INVALID' }; }
    const high = q.high[i];
    if (!isFiniteNumber(high) || !(high > 0)) { continue; } // bars with no high are skipped
    const date = exchangeDay(fmt, ts);
    if (date === null) { return { ok: false, reason: 'BODY_INVALID' }; }
    byDate.set(date, { date: date, open: isFiniteNumber(q.open[i]) ? q.open[i] : null, high: high, close: isFiniteNumber(q.close[i]) ? q.close[i] : null });
  }
  const bars = Array.from(byDate.values()).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  if (bars.length === 0) { return { ok: false, reason: 'BODY_INVALID' }; }

  const splits = [];
  const rawSplits = result.events && isObject(result.events.splits) ? result.events.splits : {};
  for (const k of Object.keys(rawSplits)) {
    const s = rawSplits[k];
    if (!isObject(s) || !isFiniteNumber(s.date) || !isFiniteNumber(s.numerator) || !isFiniteNumber(s.denominator) || !(s.numerator > 0) || !(s.denominator > 0)) {
      return { ok: false, reason: 'BODY_INVALID' };
    }
    const date = exchangeDay(fmt, s.date);
    if (date === null) { return { ok: false, reason: 'BODY_INVALID' }; }
    splits.push({ date: date, ratio: s.numerator / s.denominator });
  }
  splits.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return { ok: true, currency: cu.currency, unit: cu.unit, firstTradeDate: firstTradeDate, bars: bars, splits: splits };
}

// One request per decision. opts = { fetchImpl, nowMs, period1 (epoch seconds, default 0) }.
async function fetchChart(symbol, opts) {
  const o = opts || {};
  const impl = typeof o.fetchImpl === 'function' ? o.fetchImpl : globalThis.fetch;
  if (typeof impl !== 'function' || typeof symbol !== 'string' || !TICKER_RE.test(symbol)) { return { ok: false, reason: 'FETCH_FAILED' }; }
  const nowMs = isFiniteNumber(o.nowMs) ? o.nowMs : Date.now();
  const period1 = isFiniteNumber(o.period1) && o.period1 >= 0 ? Math.floor(o.period1) : 0;
  const url = buildUrl(symbol, period1, Math.floor(nowMs / 1000));
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(function () { if (controller) { controller.abort(); } }, TIMEOUT_MS);
  let response;
  try {
    response = await impl(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: controller ? controller.signal : undefined });
  } catch (_) {
    clearTimeout(timer);
    return { ok: false, reason: 'FETCH_FAILED' };
  }
  try {
    if (!response || response.ok !== true) { return { ok: false, reason: 'FETCH_FAILED' }; }
    let json;
    try { json = await response.json(); } catch (_) { return { ok: false, reason: 'BODY_INVALID' }; }
    return parseChart(json, symbol);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ENDPOINT, TIMEOUT_MS, buildUrl, parseChart, fetchChart };
