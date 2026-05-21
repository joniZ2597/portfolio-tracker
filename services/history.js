/**
 * services/history.js
 * Lightweight historical daily candle fetcher.
 *
 * Uses the same proxy + API infrastructure already present in the
 * Market State Engine. No new dependencies introduced.
 *
 * Primary:  Yahoo Finance via allorigins.win/raw (same YAHOO_PROXY as pipeline)
 * Fallback: Alpha Vantage TIME_SERIES_DAILY (if AV key is available)
 *
 * DOES NOT implement: RSI, MA, ATR, RS, intraday, WebSockets, AI logic.
 * DOES NOT modify any existing fetcher, orchestration, or UI code.
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// Matches YAHOO_PROXY in main codebase
const _HIST_YAHOO_PROXY = 'https://api.allorigins.win/raw?url=';
const _HIST_AV_BASE     = 'https://www.alphavantage.co/query';

const RANGE_MAP = {
  '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y',
  // pass-through
  '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y',
};

// Approximate trading days per range — for AV compact vs full output
const _AV_OUTPUT_SIZE = { '1mo': 'compact', '3mo': 'compact', '6mo': 'full', '1y': 'full' };

// ─── CACHE ───────────────────────────────────────────────────────────────────
const historicalCache = {};
const CACHE_TTL_MS    = 15 * 60 * 1000; // 15 minutes

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Fetch normalised daily candles.
 *
 * @param {string} symbol   Ticker symbol, e.g. "NVDA"
 * @param {string} range    "1M" | "3M" | "6M" | "1Y" (or Yahoo aliases)
 * @returns {Promise<Array<{date,open,high,low,close,volume}>>}  Never throws.
 */
async function fetchHistoricalCandles(symbol, range = '6mo') {
  if (!symbol || typeof symbol !== 'string') {
    console.warn('[history] invalid symbol', symbol);
    return [];
  }

  const sym      = symbol.trim().toUpperCase();
  const yr       = RANGE_MAP[range] ?? '6mo';
  const cacheKey = `${sym}:${yr}`;

  // Cache hit
  const cached = historicalCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    console.log(`[history] cache hit: ${cacheKey} (${cached.candles.length} candles)`);
    return cached.candles;
  }

  // Try Yahoo first (same proxy as existing pipeline)
  let candles = await _fetchYahooCandles(sym, yr);

  // Fallback to Alpha Vantage if Yahoo fails and AV key exists
  if (candles.length === 0) {
    candles = await _fetchAVCandles(sym, yr);
  }

  if (candles.length === 0) {
    console.warn(`[history] all sources failed for ${sym} — returning []`);
    return [];
  }

  historicalCache[cacheKey] = { candles, fetchedAt: Date.now() };
  return candles;
}

// ─── YAHOO SOURCE ────────────────────────────────────────────────────────────

async function _fetchYahooCandles(sym, yr) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=${yr}`;
  const proxied  = _HIST_YAHOO_PROXY + encodeURIComponent(yahooUrl);
  try {
    const res = await fetch(proxied, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data    = await res.json();
    const candles = _parseYahooChart(data, sym);
    if (candles.length > 0) {
      console.log(`[history] Yahoo: ${candles.length} candles for ${sym} (${yr})`);
    }
    return candles;
  } catch (err) {
    console.warn(`[history] Yahoo failed for ${sym}:`, err.message ?? err);
    return [];
  }
}

function _parseYahooChart(data, sym) {
  try {
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp;
    const quote      = result.indicators?.quote?.[0];
    if (!timestamps || !quote) return [];

    const opens = quote.open ?? [], highs = quote.high ?? [],
          lows  = quote.low  ?? [], closes = quote.close ?? [],
          volumes = quote.volume ?? [];

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i], o = opens[i], h = highs[i],
            l  = lows[i],       c = closes[i], v = volumes[i];
      if (ts==null||o==null||isNaN(o)||h==null||isNaN(h)||
          l==null||isNaN(l)||c==null||isNaN(c)||c===0) continue;
      candles.push({
        date:   new Date(ts * 1000).toISOString().slice(0, 10),
        open:   +o.toFixed(4), high: +h.toFixed(4),
        low:    +l.toFixed(4), close: +c.toFixed(4),
        volume: v ?? 0,
      });
    }
    return candles.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn('[history] Yahoo parse error:', err.message ?? err);
    return [];
  }
}

// ─── ALPHA VANTAGE FALLBACK ──────────────────────────────────────────────────

async function _fetchAVCandles(sym, yr) {
  // avKey must exist globally (set by existing pipeline saveAvKey())
  const key = (typeof avKey !== 'undefined' && avKey)
    ? avKey
    : localStorage?.getItem?.('pt_avkey');
  if (!key) {
    console.warn('[history] AV fallback skipped — no key');
    return [];
  }

  const outputSize = _AV_OUTPUT_SIZE[yr] ?? 'full';
  const url = `${_HIST_AV_BASE}?function=TIME_SERIES_DAILY&symbol=${sym}&outputsize=${outputSize}&apikey=${key}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data['Note'] || data['Information']) {
      throw new Error('AV rate limit / invalid key');
    }

    const series = data?.['Time Series (Daily)'];
    if (!series) throw new Error('No time series in AV response');

    const cutoff = _rangeToCutoff(yr);
    const candles = Object.entries(series)
      .filter(([date]) => date >= cutoff)
      .map(([date, bar]) => ({
        date,
        open:   +parseFloat(bar['1. open']).toFixed(4),
        high:   +parseFloat(bar['2. high']).toFixed(4),
        low:    +parseFloat(bar['3. low']).toFixed(4),
        close:  +parseFloat(bar['4. close']).toFixed(4),
        volume: parseInt(bar['5. volume'], 10) || 0,
      }))
      .filter(c => c.close > 0 && !isNaN(c.close))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[history] AV fallback: ${candles.length} candles for ${sym} (${yr})`);
    return candles;
  } catch (err) {
    console.warn(`[history] AV failed for ${sym}:`, err.message ?? err);
    return [];
  }
}

function _rangeToCutoff(yr) {
  const d = new Date();
  switch (yr) {
    case '1mo': d.setMonth(d.getMonth() - 1);  break;
    case '3mo': d.setMonth(d.getMonth() - 3);  break;
    case '6mo': d.setMonth(d.getMonth() - 6);  break;
    case '1y':  d.setFullYear(d.getFullYear() - 1); break;
  }
  return d.toISOString().slice(0, 10);
}

// ─── CACHE UTILITIES ─────────────────────────────────────────────────────────

function clearHistoricalCache() {
  const keys = Object.keys(historicalCache);
  keys.forEach(k => delete historicalCache[k]);
  console.log(`[history] cache cleared (${keys.length} entries)`);
}

function getHistoricalCacheStats() {
  return Object.entries(historicalCache).map(([key, val]) => ({
    key,
    candles:   val.candles.length,
    ageSeconds: Math.round((Date.now() - val.fetchedAt) / 1000),
    expiresIn:  Math.round((CACHE_TTL_MS - (Date.now() - val.fetchedAt)) / 1000),
  }));
}
