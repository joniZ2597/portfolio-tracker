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
  const { interval = '1d', range = '1d' } = params;
  const rawSym             = params.symbol || '';

  if (!rawSym.trim()) {
    return res(400, { error: 'Missing required parameter: symbol' });
  }

  const sym = rawSym.trim().toUpperCase();

  if (!/^[A-Z0-9.\-^=]+$/.test(sym)) {
    return res(400, { error: 'Invalid symbol format: ' + sym });
  }

  const polygonKey = process.env.POLYGON_API_KEY || '';

  // ── 2. Provider policy ───────────────────────────────────────────────────
  // Daily price ranges (5d / 1d): Yahoo first — Polygon aggregates are end-of-day
  // and return stale/completed bars that do not reflect the current session price.
  // Historical ranges (1mo+): Polygon first — reliable OHLCV history, no CORS.
  const isDailyPriceRange = range === '1d' || range === '5d';

  if (isDailyPriceRange) {
    console.log('[market-data] provider policy: daily range -> Yahoo first for', sym, 'range=' + range);

    // ── Daily: Yahoo → Polygon fallback ────────────────────────────────────
    try {
      const data = await fetchYahoo(sym, interval, range);
      if (data) {
        console.log('[market-data] yahoo OK for', sym, 'range=' + range);
        return res(200, data);
      }
    } catch (yahooErr) {
      console.warn('[market-data] yahoo failed for', sym + ':', yahooErr.message, '— falling back to Polygon');
    }

    if (polygonKey) {
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
    console.log('[market-data] provider policy: historical range -> Polygon first for', sym, 'range=' + range);

    // ── Historical: Polygon → Yahoo fallback ────────────────────────────────
    if (polygonKey) {
      try {
        const data = await fetchPolygon(sym, interval, range, polygonKey);
        if (data) {
          console.log('[market-data] polygon OK for', sym, 'range=' + range);
          return res(200, data);
        }
        console.warn('[market-data] polygon returned no data for', sym, '— falling back to Yahoo');
      } catch (polyErr) {
        console.warn('[market-data] polygon failed for', sym + ':', polyErr.message, '— falling back to Yahoo');
      }
    } else {
      console.log('[market-data] POLYGON_API_KEY not set — using Yahoo for', sym);
    }

    try {
      const data = await fetchYahoo(sym, interval, range);
      if (data) {
        console.log('[market-data] yahoo OK for', sym, 'range=' + range);
        return res(200, data);
      }
      return res(404, { error: 'No chart data available for ' + sym });
    } catch (yahooErr) {
      console.error('[market-data] yahoo failed for', sym + ':', yahooErr.message);
      return res(502, { error: 'All providers failed for ' + sym + ': ' + yahooErr.message });
    }
  }
};

// ── Polygon.io provider ───────────────────────────────────────────────────────
//
// Maps Polygon aggregate bars to the Yahoo chart JSON shape that the
// frontend _parseYahooChart() already knows how to consume.
//
async function fetchPolygon(sym, interval, range, apiKey) {
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
  }, TIMEOUT_MS);

  if (!raw.ok) {
    throw new Error('Polygon HTTP ' + raw.status);
  }

  const json = await raw.json();

  if (json.status === 'ERROR' || json.status === 'NOT_AUTHORIZED') {
    throw new Error('Polygon error: ' + (json.error || json.status));
  }

  const results = json.results;
  if (!results || results.length === 0) {
    // Polygon returns status OK with empty results for very new tickers
    return null;
  }

  return polygonToYahooShape(sym, results, range);
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
function res(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}
