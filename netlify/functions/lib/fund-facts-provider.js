'use strict';

/**
 * netlify/functions/lib/fund-facts-provider.js
 *
 * EG-25C-1 · C1-S1 — J1 SEC Financial Facts provider (PURE LIB, OFFLINE-ONLY).
 *
 * Deterministic SEC XBRL companyfacts → fund-contract-v1 record extractor.
 * This module is dormant-by-construction: it makes NO live network / Blob /
 * store / DOM / web-storage / scoring access. Every SEC contact is performed
 * through an INJECTED fetch implementation, and the clock is INJECTED (no
 * ambient wall-clock) — so the whole module is exercisable fully offline over recorded
 * companyfacts-style fixtures.
 *
 * What it does NOT do (deferred to later C1 slices, each its own owner GO):
 *   - no endpoint / route / HTTP or status envelope           (C1-S3 / C1-S4)
 *   - no gate / env / token / allowlist runtime               (C1-S2 / C1-S3)
 *   - no Blob / store-write / key-list output                 (C1-S4 writer)
 *   - no live SEC/provider call, no request spacing/rate limit (endpoint slices)
 *   - no J7 freshness, no scoring, no score signals
 *
 * Public shape (spec §2.1):
 *   getFundFactsWithCik(request, options) -> Promise<{ cik, record }>
 *     request = { ticker, cik? }
 *     options = { fetchImpl, userAgent, nowIso, runId?, maxBytes?, timeoutMs? }
 *       - missing userAgent  -> throws SEC_USER_AGENT_MISSING  (before any fetch)
 *       - missing fetchImpl  -> throws SEC_FETCH_UNAVAILABLE   (before any fetch)
 *       - missing/!ISO nowIso-> throws CLOCK_NOT_INJECTED      (enforces the injected clock)
 *       - invalid/unknown ticker -> { cik: null, record: null } (graceful, no fetch)
 *
 * Pure core (no I/O, no clock of its own):
 *   extractFundFacts(companyFacts, context) -> record
 *     context = { ticker, cik, nowIso, runId, secRequests? }
 *   Never throws on malformed companyFacts: absent data becomes null series +
 *   an explicit gaps[] entry — never zero, never bearish (fund-contract-v1).
 *
 * Record shape (spec §2.4, owner-selected "§2.4-full minus the writer key-list"):
 *   { ticker, cik, fetchedAt, sourceTier, contractVersion, provider, runId,
 *     series, derived, filings, gaps, secRequests, confidence, verificationStatus }
 */

// ── constants ─────────────────────────────────────────────────────────────────

var CONTRACT_VERSION = 'fund-contract-v1';
var SOURCE_TIER = 'sec_xbrl_primary';
var PROVIDER_ID = 'j1-sec-facts@job-model-v1';

var SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
var SEC_COMPANYFACTS_PRE = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';
var SEC_ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';

var DEFAULT_TIMEOUT_MS = 22000;
var DEFAULT_MAX_BYTES = 64 * 1024 * 1024; // companyfacts can be large (10-40 MB)
var FACTS_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 h — facts update quarterly at most
var TICKERMAP_TTL = 24 * 60 * 60 * 1000;   // 24 h

// Scope bound per stored series (spec §2.4).
var MAX_QUARTERS = 8;
var MAX_ANNUALS = 3;
var MAX_INSTANTS = 4;

// A true fiscal quarter is ~13-14 weeks (sec10q-live idiom): admits ~91/98-day
// quarters, excludes 6-month (~180 d) / 9-month (~270 d) YTD facts.
var MIN_QUARTER_DAYS = 80;
var MAX_QUARTER_DAYS = 100;

// Concept allowlist (spec §2.2). Fallback order is left → right; concepts
// outside this table are ignored (allowlist, not blocklist).
var REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet'
];
var NETINCOME_CONCEPTS = ['NetIncomeLoss'];
var EPS_CONCEPTS = ['EarningsPerShareDiluted', 'EarningsPerShareBasic'];
var CFO_CONCEPTS = ['NetCashProvidedByUsedInOperatingActivities'];
var CAPEX_CONCEPTS = ['PaymentsToAcquirePropertyPlantAndEquipment'];
var CASH_CONCEPTS = [
  'CashAndCashEquivalentsAtCarryingValue',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'
];
var EQUITY_CONCEPTS = ['StockholdersEquity'];
var SHARES_CONCEPTS = [
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  'WeightedAverageNumberOfSharesOutstandingBasic'
];

// debt is a summed composite (spec §2.2): LongTermDebtNoncurrent +
// LongTermDebtCurrent (summed when both present) → LongTermDebt; ShortTermBorrowings
// added when present. Instant concepts.
var DEBT_NONCURRENT = 'LongTermDebtNoncurrent';
var DEBT_CURRENT = 'LongTermDebtCurrent';
var DEBT_LONGTERM = 'LongTermDebt';
var DEBT_SHORT = 'ShortTermBorrowings';
var DEBT_CONCEPTS = [DEBT_NONCURRENT, DEBT_CURRENT, DEBT_LONGTERM, DEBT_SHORT];

// Simple (single-node) fields, in fixed record order. debt is handled separately
// and inserted after cash (see extractFundFacts).
var SIMPLE_FIELDS = [
  { field: 'revenue', concepts: REVENUE_CONCEPTS, unit: 'USD', kind: 'duration' },
  { field: 'netIncome', concepts: NETINCOME_CONCEPTS, unit: 'USD', kind: 'duration' },
  { field: 'eps', concepts: EPS_CONCEPTS, unit: 'USD/shares', kind: 'duration' },
  { field: 'cfo', concepts: CFO_CONCEPTS, unit: 'USD', kind: 'duration' },
  { field: 'capex', concepts: CAPEX_CONCEPTS, unit: 'USD', kind: 'duration' },
  { field: 'cash', concepts: CASH_CONCEPTS, unit: 'USD', kind: 'instant' },
  { field: 'equity', concepts: EQUITY_CONCEPTS, unit: 'USD', kind: 'instant' },
  { field: 'shares', concepts: SHARES_CONCEPTS, unit: 'shares', kind: 'duration' }
];

// Fixed field order for the series map and gap ordering (debt sits after cash).
var FIELD_ORDER = ['revenue', 'netIncome', 'eps', 'cfo', 'capex', 'cash', 'debt', 'equity', 'shares'];

var FP_ORDER = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 };

// ── module-scope warm caches (memory-only, injected-clock TTL) ────────────────
var _tickerMap = null;
var _tickerMapAt = 0;
var _factsCache = new Map(); // cik -> { data, at }

// Test seam: clear the warm caches so cache-behavior fixtures are deterministic.
function _clearCaches() {
  _tickerMap = null;
  _tickerMapAt = 0;
  _factsCache = new Map();
}

// ── public: injected-fetch wrapper (spec §2.1) ───────────────────────────────

async function getFundFactsWithCik(request, options) {
  var src = isObject(request) ? request : {};
  var ticker = typeof src.ticker === 'string' ? src.ticker.trim().toUpperCase() : '';
  var opts = isObject(options) ? options : {};

  // Invalid ticker is graceful (no throw, no fetch) — matches the sec10q-live idiom.
  if (!/^[A-Z]{1,10}$/.test(ticker)) {
    return { cik: null, record: null };
  }

  // Fail closed BEFORE any fetch: never contact SEC without an identifiable UA.
  var ua = typeof opts.userAgent === 'string' ? opts.userAgent.trim() : '';
  if (!ua) {
    throw new Error('SEC_USER_AGENT_MISSING');
  }
  if (typeof opts.fetchImpl !== 'function') {
    throw new Error('SEC_FETCH_UNAVAILABLE');
  }
  // Clock must be injected (a deterministic lib takes no ambient clock).
  var nowIso = typeof opts.nowIso === 'string' ? opts.nowIso : '';
  var nowMs = Date.parse(nowIso);
  if (!nowIso || !isFinite(nowMs)) {
    throw new Error('CLOCK_NOT_INJECTED');
  }
  var runId = (typeof opts.runId === 'number' && isFinite(opts.runId)) ? opts.runId : nowMs;

  var ctx = {
    fetchImpl: opts.fetchImpl,
    ua: ua,
    nowMs: nowMs,
    timeoutMs: posInt(opts.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxBytes: posInt(opts.maxBytes, DEFAULT_MAX_BYTES),
    secRequests: []
  };

  // 1) ticker → CIK. Explicit cik override skips the lookup (edgar-form4 idiom).
  var cik;
  if (src.cik != null && /^\d{1,10}$/.test(String(src.cik).replace(/\D/g, ''))) {
    cik = pad10(String(src.cik).replace(/\D/g, ''));
  } else {
    cik = await resolveCik(ticker, ctx);
  }
  if (!cik) {
    return { cik: null, record: null };
  }

  // 2) companyfacts JSON (one request per CIK; 6-h injected-clock cache).
  var companyFacts = await getCompanyFacts(cik, ctx);

  // 3) deterministic extraction (pure).
  var record = extractFundFacts(companyFacts, {
    ticker: ticker,
    cik: cik,
    nowIso: nowIso,
    runId: runId,
    secRequests: ctx.secRequests.slice()
  });

  return { cik: cik, record: record };
}

// ── identity: ticker → CIK (company_tickers.json; 24-h injected-clock cache) ──

async function resolveCik(ticker, ctx) {
  var map = await getTickerMap(ctx);
  var hit = map[ticker];
  if (hit && hit.cik_str != null) {
    var digits = String(hit.cik_str).replace(/\D/g, '');
    if (digits) {
      return pad10(digits);
    }
  }
  return null;
}

async function getTickerMap(ctx) {
  if (_tickerMap && (ctx.nowMs - _tickerMapAt) < TICKERMAP_TTL) {
    return _tickerMap;
  }
  var raw = await secGetJson(SEC_TICKERS_URL, ctx);
  var map = {};
  if (isObject(raw)) {
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var r = raw[keys[i]];
      if (r && typeof r.ticker === 'string') {
        map[r.ticker.toUpperCase()] = r;
      }
    }
  }
  _tickerMap = map;
  _tickerMapAt = ctx.nowMs;
  return map;
}

async function getCompanyFacts(cik, ctx) {
  var cached = _factsCache.get(cik);
  if (cached && (ctx.nowMs - cached.at) < FACTS_CACHE_TTL) {
    return cached.data;
  }
  var data = await secGetJson(SEC_COMPANYFACTS_PRE + cik + '.json', ctx);
  _factsCache.set(cik, { data: data, at: ctx.nowMs });
  return data;
}

// ── pure extraction core (no I/O, no clock of its own) ───────────────────────

function extractFundFacts(companyFacts, context) {
  var ctx = isObject(context) ? context : {};
  var ticker = typeof ctx.ticker === 'string' ? ctx.ticker : null;
  var cik = typeof ctx.cik === 'string' ? ctx.cik : null;
  var nowIso = typeof ctx.nowIso === 'string' ? ctx.nowIso : null;
  var runId = (typeof ctx.runId === 'number' && isFinite(ctx.runId)) ? ctx.runId : null;
  var secRequests = Array.isArray(ctx.secRequests) ? ctx.secRequests.slice() : [];

  var usgaap = readUsGaap(companyFacts);

  var series = {};
  var gaps = [];

  // Simple fields.
  var simpleByField = {};
  for (var i = 0; i < SIMPLE_FIELDS.length; i++) {
    var spec = SIMPLE_FIELDS[i];
    var got = extractSimpleField(usgaap, spec.concepts, spec.unit, spec.kind, cik);
    simpleByField[spec.field] = got;
  }

  // debt (summed composite instant series).
  var debtGot = extractDebt(usgaap, cik);

  // Assemble series + gaps in fixed field order.
  for (var f = 0; f < FIELD_ORDER.length; f++) {
    var field = FIELD_ORDER[f];
    var got2 = field === 'debt' ? debtGot : simpleByField[field];
    series[field] = { conceptUsed: got2.conceptUsed, facts: got2.facts };
    if (got2.facts.length === 0) {
      gaps.push(gapString(field, got2));
    }
  }

  // Derived metrics (basis-bearing; null when a true-quarter basis is unavailable).
  var derived = {
    revenueGrowth: computeRevenueGrowth(series.revenue.facts, runId),
    netMargin: computeNetMargin(series.netIncome.facts, series.revenue.facts, runId),
    freeCashFlow: computeFreeCashFlow(series.cfo.facts, series.capex.facts, runId),
    balanceSheetStrength: computeBalanceSheetStrength(
      series.cash.facts, series.debt.facts, series.equity.facts, runId
    )
  };

  // A null true-quarter-derived metric is an explicit gap — never zero, never
  // bearish (C1-S1-A owner ruling). balanceSheetStrength is instant-based and its
  // nullness is already covered by the debt/cash/equity field gaps.
  if (derived.revenueGrowth === null) {
    gaps.push('revenueGrowth: no usable true-quarter YoY basis (needs current + prior-year same-quarter revenue)');
  }
  if (derived.netMargin === null) {
    gaps.push('netMargin: no true-quarter basis (needs same-quarter netIncome and positive revenue)');
  }
  if (derived.freeCashFlow === null) {
    gaps.push('freeCashFlow: no true-quarter basis (needs same-quarter CFO and capex)');
  }

  var filings = buildFilings(series, cik);

  return {
    ticker: ticker,
    cik: cik,
    fetchedAt: nowIso,
    sourceTier: SOURCE_TIER,
    contractVersion: CONTRACT_VERSION,
    provider: PROVIDER_ID,
    runId: runId,
    series: series,
    derived: derived,
    filings: filings,
    gaps: gaps,
    secRequests: secRequests,
    confidence: null,
    verificationStatus: 'verified'
  };
}

// ── field extraction ─────────────────────────────────────────────────────────

// Returns { conceptUsed, facts, present } for a single-node field. Tries each
// concept in fallback order; first concept that yields ≥1 qualifying fact wins.
function extractSimpleField(usgaap, concepts, unit, kind, cik) {
  var anyNodePresent = false;
  for (var i = 0; i < concepts.length; i++) {
    var concept = concepts[i];
    var entries = readUnitEntries(usgaap, concept, unit);
    if (entries) {
      anyNodePresent = true;
      var facts = buildFacts(entries, concept, unit, kind, cik);
      if (facts.length > 0) {
        return { conceptUsed: concept, facts: facts, present: true, concepts: concepts };
      }
    }
  }
  return { conceptUsed: null, facts: [], present: anyNodePresent, concepts: concepts };
}

// Build a bounded, deduped, sorted FiscalFact[] from raw companyfacts entries.
function buildFacts(entries, concept, unit, kind, cik) {
  var byKey = new Map(); // `${fy}|${fp}` -> raw entry (most-recently-filed wins)
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!validEntry(e, kind)) {
      continue;
    }
    var key = e.fy + '|' + e.fp;
    var prior = byKey.get(key);
    if (!prior || String(e.filed) > String(prior.filed)) {
      byKey.set(key, e);
    }
  }

  var rows = [];
  byKey.forEach(function (e) {
    rows.push(toFiscalFact(e, concept, unit, cik));
  });
  rows.sort(factSort);

  return boundSeries(rows, kind);
}

// debt: per balance-sheet date, sum the available components (spec §2.2).
function extractDebt(usgaap, cik) {
  // Collect latest-filed instant entry per (concept, end).
  var byConceptEnd = {}; // concept -> Map(end -> entry)
  var ends = {};
  var anyNodePresent = false;
  for (var c = 0; c < DEBT_CONCEPTS.length; c++) {
    var concept = DEBT_CONCEPTS[c];
    var entries = readUnitEntries(usgaap, concept, 'USD');
    if (!entries) {
      continue;
    }
    anyNodePresent = true;
    var m = new Map();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!validEntry(e, 'instant')) {
        continue;
      }
      var prior = m.get(e.end);
      if (!prior || String(e.filed) > String(prior.filed)) {
        m.set(e.end, e);
      }
      ends[e.end] = true;
    }
    byConceptEnd[concept] = m;
  }

  var endList = Object.keys(ends).sort();
  var facts = [];
  for (var k = 0; k < endList.length; k++) {
    var end = endList[k];
    var built = buildDebtFactForEnd(byConceptEnd, end, cik);
    if (built) {
      facts.push(built);
    }
  }
  facts.sort(factSort);
  facts = boundSeries(facts, 'instant');

  var conceptUsed = facts.length > 0 ? facts[facts.length - 1].concept : null;
  return { conceptUsed: conceptUsed, facts: facts, present: anyNodePresent, concepts: DEBT_CONCEPTS };
}

function buildDebtFactForEnd(byConceptEnd, end, cik) {
  function at(concept) {
    var m = byConceptEnd[concept];
    return m ? (m.get(end) || null) : null;
  }
  var nonCur = at(DEBT_NONCURRENT);
  var cur = at(DEBT_CURRENT);
  var lt = at(DEBT_LONGTERM);
  var short = at(DEBT_SHORT);

  var used = [];       // { concept, entry }
  var value = 0;
  if (nonCur || cur) {
    if (nonCur) { value += nonCur.val; used.push({ concept: DEBT_NONCURRENT, entry: nonCur }); }
    if (cur) { value += cur.val; used.push({ concept: DEBT_CURRENT, entry: cur }); }
  } else if (lt) {
    value += lt.val;
    used.push({ concept: DEBT_LONGTERM, entry: lt });
  } else {
    return null; // no long-term base at this date
  }
  if (short) {
    value += short.val;
    used.push({ concept: DEBT_SHORT, entry: short });
  }

  // Provenance: a single accession only when every summed component shares it.
  var accns = used.map(function (u) { return u.entry.accn || null; });
  var sameAccn = accns.every(function (a) { return a && a === accns[0]; });
  var prov = used[0].entry;
  var accn = sameAccn ? accns[0] : null;

  return {
    concept: used.map(function (u) { return u.concept; }).join('+'),
    unit: 'USD',
    fiscalYear: prov.fy,
    fiscalPeriod: prov.fp,
    periodStart: null,
    periodEnd: end,
    valueNumeric: value,
    form: typeof prov.form === 'string' ? prov.form : null,
    accessionNumber: accn,
    filingUrl: makeFilingUrl(cik, accn),
    filed: isRealYmd(prov.filed) ? prov.filed : null
  };
}

// ── derived metrics (spec §2.2 C1-7; basis refs mandatory) ───────────────────

// revenueGrowth = YoY over true-quarter revenue pairs: (cur − prior)/abs(prior).
// null when no comparable prior-year quarter, or prior ≤ 0.
function computeRevenueGrowth(revenueFacts, runId) {
  var quarters = revenueFacts.filter(isTrueQuarterFact);
  if (quarters.length === 0) {
    return null;
  }
  var current = latestByPeriodEnd(quarters);
  var curDur = durationDays(current.periodStart, current.periodEnd);
  var prior = null;
  for (var i = 0; i < quarters.length; i++) {
    var f = quarters[i];
    if (
      f !== current &&
      f.fiscalPeriod === current.fiscalPeriod &&
      f.fiscalYear === current.fiscalYear - 1 &&
      Math.abs(durationDays(f.periodStart, f.periodEnd) - curDur) <= 10
    ) {
      prior = prior ? latestByPeriodEnd([prior, f]) : f;
    }
  }
  if (!prior || !(prior.valueNumeric > 0)) {
    return null;
  }
  var pct = ((current.valueNumeric - prior.valueNumeric) / Math.abs(prior.valueNumeric)) * 100;
  return {
    method: 'yoy_quarterly',
    valuePct: round(pct, 2),
    basis: ['revenue:' + periodTag(current), 'revenue:' + periodTag(prior)],
    computedAt: runId
  };
}

// netMargin = netIncome / revenue over the latest true-quarter pair; valuePct.
// Annual/FY/YTD facts are excluded (true-quarter basis only); null unless revenue
// is a present, positive fact for that quarter.
function computeNetMargin(netIncomeFacts, revenueFacts, runId) {
  var pair = latestCommonPeriod(netIncomeFacts.filter(isTrueQuarterFact), revenueFacts.filter(isTrueQuarterFact));
  if (!pair) {
    return null;
  }
  var ni = pair.a;
  var rev = pair.b;
  if (!(rev.valueNumeric > 0)) {
    return null;
  }
  return {
    method: 'net_margin',
    valuePct: round((ni.valueNumeric / rev.valueNumeric) * 100, 2),
    basis: ['netIncome:' + periodTag(ni), 'revenue:' + periodTag(rev)],
    computedAt: runId
  };
}

// freeCashFlow = CFO − capex over the latest true-quarter pair; valueNumeric.
// Annual/FY/YTD facts are excluded (true-quarter basis only). capex is consumed
// as a positive-magnitude outflow (sign normalized here).
function computeFreeCashFlow(cfoFacts, capexFacts, runId) {
  var pair = latestCommonPeriod(cfoFacts.filter(isTrueQuarterFact), capexFacts.filter(isTrueQuarterFact));
  if (!pair) {
    return null;
  }
  var cfo = pair.a;
  var capex = pair.b;
  var value = cfo.valueNumeric - Math.abs(capex.valueNumeric);
  return {
    method: 'cfo_minus_capex',
    valueNumeric: round(value, 2),
    basis: ['cfo:' + periodTag(cfo), 'capex:' + periodTag(capex)],
    computedAt: runId
  };
}

// balanceSheetStrength: numerics only (label vocabulary deferred to EG-25E).
//   netCash      = cash − totalDebt (latest instant where both present)
//   debtToEquity = totalDebt / equity (latest instant where both present, equity > 0)
// null when neither numeric is computable.
function computeBalanceSheetStrength(cashFacts, debtFacts, equityFacts, runId) {
  var netCash = null;
  var debtToEquity = null;
  var basis = [];

  var cashDebt = latestCommonInstant(cashFacts, debtFacts);
  if (cashDebt) {
    netCash = round(cashDebt.a.valueNumeric - cashDebt.b.valueNumeric, 2);
    basis.push('cash:' + periodTag(cashDebt.a));
    basis.push('debt:' + periodTag(cashDebt.b));
  }

  var debtEquity = latestCommonInstant(debtFacts, equityFacts);
  if (debtEquity && debtEquity.b.valueNumeric > 0) {
    debtToEquity = round(debtEquity.a.valueNumeric / debtEquity.b.valueNumeric, 4);
    pushUnique(basis, 'debt:' + periodTag(debtEquity.a));
    pushUnique(basis, 'equity:' + periodTag(debtEquity.b));
  }

  if (netCash === null && debtToEquity === null) {
    return null;
  }
  return {
    method: 'balance_sheet_numerics',
    netCash: netCash,
    debtToEquity: debtToEquity,
    basis: basis,
    computedAt: runId
  };
}

// ── filings index (built from the same companyfacts pull) ────────────────────

function buildFilings(series, cik) {
  var byAccn = new Map(); // accn -> { form, accessionNumber, filedAt, reportDate, filingUrl }
  for (var f = 0; f < FIELD_ORDER.length; f++) {
    var facts = series[FIELD_ORDER[f]].facts;
    for (var i = 0; i < facts.length; i++) {
      var fact = facts[i];
      var accn = fact.accessionNumber;
      if (!accn) {
        continue;
      }
      var rec = byAccn.get(accn);
      if (!rec) {
        byAccn.set(accn, {
          form: fact.form,
          accessionNumber: accn,
          filedAt: fact.filed,
          reportDate: fact.periodEnd,
          filingUrl: fact.filingUrl
        });
      } else if (fact.periodEnd && (!rec.reportDate || fact.periodEnd > rec.reportDate)) {
        // A filing's reportDate is its latest reported period end.
        rec.reportDate = fact.periodEnd;
      }
    }
  }
  var out = [];
  byAccn.forEach(function (rec) { out.push(rec); });
  out.sort(function (a, b) {
    var fa = String(a.filedAt || '');
    var fb = String(b.filedAt || '');
    if (fa !== fb) { return fa < fb ? -1 : 1; }
    return a.accessionNumber < b.accessionNumber ? -1 : 1;
  });
  return out;
}

// ── gap strings ──────────────────────────────────────────────────────────────

function gapString(field, got) {
  var tried = (got.concepts || []).join(', ');
  var reason = got.present ? 'no qualifying entries' : 'no concept present';
  return field + ': ' + reason + ' (' + tried + ')';
}

// ── period helpers ───────────────────────────────────────────────────────────

function periodTag(fact) {
  return String(fact.fiscalYear) + String(fact.fiscalPeriod);
}

function isTrueQuarterFact(fact) {
  if (!fact || !/^Q[1-4]$/.test(String(fact.fiscalPeriod))) {
    return false;
  }
  var d = durationDays(fact.periodStart, fact.periodEnd);
  return isFinite(d) && d >= MIN_QUARTER_DAYS && d <= MAX_QUARTER_DAYS;
}

function latestByPeriodEnd(facts) {
  var best = facts[0];
  for (var i = 1; i < facts.length; i++) {
    best = laterFact(best, facts[i]);
  }
  return best;
}

// Latest exact-(periodStart,periodEnd) pair present in both duration series.
function latestCommonPeriod(aFacts, bFacts) {
  var bByKey = {};
  for (var i = 0; i < bFacts.length; i++) {
    bByKey[periodKey(bFacts[i])] = bFacts[i];
  }
  var best = null;
  for (var j = 0; j < aFacts.length; j++) {
    var a = aFacts[j];
    var b = bByKey[periodKey(a)];
    if (b) {
      if (!best || compareByEnd(a, best.a) > 0) {
        best = { a: a, b: b };
      }
    }
  }
  return best;
}

// Latest common instant (by period end) present in both instant series.
function latestCommonInstant(aFacts, bFacts) {
  var bByEnd = {};
  for (var i = 0; i < bFacts.length; i++) {
    bByEnd[bFacts[i].periodEnd] = bFacts[i];
  }
  var best = null;
  for (var j = 0; j < aFacts.length; j++) {
    var a = aFacts[j];
    var b = bByEnd[a.periodEnd];
    if (b) {
      if (!best || String(a.periodEnd) > String(best.a.periodEnd)) {
        best = { a: a, b: b };
      }
    }
  }
  return best;
}

function periodKey(fact) {
  return String(fact.periodStart) + '|' + String(fact.periodEnd);
}

function compareByEnd(a, b) {
  if (a.periodEnd !== b.periodEnd) {
    return a.periodEnd < b.periodEnd ? -1 : 1;
  }
  return 0;
}

// Deterministic total order: latest end, then latest accession, then latest start.
function laterFact(a, b) {
  if (a.periodEnd !== b.periodEnd) {
    return a.periodEnd > b.periodEnd ? a : b;
  }
  var aAcc = String(a.accessionNumber || '');
  var bAcc = String(b.accessionNumber || '');
  if (aAcc !== bAcc) {
    return aAcc > bAcc ? a : b;
  }
  if (String(a.periodStart) !== String(b.periodStart)) {
    return String(a.periodStart) > String(b.periodStart) ? a : b;
  }
  return a;
}

// ── entry validation / projection ────────────────────────────────────────────

function validEntry(e, kind) {
  if (!isObject(e)) {
    return false;
  }
  if (typeof e.val !== 'number' || !isFinite(e.val)) {
    return false;
  }
  if (!Number.isInteger(e.fy)) {
    return false;
  }
  if (typeof e.fp !== 'string' || !(e.fp in FP_ORDER)) {
    return false;
  }
  if (!isRealYmd(e.end)) {
    return false;
  }
  if (kind === 'duration') {
    return isRealYmd(e.start);
  }
  // instant: must NOT carry a start date.
  return e.start == null;
}

function toFiscalFact(e, concept, unit, cik) {
  return {
    concept: concept,
    unit: unit,
    fiscalYear: e.fy,
    fiscalPeriod: e.fp,
    periodStart: e.start || null,
    periodEnd: e.end,
    valueNumeric: e.val,
    form: typeof e.form === 'string' ? e.form : null,
    accessionNumber: typeof e.accn === 'string' ? e.accn : null,
    filingUrl: makeFilingUrl(cik, typeof e.accn === 'string' ? e.accn : null),
    filed: isRealYmd(e.filed) ? e.filed : null
  };
}

function factSort(a, b) {
  if (a.fiscalYear !== b.fiscalYear) {
    return a.fiscalYear - b.fiscalYear;
  }
  var ao = FP_ORDER[a.fiscalPeriod] || 9;
  var bo = FP_ORDER[b.fiscalPeriod] || 9;
  if (ao !== bo) {
    return ao - bo;
  }
  return String(a.periodEnd) < String(b.periodEnd) ? -1 : (String(a.periodEnd) > String(b.periodEnd) ? 1 : 0);
}

// Scope bound per stored series (spec §2.4): duration → last 8 quarters + 3
// fiscal years; instant → latest 4. Input is sorted ascending; output preserves
// ascending order.
function boundSeries(rows, kind) {
  if (kind === 'instant') {
    return rows.slice(Math.max(0, rows.length - MAX_INSTANTS));
  }
  var quarters = [];
  var annuals = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].fiscalPeriod === 'FY') {
      annuals.push(rows[i]);
    } else {
      quarters.push(rows[i]);
    }
  }
  var keptQ = quarters.slice(Math.max(0, quarters.length - MAX_QUARTERS));
  var keptA = annuals.slice(Math.max(0, annuals.length - MAX_ANNUALS));
  var merged = keptQ.concat(keptA);
  merged.sort(factSort);
  return merged;
}

// ── companyfacts access ──────────────────────────────────────────────────────

function readUsGaap(companyFacts) {
  if (!isObject(companyFacts)) {
    return {};
  }
  var facts = companyFacts.facts;
  if (!isObject(facts)) {
    return {};
  }
  var usgaap = facts['us-gaap'];
  return isObject(usgaap) ? usgaap : {};
}

// Returns the raw entry array for a concept+unit, or null if absent.
function readUnitEntries(usgaap, concept, unit) {
  var node = usgaap[concept];
  if (!isObject(node) || !isObject(node.units)) {
    return null;
  }
  var arr = node.units[unit];
  return Array.isArray(arr) ? arr : null;
}

// ── hardened injected-fetch SEC JSON GET (no live network of its own) ─────────
// Timeout is enforced via AbortController + setTimeout (no ambient clock). No request
// spacing/rate-limit courtesy here — that belongs to the endpoint slices; this
// lib never contacts SEC outside an injected fetch.
async function secGetJson(url, ctx) {
  ctx.secRequests.push(url);

  var controller = new AbortController();
  var timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, ctx.timeoutMs);
  var aborted = new Promise(function (_resolve, reject) {
    if (controller.signal.aborted) {
      reject(new Error('SEC_TIMEOUT'));
      return;
    }
    controller.signal.addEventListener('abort', function () { reject(new Error('SEC_TIMEOUT')); }, { once: true });
  });
  aborted.catch(function () {}); // a stray timeout must never become an unhandled rejection

  try {
    var resp;
    try {
      resp = await Promise.race([
        ctx.fetchImpl(url, {
          headers: { 'User-Agent': ctx.ua, 'Accept': 'application/json' },
          signal: controller.signal
        }),
        aborted
      ]);
    } catch (_) {
      throw new Error('SEC_FETCH_FAILED');
    }

    if (!resp || typeof resp.status !== 'number') {
      throw new Error('SEC_NO_RESPONSE');
    }
    if (resp.status < 200 || resp.status >= 300) {
      var httpErr = new Error('SEC_HTTP_' + resp.status);
      httpErr.status = resp.status;
      throw httpErr;
    }

    var declared = (resp.headers && typeof resp.headers.get === 'function')
      ? Number(resp.headers.get('content-length'))
      : NaN;
    if (isFinite(declared) && declared > ctx.maxBytes) {
      throw new Error('SEC_OVERSIZE');
    }

    var text;
    try {
      text = await Promise.race([resp.text(), aborted]);
    } catch (_) {
      throw new Error('SEC_BODY_READ_FAILED');
    }
    if (typeof text !== 'string') {
      throw new Error('SEC_BODY_READ_FAILED');
    }
    if (byteLength(text) > ctx.maxBytes) {
      throw new Error('SEC_OVERSIZE');
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error('SEC_NON_JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function posInt(v, fallback) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : fallback;
}

function pad10(c) {
  return String(c).padStart(10, '0');
}

// Round to a fixed number of decimals for deterministic stringify.
function round(x, dp) {
  if (typeof x !== 'number' || !isFinite(x)) {
    return null;
  }
  var m = Math.pow(10, dp);
  return Math.round(x * m) / m;
}

function pushUnique(arr, v) {
  if (arr.indexOf(v) === -1) {
    arr.push(v);
  }
}

// Strict real calendar date (not regex-only): rejects e.g. 2025-13-40.
function isRealYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  var year = Number(s.slice(0, 4));
  var month = Number(s.slice(5, 7));
  var day = Number(s.slice(8, 10));
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function durationDays(start, end) {
  var a = Date.parse(start + 'T00:00:00Z');
  var b = Date.parse(end + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) {
    return NaN;
  }
  return (b - a) / 86400000;
}

function byteLength(s) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(s, 'utf8');
  }
  return unescape(encodeURIComponent(s)).length;
}

// Stable EDGAR filing-index permalink from a padded CIK + dashed accession.
function makeFilingUrl(cik, accn) {
  if (!accn || !cik) {
    return null;
  }
  return SEC_ARCHIVES + '/' + parseInt(cik, 10) + '/' + String(accn).replace(/-/g, '') + '/';
}

module.exports = {
  getFundFactsWithCik: getFundFactsWithCik,
  extractFundFacts: extractFundFacts,
  CONTRACT_VERSION: CONTRACT_VERSION,
  SOURCE_TIER: SOURCE_TIER,
  PROVIDER_ID: PROVIDER_ID,
  CONCEPT_ALLOWLIST: {
    revenue: REVENUE_CONCEPTS,
    netIncome: NETINCOME_CONCEPTS,
    eps: EPS_CONCEPTS,
    cfo: CFO_CONCEPTS,
    capex: CAPEX_CONCEPTS,
    cash: CASH_CONCEPTS,
    debt: DEBT_CONCEPTS,
    equity: EQUITY_CONCEPTS,
    shares: SHARES_CONCEPTS
  },
  _clearCaches: _clearCaches
};
