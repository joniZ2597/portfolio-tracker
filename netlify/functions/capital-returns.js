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
 *     buybacks: [...], dividends: [...], dividendsPerShare: [...], authorizations: [...],
 *     summary: {...}, latencyMs, secRequests: [...], errors: [] }
 *
 *   status ∈ DISABLED | OK | NONE | IDENTITY_UNRESOLVED | IDENTITY_AMBIGUOUS |
 *             VERIFICATION_UNAVAILABLE | CONFIGURATION_MISSING | ERROR
 *
 *   buybacks / dividends:     annual aggregate cash-flow amounts (duration, 10-K FY entries).
 *   dividendsPerShare:        per-share declared rates (duration, USD/shares units, 10-K + 10-Q).
 *   authorizations:           buyback program disclosures (instant USD entries, 10-K + 10-Q).
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

// Buyback cash-flow concepts (duration; units: "USD"); first non-empty annual series wins.
const BUYBACK_CONCEPTS = [
  'PaymentsForRepurchaseOfCommonStock',
  'StockRepurchasedDuringPeriodValue',
  'TreasuryStockValueAcquiredCostMethod',
];

// Dividend cash-flow concepts (duration; units: "USD").
const DIVIDEND_CONCEPT_COMMON    = 'PaymentsOfDividendsCommonStock';
const DIVIDEND_CONCEPT_PREFERRED = 'PaymentsOfDividendsPreferredStockAndPreferenceStock';
const DIVIDEND_CONCEPT_AGGREGATE = 'PaymentsOfDividends';

// Per-share dividend declared rate (duration; units: "USD/shares"; 10-K + 10-Q quarterly).
const DIVIDEND_PER_SHARE_CONCEPT = 'CommonStockDividendsPerShareDeclared';

// Buyback program disclosure concepts (instant; units: "USD"; balance-sheet date).
const BUYBACK_AUTH_CONCEPTS = [
  'StockRepurchaseProgramAuthorizedAmount1',
  'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1',
];

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
      buybacks: [], dividends: [], dividendsPerShare: [], authorizations: [], summary: null,
      errors: ['SERVER_DISABLED']
    });
  }

  const ua = (process.env.SEC_USER_AGENT || '').trim();
  if (!ua) {
    return res(200, {
      status: 'VERIFICATION_UNAVAILABLE',
      reason: 'CONFIGURATION_MISSING',
      detail: 'SEC_USER_AGENT environment variable is not set; refusing to contact SEC.',
      buybacks: [], dividends: [], dividendsPerShare: [], authorizations: [], summary: null,
      errors: ['CONFIGURATION_MISSING']
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
      windowYears, [], [], [], [], t0, ctx, [String(e.message || e)]));
  }
  if (ident.status === 'IDENTITY_AMBIGUOUS')
    return res(200, Object.assign(
      base('IDENTITY_AMBIGUOUS', ticker, null, null, ident.resolutionPath, windowYears, [], [], [], [], t0, ctx),
      { candidates: ident.candidates }
    ));
  if (!ident.cik)
    return res(200, base('IDENTITY_UNRESOLVED', ticker, ident.issuer || null, null,
      ident.resolutionPath || 'unresolved', windowYears, [], [], [], [], t0, ctx));

  // 2) Fetch companyfacts JSON (one request; result cached 6 h)
  let facts;
  try {
    facts = await getCompanyFacts(ident.cik, ctx);
  } catch (e) {
    return res(200, base('ERROR', ticker, ident.issuer, ident.cik, ident.resolutionPath,
      windowYears, [], [], [], [], t0, ctx, [String(e.message || e)]));
  }

  const usgaap  = (facts.facts && facts.facts['us-gaap']) || {};
  // minYear exclusive: fiscal years strictly greater than this are included.
  // windowYears=5 with current year 2026 → minYear=2021 → FY 2022-2026 included.
  const minYear = new Date().getFullYear() - windowYears;

  // 3) Extract capital returns data
  const cik               = ident.cik;
  const buybacks          = extractBuybacks(usgaap, minYear, cik);
  const dividends         = extractDividends(usgaap, minYear, cik);
  const dividendsPerShare = extractDividendPerShare(usgaap, minYear, cik);
  const authorizations    = extractBuybackAuthorizations(usgaap, minYear, cik);

  const hasData  = buybacks.length > 0 || dividends.length > 0 ||
                   dividendsPerShare.length > 0 || authorizations.length > 0;
  const status   = hasData ? 'OK' : 'NONE';
  const xbrlGaps = detectXbrlGaps(usgaap, buybacks, dividends, dividendsPerShare, authorizations);
  const summary  = buildSummary(buybacks, dividends, dividendsPerShare, authorizations, xbrlGaps);

  return res(200, base(status, ticker, facts.entityName || ident.issuer, ident.cik,
    ident.resolutionPath, windowYears, buybacks, dividends, dividendsPerShare, authorizations,
    t0, ctx, [], { summary }));
};

// ── XBRL cash-flow extraction (duration concepts; annual 10-K FY entries) ────

// Returns sorted annual entries for a single US-GAAP USD concept.
// Keeps 10-K FY rows only; deduplicates per fiscal year keeping most recently filed.
function extractAnnualEntries(usgaap, concept, minYear, signalType, cik) {
  const node = usgaap[concept];
  if (!node || !node.units || !Array.isArray(node.units.USD)) return [];

  const byYear = new Map();
  const gap = (end, filed) => Math.abs(Date.parse(filed) - Date.parse(end));
  for (const e of node.units.USD) {
    if (e.fp !== 'FY')                               continue;
    if (!e.form || !e.form.startsWith('10-K'))       continue;
    if (typeof e.fy !== 'number' || e.fy <= minYear) continue;
    const prior = byYear.get(e.fy);
    if (!prior) { byYear.set(e.fy, e); continue; }
    // Primary: most recently filed document wins.
    if (e.filed > prior.filed) { byYear.set(e.fy, e); continue; }
    if (e.filed < prior.filed) continue;
    // Tiebreak (same filing): prefer the period whose end date is nearest to the
    // filing date — that entry represents the current fiscal year, not a comparative period.
    if (gap(e.end, e.filed) < gap(prior.end, prior.filed)) byYear.set(e.fy, e);
  }

  return [...byYear.values()]
    .sort((a, b) => a.fy - b.fy)
    .map(e => ({
      fiscalYear:         e.fy,
      fiscalPeriod:       e.fp,
      periodStart:        e.start || null,
      periodEnd:          e.end,
      filed:              e.filed,
      form:               e.form,
      valueUSD:           e.val,
      concept,
      signalType,
      source_type:        'xbrl_companyfacts',
      verificationStatus: 'xbrl_primary',
      accessionNumber:    e.accn || null,
      filingUrl:          makeFilingUrl(cik, e.accn)
    }));
}

function extractBuybacks(usgaap, minYear, cik) {
  for (const concept of BUYBACK_CONCEPTS) {
    const entries = extractAnnualEntries(usgaap, concept, minYear, 'repurchases_executed', cik);
    if (entries.length > 0) return entries;
  }
  return [];
}

// Sums common + preferred per fiscal year when both are present; falls back to aggregate.
// signalType 'dividends_paid' is set by extractAnnualEntries for all paths.
// When common and preferred entries merge into one annual row:
//   - accessionNumber/filingUrl are preserved as a single value only when both contributing
//     entries share the same explicit non-null accession number (same filing confirmed).
//   - When accessions differ, one is null, or both are null, accessionNumber and filingUrl
//     are set to null; contributingFilings records both contributions including filed/form so
//     the merged row remains fully traceable. Row-level filed/form are left unchanged for
//     backward compatibility but must not be treated as sole provenance for the combined value.
// Individual non-merged entries (common-only or preferred-only years) carry full provenance.
function extractDividends(usgaap, minYear, cik) {
  const common    = extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_COMMON,    minYear, 'dividends_paid', cik);
  const preferred = extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_PREFERRED, minYear, 'dividends_paid', cik);

  if (common.length > 0 || preferred.length > 0) {
    const byYear = new Map();
    for (const e of common) {
      byYear.set(e.fiscalYear, {
        ...e, concept: DIVIDEND_CONCEPT_COMMON, commonUSD: e.valueUSD, preferredUSD: 0
      });
    }
    for (const e of preferred) {
      if (byYear.has(e.fiscalYear)) {
        const row = byYear.get(e.fiscalYear);
        row.preferredUSD = e.valueUSD;
        row.valueUSD     = (row.commonUSD || 0) + e.valueUSD;
        row.concept      = 'PaymentsOfDividendsCommonStock+Preferred';
        // Provenance: single filing identity only when both accessions are explicitly equal
        // and non-null. Different accessions, one null, or both null all require
        // contributingFilings to avoid attributing the combined value to one filing.
        const sameExplicitFiling =
          row.accessionNumber &&
          e.accessionNumber &&
          row.accessionNumber === e.accessionNumber;
        if (!sameExplicitFiling) {
          row.contributingFilings = [
            { concept: DIVIDEND_CONCEPT_COMMON,    filed: row.filed, form: row.form, accessionNumber: row.accessionNumber, filingUrl: row.filingUrl },
            { concept: DIVIDEND_CONCEPT_PREFERRED, filed: e.filed,   form: e.form,   accessionNumber: e.accessionNumber,   filingUrl: e.filingUrl   }
          ];
          row.accessionNumber = null;
          row.filingUrl       = null;
        }
      } else {
        // Preferred-only year — provenance fully intact from extractAnnualEntries.
        byYear.set(e.fiscalYear, {
          ...e, concept: DIVIDEND_CONCEPT_PREFERRED, commonUSD: 0, preferredUSD: e.valueUSD
        });
      }
    }
    return [...byYear.values()].sort((a, b) => a.fiscalYear - b.fiscalYear);
  }

  return extractAnnualEntries(usgaap, DIVIDEND_CONCEPT_AGGREGATE, minYear, 'dividends_paid', cik);
}

// ── XBRL per-share dividend extraction (duration; units: "USD/shares") ───────

// Returns per-period declared dividend rate from both 10-K and 10-Q filings.
// Deduplicates by (fy, fp); most recently filed entry wins. Raw e.accn survives
// deduplication because byPeriod stores raw entries; .map() reads e.accn after.
function extractDividendPerShare(usgaap, minYear, cik) {
  const node = usgaap[DIVIDEND_PER_SHARE_CONCEPT];
  if (!node || !node.units || !Array.isArray(node.units['USD/shares'])) return [];

  const fpOrd    = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 };
  const byPeriod = new Map();
  for (const e of node.units['USD/shares']) {
    if (typeof e.fy !== 'number' || e.fy <= minYear) continue;
    if (!e.form || (!e.form.startsWith('10-K') && !e.form.startsWith('10-Q'))) continue;
    const key  = `${e.fy}-${e.fp}`;
    const prior = byPeriod.get(key);
    if (!prior || e.filed > prior.filed) byPeriod.set(key, e);
  }

  return [...byPeriod.values()]
    .sort((a, b) => a.fy !== b.fy ? a.fy - b.fy : (fpOrd[a.fp] || 9) - (fpOrd[b.fp] || 9))
    .map(e => ({
      fiscalYear:         e.fy,
      fiscalPeriod:       e.fp,
      periodStart:        e.start || null,
      periodEnd:          e.end,
      filed:              e.filed,
      form:               e.form,
      valuePerShare:      e.val,
      concept:            DIVIDEND_PER_SHARE_CONCEPT,
      signalType:         'dividend_declared_per_share',
      source_type:        'xbrl_companyfacts',
      verificationStatus: 'xbrl_primary',
      accessionNumber:    e.accn || null,
      filingUrl:          makeFilingUrl(cik, e.accn)
    }));
}

// ── XBRL buyback authorization extraction (instant; units: "USD") ────────────

// Instant entries have no start date; filters out any duration entries that share the concept.
// Raw e.accn survives deduplication because byPeriod stores raw entries; .map() reads e.accn after.
function extractInstantEntries(usgaap, concept, minYear, signalType, cik) {
  const node = usgaap[concept];
  if (!node || !node.units || !Array.isArray(node.units.USD)) return [];

  const fpOrd    = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 };
  const byPeriod = new Map();
  for (const e of node.units.USD) {
    if (typeof e.fy !== 'number' || e.fy <= minYear) continue;
    if (!e.form || (!e.form.startsWith('10-K') && !e.form.startsWith('10-Q'))) continue;
    if (e.start) continue; // instant concepts carry only an end date
    const key  = `${e.fy}-${e.fp}`;
    const prior = byPeriod.get(key);
    if (!prior || e.filed > prior.filed) byPeriod.set(key, e);
  }

  return [...byPeriod.values()]
    .sort((a, b) => a.fy !== b.fy ? a.fy - b.fy : (fpOrd[a.fp] || 9) - (fpOrd[b.fp] || 9))
    .map(e => ({
      fiscalYear:         e.fy,
      fiscalPeriod:       e.fp,
      periodEnd:          e.end,
      filed:              e.filed,
      form:               e.form,
      valueUSD:           e.val,
      concept,
      signalType,
      source_type:        'xbrl_companyfacts',
      verificationStatus: 'xbrl_primary',
      accessionNumber:    e.accn || null,
      filingUrl:          makeFilingUrl(cik, e.accn)
    }));
}

// Combines all authorization concepts into one chronologically sorted array.
// Each concept maps to a distinct signalType so callers can filter without inspecting concept strings.
function extractBuybackAuthorizations(usgaap, minYear, cik) {
  const AUTH_SIGNAL_MAP = {
    'StockRepurchaseProgramAuthorizedAmount1':                    'authorization_new',
    'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1': 'authorization_remaining'
  };
  const fpOrd = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 };
  const all   = [];
  for (const concept of BUYBACK_AUTH_CONCEPTS) {
    all.push(...extractInstantEntries(usgaap, concept, minYear, AUTH_SIGNAL_MAP[concept], cik));
  }
  return all.sort((a, b) => {
    if (a.fy !== b.fy)   return a.fy - b.fy;
    if (a.fp !== b.fp)   return (fpOrd[a.fp] || 9) - (fpOrd[b.fp] || 9);
    return a.concept < b.concept ? -1 : 1;
  });
}

// ── XBRL gap detection ────────────────────────────────────────────────────────

// Returns an array of gap descriptors for signal types where XBRL evidence is absent or
// produced no qualifying entries. Gaps are auto-detectable from the extraction results and
// the raw usgaap object. xbrl_lag (announcement post-dating the most recent filing) is not
// emitted here — it resolves implicitly when a supplemental sec_8k entry is added for the
// same signalType in a future phase.
//
// reason ∈ 'concept_absent'        — concept node not present in companyfacts for this CIK.
//           'no_qualifying_entries' — concept present but no entries pass form/window filter.
function detectXbrlGaps(usgaap, buybacks, dividends, dividendsPerShare, authorizations) {
  const gaps = [];

  const hasUsdNode = concept => {
    const n = usgaap[concept];
    return !!(n && n.units && Array.isArray(n.units.USD));
  };

  // repurchases_executed
  if (buybacks.length === 0) {
    const anyPresent = BUYBACK_CONCEPTS.some(hasUsdNode);
    gaps.push({
      signalType: 'repurchases_executed',
      concept:    BUYBACK_CONCEPTS.join(' | '),
      reason:     anyPresent ? 'no_qualifying_entries' : 'concept_absent',
      detail:     anyPresent
        ? 'Buyback cash-flow concept(s) present but no annual 10-K FY entries qualify within the requested window.'
        : 'No buyback cash-flow concepts tagged in XBRL for this issuer; absence does not confirm no repurchase activity.'
    });
  }

  // dividends_paid
  if (dividends.length === 0) {
    const DPAID     = [DIVIDEND_CONCEPT_COMMON, DIVIDEND_CONCEPT_PREFERRED, DIVIDEND_CONCEPT_AGGREGATE];
    const anyPresent = DPAID.some(hasUsdNode);
    gaps.push({
      signalType: 'dividends_paid',
      concept:    DPAID.join(' | '),
      reason:     anyPresent ? 'no_qualifying_entries' : 'concept_absent',
      detail:     anyPresent
        ? 'Dividend cash-flow concept(s) present but no annual 10-K FY entries qualify within the requested window.'
        : 'No dividend cash-flow concepts tagged in XBRL for this issuer; absence does not confirm no dividend was paid.'
    });
  }

  // dividend_declared_per_share
  if (dividendsPerShare.length === 0) {
    const psNode     = usgaap[DIVIDEND_PER_SHARE_CONCEPT];
    const anyPresent = !!(psNode && psNode.units && Array.isArray(psNode.units['USD/shares']));
    gaps.push({
      signalType: 'dividend_declared_per_share',
      concept:    DIVIDEND_PER_SHARE_CONCEPT,
      reason:     anyPresent ? 'no_qualifying_entries' : 'concept_absent',
      detail:     anyPresent
        ? 'CommonStockDividendsPerShareDeclared present but no 10-K/10-Q entries qualify within the requested window.'
        : 'CommonStockDividendsPerShareDeclared not tagged in XBRL; absence does not confirm no per-share dividend was declared.'
    });
  }

  // authorization_remaining
  if (!authorizations.some(e => e.signalType === 'authorization_remaining')) {
    const concept    = 'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1';
    const anyPresent = hasUsdNode(concept);
    gaps.push({
      signalType: 'authorization_remaining',
      concept,
      reason:     anyPresent ? 'no_qualifying_entries' : 'concept_absent',
      detail:     anyPresent
        ? 'Remaining buyback authorization concept present but no qualifying instant entries within the requested window.'
        : 'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1 not tagged in XBRL for this issuer.'
    });
  }

  // authorization_new
  if (!authorizations.some(e => e.signalType === 'authorization_new')) {
    const concept    = 'StockRepurchaseProgramAuthorizedAmount1';
    const anyPresent = hasUsdNode(concept);
    gaps.push({
      signalType: 'authorization_new',
      concept,
      reason:     anyPresent ? 'no_qualifying_entries' : 'concept_absent',
      detail:     anyPresent
        ? 'Total buyback authorization concept present but no qualifying instant entries within the requested window.'
        : 'StockRepurchaseProgramAuthorizedAmount1 not tagged in XBRL for this issuer; absence does not confirm no buyback program exists.'
    });
  }

  return gaps;
}

// ── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(buybacks, dividends, dividendsPerShare, authorizations, xbrlGaps) {
  const sumUSD         = arr => arr.reduce((s, e) => s + (e.valueUSD || 0), 0);
  const totalBuybacks  = sumUSD(buybacks);
  const totalDividends = sumUSD(dividends);
  const allYears       = [...new Set([
    ...buybacks.map(e => e.fiscalYear),
    ...dividends.map(e => e.fiscalYear)
  ])].sort((a, b) => a - b);

  const latestDivPS      = dividendsPerShare.length
    ? dividendsPerShare[dividendsPerShare.length - 1] : null;
  const latestRemaining  = authorizations
    .filter(e => e.concept === 'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1')
    .slice(-1)[0] || null;
  const latestAuthorized = authorizations
    .filter(e => e.concept === 'StockRepurchaseProgramAuthorizedAmount1')
    .slice(-1)[0] || null;

  return {
    totalBuybacksUSD:                totalBuybacks  || null,
    totalDividendsUSD:               totalDividends || null,
    totalCapitalReturnedUSD:         (totalBuybacks + totalDividends) || null,
    yearsWithBuybacks:               buybacks.length,
    yearsWithDividends:              dividends.length,
    buybackConceptUsed:              (buybacks[0]  && buybacks[0].concept)  || null,
    dividendConceptUsed:             (dividends[0] && dividends[0].concept) || null,
    latestDividendPerShare:          latestDivPS    ? latestDivPS.valuePerShare    : null,
    latestDividendPerSharePeriod:    latestDivPS    ? `FY${latestDivPS.fiscalYear} ${latestDivPS.fiscalPeriod}` : null,
    latestRemainingAuthorizationUSD: latestRemaining  ? latestRemaining.valueUSD  : null,
    latestTotalAuthorizedUSD:        latestAuthorized ? latestAuthorized.valueUSD  : null,
    oldestFiscalYear:                allYears[0]                   || null,
    newestFiscalYear:                allYears[allYears.length - 1] || null,
    xbrlGaps:                        xbrlGaps || []
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
    status: 'IDENTITY_AMBIGUOUS', resolutionPath: 'name-ambiguous',
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

// Derives a stable EDGAR filing-index permalink from a padded 10-digit CIK and
// an accession number in the standard dashed format (e.g. "0001045810-25-000024").
// Returns null if either argument is absent.
function makeFilingUrl(cik, accn) {
  if (!accn || !cik) return null;
  return `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${String(accn).replace(/-/g, '')}/`;
}

function base(status, ticker, issuer, cik, resolutionPath, windowYears,
              buybacks, dividends, dividendsPerShare, authorizations,
              t0, ctx, extraErrors, extra) {
  return Object.assign({
    status,
    ticker,
    issuer:            issuer || null,
    cik:               cik || null,
    resolutionPath:    resolutionPath || null,
    windowYears,
    buybacks:          buybacks          || [],
    dividends:         dividends         || [],
    dividendsPerShare: dividendsPerShare || [],
    authorizations:    authorizations    || [],
    latencyMs:         Date.now() - t0,
    secRequests:       ctx.secRequests,
    errors:            (ctx.errors || []).concat(extraErrors || [])
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
