/**
 * Netlify Serverless Function: edgar-form4   (Phase 7B-6E-3 — DEV-ONLY vertical slice)
 * Path: netlify/functions/edgar-form4.js
 *
 * Dedicated SEC/EDGAR Form 4 primary-source retrieval + deterministic parser.
 * The browser must NOT call sec.gov directly; this server path adds the
 * SEC-required identifiable User-Agent and applies timeout / rate discipline.
 *
 * Server-side dormancy gate (a client flag cannot keep a deployed endpoint dormant):
 *   PT_ENABLE_EDGAR_FORM4_SERVER   must equal the string "true" for the function to do anything.
 *   If unset/!= "true", the function returns DISABLED and makes NO SEC request. Production must
 *   NOT set this variable; only branch-dev QA enables it.
 *
 * Required environment variable (NOT stored in source):
 *   SEC_USER_AGENT   e.g. "PortfolioTracker-PulseDev/1.0 you@example.com"
 *   Checked only AFTER the server gate passes. If missing, returns CONFIGURATION_MISSING /
 *   VERIFICATION_UNAVAILABLE and makes NO request to SEC. There is intentionally no fallback in code.
 *
 * Request:  POST /.netlify/functions/edgar-form4
 *   Body: { ticker, issuerNameHint?, cik?, windowStart:"YYYY-MM-DD", windowEnd:"YYYY-MM-DD" }
 * Response (always HTTP 200 for logical outcomes; 4xx only for malformed client input):
 *   { status, ticker, issuer, cik, resolutionPath, window, filingsScanned,
 *     events:[...normalized...], latencyMs, secRequests:[{url,status,ms}], errors:[] }
 *   status ∈ DISABLED | OK | NONE_CONFIRMED | PARTIAL_SCAN | IDENTITY_UNRESOLVED | IDENTITY_AMBIGUOUS | VERIFICATION_UNAVAILABLE
 *   NONE_CONFIRMED is returned ONLY when (a) the submissions data demonstrably covers the full
 *   requested window — the `recent` payload reaches back past it, or the referenced older submission
 *   shards needed to cover it were retrieved — AND (b) every in-window candidate filing was fetched
 *   and parsed (no truncation, no fetch failures). If coverage is unproven, the cap is hit, or a fetch
 *   fails, the status is PARTIAL_SCAN. Positive detections always return OK.
 *
 * Boundaries: memory-only; does not touch any other function, key, or client state.
 */

'use strict';

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_BROWSE      = 'https://www.sec.gov/cgi-bin/browse-edgar';
const SEC_SUBMISSIONS      = 'https://data.sec.gov/submissions/CIK';
const SEC_SUBMISSIONS_BASE = 'https://data.sec.gov/submissions/';   // older shard files live here (by name)
const SEC_ARCHIVES    = 'https://www.sec.gov/Archives/edgar/data';

const REQ_TIMEOUT_MS = 12000;   // per SEC request
const SEC_SPACING_MS = 130;     // ~7.7 req/s — under SEC's 10/s guidance
const MAX_FILINGS    = 50;      // safety ceiling on in-window XML fetches; overflow => PARTIAL_SCAN (never a false NONE)
const FILING_LOOKBACK_DAYS = 5; // catch late filings of in-window transactions
const MAX_SHARDS     = 4;       // bounded older-submission-shard fetches when `recent` underreaches the window

// ── module-scope warm caches (memory-only) ──────────────────────────────────
let _tickerMap = null, _tickerMapAt = 0;
const TICKERMAP_TTL = 24 * 60 * 60 * 1000;
const _xmlCache = new Map();    // accession -> parsed transactions (immutable filings)

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return res(405, { error: 'Method not allowed' });

  // Server-side dormancy gate — enforced before anything else, so a direct call to a deployed
  // endpoint cannot trigger SEC traffic. Production must not set this variable.
  if (process.env.PT_ENABLE_EDGAR_FORM4_SERVER !== 'true') {
    return res(200, {
      status: 'DISABLED',
      reason: 'SERVER_DISABLED',
      detail: 'edgar-form4 is disabled on this deployment (PT_ENABLE_EDGAR_FORM4_SERVER not set); no SEC request made.',
      events: [], secRequests: [], errors: ['SERVER_DISABLED']
    });
  }

  const ua = process.env.SEC_USER_AGENT || '';
  if (!ua.trim()) {
    // No SEC call is made without an identifiable UA.
    return res(200, {
      status: 'VERIFICATION_UNAVAILABLE',
      reason: 'CONFIGURATION_MISSING',
      detail: 'SEC_USER_AGENT environment variable is not set; refusing to contact SEC.',
      events: [], secRequests: [], errors: ['CONFIGURATION_MISSING']
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return res(400, { error: 'Invalid JSON' }); }

  const ticker = String(body.ticker || '').trim().toUpperCase();
  if (!ticker) return res(400, { error: 'Missing ticker' });
  const issuerNameHint = String(body.issuerNameHint || '').trim();
  const cikOverride = body.cik ? pad10(String(body.cik).replace(/\D/g, '')) : null;
  const windowStart = isoDate(body.windowStart) || '2026-03-01';
  const windowEnd   = isoDate(body.windowEnd)   || '2026-05-30';

  const ctx = { ua, secRequests: [], errors: [] };
  const t0 = Date.now();

  // 1) Identity: ticker -> CIK
  let ident;
  try {
    ident = cikOverride
      ? { cik: cikOverride, issuer: issuerNameHint || null, resolutionPath: 'cik-override' }
      : await resolveIdentity(ticker, issuerNameHint, ctx);
  } catch (e) {
    return res(200, base('VERIFICATION_UNAVAILABLE', ticker, null, null, 'identity-error',
      windowStart, windowEnd, 0, [], t0, ctx, [String(e.message || e)]));
  }
  if (ident.status === 'IDENTITY_AMBIGUOUS')
    return res(200, base('IDENTITY_AMBIGUOUS', ticker, null, null, ident.resolutionPath,
      windowStart, windowEnd, 0, [], t0, ctx, [], { candidates: ident.candidates }));
  if (!ident.cik)
    return res(200, base('IDENTITY_UNRESOLVED', ticker, ident.issuer || null, null, ident.resolutionPath || 'unresolved',
      windowStart, windowEnd, 0, [], t0, ctx));

  // 2) Filing list (Form 4) within lookback, with submissions window-coverage proof
  let listing;
  try {
    listing = await listForm4(ident.cik, windowStart, ctx);
  } catch (e) {
    return res(200, base('VERIFICATION_UNAVAILABLE', ticker, ident.issuer, ident.cik, ident.resolutionPath,
      windowStart, windowEnd, 0, [], t0, ctx, [String(e.message || e)]));
  }
  const filings = listing.filings;

  // 3+4) Fetch + parse each candidate's ownership XML; keep in-window transactions
  const events = [];
  const filingsTotal = filings.length;
  const toScan = filings.slice(0, MAX_FILINGS);
  const truncated = filingsTotal > toScan.length;
  let scanned = 0, fetchFailures = 0;
  for (const f of toScan) {
    scanned++;
    try {
      const txns = await getParsedFiling(ident.cik, f, ctx);
      for (const tx of txns) {
        if (tx.transactionDate && tx.transactionDate >= windowStart && tx.transactionDate <= windowEnd) {
          events.push(normalize(ticker, ident, f, tx));
        }
      }
    } catch (e) { fetchFailures++; ctx.errors.push('parse:' + f.accession + ':' + (e.message || e)); }
  }

  // 6) Strict status gating — NONE_CONFIRMED requires an exhaustive, fully-scanned window.
  let status;
  if (events.length > 0) status = 'OK';                                            // positive detection always reportable
  else if (fetchFailures > 0 && fetchFailures === scanned && scanned > 0) status = 'VERIFICATION_UNAVAILABLE';
  else if (truncated || fetchFailures > 0 || !listing.coverageComplete) status = 'PARTIAL_SCAN'; // cap, partial failure, or unproven window coverage => cannot prove absence
  else status = 'NONE_CONFIRMED';                                                  // full window coverage proven AND all in-window candidates scanned, zero qualifying

  return res(200, base(status, ticker, ident.issuer, ident.cik, ident.resolutionPath,
    windowStart, windowEnd, scanned, events, t0, ctx, [],
    { filingsTotal, truncated, coverageComplete: listing.coverageComplete, coverageEarliest: listing.coverageEarliest }));
};

// ── Identity resolution ──────────────────────────────────────────────────────
async function resolveIdentity(ticker, nameHint, ctx) {
  // 1. authoritative ticker->CIK map
  try {
    const map = await getTickerMap(ctx);
    const hit = map[ticker];
    if (hit) return { cik: pad10(String(hit.cik_str)), issuer: hit.title, resolutionPath: 'company_tickers' };
  } catch (e) { ctx.errors.push('tickermap:' + (e.message || e)); }

  // 2. browse-edgar ticker lookup (atom)
  try {
    const atom = await secGet(`${SEC_BROWSE}?action=getcompany&ticker=${encodeURIComponent(ticker)}&type=4&output=atom&count=1`, ctx);
    const cik = (atom.match(/<cik>(\d+)<\/cik>/i) || [])[1];
    const name = (atom.match(/<conformed-name>([^<]+)<\/conformed-name>/i) || [])[1];
    if (cik) return { cik: pad10(cik), issuer: name || null, resolutionPath: 'browse-ticker' };
  } catch (e) { ctx.errors.push('browse-ticker:' + (e.message || e)); }

  // 3. name search fallback (ambiguity-aware)
  const q = nameHint || ticker;
  const atom = await secGet(`${SEC_BROWSE}?action=getcompany&company=${encodeURIComponent(q)}&type=4&output=atom&count=10`, ctx);
  const candidates = parseCompanyCandidates(atom);
  if (candidates.length === 0) return { cik: null, resolutionPath: 'name-none' };
  if (candidates.length === 1) return { cik: pad10(candidates[0].cik), issuer: candidates[0].name, resolutionPath: 'name-single' };
  // disambiguate by exact conformed-name match to the supplied hint
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = candidates.filter(c => norm(c.name) === norm(nameHint));
  if (exact.length === 1) return { cik: pad10(exact[0].cik), issuer: exact[0].name, resolutionPath: 'name-exact' };
  return { status: 'IDENTITY_AMBIGUOUS', resolutionPath: 'name-ambiguous',
           candidates: candidates.map(c => ({ cik: pad10(c.cik), name: c.name })) };
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
  const out = [];
  const re = /<cik>(\d+)<\/cik>/gi;            // company-search atom: one <cik> per entry
  let m; const seen = new Set();
  while ((m = re.exec(atom))) { if (!seen.has(m[1])) { seen.add(m[1]); out.push({ cik: m[1], name: '' }); } }
  // attach names if present (best-effort; order-aligned conformed-name tags)
  const names = [...atom.matchAll(/<conformed-name>([^<]+)<\/conformed-name>/gi)].map(x => x[1]);
  out.forEach((c, i) => { if (names[i]) c.name = names[i]; });
  return out;
}

// ── Filing list ──────────────────────────────────────────────────────────────
async function listForm4(cik, windowStart, ctx) {
  const requiredBackTs = Date.parse(windowStart) - FILING_LOOKBACK_DAYS * 86400000;
  const out = [];
  let earliestTs = Infinity;

  // Ingest one submissions block (recent or a shard): collect Form 4 candidates and track
  // the earliest filingDate seen, which determines how far back our data demonstrably reaches.
  const ingest = (r) => {
    const forms = r.form || [], dates = r.filingDate || [], accs = r.accessionNumber || [], docs = r.primaryDocument || [];
    for (let i = 0; i < forms.length; i++) {
      const ts = Date.parse(dates[i]);
      if (!isNaN(ts) && ts < earliestTs) earliestTs = ts;
      if (forms[i] !== '4') continue;
      if (isNaN(ts) || ts < requiredBackTs) continue;
      out.push({ accession: accs[i], accessionNoDash: String(accs[i]).replace(/-/g, ''), filingDate: dates[i], primaryDoc: docs[i] || '' });
    }
  };

  const txt = await secGet(`${SEC_SUBMISSIONS}${cik}.json`, ctx);
  const j = JSON.parse(txt);
  ingest((j.filings && j.filings.recent) || {});

  // Coverage is proven only when our data reaches back past the window's earliest relevant filing date.
  let coverageComplete = earliestTs <= requiredBackTs;
  if (!coverageComplete) {
    const files = ((j.filings && j.filings.files) || []).filter(f => f && f.name && Date.parse(f.filingTo) >= requiredBackTs);
    const needed = files.slice(0, MAX_SHARDS);
    const overflowBeyondCap = files.length > needed.length;   // more shards required than we are willing to fetch
    let shardOk = true;
    for (const sf of needed) {
      try { ingest(JSON.parse(await secGet(`${SEC_SUBMISSIONS_BASE}${sf.name}`, ctx))); }
      catch (e) { shardOk = false; ctx.errors.push('shard:' + sf.name + ':' + (e.message || e)); }
    }
    coverageComplete = shardOk && !overflowBeyondCap && (earliestTs <= requiredBackTs);
  }

  return { filings: out, coverageComplete, coverageEarliest: isFinite(earliestTs) ? new Date(earliestTs).toISOString().slice(0, 10) : null };
}

// ── Retrieve + parse one filing's ownership XML ──────────────────────────────
async function getParsedFiling(cik, filing, ctx) {
  if (_xmlCache.has(filing.accession)) return _xmlCache.get(filing.accession);
  const cikNoPad = String(parseInt(cik, 10));
  const dir = `${SEC_ARCHIVES}/${cikNoPad}/${filing.accessionNoDash}`;
  // find the ownership XML via the filing directory index.json
  const idxTxt = await secGet(`${dir}/index.json`, ctx);
  let xmlName = null;
  try {
    const idx = JSON.parse(idxTxt);
    const items = (idx.directory && idx.directory.item) || [];
    const xmls = items.map(it => it.name).filter(n => /\.xml$/i.test(n) && !/-index|R\d+\.xml/i.test(n));
    // prefer obvious form4 names, else first xml
    xmlName = xmls.find(n => /form4|ownership|edgardoc|wk-form4/i.test(n)) || xmls[0] || null;
  } catch (e) { /* fall through */ }
  if (!xmlName) throw new Error('no-xml-in-index');
  const xml = await secGet(`${dir}/${xmlName}`, ctx);
  if (!/<ownershipDocument>/i.test(xml)) throw new Error('not-ownership-doc');
  const txns = parseForm4(xml, `${dir}/${xmlName}`);
  _xmlCache.set(filing.accession, txns);
  return txns;
}

// ── Deterministic Form 4 XML parser (dependency-free; Form 4 fixed schema) ───
function parseForm4(xml, sourceUrl) {
  const issuerName = val(xml, 'issuerName');
  const issuerSym  = val(xml, 'issuerTradingSymbol');
  const issuerCik  = val(xml, 'issuerCik');
  const filerName  = val(xml, 'rptOwnerName');
  const roles = [];
  if (/<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(xml)) roles.push('director');
  if (/<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(xml)) roles.push('officer');
  if (/<isTenPercentOwner>\s*(1|true)\s*<\/isTenPercentOwner>/i.test(xml)) roles.push('tenPercentOwner');
  if (/<isOther>\s*(1|true)\s*<\/isOther>/i.test(xml)) roles.push('other');
  const officerTitle = val(xml, 'officerTitle') || null;
  // Multi-owner safety: Form 4 permits multiple <reportingOwner> blocks (joint / group filings).
  // Single-owner extraction above would misattribute person/role to every transaction, so we
  // detect the case and (in normalize) withhold person/role and mark the event for review.
  const multiOwner = (xml.match(/<reportingOwner>/gi) || []).length > 1;
  const footnotes = {};
  [...xml.matchAll(/<footnote\s+id="([^"]+)">([\s\S]*?)<\/footnote>/gi)].forEach(m => { footnotes[m[1]] = clean(m[2]); });

  const out = [];
  const collect = (block, isDerivative) => {
    const code = (block.match(/<transactionCode>\s*([^<\s]+)\s*<\/transactionCode>/i) || [])[1] || null;
    if (!code) return; // holdings rows (no transaction) are skipped
    const fnIds = [...block.matchAll(/<footnoteId\s+id="([^"]+)"/gi)].map(x => x[1]);
    const fnText = fnIds.map(id => footnotes[id] || '').join(' ').toLowerCase();
    out.push({
      table: isDerivative ? 'derivative' : 'nonDerivative',
      securityTitle: val(block, 'securityTitle') || (isDerivative ? 'derivative' : 'security'),
      transactionDate: val(block, 'transactionDate'),
      transactionCode: code,
      shares: num(val(block, 'transactionShares')),
      pricePerShare: hasTag(block, 'transactionPricePerShare') ? num(val(block, 'transactionPricePerShare')) : null,
      acquiredDisposed: val(block, 'transactionAcquiredDisposedCode') || null,
      sharesOwnedAfter: num(val(block, 'sharesOwnedFollowingTransaction')),
      underlyingShares: isDerivative ? num(val(block, 'underlyingSecurityShares')) : null,
      equitySwap: /<equitySwapInvolved>\s*1\s*<\/equitySwapInvolved>/i.test(block),
      footnoteText: fnText,
      issuerName, issuerSym, issuerCik, filerName, roles, officerTitle, multiOwner, sourceUrl
    });
  };
  [...xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)].forEach(m => collect(m[1], false));
  [...xml.matchAll(/<derivativeTransaction>([\s\S]*?)<\/derivativeTransaction>/gi)].forEach(m => collect(m[1], true));
  return out;
}

// ── Deterministic classification (Phase 7B-6E-2 §5) ──────────────────────────
function classify(tx) {
  const code = (tx.transactionCode || '').toUpperCase();
  const fn = tx.footnoteText || '';
  const title = (tx.securityTitle || '').toLowerCase();
  // Conservative: sell_to_cover ONLY when footnotes literally say so.
  const sellToCover = /sell-to-cover|sell to cover/.test(fn);
  // Explicit forward evidence — NOT mere presence in the derivative table.
  const explicitForward = tx.equitySwap || /forward|prepaid|variable share/.test(title) || /forward|prepaid|variable share/.test(fn);

  // 1) Explicit forward/prepaid/variable-share/equity-swap → derivative_forward.
  if (explicitForward) return { classification: 'derivative_forward', materiality: 'high' };
  // 2) Code M = option exercise/conversion — including when in the derivative table.
  if (code === 'M') return { classification: 'option_exercise', materiality: 'context' };
  // 3) Any remaining derivative-table transaction without explicit forward evidence → conservative review
  //    (never an ordinary sale/purchase).
  if (tx.table === 'derivative') return { classification: 'derivative_other_review', materiality: 'review' };

  // 4) Non-derivative conservative rules:
  if (code === 'P') return { classification: 'open_market_purchase', materiality: 'high' };
  if (code === 'G') return { classification: 'gift', materiality: 'low' };
  // Code F = tax/exercise-price satisfied by withholding; NOT automatically sell-to-cover.
  if (code === 'F') return sellToCover
    ? { classification: 'sell_to_cover', materiality: 'low' }
    : { classification: 'tax_withholding_or_payment', materiality: 'low' };
  // Code S = sale unless a footnote explicitly proves sell-to-cover.
  if (code === 'S') return sellToCover
    ? { classification: 'sell_to_cover', materiality: 'low' }
    : { classification: 'open_market_sale', materiality: 'high' };
  return { classification: 'unknown_review', materiality: 'review' };
}

function normalize(ticker, ident, filing, tx) {
  const cls = classify(tx);
  const multiOwner = !!tx.multiOwner;
  // Transaction facts (date/code/shares/direction) are correct regardless of owner count.
  // For multi-owner filings we withhold person/role attribution and mark the event for review,
  // so a real in-window filing still surfaces (no false NONE) without risking misattribution.
  return {
    ticker,
    issuer: tx.issuerName || ident.issuer || null,
    cik: ident.cik,
    filerName: multiOwner ? null : (tx.filerName || null),
    roles: multiOwner ? [] : (tx.roles || []),
    officerTitle: multiOwner ? null : (tx.officerTitle || null),
    multiOwner,
    transactionDate: tx.transactionDate || null,
    filingDate: filing.filingDate,
    transactionCode: tx.transactionCode || null,
    acquiredDisposed: tx.acquiredDisposed || null,
    shares: tx.shares,
    pricePerShare: tx.pricePerShare,
    derivative: tx.table === 'derivative',
    underlyingShares: tx.underlyingShares,
    footnoteText: tx.footnoteText || '',
    accession: filing.accession,
    sourceUrl: tx.sourceUrl,
    classification: cls.classification,
    materiality: cls.materiality,
    confidence: multiOwner ? 'REVIEW' : ((tx.transactionDate && tx.transactionCode) ? 'HARD' : 'WEAK'),
    note: multiOwner ? 'multi-owner Form 4 — reporting-owner attribution withheld; manual review' : null,
    sourceTier: 1
  };
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
      const r = await timedFetch(url, { headers: { 'User-Agent': ctx.ua, 'Accept-Encoding': 'gzip, deflate', 'Accept': '*/*' } }, REQ_TIMEOUT_MS);
      ctx.secRequests.push({ url: redact(url), status: r.status, ms: Date.now() - started });
      if (r.status >= 500 || r.status === 429) { lastErr = new Error('sec ' + r.status); await sleep(300); continue; }
      const txt = await r.text();
      if (!r.ok) throw new Error('sec ' + r.status);
      return txt;
    } catch (e) { lastErr = e; ctx.secRequests.push({ url: redact(url), status: 'err', ms: Date.now() - started }); await sleep(250); }
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
function val(scope, tag) {
  // <tag>...<value>X</value> (handles whitespace/footnote refs) OR <tag>X</tag>
  let m = scope.match(new RegExp('<' + tag + '\\b[^>]*>\\s*<value>([\\s\\S]*?)<\\/value>', 'i'));
  if (m) return clean(m[1]);
  m = scope.match(new RegExp('<' + tag + '\\b[^>]*>([^<]*)<\\/' + tag + '>', 'i'));
  return m ? clean(m[1]) : '';
}
function hasTag(scope, tag) { return new RegExp('<' + tag + '\\b', 'i').test(scope); }
function num(s) { if (s == null || s === '') return null; const n = Number(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
function clean(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(); }
function pad10(c) { return String(c).padStart(10, '0'); }
function isoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function redact(u) { return String(u).split('?')[0]; } // never echo query strings back

function base(status, ticker, issuer, cik, resolutionPath, windowStart, windowEnd, filingsScanned, events, t0, ctx, extraErrors, extra) {
  return Object.assign({
    status, ticker, issuer: issuer || null, cik: cik || null, resolutionPath: resolutionPath || null,
    window: { start: windowStart, end: windowEnd },
    filingsScanned, events: events || [],
    latencyMs: Date.now() - t0,
    secRequests: ctx.secRequests,
    errors: (ctx.errors || []).concat(extraErrors || [])
  }, extra || {});
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function res(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(body) };
}
