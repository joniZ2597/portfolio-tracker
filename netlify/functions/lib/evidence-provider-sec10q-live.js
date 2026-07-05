'use strict';

/**
 * netlify/functions/lib/evidence-provider-sec10q-live.js
 *
 * EG-20F-4 — sec10q_live provider (structured-XBRL, egress-hardened).
 *
 * Live-capable research-evidence provider for the dormant research-evidence
 * function. It produces deterministic, contract-shaped sec10q evidence from
 * SEC *structured* data only:
 *   - submissions API (filing metadata)        -> the 10-Q "filing exists" item
 *   - companyconcept API (per-concept XBRL)     -> quarterly revenue / net-income
 *                                                  comparison vs the prior-year
 *                                                  same quarter (true-quarter-
 *                                                  duration facts only; both
 *                                                  values provably present)
 *
 * It NEVER:
 *   - parses 10-Q narrative / MD&A / risk-factor text
 *   - fetches or parses the 10-Q HTML/iXBRL document
 *   - fetches the full companyfacts blob
 *   - fabricates a numeric claim that is not backed by two fetched XBRL facts
 *   - emits a YTD/cumulative figure as a "quarterly" comparison
 *
 * Egress hardening (mirrors netlify/functions/edgar-form4.js):
 *   - requires SEC_USER_AGENT before ANY SEC request is made (fail-closed)
 *   - per-request AbortController timeout that stays active THROUGH body
 *     consumption (a stalled body fails closed, it does not hang)
 *   - response-size cap (content-length header AND UTF-8 byte length)
 *   - bounded per-invocation request ceiling + minimal request spacing
 *   - fail-closed on timeout / oversize / HTTP error / non-JSON / malformed body
 *   - a concept-level HTTP 429 anywhere returns filing-only (even a numeric
 *     item an earlier concept already produced is dropped)
 *
 * Output is validated/projected by the frozen contract
 * (netlify/functions/lib/evidence-contract.js) regardless of what this provider
 * returns; every emitted item already satisfies that contract.
 *
 * Provider shape (super-set of evidence-provider-mock / -sec10q-fixture):
 *   getEvidence({ ticker, categories }, options?) -> Promise<raw evidence array>
 *
 * `options` (all optional; dependency-injection for offline tests):
 *   { fetch, env, timeoutMs, maxBytes, spacingMs, maxRequests }
 * When omitted, defaults are globalThis.fetch and process.env — there is no
 * live network in EG-20F-4; the first real sec.gov contact is the separately
 * approved EG-20F-5 canary.
 */

var CATEGORY = 'sec10q';
var SOURCE_TYPE = 'sec_filing';

var SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
var SEC_SUBMISSIONS_PRE = 'https://data.sec.gov/submissions/CIK';
var SEC_CONCEPT_PRE = 'https://data.sec.gov/api/xbrl/companyconcept/CIK';
var SEC_ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';

// Ordered allow-lists: try canonical tags first, fall back on taxonomy variance.
var REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet'
];
var NETINCOME_CONCEPTS = ['NetIncomeLoss'];

var DEFAULT_TIMEOUT_MS = 12000;
var DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard cap per response
var DEFAULT_SPACING_MS = 130;            // ~7.7 req/s, under SEC's 10/s guidance
var DEFAULT_MAX_REQUESTS = 8;            // bounded SEC requests per invocation

// A true fiscal quarter is ~13-14 weeks. This window admits 13/14-week quarters
// (~91/98 days) while excluding 6-month (~180d) and 9-month (~270d) YTD facts.
var MIN_QUARTER_DAYS = 80;
var MAX_QUARTER_DAYS = 100;

var ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;
var MAX_CLAIM = 1000;

function getEvidence(request, options) {
  // Legacy contract: resolve to the raw evidence item array. Delegates to the
  // shared core (which resolves the CIK exactly once) and projects to .items, so
  // existing callers observe the identical Promise<Array> behavior. Pre-fetch
  // throws (e.g. SEC_USER_AGENT_MISSING) propagate as before.
  return runGetEvidenceCore(request, options).then(function (r) { return r.items; });
}

// Slice 2A additive seam: surface the padded real CIK resolved during the normal
// live provider flow — WITHOUT a second SEC lookup and WITHOUT parsing sourceUrl.
// Returns { cik, items } from the SAME single invocation as getEvidence.
// cik is null when no ticker->CIK mapping was resolved (invalid input / unknown
// ticker); it is the 10-digit padded CIK once resolved (even if no 10-Q exists).
function getEvidenceWithCik(request, options) {
  return runGetEvidenceCore(request, options);
}

// Shared core. Resolves the CIK exactly once and returns { cik, items }.
// getEvidence projects .items (legacy); getEvidenceWithCik returns the object.
async function runGetEvidenceCore(request, options) {
  var src = isObject(request) ? request : {};
  var ticker = typeof src.ticker === 'string' ? src.ticker.trim().toUpperCase() : '';
  var categories = src.categories;

  if (!Array.isArray(categories) || categories.indexOf(CATEGORY) === -1) {
    return { cik: null, items: [] };
  }
  if (!/^[A-Z]{1,10}$/.test(ticker)) {
    return { cik: null, items: [] };
  }

  var cfg = buildConfig(options);

  // Fail closed BEFORE any fetch: never contact SEC without an identifiable UA.
  var ua = typeof cfg.env.SEC_USER_AGENT === 'string' ? cfg.env.SEC_USER_AGENT.trim() : '';
  if (!ua) {
    throw new Error('SEC_USER_AGENT_MISSING');
  }
  if (typeof cfg.fetchImpl !== 'function') {
    throw new Error('SEC_FETCH_UNAVAILABLE');
  }

  var ctx = {
    fetchImpl: cfg.fetchImpl,
    ua: ua,
    timeoutMs: cfg.timeoutMs,
    maxBytes: cfg.maxBytes,
    spacingMs: cfg.spacingMs,
    maxRequests: cfg.maxRequests,
    requestCount: 0,
    lastAt: 0
  };

  // 1) ticker -> CIK. A successful response that simply lacks the ticker is
  //    "no evidence" (graceful []); a fetch/hardening failure throws (502).
  //    The resolved CIK is surfaced verbatim via getEvidenceWithCik — no re-lookup.
  var cik = await resolveCik(ticker, ctx);
  if (!cik) {
    return { cik: null, items: [] };
  }

  // 2) latest 10-Q filing metadata (backbone). Fetch failure here is fail-closed
  //    (throws -> PROVIDER_FAILURE); a clean response with no 10-Q is [].
  var filing = await latestTenQ(cik, ctx);
  if (!filing) {
    return { cik: cik, items: [] };
  }

  var items = [];
  items.push(filingItem(ticker, filing, filingIndexUrl(cik, filing)));

  // 3) Optional structured-XBRL comparisons. Each numeric item is anchored to
  //    the *selected concept fact's* accession (not necessarily the latest
  //    filing). Numeric results are STAGED in enrichmentItems and attached only
  //    after every concept path completes without a rate-limit signal: a
  //    concept-level 429 anywhere backs off ALL enrichment and returns
  //    filing-only — even discarding a numeric item an earlier concept already
  //    produced. Any other failure or an absent comparable omits that single
  //    item — never fabricated.
  var enrichmentItems = [];

  var revenue = await conceptComparison(cik, REVENUE_CONCEPTS, ctx);
  if (revenue.status === 'ratelimited') {
    return { cik: cik, items: items };
  }
  if (revenue.status === 'ok') {
    var revItem = numericItem(ticker, cik, 'revenue', 'quarterly revenue', 'Quarterly Revenue', revenue.cmp);
    if (revItem) {
      enrichmentItems.push(revItem);
    }
  }

  var netIncome = await conceptComparison(cik, NETINCOME_CONCEPTS, ctx);
  if (netIncome.status === 'ratelimited') {
    return { cik: cik, items: items };
  }
  if (netIncome.status === 'ok') {
    var niItem = numericItem(ticker, cik, 'netincome', 'quarterly net income', 'Quarterly Net Income', netIncome.cmp);
    if (niItem) {
      enrichmentItems.push(niItem);
    }
  }

  // All enrichment paths completed without a rate-limit — attach staged numerics.
  for (var ei = 0; ei < enrichmentItems.length; ei++) {
    items.push(enrichmentItems[ei]);
  }

  return { cik: cik, items: items };
}

// ── config / injection ───────────────────────────────────────────────────────
function buildConfig(options) {
  var o = isObject(options) ? options : {};
  var globalFetch = (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function')
    ? globalThis.fetch
    : undefined;
  return {
    fetchImpl: typeof o.fetch === 'function' ? o.fetch : globalFetch,
    env: isObject(o.env) ? o.env : process.env,
    timeoutMs: posInt(o.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxBytes: posInt(o.maxBytes, DEFAULT_MAX_BYTES),
    spacingMs: (typeof o.spacingMs === 'number' && isFinite(o.spacingMs) && o.spacingMs >= 0)
      ? o.spacingMs
      : DEFAULT_SPACING_MS,
    maxRequests: posInt(o.maxRequests, DEFAULT_MAX_REQUESTS)
  };
}

// ── identity: ticker -> CIK ──────────────────────────────────────────────────
async function resolveCik(ticker, ctx) {
  var j = await secGetJson(SEC_TICKERS_URL, ctx);
  if (!isObject(j)) {
    return null;
  }
  var keys = Object.keys(j);
  for (var i = 0; i < keys.length; i++) {
    var r = j[keys[i]];
    if (r && typeof r.ticker === 'string' && r.ticker.toUpperCase() === ticker && r.cik_str != null) {
      var digits = String(r.cik_str).replace(/\D/g, '');
      if (digits) {
        return pad10(digits);
      }
    }
  }
  return null;
}

// ── latest 10-Q from the submissions API ─────────────────────────────────────
async function latestTenQ(cik, ctx) {
  var j = await secGetJson(SEC_SUBMISSIONS_PRE + cik + '.json', ctx);
  var recent = j && j.filings && j.filings.recent;
  if (!recent || !Array.isArray(recent.form)) {
    return null;
  }
  var forms = recent.form;
  var dates = Array.isArray(recent.filingDate) ? recent.filingDate : [];
  var accs = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  var docs = Array.isArray(recent.primaryDocument) ? recent.primaryDocument : [];
  var reports = Array.isArray(recent.reportDate) ? recent.reportDate : [];

  var best = null;
  for (var i = 0; i < forms.length; i++) {
    if (forms[i] !== '10-Q') {
      continue;
    }
    var filingDate = isRealYmd(dates[i]) ? dates[i] : null;
    var accession = typeof accs[i] === 'string' ? accs[i].trim() : '';
    if (!filingDate || !ACCESSION_RE.test(accession)) {
      continue;
    }
    var cand = {
      accession: accession,
      accNoDash: accession.replace(/-/g, ''),
      filingDate: filingDate,
      reportDate: isRealYmd(reports[i]) ? reports[i] : null,
      primaryDoc: typeof docs[i] === 'string' ? docs[i] : ''
    };
    if (!best || cand.filingDate > best.filingDate) {
      best = cand;
    }
  }
  return best;
}

// ── per-concept quarterly comparison ─────────────────────────────────────────
// Returns { status: 'ok', cmp } | { status: 'none' } | { status: 'ratelimited' }.
// A 404 (concept not reported) advances to the next allow-listed tag; a 429
// signals back-off (caller stops all enrichment); any other hardening failure
// omits this concept only.
async function conceptComparison(cik, concepts, ctx) {
  for (var i = 0; i < concepts.length; i++) {
    var url = SEC_CONCEPT_PRE + cik + '/us-gaap/' + concepts[i] + '.json';
    var j;
    try {
      j = await secGetJson(url, ctx);
    } catch (e) {
      if (e && e.status === 404) {
        continue; // tag not reported by this filer — try the next tag
      }
      if (e && e.status === 429) {
        return { status: 'ratelimited' }; // SEC is rate-limiting — stop enrichment
      }
      return { status: 'none' }; // timeout / oversize / 5xx / non-JSON — omit
    }
    var usd = j && j.units && Array.isArray(j.units.USD) ? j.units.USD : null;
    if (!usd) {
      continue;
    }
    var sel = selectQuarterlyComparison(usd);
    if (sel) {
      return { status: 'ok', cmp: sel };
    }
  }
  return { status: 'none' };
}

// Deterministically pick the most recent *true-quarter* 10-Q fact and its
// prior-year same-period counterpart (same fiscal period, fy-1, comparable
// quarter duration). YTD/cumulative facts are excluded outright.
function selectQuarterlyComparison(usdFacts) {
  var q = [];
  for (var i = 0; i < usdFacts.length; i++) {
    if (validQuarterFact(usdFacts[i])) {
      q.push(usdFacts[i]);
    }
  }
  if (q.length === 0) {
    return null;
  }
  var current = pickLatest(q);
  var curDur = durationDays(current.start, current.end);
  var priors = [];
  for (var p = 0; p < q.length; p++) {
    var f = q[p];
    if (
      f !== current &&
      f.fp === current.fp &&
      f.fy === current.fy - 1 &&
      Math.abs(durationDays(f.start, f.end) - curDur) <= 10
    ) {
      priors.push(f);
    }
  }
  if (priors.length === 0) {
    return null;
  }
  return { current: current, prior: pickLatest(priors) };
}

function validQuarterFact(f) {
  return !!f &&
    f.form === '10-Q' &&
    typeof f.val === 'number' && isFinite(f.val) &&
    typeof f.fp === 'string' && /^Q[1-4]$/.test(f.fp) &&
    Number.isInteger(f.fy) &&
    typeof f.accn === 'string' && ACCESSION_RE.test(f.accn) &&
    isRealYmd(f.start) && isRealYmd(f.end) &&
    isTrueQuarter(f);
}

function isTrueQuarter(f) {
  var d = durationDays(f.start, f.end);
  return isFinite(d) && d >= MIN_QUARTER_DAYS && d <= MAX_QUARTER_DAYS;
}

// Deterministic total order for duplicate resolution (same end / same filing):
// latest period end, then latest accession, then latest start.
function laterFact(a, b) {
  if (a.end !== b.end) {
    return a.end > b.end ? a : b;
  }
  if (a.accn !== b.accn) {
    return a.accn > b.accn ? a : b;
  }
  if (a.start !== b.start) {
    return a.start > b.start ? a : b;
  }
  return a;
}

function pickLatest(facts) {
  var best = facts[0];
  for (var i = 1; i < facts.length; i++) {
    best = laterFact(best, facts[i]);
  }
  return best;
}

// ── contract-shaped item builders ────────────────────────────────────────────
function filingItem(ticker, filing, indexUrl) {
  var claim = filing.reportDate
    ? ticker + ' filed Form 10-Q for the period ending ' + filing.reportDate + ' (filed ' + filing.filingDate + ').'
    : ticker + ' filed Form 10-Q (filed ' + filing.filingDate + ').';
  return contractItem({
    evidenceId: 'sec10q_live:' + ticker + ':filing:' + filing.accNoDash,
    claim: claim,
    direction: 'neutral',
    sourceLabel: 'Form 10-Q — Quarterly Report',
    sourceUrl: indexUrl,
    sourceDate: filing.filingDate
  });
}

// Numeric evidence is anchored to the SELECTED concept fact's accession — the
// figure's actual source filing — not the latest 10-Q. Returns null (omit) if
// the selected fact lacks a valid accession.
function numericItem(ticker, cik, key, metricLabel, sourceMetric, cmp) {
  if (!cmp || !cmp.current || typeof cmp.current.accn !== 'string' || !ACCESSION_RE.test(cmp.current.accn)) {
    return null;
  }
  var cur = cmp.current.val;
  var prev = cmp.prior.val;
  var direction = cur > prev ? 'positive' : (cur < prev ? 'negative' : 'neutral');
  var verb = cur > prev ? 'rose to' : (cur < prev ? 'declined to' : 'was unchanged at');
  var claim;
  if (direction === 'neutral') {
    claim = ticker + ' Form 10-Q ' + metricLabel + ' ' + verb + ' ' + formatUsd(cur) +
      ' versus the same quarter a year earlier (period ending ' + cmp.current.end + ').';
  } else {
    claim = ticker + ' Form 10-Q ' + metricLabel + ' ' + verb + ' ' + formatUsd(cur) +
      ' from ' + formatUsd(prev) + ' in the same quarter a year earlier (period ending ' + cmp.current.end + ').';
  }
  return contractItem({
    evidenceId: 'sec10q_live:' + ticker + ':' + key + ':' + cmp.current.accn,
    claim: clampClaim(claim),
    direction: direction,
    sourceLabel: 'Form 10-Q — ' + sourceMetric + ' (XBRL)',
    sourceUrl: filingIndexUrlFromAccession(cik, cmp.current.accn),
    sourceDate: isRealYmd(cmp.current.end) ? cmp.current.end : null
  });
}

// Always returns exactly the frozen-contract field set.
function contractItem(fields) {
  return {
    evidenceId: fields.evidenceId,
    category: CATEGORY,
    claim: fields.claim,
    direction: fields.direction,
    confidence: null,
    sourceLabel: fields.sourceLabel != null ? fields.sourceLabel : null,
    sourceUrl: fields.sourceUrl != null ? fields.sourceUrl : null,
    sourceDate: fields.sourceDate != null ? fields.sourceDate : null,
    sourceType: SOURCE_TYPE,
    requiresVerification: true,
    scoringImpact: 'none'
  };
}

function filingIndexUrl(cik, filing) {
  return filingIndexUrlFromAccession(cik, filing.accession);
}

function filingIndexUrlFromAccession(cik, accession) {
  var cikNoPad = String(parseInt(cik, 10));
  var accNoDash = accession.replace(/-/g, '');
  return SEC_ARCHIVES + '/' + cikNoPad + '/' + accNoDash + '/' + accession + '-index.htm';
}

// ── hardened SEC JSON fetch ──────────────────────────────────────────────────
// The abort timer stays armed THROUGH body consumption: a stalled body rejects
// (fail closed) instead of hanging. `aborted` rejects the moment the controller
// fires and is raced against both the fetch and the body read.
async function secGetJson(url, ctx) {
  if (ctx.requestCount >= ctx.maxRequests) {
    throw new Error('SEC_REQUEST_CEILING');
  }
  ctx.requestCount++;

  if (ctx.spacingMs > 0) {
    var wait = ctx.spacingMs - (Date.now() - ctx.lastAt);
    if (wait > 0) {
      await sleep(wait);
    }
  }
  ctx.lastAt = Date.now();

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
      throw new Error('SEC_FETCH_FAILED'); // network error / abort / timeout during fetch
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
      // Timeout remains active through the body read.
      text = await Promise.race([resp.text(), aborted]);
    } catch (_) {
      throw new Error('SEC_BODY_READ_FAILED'); // body error / stall / abort during read
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

// ── helpers ──────────────────────────────────────────────────────────────────
function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function posInt(v, fallback) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : fallback;
}
// Strict real calendar date (not regex-only): rejects e.g. 2025-13-40 / 2025-02-30.
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
function pad10(c) {
  return String(c).padStart(10, '0');
}
function formatUsd(n) {
  var r = Math.round(n);
  var neg = r < 0;
  var s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + s;
}
function clampClaim(s) {
  return s.length > MAX_CLAIM ? s.slice(0, MAX_CLAIM) : s;
}
// UTF-8 byte length (not JS character count) for the response-size cap.
function byteLength(s) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(s, 'utf8');
  }
  return unescape(encodeURIComponent(s)).length;
}
function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

module.exports = { getEvidence, getEvidenceWithCik };
