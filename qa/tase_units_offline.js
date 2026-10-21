'use strict';
/*
 * tase_units_offline.js — tase-units-1 (CB-1; PA-01 + PA-02): TASE prices in ILS on screen and in AI prompts,
 * research lookup for dotted symbols. Offline: no network, no browser, no storage, no file writes.
 *   TU-1 header price (.TA ₪, US $)        TU-2 MA rows        TU-3 change amount     TU-4 PRE / POST prices
 *   TU-5 formatStockContext                TU-6 buildTechSnapshotBlock               TU-7 parsePerplexityContext
 *   TU-8 invariants (I-1: stored / fetched values stay raw; ATH row, K-check callers, scoring byte-identical)
 *   TU-9 SETUP: every edited function extracts; no new top-level function referenced by renderMainPanel
 * The REAL functions are extracted from index.html (LF and CRLF both load: EOL-1). US expectations are literal oracles
 * of the pre-task output. Planted negatives mutate an in-memory COPY of the source, never the file on disk.
 */
const fs = require('fs');
const path = require('path');
const core = require('./lib/index-pins-core');

const SRC = core.normalizeText(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
const countOf = (h, n) => (n ? h.split(n).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── extraction ─────────────────────────────────────────────────────────────────────────────────────
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error('function not uniquely extractable: ' + name + ' (' + hit.length + ')');
  return hit[0].text;
}

// ── renderMainPanel harness (qa/ath_client_offline.js pattern) ─────────────────────────────────────
function makeNeutral() {
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => ''; if (typeof k === 'symbol') return undefined; if (k === 'then') return undefined; if (k === 'toString' || k === 'valueOf' || k === 'toJSON') return () => ''; return p; },
    apply() { return p; }, construct() { return p; }, set() { return true; }, has() { return true; }
  });
  return p;
}
const NEUTRAL = makeNeutral();
function makeScope(map) {
  return new Proxy({}, {
    has(t, k) { if (typeof k === 'symbol') return false; if (k in map) return true; if (k in globalThis) return false; return true; },
    get(t, k) { if (k === Symbol.unscopables) return undefined; if (k in map) return map[k]; return NEUTRAL; },
    set(t, k, v) { map[k] = v; return true; }
  });
}
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup', '_setupDisplay', '_ptScoreNorm', '_ptScoreText', '_ptScoreDial', '_nlmConsistencyChecks'];
function buildRenderer(src) {
  const rmSrc = fnText(src, 'renderMainPanel');
  const helpers = RENDER_REAL.map(n => fnText(src, n));
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  return function render(it, o) {
    const opts = o || {};
    const node = { innerHTML: '' };
    const win = { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false };
    if (Object.prototype.hasOwnProperty.call(opts, 'gate')) win.PT_ENABLE_ATH_CLIENT = opts.gate;
    const map = {
      window: win,
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: { [it.ticker]: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: opts.snap || US_SNAP, refInput: opts.ext ? opts.ext.regularPrice : it._verifiedPrice } },
      _extendedMktCache: opts.ext ? { [it.ticker]: opts.ext } : {},
      _athCache: opts.cache || {},
      _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(it);
    return node.innerHTML;
  };
}
const snapOf = k => ({ sma20: 180 * k, sma50: 170 * k, sma150: 160 * k, sma200: 150 * k, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
  hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
  rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 });
const US_SNAP = snapOf(1);        // sma20 180 / sma50 170 / sma150 160
const TA_SNAP = snapOf(100);      // the same levels in agorot: 18000 / 17000 / 16000
const mkItem = (ticker, price) => ({ ticker, company_name: 'Test Co', sentiment_score: 70, sentiment: 'positive',
  summary: 'KEY EVENT: x. ACTIONABLE TAKE: hold. Rating: Buy | PT: $200', action: 'buy', technical_setup: 'healthy_uptrend',
  _verifiedPrice: price, _verifiedChangePct: 0.95 });
const grab = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };
const headerPrice = html => grab(html, /<span class="ph-price">([^<]*)<\/span>/);
const chgText = html => grab(html, /<span class="ph-chg [^"]*">([^<]*)<\/span>/);
const extPrice = html => grab(html, /<span class="ph-ext-price">([^<]*)<\/span>/);
const maVals = html => { const out = []; const re = /<span class="ma-val">([^<]*)<\/span>/g; let m; while ((m = re.exec(html))) out.push(m[1]); return out; };

// ── prompt-side extraction ─────────────────────────────────────────────────────────────────────────
function buildContextFn(src) { return new Function(fnText(src, 'formatStockContext') + '\nreturn formatStockContext;')(); }
function buildBlockFn(src, cache) {
  const body = fnText(src, '_setupDisplay') + '\n' + fnText(src, 'buildTechSnapshotBlock') + '\nreturn buildTechSnapshotBlock;';
  return cache === undefined ? new Function(body)() : new Function('_athCache', body)(cache);
}
function buildParserFn(src) { return new Function('console', fnText(src, 'parsePerplexityContext') + '\nreturn parsePerplexityContext;')(quiet); }

const stockRow = (symbol, k, over) => Object.assign({ symbol, source: 'yahoo', price: 226.73 * k, open: 225.1 * k, previous_close: 224.6 * k,
  high: 227.5 * k, low: 224.9 * k, volume: 1234567, change_percent: 0.95 }, over || {});
const WRAP = body => '\n=== LIVE MARKET DATA (verified, use exactly as provided) ===\n' + body + '\n=== END MARKET DATA ===';
const NOTE = '  NOTE: Do NOT estimate or infer November low / April low → mark as "not available" if unknown.';
// US oracle: the pre-task output (2c2b0d9 / 14d6c94), byte for byte, except that USD prices print 2 decimals since
// ai-request-hygiene-1 (G-1): $225.1 -> $225.10 etc.
const US_CONTEXT = WRAP('NVDA [source: yahoo]\n  Price: $226.73 (+0.95%) | Open: $225.10 | Prev Close: $224.60\n  Intraday High: $227.50 | Intraday Low: $224.90 | Volume: 1,234,567\n' + NOTE);
const CURRENCY_LINE = '  CURRENCY: ILS (Tel Aviv listing; prices converted from agorot). State every price level in ILS.';
const TA_ROW = { symbol: 'MTRX.TA', source: 'yahoo', price: 8884, open: 8800, previous_close: 8800, high: 8950, low: 8790, volume: 1234567, change_percent: 0.95 };

const US_SNAP_BLOCK = { sma20: 180, sma50: 170, sma150: 160, pct20: 5.56, pct50: 11.77, pct150: 18.76, high1yDist: -12, volRatio: 1.1, rsSPY: 2.5, rsQQQ: -0.5, rsSector: 1.5, sectorEtf: 'XLK' };
const TA_SNAP_BLOCK = Object.assign({}, US_SNAP_BLOCK, { sma20: 8700, sma50: 8500, sma150: 8000, pct20: 2.1, pct50: 4.5, pct150: 11.05 });
const ATH_TA = { state: 'verified', athValue: 120, currency: 'ILS', athDate: '2025-01-02' };

// ── base digests of the functions that must stay byte-identical through the task (TS-1) ─────────────
const BASE_DIGESTS = {
  fetchYahoo: 'da826004e7de4edbcd086a8def36ed775f3f656e9117eb37957a662bf2a899d1',   // market-data-daily-change-1 (V-1): session-aligned daily change
  _athAccept: '02bb7e3a237e4dd285ba4795978e126798ba39ce76ada7ccdfb701d59c5b0f24',
  _pfLiveNormalize: 'c9e3b362c10d3325df9417d99f9abb7f5aba1f7b4cb4dddc9954e4df1cc5b6f1',
  _nlmConsistencyChecks: '6716b144c8d3edde40a38b0fad8822493b022fc9b28d0b0b2ab43f76c4a4312b',
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  orchestrate: '490d522b4714fe08d4e7030eb05594b07734f6dd7dbb8d6750efd972d66263e2', // scan-action-gate-1 (DR-1 / DR-2)
  enforceScoreConsistency: '28a3a5cac29be9a0b61e854182caaa7cac2ed241fe847fd5b65e8e05a8cbfc60',
  fetchAnthropicAnalysis: '99eb1e8d96c2c0f17acc4dc7af289815b87edaa0a57e5a5616c661373df95089',   // ai-request-hygiene-1 (E-1 cap, E-2 telemetry)
  fetchHistoricalCandles: '94b245c8700ed0e84fed41782f6fc1ee00e24f468f014fc20e26809ce114d17d',
  computeTechnicalSnapshot: '373e9290a82129cb1ec2ec053ceb5263e81159fc7acc8a589a91defad8d2fc9d'
};
// top-level functions renderMainPanel calls at the task base (TU-9: this set may not grow)
const BASE_RM_REFS = ['_dd0RunCard', '_ffpToggleCard', '_initCmpCard', '_initDd0Card', '_initKlCard', '_initSigCard', '_initTsCard', '_nlmConsistencyChecks', '_ptScoreDial', '_ptScoreNorm', '_ptScoreStates', '_ptScoreText', '_ptUsMarketPill', '_refreshPriceRow', '_runCRResearchCard', '_runEdgarInsiderDeepDive', '_runFundFactsCard', '_runResearchEvidenceCard', '_runSecEvidenceStoreCard', '_setupDisplay', '_srHeldMap', '_techPanelPrice', '_techSnapFor', '_ts1FillRow', 'classifyTechnicalSetup', 'findTicker', 'hasVerifiedMarketData', 'refreshTechPanel'];

// ── rows ───────────────────────────────────────────────────────────────────────────────────────────
const ROWS = [];
const row = (id, label, fn) => ROWS.push({ id, label, fn });

row('TU-1', 'header price: .TA 8884 agorot → ₪88.84; US 226.73 → $226.73', src => {
  const r = buildRenderer(src);
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
  eq(headerPrice(r(mkItem('NVDA', 226.73))), '$226.73', 'US header');
  eq(headerPrice(r(mkItem('MTRX.TA', 8884), { snap: TA_SNAP })), '₪88.84', '.TA header');
});
row('TU-2', 'MA rows: .TA levels ÷100 with ₪; US unchanged', src => {
  const r = buildRenderer(src);
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
  eq(maVals(r(mkItem('NVDA', 226.73))), ['$180.00', '$170.00', '$160.00'], 'US MA');
  eq(maVals(r(mkItem('MTRX.TA', 8884), { snap: TA_SNAP })), ['₪180.00', '₪170.00', '₪160.00'], '.TA MA');
});
row('TU-3', 'change amount: price - price/(1+chg%) ÷100 for .TA (83.60 agorot → 0.84); US 2.13 (PA-03 fixed by display-honesty-1)', src => {
  const r = buildRenderer(src);
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
  eq(chgText(r(mkItem('NVDA', 226.73))), '▲2.13 (+0.95%)', 'US change');
  eq(chgText(r(mkItem('MTRX.TA', 8884), { snap: TA_SNAP })), '▲0.84 (+0.95%)', '.TA change');
});
row('TU-4', 'PRE / POST: extended price and the post-↻ regular price ÷100 with ₪ for .TA; US unchanged', src => {
  const r = buildRenderer(src);
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
  const usExt = { marketState: 'PRE', regularPrice: 226.5, regularChangePct: 1.1, preMarketPrice: 227.9, preMarketChangePercent: 0.62, postMarketPrice: null, postMarketChangePercent: null };
  const usHtml = r(mkItem('NVDA', 226.73), { ext: usExt });
  eq(extPrice(usHtml), '$227.90', 'US PRE ext price');
  eq(headerPrice(usHtml), '$226.50', 'US post-↻ regular price');
  const taExt = { marketState: 'PRE', regularPrice: 8900, regularChangePct: 1.1, preMarketPrice: 8950, preMarketChangePercent: 0.56, postMarketPrice: null, postMarketChangePercent: null };
  const taHtml = r(mkItem('MTRX.TA', 8884), { snap: TA_SNAP, ext: taExt });
  eq(extPrice(taHtml), '₪89.50', '.TA PRE ext price');
  eq(headerPrice(taHtml), '₪89.00', '.TA post-↻ regular price');
  const taPost = r(mkItem('MTRX.TA', 8884), { snap: TA_SNAP, ext: Object.assign({}, taExt, { marketState: 'POST', postMarketPrice: 8870, postMarketChangePercent: -0.2 }) });
  eq(extPrice(taPost), '₪88.70', '.TA POST ext price');
  eq(headerPrice(taPost), '₪89.00', '.TA POST post-↻ regular price');
});
row('TU-5', 'formatStockContext: .TA in ILS + CURRENCY line; US byte-identical to the oracle', src => {
  const f = buildContextFn(src);
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ':\n got  ' + JSON.stringify(a) + '\n want ' + JSON.stringify(b)); };
  eq(f({ NVDA: stockRow('NVDA', 1) }), US_CONTEXT, 'US context');
  const want = WRAP('MTRX.TA [source: yahoo]\n  Price: 88.84 ILS (+0.95%) | Open: 88.00 ILS | Prev Close: 88.00 ILS\n  Intraday High: 89.50 ILS | Intraday Low: 87.90 ILS | Volume: 1,234,567\n' + CURRENCY_LINE + '\n' + NOTE);
  eq(f({ 'MTRX.TA': TA_ROW }), want, '.TA context');
  const mixed = f({ NVDA: stockRow('NVDA', 1), 'MTRX.TA': TA_ROW });
  if (countOf(mixed, 'CURRENCY:') !== 1) throw new Error('the CURRENCY line must appear once, for the .TA row only');
  if (mixed.indexOf('NVDA [source: yahoo]\n  Price: $226.73') === -1) throw new Error('US row inside a mixed map changed');
});
row('TU-6', 'buildTechSnapshotBlock: .TA MA levels in ILS, percentages and ATH line unchanged; US byte-identical', src => {
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ':\n got  ' + JSON.stringify(a) + '\n want ' + JSON.stringify(b)); };
  const f = buildBlockFn(src);
  const head = sym => `${sym} [setup: healthy_uptrend = ${new Function(fnText(src, '_setupDisplay') + '\nreturn _setupDisplay;')()('healthy_uptrend')}]\n`;
  const tail = '  1Y High Dist: -12.00%   Volume vs 20D avg: 1.10x\n  RS vs SPY (3M): +2.50%   RS vs QQQ (3M): -0.50% vs XLK: +1.50%\n';
  eq(f('NVDA', US_SNAP_BLOCK, 'healthy_uptrend'),
    head('NVDA') + '  MA20: $180.00 (+5.56%)   MA50: $170.00 (+11.77%)\n  MA150: $160.00 (+18.76%)\n' + tail, 'US block');
  eq(f('MTRX.TA', TA_SNAP_BLOCK, 'healthy_uptrend'),
    head('MTRX.TA') + '  MA20: 87.00 ILS (+2.10%)   MA50: 85.00 ILS (+4.50%)\n  MA150: 80.00 ILS (+11.05%)\n' + tail, '.TA block');
  const g = buildBlockFn(src, { 'MTRX.TA': ATH_TA });
  eq(g('MTRX.TA', TA_SNAP_BLOCK, 'healthy_uptrend'),
    head('MTRX.TA') + '  MA20: 87.00 ILS (+2.10%)   MA50: 85.00 ILS (+4.50%)\n  MA150: 80.00 ILS (+11.05%)\n' + tail + '  All-time high (verified): 120.00 ILS (2025-01-02)\n', '.TA block with ATH line');
});
row('TU-7', 'parsePerplexityContext: dotted / dashed symbols keep their suffix; 1–2 letter suffix only; other forms unchanged', src => {
  const p = buildParserFn(src);
  const body = '\nANALYST_ACTIONS: UBS upgraded to Buy from Neutral (Oct 2)\nEARNINGS: NONE\n';
  const keys = header => Object.keys(p(header + body)).filter(k => k !== '__raw__');
  const want = (header, k) => { const got = keys(header); if (JSON.stringify(got) !== JSON.stringify([k])) throw new Error(JSON.stringify(header) + ' → ' + JSON.stringify(got) + ', want ' + JSON.stringify([k])); };
  want('TICKER: MTRX.TA', 'MTRX.TA');
  want('TICKER: BRK.B', 'BRK.B');
  want('TICKER: BRK-B', 'BRK-B');
  want('TICKER: AAPL.', 'AAPL');
  want('**NVDA**', 'NVDA');
  want('## $MSFT', 'MSFT');
  want('TICKER: TST', 'TST');
  want('TICKER: AAPL.COM', 'AAPL');   // a 3+ letter suffix is not accepted: the symbol stops before the dot, exactly as before
});
row('TU-8', 'invariants: render does not touch stored values; ATH row (AC-11 shape); K-check callers; fetch / scoring functions byte-identical', src => {
  const r = buildRenderer(src);
  const it = mkItem('MTRX.TA', 11000);
  const before = JSON.stringify(it);
  const html = r(it, { gate: true, cache: { 'MTRX.TA': ATH_TA }, snap: TA_SNAP });
  if (JSON.stringify(it) !== before) throw new Error('rendering mutated the stored item');
  if (it._verifiedPrice !== 11000) throw new Error('_verifiedPrice must stay in raw agorot');
  const m = /<span class="rr-lbl">All-time high<\/span><span class="rr-val [^"]*">([^<]*)<\/span>/.exec(html);
  if (!m || m[1].indexOf('120.00 ILS · 2025-01-02 · -8.33%') !== 0) throw new Error('ATH row distance changed: ' + (m && m[1]));
  const fns = core.extractFunctions(src);
  for (const name of Object.keys(BASE_DIGESTS)) {
    const hit = fns.filter(f => f.name === name);
    if (hit.length !== 1) throw new Error(name + ' not uniquely extractable');
    if (core.sha256(hit[0].text) !== BASE_DIGESTS[name]) throw new Error(name + ' changed since the base');
  }
  const callerA = "const _ks = _nlmConsistencyChecks(r, { price: typeof r._verifiedPrice === 'number' ? r._verifiedPrice : null, held:";
  if (countOf(src, callerA) !== 2) throw new Error('list K-check callers changed');
  if (countOf(src, "const _ks = _nlmConsistencyChecks(item, { price: hasData ? _techPanelPrice(item) : null, mas: _panelSnap, held:") !== 1) throw new Error('panel K-check caller changed');
});
row('TU-9', 'SETUP: edited functions extract exactly once; renderMainPanel references no new top-level function', src => {
  const fns = core.extractFunctions(src);
  for (const n of ['renderMainPanel', 'formatStockContext', 'buildTechSnapshotBlock', 'parsePerplexityContext']) {
    if (fns.filter(f => f.name === n).length !== 1) throw new Error(n + ' does not extract exactly once');
  }
  // EOL-1: the same source with CRLF line endings loads (normalised) to byte-identical function texts
  const crlf = src.replace(/\n/g, '\r\n');
  if (crlf === src) throw new Error('CRLF variant not built');
  const viaCrlf = core.extractFunctions(core.normalizeText(crlf));
  for (const n of ['renderMainPanel', 'formatStockContext', 'buildTechSnapshotBlock', 'parsePerplexityContext']) {
    const a = viaCrlf.filter(f => f.name === n);
    if (a.length !== 1 || a[0].text !== fnText(src, n)) throw new Error(n + ' differs when the source is loaded from CRLF text');
  }
  const names = new Set(fns.map(f => f.name));
  const rm = fnText(src, 'renderMainPanel');
  const refs = Array.from(names).filter(n => n !== 'renderMainPanel' && new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '\\s*\\(').test(rm)).sort();
  if (JSON.stringify(refs) !== JSON.stringify(BASE_RM_REFS)) throw new Error('renderMainPanel references changed: ' + JSON.stringify(refs));
});

// ── run ────────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
function evaluate(src) {
  const res = {};
  for (const r of ROWS) { try { r.fn(src); res[r.id] = null; } catch (e) { res[r.id] = e.message; } }
  return res;
}
const live = evaluate(SRC);
for (const r of ROWS) {
  if (live[r.id] === null) console.log('  PASS  ' + r.id + ' ' + r.label);
  else { failed += 1; console.log('  FAIL  ' + r.id + ' ' + r.label + '\n        ' + String(live[r.id]).split('\n').join('\n        ')); }
}

// ── planted negatives (brief §3): each mutates an in-memory COPY of the production source; the named row must then FAIL ──
const mut = (s, a, b) => { if (countOf(s, a) !== 1) throw new Error('negative anchor not unique: ' + a.slice(0, 60)); return s.replace(a, () => b); };
const NEGS = [
  { id: 'NEG-1', row: 'TU-8', label: 'conversion at fetch time (fetchYahoo returns ILS)', f: s => mut(s, '    symbol,\n    price,\n    change_percent,\n    high:', '    symbol,\n    price: price / 100,\n    change_percent,\n    high:') },
  { id: 'NEG-2', row: 'TU-1', label: '$ kept for .TA', f: s => mut(s, "const _pxSym = _pxDiv === 100 ? '₪' : '$';", "const _pxSym = '$';") },
  { id: 'NEG-3', row: 'TU-1', label: '÷100 applied to US', f: s => mut(s, "/\\.TA$/.test(item.ticker || '') ? 100 : 1;", "/\\.TA$/.test(item.ticker || '') ? 100 : 100;") },
  { id: 'NEG-4', row: 'TU-2', label: 'MA rows not converted', f: s => mut(s, 'return _pxSym + (sma / _pxDiv).toFixed(2);', 'return _pxSym + sma.toFixed(2);') },
  { id: 'NEG-5', row: 'TU-3', label: 'change amount not converted', f: s => mut(s, 'Math.abs((_displayPriceBase - _displayPriceBase / (1 + chg/100)) / _pxDiv).toFixed(2)', 'Math.abs(_displayPriceBase - _displayPriceBase / (1 + chg/100)).toFixed(2)') },
  { id: 'NEG-6', row: 'TU-4', label: 'extended price not converted', f: s => mut(s, '${_pxSym}${(_extPrice / _pxDiv).toFixed(2)}', '${_pxSym}${_extPrice.toFixed(2)}') },
  { id: 'NEG-7', row: 'TU-5', label: 'prompt left in agorot', f: s => mut(s, "_ta ? (v / 100).toFixed(2) + ' ILS' : '$' + _usd(v)", "_ta ? v + ' ILS' : '$' + _usd(v)") },
  { id: 'NEG-8', row: 'TU-6', label: 'MA prompt levels left in agorot', f: s => mut(s, "(v / 100).toFixed(2) + ' ILS' : '$' + v.toFixed(2)", "v.toFixed(2) + ' ILS' : '$' + v.toFixed(2)") },
  { id: 'NEG-9', row: 'TU-7', label: 'old ticker-header regex', f: s => mut(s, '([A-Z]{1,6}(?:[.\\-][A-Z]{1,2})?)(?=\\b|\\*\\*|\\s|$)/);', '([A-Z]{1,6})(?=\\b|\\*\\*|\\s|$)/);') },
  { id: 'NEG-10', row: 'TU-7', label: 'regex accepting 3+ letter suffixes (AAPL.COM)', f: s => mut(s, '(?:[.\\-][A-Z]{1,2})?)', '(?:[.\\-][A-Z]{1,3})?)') }
];
for (const n of NEGS) {
  let bit = null;
  try { bit = evaluate(n.f(SRC))[n.row]; } catch (e) { bit = 'setup: ' + e.message; }
  if (bit !== null && String(bit).indexOf('setup:') !== 0) console.log('  PASS  negative caught: ' + n.id + ' ' + n.label + ' → ' + n.row + ' fails (' + String(bit).split('\n')[0].slice(0, 90) + ')');
  else { failed += 1; console.log('  FAIL  negative NOT caught: ' + n.id + ' ' + n.label + ' (' + n.row + ': ' + (bit === null ? 'still passes' : bit) + ')'); }
}
console.log(failed === 0 ? '  PASS  ' + ROWS.length + ' tase-units assertion(s) passed' : '  FAIL  ' + failed + ' of ' + ROWS.length + ' tase-units assertion(s) failed');
process.exit(failed === 0 ? 0 : 1);
