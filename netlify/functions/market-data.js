/**
 * Netlify Serverless Function: market-data
 * Path: netlify/functions/market-data.js
 *
 * Proxies Yahoo Finance chart requests server-side, avoiding browser CORS
 * restrictions entirely. Called by the frontend as:
 *   /.netlify/functions/market-data?symbol=AAPL&interval=1d&range=1y
 *
 * Returns the raw Yahoo Finance chart JSON payload on success, or a
 * structured error object on failure.
 */

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Reasonable server-side timeout — no browser proxy latency to worry about
const FETCH_TIMEOUT_MS = 10000;

exports.handler = async function (event) {
  // ── 1. Parse and validate query parameters ────────────────────────────────
  const { symbol, interval = '1d', range = '1d' } = event.queryStringParameters || {};

  if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
    return response(400, { error: 'Missing required parameter: symbol' });
  }

  const sym = symbol.trim().toUpperCase();

  // Basic symbol sanity check — Yahoo symbols are alphanumeric + a few chars
  if (!/^[A-Z0-9.\-^=]+$/.test(sym)) {
    return response(400, { error: 'Invalid symbol format: ' + sym });
  }

  // ── 2. Build Yahoo Finance URL ────────────────────────────────────────────
  const yahooUrl =
    `${YAHOO_BASE}/${encodeURIComponent(sym)}` +
    `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

  // ── 3. Fetch from Yahoo Finance (server-side, no CORS restrictions) ───────
  let yahooResponse;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    yahooResponse = await fetch(yahooUrl, {
      signal: controller.signal,
      headers: {
        // Mimic a browser request so Yahoo doesn't reject with 401/403
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    clearTimeout(timer);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.error('[market-data] fetch error for', sym, ':', err.message);
    return response(502, {
      error: isTimeout
        ? `Yahoo Finance request timed out for ${sym}`
        : `Network error fetching ${sym}: ${err.message}`,
    });
  }

  // ── 4. Handle non-2xx HTTP responses from Yahoo ───────────────────────────
  if (!yahooResponse.ok) {
    console.error(
      '[market-data] Yahoo returned HTTP',
      yahooResponse.status,
      'for',
      sym
    );
    return response(yahooResponse.status === 404 ? 404 : 502, {
      error: `Yahoo Finance returned HTTP ${yahooResponse.status} for ${sym}`,
    });
  }

  // ── 5. Parse JSON body ────────────────────────────────────────────────────
  let data;
  try {
    data = await yahooResponse.json();
  } catch (err) {
    console.error('[market-data] JSON parse error for', sym, ':', err.message);
    return response(502, {
      error: `Failed to parse Yahoo Finance response for ${sym}`,
    });
  }

  // ── 6. Verify chart data is present in the response ───────────────────────
  const result = data?.chart?.result;
  if (!result || result.length === 0) {
    const yahooError = data?.chart?.error;
    console.warn('[market-data] no chart result for', sym, yahooError || '');
    return response(404, {
      error:
        (yahooError && yahooError.description) ||
        `No chart data available for ${sym}`,
    });
  }

  // ── 7. Return the validated Yahoo payload to the client ───────────────────
  return response(200, data);
};

// ── Helper: build a standard Netlify function response ──────────────────────
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Allow the frontend (same Netlify site) to call this function
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}