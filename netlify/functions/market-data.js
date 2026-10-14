/**
 * Netlify Serverless Function: market-data
 * Path: netlify/functions/market-data.js
 *
 * Provider priority:
 *   1. Polygon.io  — reliable, server-side, no CORS. Requires POLYGON_API_KEY env var.
 *   2. Yahoo Finance — fallback if Polygon key absent or request fails.
 *
 * Response contract: always returns Yahoo-compatible chart JSON so the
 * frontend _parseYahooChart() needs no changes.
 *
 * Called by the frontend as:
 *   /.netlify/functions/market-data?symbol=AAPL&interval=1d&range=5d
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const YAHOO_BASE   = 'https://query1.finance.yahoo.com/v8/finance/chart';
const POLYGON_BASE = 'https://api.polygon.io';
const TIMEOUT_MS   = 10000; // per-provider timeout

// ── Entry point ───────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  // ── 1. Validate query parameters ─────────────────────────────────────────
  const params             = event.queryStringParameters || {};
  const multiParams        = event.multiValueQueryStringParameters || {};
  const { interval = '1d', range = '1d' } = params;
  const rawSym             = params.symbol || '';

  // ── G-L purpose routing + server backstop (cooperative, not auth) ─────────
  // Absent purpose / purpose=scan keep existing scan behavior unchanged.
  // purpose=portfolio-live is gated; when off it returns the typed DISABLED
  // envelope before any provider I/O. Duplicate → AMBIGUOUS; unknown → INVALID.
  const purposeResult = resolvePurpose(params, multiParams);
  if (purposeResult.error === 'AMBIGUOUS') return res(400, ENVELOPE_AMBIGUOUS_PURPOSE);
  if (purposeResult.error === 'INVALID')   return res(400, ENVELOPE_INVALID_PURPOSE);
  const purpose = purposeResult.purpose; // 'scan' | 'portfolio-live'

  if (purpose === 'portfolio-live' &&
      process.env.PT_ENABLE_PORTFOLIO_LIVE_PRICES_SERVER !== 'true') {
    return res(200, ENVELOPE_SERVER_DISABLED); // typed 200, no upstream request
  }

  if (!rawSym.trim()) {
    return res(400, { error: 'Missing required parameter: symbol' });
  }

  const sym = rawSym.trim().toUpperCase();

  if (!/^[A-Z0-9.\-^=]+$/.test(sym)) {
    return res(400, { error: 'Invalid symbol format: ' + sym });
  }

  // ── Hourly upstream budget: portfolio-live only, after the server gate and the symbol validation, before any upstream I/O ──
  // Beyond BUDGET_PER_HOUR (market-data-live-budget) the typed 429 is answered and nothing is requested. Fails closed (takeLiveBudget).
  if (purpose === 'portfolio-live' && !(await takeLiveBudget(event, range))) {
    return res(429, ENVELOPE_BUDGET_EXHAUSTED);
  }

  const polygonKey = process.env.POLYGON_API_KEY || '';
  // portfolio-live is Yahoo-only (market-data-1, ruling M-1): the metered Polygon key is never used for it.
  const polygonAllowed = polygonKey !== '' && purpose !== 'portfolio-live';

  // ── 2. Provider policy ───────────────────────────────────────────────────
  // Daily price ranges (5d / 1d): Yahoo first — Polygon aggregates are end-of-day
  // and return stale/completed bars that do not reflect the current session price.
  // Historical ranges (1mo+): Polygon first — reliable OHLCV history, no CORS.
  const isDailyPriceRange = range === '1d' || range === '5d';

  if (isDailyPriceRange) {
    console.log('[market-data] provider policy: daily range -> Yahoo first for', sym, 'range=' + range);

    // ── Daily: Yahoo (+ display-only overlay) → Polygon fallback ───────────
    let _session      = 'CLOSED';
    let _needsOverlay = false;
    try {
      _session      = getEtSession(new Date(polygonNowMs(event)));
      _needsOverlay = (_session === 'PRE' || _session === 'POST') && !/\.TA$/i.test(sym);
    } catch (sessionErr) {
      console.warn('[market-data] ext overlay session check skipped for', sym + ':', sessionErr.message);
    }
    const [_mainRes, _overlayRes] = await Promise.allSettled([
      fetchYahoo(sym, interval, range),
      _needsOverlay ? fetchYahooIntraday(sym, 5000) : Promise.resolve(null),
    ]);

    if (_mainRes.status === 'fulfilled' && _mainRes.value) {
      const data = _mainRes.value;
      console.log('[market-data] yahoo OK for', sym, 'range=' + range);
      if (_needsOverlay && _overlayRes.status === 'fulfilled' && _overlayRes.value) {
        try {
          const _meta     = data?.chart?.result?.[0]?.meta;
          const _regClose = _meta?.regularMarketPrice;
          const _overlay  = deriveExtendedOverlay(_overlayRes.value, _regClose, _session, getEtDateStr());
          if (_overlay && _meta) {
            Object.assign(_meta, _overlay);
            console.log('[market-data] ext overlay applied for', sym, _session,
              'price=' + (_overlay.preMarketPrice ?? _overlay.postMarketPrice));
          }
        } catch (overlayErr) {
          console.warn('[market-data] ext overlay skipped for', sym + ':', overlayErr.message);
        }
      } else if (_needsOverlay && _overlayRes.status === 'rejected') {
        console.warn('[market-data] ext overlay fetch skipped for', sym + ':', _overlayRes.reason?.message);
      }
      if (purpose === 'portfolio-live') ensureProvider(data, 'yahoo');
      return res(200, data);
    }
    if (_mainRes.status === 'rejected') {
      console.warn('[market-data] yahoo failed for', sym + ':', _mainRes.reason?.message, '— falling back to Polygon');
    }

    if (polygonAllowed) {
      try {
        const data = await fetchPolygon(sym, interval, range, polygonKey);
        if (data) {
          console.log('[market-data] polygon OK for', sym, 'range=' + range);
          return res(200, data);
        }
        console.warn('[market-data] polygon returned no data for', sym);
      } catch (polyErr) {
        console.warn('[market-data] polygon failed for', sym + ':', polyErr.message);
      }
    }

    return res(502, { error: 'All providers failed for ' + sym + ' range=' + range });

  } else {
    console.log('[market-data] provider policy: historical range -> ' + (purpose === 'portfolio-live' ? 'Yahoo only' : 'Polygon first') + ' for', sym, 'range=' + range);

    // ── Historical: Polygon → Yahoo fallback ────────────────────────────────
    // polygonFallbackClass is set only when Polygon was tried and failed; it types the X-PT-Polygon-Fallback header on the Yahoo response.
    let polygonFallbackClass = '';
    if (polygonAllowed) {
      try {
        const data = await fetchPolygonWithRetry(event, sym, interval, range, polygonKey);
        if (data) {
          console.log('[market-data] polygon OK for', sym, 'range=' + range);
          return res(200, data);
        }
        polygonFallbackClass = 'empty';
        console.warn('[market-data] polygon returned no data for', sym, '— falling back to Yahoo', '[' + polygonFallbackClass + ']');
      } catch (polyErr) {
        polygonFallbackClass = classifyPolygonFailure(polyErr);
        console.warn('[market-data] polygon failed for', sym + ':', polyErr.message, '— falling back to Yahoo', '[' + polygonFallbackClass + ']');
      }
    } else if (purpose === 'portfolio-live') {
      console.log('[market-data] portfolio-live is Yahoo-only — using Yahoo for', sym);
    } else {
      console.log('[market-data] POLYGON_API_KEY not set — using Yahoo for', sym);
    }

    const fallbackHeaders = polygonFallbackClass ? { 'X-PT-Polygon-Fallback': polygonFallbackClass } : undefined;
    try {
      const data = await fetchYahoo(sym, interval, range);
      if (data) {
        console.log('[market-data] yahoo OK for', sym, 'range=' + range);
        if (purpose === 'portfolio-live') ensureProvider(data, 'yahoo');
        return res(200, data, fallbackHeaders);
      }
      return res(404, { error: 'No chart data available for ' + sym }, fallbackHeaders);
    } catch (yahooErr) {
      console.error('[market-data] yahoo failed for', sym + ':', yahooErr.message);
      return res(502, { error: 'All providers failed for ' + sym + ': ' + yahooErr.message }, fallbackHeaders);
    }
  }
};

// ── Polygon.io provider ───────────────────────────────────────────────────────
//
// Maps Polygon aggregate bars to the Yahoo chart JSON shape that the
// frontend _parseYahooChart() already knows how to consume.
//
async function fetchPolygon(sym, interval, range, apiKey, timeoutMs) {
  // Convert Yahoo-style range to a from/to date window
  const { from, to } = rangeToDateWindow(range);
  const multiplier   = 1;
  const timespan     = intervalToTimespan(interval);

  // GET /v2/aggs/ticker/{sym}/range/1/day/{from}/{to}
  const url =
    POLYGON_BASE +
    '/v2/aggs/ticker/' + encodeURIComponent(sym) +
    '/range/' + multiplier + '/' + timespan +
    '/' + from + '/' + to +
    '?adjusted=true&sort=asc&limit=750';

  const raw = await timedFetch(url, {
    headers: { Authorization: 'Bearer ' + apiKey },
  }, timeoutMs || TIMEOUT_MS);

  // The failure class comes from these structured fields (httpStatus, bodyStatus, retryAfter), never from message text.
  if (!raw.ok) {
    const httpErr = new Error('Polygon HTTP ' + raw.status);
    httpErr.httpStatus = raw.status;
    httpErr.retryAfter = raw.headers && typeof raw.headers.get === 'function' ? raw.headers.get('retry-after') : null;
    throw httpErr;
  }

  const json = await raw.json();

  if (json.status === 'ERROR' || json.status === 'NOT_AUTHORIZED') {
    const bodyErr = new Error('Polygon error: ' + (json.error || json.status));
    bodyErr.bodyStatus = json.status;
    throw bodyErr;
  }

  const results = json.results;
  if (!results || results.length === 0) {
    // Polygon returns status OK with empty results for very new tickers
    return null;
  }

  return polygonToYahooShape(sym, results, range);
}

// ── Polygon bounded retry (scan historical path only) ─────────────────────────
// One retry, only on an HTTP 429 observed within POLYGON_FAST_429_MS of the request being issued: wait
// min(Retry-After seconds x 1000, POLYGON_RETRY_WAIT_MAX_MS) ms (POLYGON_RETRY_WAIT_DEFAULT_MS when absent or invalid), then
// one more request with a POLYGON_RETRY_TIMEOUT_MS timeout. Never more than two Polygon requests per handler call.
// Test hooks follow the _testClock pattern: event._testClock.nowMs (a number) and event._testSleep(ms) (a function); ignored when invalid.
const POLYGON_FAST_429_MS          = 2000;
const POLYGON_RETRY_WAIT_MAX_MS    = 1500;
const POLYGON_RETRY_WAIT_DEFAULT_MS = 1000;
const POLYGON_RETRY_TIMEOUT_MS     = 3000;

function polygonNowMs(event) {
  const clock = event && event._testClock;
  return clock && typeof clock.nowMs === 'number' && isFinite(clock.nowMs) ? clock.nowMs : Date.now();
}

function polygonSleep(event, ms) {
  if (event && typeof event._testSleep === 'function') return Promise.resolve(event._testSleep(ms));
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function polygonRetryWaitMs(retryAfter) {
  if (typeof retryAfter === 'string' && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1000, POLYGON_RETRY_WAIT_MAX_MS);
  }
  return POLYGON_RETRY_WAIT_DEFAULT_MS;
}

async function fetchPolygonWithRetry(event, sym, interval, range, apiKey) {
  for (let attempt = 1; ; attempt += 1) {
    const issuedMs = polygonNowMs(event);
    try {
      return await fetchPolygon(sym, interval, range, apiKey, attempt === 1 ? TIMEOUT_MS : POLYGON_RETRY_TIMEOUT_MS);
    } catch (err) {
      if (attempt >= 2 || !(err && err.httpStatus === 429) || polygonNowMs(event) - issuedMs > POLYGON_FAST_429_MS) throw err;
      await polygonSleep(event, polygonRetryWaitMs(err.retryAfter));
    }
  }
}

// One class per failure, from structured fields only: HTTP status, the response body's status field, the abort error name.
function classifyPolygonFailure(err) {
  if (err && err.name === 'AbortError') return 'timeout';
  if (err && err.httpStatus === 429) return 'http-429';
  if (err && Number.isInteger(err.httpStatus)) return 'http-' + err.httpStatus;
  if (err && err.bodyStatus === 'NOT_AUTHORIZED') return 'auth';
  if (err && err.bodyStatus === 'ERROR') return 'error';
  return 'network';
}

// ── Yahoo Finance provider (fallback) ─────────────────────────────────────────
async function fetchYahoo(sym, interval, range) {
  const url =
    YAHOO_BASE + '/' + encodeURIComponent(sym) +
    '?interval=' + encodeURIComponent(interval) +
    '&range=' + encodeURIComponent(range);

  const raw = await timedFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  }, TIMEOUT_MS);

  if (!raw.ok) {
    throw new Error('Yahoo HTTP ' + raw.status);
  }

  const data = await raw.json();
  const result = data?.chart?.result;

  if (!result || result.length === 0) {
    const yahooErr = data?.chart?.error;
    throw new Error((yahooErr && yahooErr.description) || 'No chart data from Yahoo');
  }

  return data; // already Yahoo shape
}

// ── ET session helpers (DST-correct via Intl) ─────────────────────────────────

function getEtSession(now) {
  const d = now || new Date();
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const f = parseInt(p.hour) + parseInt(p.minute) / 60;
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return 'CLOSED';
  if (f >= 4   && f < 9.5)  return 'PRE';
  if (f >= 9.5 && f < 16)   return 'REGULAR';
  if (f >= 16  && f < 20)   return 'POST';
  return 'CLOSED';
}

function getEtDateStr(now) {
  const d = now || new Date();
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

function getBarEtParts(tsSeconds) {
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(tsSeconds * 1000)).forEach(x => { p[x.type] = x.value; });
  return {
    dateStr: p.year + '-' + p.month + '-' + p.day,
    etFrac:  parseInt(p.hour) + parseInt(p.minute) / 60,
  };
}

// ── Intraday display-only fetch (PRE/POST overlay source) ─────────────────────
// Issued only when session is PRE or POST. Never used for candle calculations.

async function fetchYahooIntraday(sym, timeoutMs) {
  const url =
    YAHOO_BASE + '/' + encodeURIComponent(sym) +
    '?interval=1m&range=1d&includePrePost=true';
  const raw = await timedFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  }, timeoutMs);
  if (!raw.ok) throw new Error('Yahoo intraday HTTP ' + raw.status);
  const data = await raw.json();
  if (!data?.chart?.result?.[0]) throw new Error('Yahoo intraday: no chart result');
  return data;
}

// ── Extended-hours overlay derivation ────────────────────────────────────────
// Returns { marketState, pre/postMarketPrice, pre/postMarketChangePercent } or null.
// Never touches candle arrays — display-only fields overlaid onto meta only.

function deriveExtendedOverlay(intradayData, regularClose, session, todayEtDate) {
  if (session !== 'PRE' && session !== 'POST') return null;
  if (!Number.isFinite(regularClose) || regularClose <= 0) return null;

  const result     = intradayData?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const closes     = result.indicators?.quote?.[0]?.close || [];
  const minHour    = session === 'PRE' ? 4   : 16;
  const maxHour    = session === 'PRE' ? 9.5 : 20;

  let extPrice = null;
  let latestTs = -1;
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    if (ts <= latestTs) continue;
    const { dateStr, etFrac } = getBarEtParts(ts);
    if (dateStr !== todayEtDate) continue;
    if (etFrac < minHour || etFrac >= maxHour) continue;
    const c = closes[i];
    if (!Number.isFinite(c) || c <= 0) continue;
    extPrice = c;
    latestTs = ts;
  }

  if (extPrice === null) return null;

  const extChgPct = parseFloat(((extPrice - regularClose) / regularClose * 100).toFixed(2));

  if (session === 'PRE') {
    return {
      marketState:            'PRE',
      preMarketPrice:         extPrice,
      preMarketChangePercent: extChgPct,
    };
  }
  return {
    marketState:             'POST',
    postMarketPrice:         extPrice,
    postMarketChangePercent: extChgPct,
  };
}

// ── Polygon → Yahoo shape adapter ─────────────────────────────────────────────
//
// _parseYahooChart() on the frontend reads:
//   result.meta.regularMarketPrice
//   result.meta.chartPreviousClose  (used for daily change)
//   result.meta.regularMarketDayHigh / Low / Open / Volume / Time
//   result.timestamp[]
//   result.indicators.quote[0].open/high/low/close/volume[]
//
function polygonToYahooShape(sym, bars, range) {
  // bars are sorted asc by Polygon (t = Unix ms)
  const last     = bars[bars.length - 1];
  const prevBar  = bars.length >= 2 ? bars[bars.length - 2] : null;

  const timestamps = bars.map(b => Math.floor(b.t / 1000)); // ms → s
  const opens      = bars.map(b => b.o);
  const highs      = bars.map(b => b.h);
  const lows       = bars.map(b => b.l);
  const closes     = bars.map(b => b.c);
  const volumes    = bars.map(b => b.v);

  // Build a meta block that mirrors what Yahoo returns so fetchYahoo() in the
  // frontend can use meta.regularMarketPrice etc. without changes.
  const meta = {
    symbol:                   sym,
    regularMarketPrice:       last.c,
    regularMarketDayHigh:     last.h,
    regularMarketDayLow:      last.l,
    regularMarketOpen:        last.o,
    regularMarketVolume:      last.v,
    regularMarketTime:        Math.floor(last.t / 1000),
    // chartPreviousClose is what fetchYahoo() in the frontend uses as fallback
    chartPreviousClose:       prevBar ? prevBar.c : last.c,
    previousClose:            prevBar ? prevBar.c : last.c,
    dataGranularity:          '1d',
    range:                    range,
    currency:                 'USD',
    exchangeName:             'POLYGON',
    instrumentType:           'EQUITY',
    firstTradeDate:           timestamps[0] || 0,
    gmtoffset:                -18000,
    timezone:                 'EST',
    exchangeTimezoneName:     'America/New_York',
    // Polygon is the data source — surfaced in the frontend source indicator
    _provider:                'polygon',
  };

  // Wrap in Yahoo chart shape so _parseYahooChart works unchanged
  return {
    chart: {
      result: [
        {
          meta,
          timestamp: timestamps,
          indicators: {
            quote: [
              {
                open:   opens,
                high:   highs,
                low:    lows,
                close:  closes,
                volume: volumes,
              },
            ],
            adjclose: [{ adjclose: closes }],
          },
        },
      ],
      error: null,
    },
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Convert Yahoo-style range string to { from, to } YYYY-MM-DD strings
function rangeToDateWindow(range) {
  const to   = new Date();
  const from = new Date(to);

  switch (range) {
    case '1d':  from.setDate(from.getDate() - 5);   break; // 5 calendar days → ≥1 trading day
    case '5d':  from.setDate(from.getDate() - 7);   break; // 1 week
    case '1mo': from.setMonth(from.getMonth() - 1); break;
    case '3mo': from.setMonth(from.getMonth() - 3); break;
    case '6mo': from.setMonth(from.getMonth() - 6); break;
    case '1y':
    case '1Y':  from.setFullYear(from.getFullYear() - 1); break;
    case '2y':  from.setFullYear(from.getFullYear() - 2); break;
    case '5y':  from.setFullYear(from.getFullYear() - 5); break;
    default:    from.setMonth(from.getMonth() - 6); break; // safe default
  }

  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

// Convert Yahoo interval to Polygon timespan
function intervalToTimespan(interval) {
  switch (interval) {
    case '1m':  return 'minute';
    case '5m':  return 'minute'; // Polygon uses multiplier for sub-hour
    case '15m': return 'minute';
    case '60m':
    case '1h':  return 'hour';
    case '1d':
    default:    return 'day';
  }
}

// ── G-L typed envelopes (approved contract schema) ────────────────────────────
const ENVELOPE_SERVER_DISABLED = {
  status: 'DISABLED',
  reason: 'SERVER_DISABLED',
  detail: 'portfolio live prices disabled on this deployment; no upstream request made.',
  errors: ['SERVER_DISABLED'],
};
const ENVELOPE_INVALID_PURPOSE = {
  status: 'ERROR',
  reason: 'INVALID_PURPOSE',
  detail: 'invalid request purpose',
  errors: ['INVALID_PURPOSE'],
};
const ENVELOPE_AMBIGUOUS_PURPOSE = {
  status: 'ERROR',
  reason: 'AMBIGUOUS_PURPOSE',
  detail: 'ambiguous request purpose',
  errors: ['AMBIGUOUS_PURPOSE'],
};
// Slice 2 (market-data-1): the hourly cap for portfolio-live. HTTP 429, a per-symbol failure for the client (not a terminal envelope).
const ENVELOPE_BUDGET_EXHAUSTED = {
  status: 'ERROR',
  reason: 'BUDGET_EXHAUSTED',
  detail: 'portfolio live price budget exhausted for this hour; no upstream request made.',
  errors: ['BUDGET_EXHAUSTED'],
};
const ALLOWED_PURPOSES = ['scan', 'portfolio-live'];

// Returns { purpose } for valid input, or { error:'AMBIGUOUS' | 'INVALID' }.
//   absent purpose         → 'scan'  (legacy behavior preserved)
//   purpose=scan           → 'scan'
//   purpose=portfolio-live → 'portfolio-live'
//   duplicate purpose      → AMBIGUOUS  (via multiValueQueryStringParameters)
//   unknown / malformed    → INVALID
// Uses representable string values only — does not rely on URL-encoding rejection.
function resolvePurpose(params, multiParams) {
  let values;
  if (multiParams && Array.isArray(multiParams.purpose)) {
    values = multiParams.purpose;
  } else if (params && Object.prototype.hasOwnProperty.call(params, 'purpose')) {
    values = [params.purpose];
  } else {
    values = [];
  }

  if (values.length === 0) return { purpose: 'scan' };
  if (values.length > 1)  return { error: 'AMBIGUOUS' };

  const val = values[0];
  if (typeof val !== 'string' || ALLOWED_PURPOSES.indexOf(val) === -1) return { error: 'INVALID' };
  return { purpose: val };
}

// Stamp the actual provider onto meta when absent (never overwrites). Display-only.
function ensureProvider(data, provider) {
  try {
    const meta = data && data.chart && data.chart.result &&
                 data.chart.result[0] && data.chart.result[0].meta;
    if (meta && !meta._provider) meta._provider = provider;
  } catch (_) { /* provenance is display-only — never fatal */ }
}

// ── Hourly upstream budget (portfolio-live only) ──────────────────────────────
// Units = the upstream calls this request will make: one Yahoo call, plus the extended-hours overlay call on daily ranges in PRE / POST.
// Resolves true when the units were admitted (and counted); false otherwise - including any error: the budget fails closed.
// The budget lib and the storage package are required here, inside the portfolio-live branch only, so the scan path never loads them.
async function takeLiveBudget(event, range) {
  try {
    const budget = require('./lib/market-data-live-budget');
    const clock = event && event._testClock;
    const nowMs = clock && typeof clock.nowMs === 'number' && isFinite(clock.nowMs) ? clock.nowMs : Date.now();
    let units = 1;
    if (range === '1d' || range === '5d') {
      const session = getEtSession(new Date(nowMs));
      if (session === 'PRE' || session === 'POST') units = 2;
    }
    let store = event && event._testStore;
    if (!store) {
      // A legacy Lambda-style function receives the Blobs context only through connectLambda(event) (same guarded pattern as
      // tradingview-webhook.js / portfolio-sync.js); a failure here propagates to the catch below and refuses the request.
      const blobs = require('@netlify/blobs');
      if (event && event.blobs) blobs.connectLambda(event);
      store = blobs.getStore(budget.STORE_NAME);
    }
    return await budget.take(store, new Date(nowMs).toISOString(), units);
  } catch (_) {
    return false;
  }
}

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Standard response builder ─────────────────────────────────────────────────
// extraHeaders (optional): added after the three standard headers; absent -> the response is exactly as before.
function res(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    }, extraHeaders),
    body: JSON.stringify(body),
  };
}
