/**
 * Netlify Serverless Function: capital-returns   (Phase 7B-6G-1 — DEV-ONLY)
 * Path: netlify/functions/capital-returns.js
 *
 * Fetches US-GAAP XBRL company facts from SEC and returns structured capital
 * returns history (share buybacks + dividends) for a given ticker.
 *
 * Uses the same CIK resolution waterfall and secGet discipline as edgar-form4.js.
 * Only one SEC request is made after identity resolution: the companyfacts endpoint.
 * No filing-level XML is fetched. companyfacts JSON can be large for major companies
 * (10–40 MB); Netlify's 26-second function wall-clock applies — see REQ_TIMEOUT_MS.
 *
 * Server-side dormancy gate:
 *   PT_ENABLE_CAPITAL_RETURNS_SERVER must equal "true". Production must NOT set this.
 *   If unset/!= "true", returns DISABLED and makes NO SEC request.
 *
 * Required environment variable (NOT stored in source):
 *   SEC_USER_AGENT  e.g. "PortfolioTracker-PulseDev/1.0 you@example.com"
 *   Checked only AFTER the server gate passes. If missing, returns VERIFICATION_UNAVAILABLE.
 *
 * Request: POST /.netlify/functions/capital-returns
 *   Body: { ticker, issuerNameHint?, cik?, windowYears?: number (1–10, default 5) }
 *
 * Response (always HTTP 200 for logical outcomes; 4xx only for malformed input):
 *   { status, ticker, issuer, cik, resolutionPath, windowYears,
 *     buybacks: [...], dividends: [...], summary: {...},
 *     latencyMs, secRequests: [...], errors: [] }
 *
 *   status ∈ DISABLED | OK | NONE | IDENTITY_UNRESOLVED | IDENTITY_AMBIGUOUS |
 *             VERIFICATION_UNAVAILABLE | CONFIGURATION_MISSING | ERROR
 *
 *   OK:   at least one buyback or dividend entry found in the requested window.
 *   NONE: identity resolved, facts fetched, relevant concepts present but zero
 *         entries survived the window filter (company had no buybacks/dividends
 *         or did not report via these concepts in this period).
 *
 * Boundaries: memory-only; does not touch edgar-form4, finance-search, scoring,
 * pt_results, localStorage, UI, or any production path.
 */

'use strict';

const SEC_TICKERS_URL  = 'https://www.sec.gov/files/company_tickers.json';
const SEC_BROWSE       = 'https://www.sec.gov/cgi-bin/browse-edgar';
const SEC_COMPANYFACTS = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';

const REQ_TIMEOUT_MS  = 22000;                // per SEC request; companyfacts can be large
const SEC_SPACING_MS  = 130;                  // ~7.7 req/s — under SEC's 10/s guidance
const FACTS_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 h — facts update quarterly at most
const TICKERMAP_TTL   = 24 * 60 * 60 * 1000; // 24 h

// Buyback concepts tried in preference order; first non-empty annual series wins.
const BUYBACK_CONCEPTS = [
  'PaymentsForRepurchaseOfCommonStock',  // most common; cash outflow for repurchases
  'StockRepurchasedDuringPeriodValue',   // used by some filers instead
  'TreasuryStockValueAcquiredCostMethod' // treasury-method reporters
];

// Dividend split concepts (common + preferred summed per year when both present).
const DIVIDEND_CONCEPT_COMMON    = 'PaymentsOfDividendsCommonStock';
const DIVIDEND_CONCEPT_PREFERRED = 'PaymentsOfDividendsPreferredStockAndPreferenceStock';
// Aggregate fallback when neither split concept has data.
const DIVIDEND_CONCEPT_AGGREGATE = 'PaymentsOfDividends';

// ── module-scope warm caches (memory-only) ───────────────────────────────────
let _tickerMap = null, _tickerMapAt = 0;
const _factsCache = new Map(); // cik -> { data, fetchedAt }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return res(405, { error: 'Method not allowed' });

  // Server-side dormancy gate — first, before UA check and any SEC traffic.
  if (process.env.PT_ENABLE_CAPITAL_RETURNS_SERVER !== 'true') {
    return res(200, {
      status: 'DISABLED',
      reason: 'SERVER_DISABLED',
      detail: 'capital-returns is disabled on this deployment; no SEC request made.',
      buybacks: [], dividends: [], summary: null, errors: ['SERVER_DISABLED']
    });
  }

  const ua = (process.env.SEC_USER_AGENT || '').trim();
  if (!ua) {
    return res(200, {
      status: 'VERIFICATION_UNAVAILABLE',
      reason: 'CONFIGURATION_MISSING',
      detail: 'SEC_USER_AGENT environment variable is not set; refusing to contact SEC.',
      buybacks: [], dividends: [], summary: null, errors: ['CONFIGURATION_MISSING']
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return res(400, { error: 'Invalid JSON' }); }

  const ticker         = String(body.ticker || '').trim().toUpperCase();
  if (!ticker || !/^[A-Za-z0-9.\-]{1,12}$/.test(ticker)) return res(400, { error: 'Invalid ticker' });
  const issuerNameHint = String(body.issuerNameHint || '').trim();
  const cikOverride    = body.cik ? pad10(String(body.cik).replace(/\D/g, '')) : null;
  const windowYears    = Math.min(10, Math.max(1, parseInt(body.windowYears) || 5));

  const ctx = { ua, secRequests: [], errors: [] };
  const t0  = Date.now();

  // 1) Ticker → CIK (same three-step waterfall as edgar-form4.js)
  let ident;
  try {
    ident = cikOverride
      ? { cik: cikOverride, issuer: issuerNameHint || null, resolutionPath: 'cik-override' }
      : await resolveIdentity(ticker, issuerNameHint, ctx);
  } catch (e) {
    return res(200, base('VERIFICATION_UNAVAILABLE', ticker, null, null, 'identity-error',
      windowYears, [], [], t0, ctx, [String(e.message || e)]));
  }
  if (ident.status === 'IDENTITY_AMBIGUOUS')
    return res(200, Object.assign(
      base('IDENTITY_AMBIGUOUS', ticker, null, null, ident.resolutionPath, windowYears, [], [], t0, ctx),
      { candidates: ident.candidates }
    ));
  if (!ident.cik)
    return res(200, base('IDENTITY_UNRESOLVED', ticker, ident.issuer || null, null,
      ident.resolutionPath || 'unresolved', windowYears, [], [], t0, ctx));

  // 2) Fetch companyfacts JSON (one request; result cached 6 h)
  let facts;
  try {
    facts = await getCompanyFacts(ident.cik, ctx);
  } catch (e) {
    return res(200, base('ERROR', ticker, ident.issuer, ident.cik, ident.resolutionPath,
      windowYears, [], [], t0, ctx, [String(e.message || e)]));
  }

  const usgaap  = (facts.facts && facts.facts['us-gaap']) || {};
  // minYear is exclusive: fiscal years strictly greater than this value are included.
  // windowYears=5 with current year 2026 → minYear=2021 → FY 2022-2026 included.
  const minYear = new Date().getFullYear() - windowYears;

  // 3) Extract and structure capital returns data
  const buybacks  = extractBuybacks(usgaap, minYear);
  const dividends = extractDividends(usgaap, minYear);

  const status  = (buybacks.length > 0 || dividends.length > 0) ? 'OK' : 'NONE';
  const summary = buildSummary(buybacks, dividends);

  return res(200, base(status, ticker, facts.entityName || ident.issuer, ident.cik,
    ident.resolutionPath, windowYears, buybacks, dividends, t0, ctx, [], { summary }));
};

// ── XBRL extraction ──────────────────────────────────────────────────────────

// Returns sorted annual entries for a single US-GAAP concept.
// Filters to 10-K FY rows only; deduplicates per fiscal year keeping most recently filed.
// Each entry: { fiscalYear, fiscalPeriod, periodEnd, filed, form, valueUSD, concept }
function extractAnnualEntries(usgaap, concept, minYear) {
  const node = usgaap[concept];
  if (!node || !node.units || !Array.isArray(node.units.USD)) return [];

  const byYear = new Map();
  for (const e of node.units.USD) {
    if (e.fp !== 'FY')                          continue; // annual only
    if (!e.form || !e.form.startsWith('10-K'))  continue; // 10-K and 10-K/A
    if (typeof e.fy !== 'number' || e.fy <= minYear) continue;
    const prior = byYear.get(e.fy);
    if (!prior || e.filed > prior.filed) byYear.set(e.fy, e);
  }

  return [...byYear.values()]
    .sort((a, b) => a.fy - b.fy)
    .map(e => ({
      fiscalYear:   e.fy,
      fiscalPeriod: e.fp,
      periodEnd:    e.end,
      filed:        e.filed,
      form:         e.form,
      valueUSD:     e.val,
      concept
    }));
}

// Tries buyback concepts in priority order; returns the first non-empty series.
function extractBuybacks(usgaap, minYear) {
  for (const concept of BUYBACK_CONCEPTS) {
    const entries = extractAnnualEntries(usgaap, concept, minYear);
    if (entries.length > 0) return entries;
  }
  return [];
}

// Builds dividend series: sums common + preferred per fiscal year when both are present;
// falls back to the aggregate PaymentsOfDividends concept when neither split has data.
// Each entry gains commonUSD and preferredUSD fields when the split is used.
function extractDividends(usgaap, minYear) {
  const common    = extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_COMMON, minYear);
  const preferred = extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_PREFERRED, minYear);

  if (common.length > 0 || preferred.length > 0) {
    const byYear = new Map();
    for (const e of common) {
      byYear.set(e.fiscalYear, {
        ...e,
        concept:      DIVIDEND_CONCEPT_COMMON,
        commonUSD:    e.valueUSD,
        preferredUSD: 0
      });
    }
    for (const e of preferred) {
      if (byYear.has(e.fiscalYear)) {
        const row = byYear.get(e.fiscalYear);
        row.preferredUSD = e.valueUSD;
        row.valueUSD     = (row.commonUSD || 0) + e.valueUSD;
        row.concept      = 'PaymentsOfDividendsCommonStock+Preferred';
      } else {
        byYear.set(e.fiscalYear, {
          ...e,
          concept:      DIVIDEND_CONCEPT_PREFERRED,
          commonUSD:    0,
          preferredUSD: e.valueUSD
        });
      }
    }
    return [...byYear.values()].sort((a, b) => a.fiscalYear - b.fiscalYear);
  }

  return extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_AGGREGATE, minYear);
}

function buildSummary(buybacks, dividends) {
  const sumUSD         = arr => arr.reduce((s, e) => s + (e.valueUSD || 0), 0);
  const totalBuybacks  = sumUSD(buybacks);
  const totalDividends = sumUSD(dividends);
  const allYears       = [...new Set([
    ...buybacks.map(e => e.fiscalYear),
    ...dividends.map(e => e.fiscalYear)
  ])].sort((a, b) => a - b);

  return {
    totalBuybacksUSD:        totalBuybacks  || null,
    totalDividendsUSD:       totalDividends || null,
    totalCapitalReturnedUSD: (totalBuybacks + totalDividends) || null,
    yearsWithBuybacks:       buybacks.length,
    yearsWithDividends:      dividends.length,
    buybackConceptUsed:      (buybacks[0]  && buybacks[0].concept)  || null,
    dividendConceptUsed:     (dividends[0] && dividends[0].concept) || null,
    oldestFiscalYear:        allYears[0]                   || null,
    newestFiscalYear:        allYears[allYears.length - 1] || null
  };
}

// ── Company facts fetch (module-scope cache, 6 h TTL) ────────────────────────

async function getCompanyFacts(cik, ctx) {
  const cached = _factsCache.get(cik);
  if (cached && (Date.now() - cached.fetchedAt) < FACTS_CACHE_TTL) return cached.data;
  const txt  = await secGet(`${SEC_COMPANYFACTS}${cik}.json`, ctx);
  const data = JSON.parse(txt);
  _factsCache.set(cik, { data, fetchedAt: Date.now() });
  return data;
}

// ── Identity resolution (same waterfall as edgar-form4.js) ───────────────────

async function resolveIdentity(ticker, nameHint, ctx) {
  // 1. Authoritative ticker→CIK map (SEC bulk JSON, cached 24 h)
  try {
    const map = await getTickerMap(ctx);
    const hit = map[ticker];
    if (hit) return { cik: pad10(String(hit.cik_str)), issuer: hit.title, resolutionPath: 'company_tickers' };
  } catch (e) { ctx.errors.push('tickermap:' + (e.message || e)); }

  // 2. browse-edgar ticker lookup (atom)
  try {
    const atom = await secGet(
      `${SEC_BROWSE}?action=getcompany&ticker=${encodeURIComponent(ticker)}&type=4&output=atom&count=1`, ctx);
    const cik  = (atom.match(/<cik>(\d+)<\/cik>/i) || [])[1];
    const name = (atom.match(/<conformed-name>([^<]+)<\/conformed-name>/i) || [])[1];
    if (cik) return { cik: pad10(cik), issuer: name || null, resolutionPath: 'browse-ticker' };
  } catch (e) { ctx.errors.push('browse-ticker:' + (e.message || e)); }

  // 3. Name search fallback (ambiguity-aware)
  const q    = nameHint || ticker;
  const atom = await secGet(
    `${SEC_BROWSE}?action=getcompany&company=${encodeURIComponent(q)}&type=4&output=atom&count=10`, ctx);
  const candidates = parseCompanyCandidates(atom);
  if (candidates.length === 0) return { cik: null, resolutionPath: 'name-none' };
  if (candidates.length === 1) return { cik: pad10(candidates[0].cik), issuer: candidates[0].name, resolutionPath: 'name-single' };
  const norm  = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = candidates.filter(c => norm(c.name) === norm(nameHint));
  if (exact.length === 1) return { cik: pad10(exact[0].cik), issuer: exact[0].name, resolutionPath: 'name-exact' };
  return {
    status: 'IDENTITY_AMBIGUOUS',
    resolutionPath: 'name-ambiguous',
    candidates: candidates.map(c => ({ cik: pad10(c.cik), name: c.name }))
  };
}

async function getTickerMap(ctx) {
  if (_tickerMap && (Date.now() - _tickerMapAt) < TICKERMAP_TTL) return _tickerMap;
  const txt = await secGet(SEC_TICKERS_URL, ctx);
  const raw = JSON.parse(txt);
  const map = {};
  Object.keys(raw).forEach(k => { const r = raw[k]; if (r && r.ticker) map[String(r.ticker).toUpperCase()] = r; });
  _tickerMap = map; _tickerMapAt = Date.now();
  return map;
}

function parseCompanyCandidates(atom) {
  const out = []; const re = /<cik>(\d+)<\/cik>/gi;
  let m; const seen = new Set();
  while ((m = re.exec(atom))) { if (!seen.has(m[1])) { seen.add(m[1]); out.push({ cik: m[1], name: '' }); } }
  const names = [...atom.matchAll(/<conformed-name>([^<]+)<\/conformed-name>/gi)].map(x => x[1]);
  out.forEach((c, i) => { if (names[i]) c.name = names[i]; });
  return out;
}

// ── SEC fetch (UA + timeout + spacing + bounded retry) ───────────────────────

let _lastSecAt = 0;
async function secGet(url, ctx) {
  const wait = SEC_SPACING_MS - (Date.now() - _lastSecAt);
  if (wait > 0) await sleep(wait);
  _lastSecAt = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const r = await timedFetch(url,
        { headers: { 'User-Agent': ctx.ua, 'Accept-Encoding': 'gzip, deflate', 'Accept': '*/*' } },
        REQ_TIMEOUT_MS);
      ctx.secRequests.push({ url: redact(url), status: r.status, ms: Date.now() - started });
      if (r.status >= 500 || r.status === 429) { lastErr = new Error('sec ' + r.status); await sleep(300); continue; }
      const txt = await r.text();
      if (!r.ok) throw new Error('sec ' + r.status);
      return txt;
    } catch (e) {
      lastErr = e;
      ctx.secRequests.push({ url: redact(url), status: 'err', ms: Date.now() - started });
      await sleep(250);
    }
  }
  throw lastErr || new Error('sec request failed');
}

async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pad10(c)  { return String(c).padStart(10, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function redact(u) { return String(u).split('?')[0]; }

function base(status, ticker, issuer, cik, resolutionPath, windowYears, buybacks, dividends, t0, ctx, extraErrors, extra) {
  return Object.assign({
    status,
    ticker,
    issuer:         issuer || null,
    cik:            cik || null,
    resolutionPath: resolutionPath || null,
    windowYears,
    buybacks:       buybacks  || [],
    dividends:      dividends || [],
    latencyMs:      Date.now() - t0,
    secRequests:    ctx.secRequests,
    errors:         (ctx.errors || []).concat(extraErrors || [])
  }, extra || {});
}

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(body) };
}
