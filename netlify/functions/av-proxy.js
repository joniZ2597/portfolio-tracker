/**
 * Netlify Serverless Function: av-proxy
 * Path: netlify/functions/av-proxy.js
 *
 * Proxies GET requests to alphavantage.co/query using a server-side key.
 * ALPHA_VANTAGE_API_KEY is never returned to the browser in any response body,
 * header, or log line.
 *
 * Normal use:  GET /.netlify/functions/av-proxy?function=GLOBAL_QUOTE&symbol=AAPL
 *   Supported function values: GLOBAL_QUOTE, TIME_SERIES_DAILY, TIME_SERIES_INTRADAY
 *   Optional: outputsize=compact|full, interval=15min (for TIME_SERIES_INTRADAY)
 *   apikey is added server-side -- never send it from the browser.
 *
 * Status ping: GET /.netlify/functions/av-proxy?mode=ping
 *   Returns { ok: true, model: 'alphavantage', price } on success.
 *   Returns { ok: false, status: 'no_key' } when env var is absent.
 *   Returns { ok: false, status: 'auth_failed' | 'rate_limited' | 'unreachable' } on error.
 */

'use strict';

const AV_BASE    = 'https://www.alphavantage.co/query';
const TIMEOUT_MS = 12000;

// Allowed AV function values -- prevents open-relay abuse
const ALLOWED_FUNCTIONS = new Set([
  'GLOBAL_QUOTE',
  'TIME_SERIES_DAILY',
  'TIME_SERIES_INTRADAY',
]);

// -- Entry point ---------------------------------------------------------------
exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const params = event.queryStringParameters || {};

  // Ping / status-check mode (GET ?mode=ping)
  if (params.mode === 'ping') {
    return handlePing();
  }

  if (event.httpMethod !== 'GET') {
    return res(405, { error: 'Method not allowed' });
  }

  const key = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!key) {
    return res(503, { error: 'Alpha Vantage service not configured' });
  }

  const fn = params.function || '';
  if (!ALLOWED_FUNCTIONS.has(fn)) {
    return res(400, { error: 'Unsupported function' });
  }

  // Sanitise symbol: uppercase letters, digits, dot only (e.g. BRK.B)
  const symbol = (params.symbol || '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!symbol) {
    return res(400, { error: 'Missing symbol' });
  }

  // Build upstream query -- only forward safe params, inject key server-side
  const qs = new URLSearchParams({ function: fn, symbol, apikey: key });
  if (params.outputsize) {
    qs.set('outputsize', params.outputsize === 'full' ? 'full' : 'compact');
  }
  if (params.interval) {
    qs.set('interval', params.interval);
  }

  const upstreamUrl = AV_BASE + '?' + qs.toString();

  try {
    const upstream = await timedFetch(upstreamUrl, {
      method:  'GET',
      headers: { 'User-Agent': 'portfolio-tracker/1.0' },
    }, TIMEOUT_MS);

    if (!upstream.ok) {
      // Consume body to avoid memory leak -- do not forward (may contain key hints)
      await upstream.text().catch(() => {});
      console.error('[av-proxy] upstream error:', upstream.status, fn, symbol);
      return res(502, { error: 'Upstream error ' + upstream.status });
    }

    const data = await upstream.json();
    console.log('[av-proxy] ok:', fn, symbol);
    return res(200, data);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('[av-proxy] timeout:', fn, symbol);
      return res(504, { error: 'Upstream timeout' });
    }
    console.error('[av-proxy] fetch failed:', e.message);
    return res(502, { error: 'Upstream request failed' });
  }
};

// -- Ping handler --------------------------------------------------------------
async function handlePing() {
  const key = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!key) return res(200, { ok: false, status: 'no_key' });

  try {
    const url = AV_BASE + '?' + new URLSearchParams({
      function: 'GLOBAL_QUOTE',
      symbol:   'AAPL',
      apikey:   key,
    }).toString();

    const r = await timedFetch(url, {
      method:  'GET',
      headers: { 'User-Agent': 'portfolio-tracker/1.0' },
    }, TIMEOUT_MS);

    if (!r.ok) {
      await r.text().catch(() => {});
      return res(200, { ok: false, status: 'auth_failed' });
    }

    const d = await r.json();
    if (d['Note'] || d['Information']) {
      return res(200, { ok: false, status: 'rate_limited' });
    }
    const q = d?.['Global Quote'];
    if (!q || !q['05. price']) {
      return res(200, { ok: false, status: 'auth_failed' });
    }

    return res(200, {
      ok:    true,
      model: 'alphavantage',
      price: parseFloat(q['05. price']),
    });

  } catch (e) {
    console.error('[av-proxy] ping failed:', e.message);
    return res(200, { ok: false, status: 'unreachable' });
  }
}

// -- Fetch with timeout --------------------------------------------------------
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// -- CORS headers --------------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

// -- Standard response builder -------------------------------------------------
function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
