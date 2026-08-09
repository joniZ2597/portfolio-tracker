/**
 * Netlify Serverless Function: boi-fx-proxy
 * Path: netlify/functions/boi-fx-proxy.js
 *
 * Proxies a GET request to the Bank of Israel's public representative
 * exchange-rate API and returns only the USD/ILS rate, normalized to this
 * app's pt_fx shape. No key, no auth -- the upstream endpoint is a public,
 * unauthenticated Bank of Israel API.
 *
 * Normal use: GET /.netlify/functions/boi-fx-proxy
 *   Returns { status: 'OK', rate, effectiveAt, source: 'boi', fetchedAt } on success.
 *   Returns { status: 'DISABLED', reason: 'SERVER_DISABLED' } when the gate is off (default).
 *   Returns { status: 'ERROR', reason } on upstream/shape failure.
 */

'use strict';

const SERVER_GATE = 'PT_ENABLE_PORTFOLIO_FX_SERVER';
const BOI_URL      = 'https://www.boi.org.il/PublicApi/GetExchangeRates?asXml=false';
const TIMEOUT_MS   = 12000;

exports.handler = async function (event) {
  if (process.env[SERVER_GATE] !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (method !== 'GET') {
    return res(405, { status: 'ERROR', reason: 'METHOD_NOT_ALLOWED' });
  }

  let upstream;
  try {
    upstream = await timedFetch(BOI_URL, {
      method:  'GET',
      headers: { 'User-Agent': 'portfolio-tracker/1.0', 'Accept': 'application/json' },
    }, TIMEOUT_MS);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      console.error('[boi-fx-proxy] timeout');
      return res(504, { status: 'ERROR', reason: 'UPSTREAM_TIMEOUT' });
    }
    console.error('[boi-fx-proxy] fetch failed:', e && e.message);
    return res(502, { status: 'ERROR', reason: 'UPSTREAM_REQUEST_FAILED' });
  }

  if (!upstream.ok) {
    await upstream.text().catch(function () {});
    console.error('[boi-fx-proxy] upstream error:', upstream.status);
    return res(502, { status: 'ERROR', reason: 'UPSTREAM_ERROR_' + upstream.status });
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    console.error('[boi-fx-proxy] upstream body not JSON:', e && e.message);
    return res(502, { status: 'ERROR', reason: 'UPSTREAM_SHAPE_INVALID' });
  }

  const entries = (data && Array.isArray(data.exchangeRates)) ? data.exchangeRates : [];
  const usd = entries.find(function (entry) { return entry && entry.key === 'USD'; });

  if (!usd) {
    console.error('[boi-fx-proxy] no USD entry in upstream response');
    return res(502, { status: 'ERROR', reason: 'UPSTREAM_SHAPE_INVALID' });
  }

  const rate = Number(usd.currentExchangeRate);
  const unit = Number(usd.unit);
  const effectiveAt = typeof usd.lastUpdate === 'string' ? usd.lastUpdate : '';
  const effectiveAtValid = effectiveAt !== '' && !isNaN(Date.parse(effectiveAt));

  // unit !== 1 means the upstream contract changed shape (BoI quotes some
  // currencies per 10/100 units) -- never silently divide, fail closed instead.
  if (!isFinite(rate) || rate <= 0 || unit !== 1 || !effectiveAtValid) {
    console.error('[boi-fx-proxy] USD entry failed shape validation:', JSON.stringify(usd));
    return res(502, { status: 'ERROR', reason: 'UPSTREAM_SHAPE_INVALID' });
  }

  console.log('[boi-fx-proxy] ok: rate=' + rate + ' effectiveAt=' + effectiveAt);
  return res(200, {
    status:      'OK',
    rate:        rate,
    effectiveAt: effectiveAt,
    source:      'boi',
    fetchedAt:   new Date().toISOString(),
  });
};

// -- Fetch with timeout --------------------------------------------------------
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
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
