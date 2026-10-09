#!/usr/bin/env node
'use strict';
/**
 * qa/narrative_consistency_offline.js — nlm-consistency-1 Slice 3 (R-6, Entry 14 slice 1): deterministic narrative
 * consistency checks K1–K6, warn-only display (D9).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL _nlmConsistencyChecks, renderMainPanel and the two
 * Scan Results renderers from index.html; fixtures are authored from the 3 Oct 2026 consistency pilot facts recorded in
 * the brief (MRNA M1, CBOE C1–C5, ROK R5 / "10 %").
 *
 *   NC-1  K1 "today" vs an earlier catalyst date           NC-7  missing inputs -> skipped, never failed
 *   NC-2  K2 downside / support level above the price      NC-8  no mutation of the item; AI fields byte-identical in the render
 *   NC-3  K3 stated % vs computed distance (> 0.5 pp)      NC-9  detail line only with >= 1 failure; ⚠ counts in Ranked / Daily Review
 *   NC-4  K4 entry floor <= invalidation                   NC-10 score / action / groups / order / stored result unaffected
 *   NC-5  K5 holder / exit language while not held         NC-11 _aiUnavailable -> no checks, no ⚠, no line
 *   NC-6  K6 narrative score vs product score              NC-12 K7 absent (only K1–K6)
 *   Planted negatives NEG-1..NEG-11 mutate the production source (never the test).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const norm = s => s.replace(/\r\n/g, '\n');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── Source extraction (qa/no_synthetic_score_offline.js rule) ───────────────────────────────────
function extractFn(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const realStart = (start >= 6 && content.slice(start - 6, start) === 'async ') ? start - 6 : start;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') { depth -= 1; if (depth === 0) return content.slice(realStart, i + 1); }
  }
  return null;
}

// ── Fixtures (pilot-shaped) ──────────────────────────────────────────────────────────────────────
const TODAY = '2026-10-03T13:00:00.000Z';
const S = 'This is a valid synthetic summary body used purely for offline pin fixtures and exceeds fifty characters.';
const base = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment_score: 45, sentiment: 'neutral', action: 'hold_wait',
  technical_setup: 'support_test', summary: S, _verifiedPrice: 100, _verifiedChangePct: 0.5, _orchestratedAt: TODAY }, over || {});
const F = {
  M1:   base({ ticker: 'MRNA', summary: 'KEY EVENT: Shares jumped today after the Phase 3 readout. ACTIONABLE TAKE: current holders can stay. Rating: Neutral | PT: $40', _catalysts: { bullish: ['Phase 3 readout announced Sep 30'], bearish: [], macro: [] } }),
  M1ok: base({ ticker: 'MRNA', summary: 'KEY EVENT: Shares jumped today after the Phase 3 readout. Rating: Neutral | PT: $40', _catalysts: { bullish: ['Phase 3 readout (Oct 3)'], bearish: [], macro: [] } }),
  C1:   base({ ticker: 'CBOE', _verifiedPrice: 271.26, summary: 'PRICE CONTEXT: Downside risk to the 150-day MA at $293.38 remains. Rating: Neutral | PT: $280' }),
  C1ok: base({ ticker: 'CBOE', _verifiedPrice: 271.26, summary: 'PRICE CONTEXT: Resistance at $293.38 caps the upside. Rating: Neutral | PT: $280' }),
  C2:   base({ ticker: 'CBOE', _verifiedPrice: 271.26, action: 'add_on_pullback', entry_zone: '$270-$275', invalidation: 'Daily close below $272' }),
  C2ok: base({ ticker: 'CBOE', _verifiedPrice: 271.26, action: 'add_on_pullback', entry_zone: '$270-$275', invalidation: 'Daily close below $262' }),
  C3:   base({ ticker: 'CBOE', summary: 'A 17.0% move to $117.97 would retest the highs. Rating: Neutral | PT: $120' }),
  R10:  base({ ticker: 'ROK', summary: 'A 10% move to $110.05 is plausible. Rating: Buy | PT: $115' }),
  C4:   base({ ticker: 'CBOE', sentiment_score: 45, summary: 'Our score of 42 reflects caution. Rating: Neutral | PT: $280' }),
  C4ok: base({ ticker: 'CBOE', sentiment_score: 45, summary: 'Our score of 45 reflects caution. Rating: Neutral | PT: $280' }),
  C5:   base({ ticker: 'CBOE', summary: 'ACTIONABLE TAKE: Current holders should exit the position into strength. Rating: Sell | PT: $250' }),
  R5:   base({ ticker: 'ROK', _verifiedPrice: 450, action: 'add_on_pullback', entry_zone: '$425-$432', invalidation: 'Close below $428' }),
  R5ok: base({ ticker: 'ROK', _verifiedPrice: 450, action: 'add_on_pullback', entry_zone: '$432-$440', invalidation: 'Close below $428' }),
  TRIM: base({ ticker: 'ROK', _verifiedPrice: 450, action: 'trim', entry_zone: '$425-$432', invalidation: 'Close below $428' }),
  MULTI: base({ ticker: 'CBOE', _verifiedPrice: 271.26, sentiment_score: 45, action: 'add_on_pullback', entry_zone: '$270-$275', invalidation: 'Daily close below $272',
    summary: 'KEY EVENT: Shares fell today. PRICE CONTEXT: Downside risk to the 150-day MA at $293.38 remains. Our score of 42 reflects caution. ACTIONABLE TAKE: current holders should exit the position. Rating: Sell | PT: $250',
    _catalysts: { bullish: [], bearish: ['Guidance cut on Sep 30'], macro: [] } })
};
const SUMMARY_NET = 'AI analysis unavailable — market data shown only. Technical panels reflect verified price and candle data. No AI-generated summary is available for this scan.';
const failedItem = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment: 'neutral', sentiment_score: null, summary: SUMMARY_NET + ' today exit score 42 downside $999',
  alerts: [], news: [], _aiUnavailable: true, _aiParseFailed: false, _verifiedPrice: 100, _verifiedChangePct: 1.2, _orchestratedAt: TODAY, _catalysts: { bullish: ['Sep 30 event'] } }, over || {});
function panelSnap() {
  return { sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 };
}

// ── Checker sandbox ─────────────────────────────────────────────────────────────────────────────
function buildChecker(src) {
  const s = extractFn(src, '_nlmConsistencyChecks');
  if (!s) throw new Error('_nlmConsistencyChecks not extractable');
  return new Function(s + '\nreturn _nlmConsistencyChecks;')();
}
const ids = arr => Array.isArray(arr) ? arr.map(k => k.id).join(',') : 'NOT-AN-ARRAY';

// ── Scan Results sandbox (vm context with the real functions) ───────────────────────────────────
const SR_FNS = ['_ptScoreNorm', '_ptScoreText', '_ptScoreCmp', '_ptScoreStates', '_ptScoreFillHtml', '_vscCellHtml',
  '_srGroupResults', '_crEsc', '_srHeldMap', '_srHeldHtml', '_nlmConsistencyChecks', '_srRenderGrouped', 'openScanResultsOverlay'];
function buildScanResults(src, held) {
  const srcs = SR_FNS.map(n => extractFn(src, n));
  if (srcs.some(s => !s)) throw new Error('scan results pieces missing: ' + SR_FNS.filter((n, i) => !srcs[i]).join(','));
  const state = { tbody: { innerHTML: '' }, writes: 0 };
  const els = { scanResultsOverlay: { style: {} }, srRows: state.tbody, srCount: { textContent: '' } };
  const ctx = {
    console: quiet, _cockpitResults: [], _srMode: 'ranked', _srDensity: 'regular',
    RATING_SUMMARY_RE: /Rating:\s*(Buy|Neutral|Sell)/i,
    _SR_BULLISH_TIER: new Set(['healthy_uptrend', 'healthy_uptrend_near_ath', 'pullback_in_uptrend']),
    _SR_BEARISH_TIER: new Set(['breakdown_risk', 'below_key_mas']),
    document: { getElementById: id => els[id] || null },
    loadHoldings: () => (held || {}), _srSafeParseResults: () => [],
    localStorage: { setItem() { state.writes += 1; }, getItem() { return null; }, removeItem() { state.writes += 1; } }
  };
  vm.createContext(ctx);
  vm.runInContext(srcs.join('\n'), ctx);
  const render = (mode, results) => { ctx._cockpitResults = results; ctx._srMode = mode; state.tbody.innerHTML = ''; vm.runInContext('openScanResultsOverlay()', ctx); return state.tbody.innerHTML; };
  const group = results => { ctx.__in = results; return vm.runInContext('_srGroupResults(__in)', ctx); };
  const grouped = results => { state.tbody.innerHTML = ''; ctx.__in = results; vm.runInContext('_srRenderGrouped(__in, document.getElementById("srRows"))', ctx); return state.tbody.innerHTML; };
  return { render, group, grouped, state };
}
const warnOf = (html, ticker) => { const m = new RegExp('<td class="sr-sym">' + ticker + '(?:<span class="sr-held">HELD</span>)?(?:<span class="sr-warn" title="([^"]*)"[^>]*>⚠ (\\d+)</span>)?</td>').exec(html); return m ? { count: m[2] ? Number(m[2]) : 0, title: m[1] || '' } : null; };
const tickersOf = html => (html.match(/data-ticker="([^"]+)"/g) || []).map(m => m.slice(13, -1));

// ── renderMainPanel harness (qa/pulse_analyst_view_offline.js pattern) ──────────────────────────
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
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup', '_setupDisplay',
  '_ptScoreNorm', '_ptScoreText', '_ptScoreDial', '_nlmConsistencyChecks'];
function buildRenderer(src, rmSrc) {
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = RENDER_REAL.map(n => { const s = extractFn(src, n); if (!s) throw new Error('missing ' + n); return s; });
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  // render(item, { held, ext }) -> innerHTML
  return function render(it, o) {
    const opts = o || {};
    const node = { innerHTML: '' };
    const writes = { n: 0 };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false, PT_ENABLE_ATH_CLIENT: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      localStorage: { setItem() { writes.n += 1; }, getItem() { return null; } },
      _techCache: { [it.ticker]: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: panelSnap(), refInput: opts.ext ? opts.ext.regularPrice : it._verifiedPrice } },
      _extendedMktCache: opts.ext ? { [it.ticker]: opts.ext } : {},
      _athCache: {},
      _srHeldMap: () => (opts.held || {}),
      _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(it);
    return { html: node.innerHTML, writes: writes.n };
  };
}
const LINE_RE = /<div class="mp-act-row mp-nlm"><span class="mp-act-lbl">Consistency<\/span><span class="mp-act-val"[^>]*>([^<]*)<\/span><\/div>/;
const lineOf = html => { const m = LINE_RE.exec(html); return m ? m[1] : null; };
const actVal = (html, lbl) => { const m = new RegExp('<span class="mp-act-lbl">' + lbl + '<\\/span><span class="mp-act-val">([^<]*)<\\/span>').exec(html); return m ? m[1] : null; };

// ── Evaluate every group on one source text ─────────────────────────────────────────────────────
function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = (id, fn) => { try { fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 220), false); } };
  const rm = extractFn(src, 'renderMainPanel') || '';
  let check = null;
  try { check = buildChecker(src); } catch (e) { check = null; }
  const run = (item, ctx) => check ? check(item, Object.assign({ price: item._verifiedPrice }, ctx || {})) : null;

  guard('NC-1', () => {
    chk('NC-1', 'MRNA M1: "today" with a catalyst dated Sep 30 (today = Oct 3) -> K1', ids(run(F.M1, { held: true })) === 'K1');
    chk('NC-1', 'same-day catalyst -> passes', ids(run(F.M1ok, { held: true })) === '');
    chk('NC-1', 'K1 text names the catalyst date', (run(F.M1, { held: true }) || [])[0].text.indexOf('2026-09-30') !== -1);
    chk('NC-1', 'ISO and "30 Sep" forms are parsed too', ids(run(base({ summary: 'Up today on news.', _catalysts: { bullish: ['Deal closed 2026-09-29'] } }))) === 'K1' && ids(run(base({ summary: 'Up today on news.', _catalysts: { bearish: ['30 Sep guidance cut'] } }))) === 'K1');
    chk('NC-1', 'impossible calendar dates (Sep 31, 2026-02-30, 31 Jun) are not dates: K1 skipped (Codex S3 finding 2)', ids(run(base({ summary: 'Up today on news.', _catalysts: { bullish: ['Event on Sep 31'] } }))) === '' && ids(run(base({ summary: 'Up today on news.', _catalysts: { bullish: ['Event 2026-02-30'] } }))) === '' && ids(run(base({ summary: 'Up today on news.', _catalysts: { macro: ['31 Jun data'] } }))) === '');
    chk('NC-1', 'a real leap-day date is still parsed (Feb 29 2024 < today -> K1)', ids(run(base({ summary: 'Up today on news.', _catalysts: { bullish: ['Event 2024-02-29'] } }))) === 'K1');
  });
  guard('NC-2', () => {
    chk('NC-2', 'CBOE C1: MA150 $293.38 called downside at 271.26 -> K2', ids(run(F.C1)) === 'K2');
    chk('NC-2', 'resistance above the price -> passes', ids(run(F.C1ok)) === '');
    chk('NC-2', 'upside level below the price -> K2', ids(run(base({ _verifiedPrice: 300, summary: 'Upside to $280 looks capped.' }))) === 'K2');
    chk('NC-2', 'the displayed price (ctx.price) is what K2 compares against', ids(run(F.C1, { price: 300 })) === '');
    chk('NC-2', 'unrelated "support" wording does not bind to a distant $ level in the same sentence (Codex S3 finding 1)',
      ids(run(base({ _verifiedPrice: 45, summary: 'Support for the product remains strong, and the stock trades near $40.' }))) === '' &&
      ids(run(base({ _verifiedPrice: 45, summary: 'Analysts see support for the thesis as the company guided to $4.5B of revenue.' }))) === '' &&
      ids(run(base({ _verifiedPrice: 35, summary: 'Support for the product remains strong, and the stock trades near $40.' }))) === '');
    chk('NC-2', 'a level named right after the direction word still binds ("downside is capped near $40" at 35 -> K2)', ids(run(base({ _verifiedPrice: 35, summary: 'Support for the product remains strong; downside risk is capped near $40.' }))) === 'K2');
  });
  guard('NC-3', () => {
    chk('NC-3', 'CBOE C3: stated 17.0 % to $117.97 at 100 (actual 17.97 %) -> K3', ids(run(F.C3)) === 'K3');
    chk('NC-3', 'ROK: "10%" to $110.05 (actual 10.05 %) -> passes (within 0.5 pp)', ids(run(F.R10)) === '');
    chk('NC-3', 'the "$level (x%)" form is parsed too', ids(run(base({ summary: 'Support at $90 (-12%) matters.' }))) === 'K3' && ids(run(base({ summary: 'Support at $90 (-10%) matters.' }))) === '');
  });
  guard('NC-4', () => {
    chk('NC-4', 'ROK R5: entry floor 425 <= invalidation 428 -> K4', ids(run(F.R5)) === 'K4');
    chk('NC-4', 'CBOE C2: entry floor 270 <= invalidation 272 -> K4', ids(run(F.C2)) === 'K4');
    chk('NC-4', 'entry floor above the invalidation -> passes', ids(run(F.R5ok)) === '' && ids(run(F.C2ok)) === '');
    chk('NC-4', 'not a long setup (trim) -> K4 not applied', ids(run(F.TRIM)) === '');
  });
  guard('NC-5', () => {
    chk('NC-5', 'CBOE C5: exit language while not held -> K5', ids(run(F.C5, { held: false })) === 'K5');
    chk('NC-5', 'held MRNA "current holders" -> passes', ids(run(F.M1ok, { held: true })) === '' && ids(run(base({ summary: 'Current holders can stay.' }), { held: true })) === '');
    chk('NC-5', 'unknown holdings (null) -> K5 skipped', ids(run(F.C5, { held: null })) === '');
  });
  guard('NC-6', () => {
    chk('NC-6', 'CBOE C4: narrative "score of 42" vs product 45 -> K6', ids(run(F.C4)) === 'K6');
    chk('NC-6', 'equal -> passes', ids(run(F.C4ok)) === '');
    chk('NC-6', 'K6 compares with sentiment_score, never with the analyst rating', ids(run(base({ sentiment_score: 42, rating: 'Buy', summary: 'Our score of 42 reflects caution. Rating: Buy | PT: $1' }))) === '');
  });
  guard('NC-7', () => {
    chk('NC-7', 'K1 skipped without "today" / without a catalyst date / without a date reference', ids(run(base({ _catalysts: { bullish: ['Sep 30 news'] } }))) === '' && ids(run(base({ summary: 'Up today.', _catalysts: { bullish: ['news'] } }))) === '' && ids(run(base({ summary: 'Up today.', _catalysts: { bullish: ['Sep 30 news'] }, _orchestratedAt: undefined }))) === '');
    chk('NC-7', 'K2 / K3 skipped without a price', ids(run(F.C1, { price: null })) === '' && ids(run(F.C3, { price: undefined })) === '');
    chk('NC-7', 'K3 skipped without a stated level or percent', ids(run(base({ summary: 'A 17% move would retest the highs.' }))) === '' && ids(run(base({ summary: 'A move to $117.97 would retest the highs.' }))) === '');
    chk('NC-7', 'K4 skipped without an entry zone or an invalidation', ids(run(base({ action: 'add_on_pullback', entry_zone: '$270-$275' }))) === '' && ids(run(base({ action: 'add_on_pullback', invalidation: 'Below $272' }))) === '' && ids(run(base({ action: 'add_on_pullback', entry_zone: 'the gap', invalidation: 'the low' }))) === '');
    chk('NC-7', 'K5 skipped when holdings are unknown', ids(run(F.C5, { held: null })) === '' && ids(run(F.C5, {})) === '');
    chk('NC-7', 'K6 skipped with a null product score or no stated score', ids(run(base({ sentiment_score: null, summary: 'Our score of 42 reflects caution.' }))) === '' && ids(run(F.C4ok)) === '');
    chk('NC-7', 'empty / missing summary and a non-object item -> no failures, no throw', ids(run(base({ summary: '' }))) === '' && ids(run(base({ summary: undefined }))) === '' && ids(check(null, {})) === '' && ids(check(undefined)) === '');
  });
  guard('NC-8', () => {
    const before = JSON.stringify(F.MULTI);
    const out = run(F.MULTI, { held: false });
    chk('NC-8', 'the checker never mutates the item', JSON.stringify(F.MULTI) === before && ids(out) === 'K1,K2,K3,K4,K5,K6'.split(',').filter(k => ids(out).indexOf(k) !== -1).join(',') && out.length >= 4);
    const render = buildRenderer(src, rm);
    const item = Object.assign({}, F.MULTI, { key_risk: 'Rates <b>stay</b> high "today"', conflict: null });
    const snapshot = JSON.stringify(item);
    const r = render(item, { held: {} });
    chk('NC-8', 'the render never mutates the item', JSON.stringify(item) === snapshot);
    chk('NC-8', 'AI fields render byte-identically (escaped) with a Consistency line present', lineOf(r.html) !== null && actVal(r.html, 'Entry Zone') === '$270-$275' && actVal(r.html, 'Invalidation') === 'Daily close below $272' && actVal(r.html, 'Key Risk') === 'Rates &lt;b&gt;stay&lt;/b&gt; high &quot;today&quot;');
    chk('NC-8', 'the summary text is not rewritten anywhere in the panel (no "recently" substitution, the word today is still rendered)', r.html.indexOf('recently') === -1 && item.summary.indexOf('today') !== -1);
    chk('NC-8', 'no storage write during the render', r.writes === 0);
  });
  guard('NC-9', () => {
    const render = buildRenderer(src, rm);
    const multi = render(F.MULTI, { held: {} });
    const line = lineOf(multi.html);
    chk('NC-9', 'detail: one Consistency line directly under the Actionable Take with the failed texts', line !== null && countOf(multi.html, 'mp-nlm') === 1 && line.indexOf('K1') === -1 && line.indexOf('·') !== -1 && line.indexOf('score 42') !== -1 && multi.html.indexOf('mp-nlm') < multi.html.indexOf('mp-action-time'));
    const clean = render(F.C1ok, { held: {} });
    chk('NC-9', 'detail: no line when nothing fails', lineOf(clean.html) === null && clean.html.indexOf('Consistency') === -1);
    const sr = buildScanResults(src, {});
    const rows = [F.MULTI, F.C1ok, F.C4, base({ ticker: 'ZED' })];
    const ranked = sr.render('ranked', rows); const review = sr.grouped(rows);
    const nMulti = ids(run(F.MULTI, { held: false })).split(',').length;
    chk('NC-9', 'Ranked: ⚠ n beside the ticker when n > 0, none at 0', !!warnOf(ranked, 'CBOE') && warnOf(ranked, 'ZED').count === 0 && countOf(ranked, 'sr-warn') === 2 && ranked.indexOf('⚠ ' + nMulti) !== -1 && ranked.indexOf('⚠ 1') !== -1);
    chk('NC-9', 'Daily Review: the same ⚠ counts', countOf(review, 'sr-warn') === 2 && review.indexOf('⚠ ' + nMulti) !== -1 && review.indexOf('⚠ 1') !== -1 && warnOf(review, 'ZED').count === 0);
    chk('NC-9', 'the ⚠ title carries the failed texts', /title="[^"]*score 42[^"]*"/.test(ranked));
    const heldSr = buildScanResults(src, { CBOE: { symbol: 'CBOE', positionSize: 1 } });
    chk('NC-9', 'Scan Results read holdings for K5: held CBOE drops the K5 failure', countOf(heldSr.render('ranked', [F.C5]), 'sr-warn') === 0 && countOf(sr.render('ranked', [F.C5]), 'sr-warn') === 1);
  });
  guard('NC-10', () => {
    const sr = buildScanResults(src, {});
    const noisy = [F.MULTI, base({ ticker: 'AAA', sentiment_score: 45 }), F.C4, base({ ticker: 'BBB', sentiment_score: 80, technical_setup: 'healthy_uptrend' })];
    const quietRows = noisy.map(r => Object.assign({}, r, { summary: S, entry_zone: undefined, invalidation: undefined, _catalysts: undefined }));
    const gN = sr.group(noisy); const gQ = sr.group(quietRows);
    const idsOf = g => g.map(x => x.items.map(r => r.ticker).join(',')).join('|');
    chk('NC-10', 'groups and their order identical with and without failures', idsOf(gN) === idsOf(gQ));
    chk('NC-10', 'Ranked order identical with and without failures', tickersOf(sr.render('ranked', noisy)).join() === tickersOf(sr.render('ranked', quietRows)).join());
    const before = JSON.stringify(noisy);
    sr.render('ranked', noisy); sr.grouped(noisy);
    chk('NC-10', 'score / action / fields untouched by the renderers; no storage write', JSON.stringify(noisy) === before && sr.state.writes === 0);
    chk('NC-10', 'static: _srGroupResults, orchestrate, enforceScoreConsistency, _isValidScanResult and mergeResultsByTicker never call the checker',
      ['_srGroupResults', 'orchestrate', 'enforceScoreConsistency', '_isValidScanResult', 'mergeResultsByTicker', 'analyzeChunk', 'fetchAnthropicAnalysis'].every(n => (extractFn(src, n) || 'x').indexOf('_nlmConsistencyChecks') === -1));
    chk('NC-10', 'static: the checker reads no storage, touches no score field and references no prompt', (() => { const s = extractFn(src, '_nlmConsistencyChecks') || ''; return s.length > 0 && !/localStorage|sessionStorage|\bpt_(?:results|tickers|holdings)\b|fetch\(|sentiment_score\s*=[^=]|\.action\s*=[^=]|\borchestrate\(|enforceScoreConsistency|_techCache/.test(s); })());
  });
  guard('NC-11', () => {
    chk('NC-11', 'failed analysis -> no checks', ids(run(failedItem(), { held: false })) === '');
    const render = buildRenderer(src, rm);
    const r = render(failedItem(), { held: {} });
    chk('NC-11', 'failed analysis -> no Consistency line', lineOf(r.html) === null && r.html.indexOf('mp-nlm') === -1);
    const sr = buildScanResults(src, {});
    chk('NC-11', 'failed analysis -> no ⚠ in Ranked / Daily Review', countOf(sr.render('ranked', [failedItem()]), 'sr-warn') === 0 && countOf(sr.grouped([failedItem()]), 'sr-warn') === 0);
  });
  guard('NC-12', () => {
    const s = extractFn(src, '_nlmConsistencyChecks') || '';
    const found = Array.from(new Set((s.match(/id: 'K\d+'/g) || []).map(x => x.slice(5, -1)))).sort();
    chk('NC-12', 'exactly the ids K1..K6 exist, K7 absent', found.join(',') === 'K1,K2,K3,K4,K5,K6' && s.indexOf('K7') === -1);
    chk('NC-12', 'the checker is the only new top-level function referenced by renderMainPanel (§0.4 exception)', countOf(rm, '_nlmConsistencyChecks(') === 1 && (rm.match(/\b_nlm\w*\(/g) || []).length === 1);
    chk('NC-12', 'the two Scan Results renderers call the checker with the same expression', (() => { const a = extractFn(src, '_srRenderGrouped') || ''; const b = extractFn(src, 'openScanResultsOverlay') || ''; const ea = /\$\{\(\(\) => \{ const _ks = _nlmConsistencyChecks\(r,[\s\S]*?\}\)\(\)\}/.exec(a); const eb = /\$\{\(\(\) => \{ const _ks = _nlmConsistencyChecks\(r,[\s\S]*?\}\)\(\)\}/.exec(b); return !!ea && !!eb && ea[0] === eb[0]; })());
  });
  return R;
}

// ── Planted negatives (mutations on the production source text) ─────────────────────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + from.slice(0, 70));
  return text.replace(from, () => to);
}
const NEGATIVES = [
  { id: 'NC-1', label: 'date comparison removed (K1 fires on a same-day catalyst)', f: s => mut(s, "    if (dates.length && dates.every(d => d < today)) out.push({ id: 'K1'", "    if (dates.length) out.push({ id: 'K1'") },
  { id: 'NC-2', label: 'direction inverted', f: s => mut(s, "if ((word === 'downside' || word === 'support') && level > price)", "if ((word === 'downside' || word === 'support') && level < price)") },
  { id: 'NC-2', label: 'the $ level bound to any direction word in the sentence (window removed)', f: s => mut(s, "[^$;.,\\n]{0,40}\\$\\s?(\\d[\\d,]*\\.?\\d*)|", "[^$\\n]{0,400}\\$\\s?(\\d[\\d,]*\\.?\\d*)|") },
  { id: 'NC-1', label: 'impossible calendar dates accepted (round-trip check dropped)', f: s => mut(s, "return (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) ? y + '-'", "return (dt.getUTCFullYear() === y) ? y + '-'") },
  { id: 'NC-3', label: 'tolerance widened to 1 pp', f: s => mut(s, 'if (Math.abs(actual - pct) > 0.5)', 'if (Math.abs(actual - pct) > 1)') },
  { id: 'NC-4', label: 'comparison flipped', f: s => mut(s, "      if (floor <= inv) out.push({ id: 'K4'", "      if (floor > inv) out.push({ id: 'K4'") },
  { id: 'NC-5', label: 'holdings ignored', f: s => mut(s, '  if (c.held === false && /\\b(current holders', '  if (c.held !== undefined && /\\b(current holders') },
  { id: 'NC-6', label: 'score compared to the analyst rating', f: s => mut(s, "    if (m && Number(m[1]) !== item.sentiment_score) out.push", "    if (m && Number(m[1]) !== (item.rating === 'Buy' ? 70 : 42)) out.push") },
  { id: 'NC-7', label: 'a missing stated score treated as a failure', f: s => mut(s, "    if (m && Number(m[1]) !== item.sentiment_score) out.push({ id: 'K6', text: 'narrative score ' + m[1]", "    if (!m || Number(m[1]) !== item.sentiment_score) out.push({ id: 'K6', text: 'narrative score ' + (m ? m[1] : 'none')") },
  { id: 'NC-8', label: 'the AI text rewritten by the checker', f: s => mut(s, "  const text = String(item.summary || '');\n  const price =", "  const text = String(item.summary || ''); if (item.summary) item.summary = text.replace(/\\btoday\\b/gi, 'recently');\n  const price =") },
  { id: 'NC-9', label: 'the Consistency line shown with 0 failures', f: s => mut(s, "    return (Array.isArray(_ks) && _ks.length) ? `\\n        <div class=\"mp-act-row mp-nlm\">", "    return (Array.isArray(_ks)) ? `\\n        <div class=\"mp-act-row mp-nlm\">") },
  { id: 'NC-10', label: '⚠ count used in the Daily Review sort', f: s => mut(s, '  const items = source.slice().sort(_ptScoreCmp); // R-5 (Entry 37, ruling B1)', '  const items = source.slice().sort((a, b) => (_nlmConsistencyChecks(b, { price: b._verifiedPrice }).length - _nlmConsistencyChecks(a, { price: a._verifiedPrice }).length) || _ptScoreCmp(a, b)); // R-5 (Entry 37, ruling B1)') },
  { id: 'NC-11', label: 'checks run on a failed item', f: s => mut(s, "  if (!item || typeof item !== 'object' || item._aiUnavailable === true) return out;", "  if (!item || typeof item !== 'object') return out;") }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
(() => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };
  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const real = evaluate(index);
  const order = ['NC-1', 'NC-2', 'NC-3', 'NC-4', 'NC-5', 'NC-6', 'NC-7', 'NC-8', 'NC-9', 'NC-10', 'NC-11', 'NC-12'];
  for (const id of order) for (const c of (real[id] || [])) check(id + ' ' + c.name, c.ok);
  for (const g of order) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);
  const realClean = failures === 0;
  for (const n of NEGATIVES) {
    let mutated = null;
    try { mutated = n.f(index); } catch (e) { check('negative ' + n.id + ' (' + n.label + '): anchor unique — ' + e.message, false); continue; }
    const r = evaluate(mutated);
    const bit = Array.isArray(r[n.id]) && r[n.id].some(c => !c.ok);
    check('negative ' + n.id + ' (' + n.label + ') is caught by ' + n.id + (realClean ? '' : ' [unproven: real run not clean]'), bit && realClean);
  }
  console.log(failures === 0
    ? 'NARRATIVE CONSISTENCY OFFLINE: PASS (' + asserts + ' asserts)'
    : 'NARRATIVE CONSISTENCY OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
