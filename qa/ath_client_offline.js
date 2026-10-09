#!/usr/bin/env node
'use strict';
/**
 * qa/ath_client_offline.js — nlm-consistency-1 Slice 2 (B4, Entry 34): the All-time-high client.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL functions from index.html and runs them in
 * sandboxes with a stubbed fetch (qa/no_synthetic_score_offline.js / qa/tech_snapshot_cache_offline.js patterns).
 *
 *   AC-1  gate off -> zero requests; panel and AI text byte-identical to the pre-slice functions
 *   AC-2  one ath-ensure per scanned ticker, body exactly {ticker}, at most 4 in flight, no retry
 *   AC-3  verified -> value · date · distance at the DISPLAYED price (near / at-above suffixes)
 *   AC-4  stale-suspect -> "ATH under review"; unavailable -> "—"; never the 1Y High
 *   AC-5  AI line exactly once for verified; block byte-identical otherwise; no distance / 1Y value in the line
 *   AC-6  no data path into setup / score / _techCache / persistence
 *   AC-7  no web storage / URL use
 *   AC-8  no new top-level function referenced by renderMainPanel
 *   AC-9  a failed (null-score) item still gets the row
 *   AC-10 default assignment once; false / 'true' / 1 -> zero requests
 *   AC-11 ILA -> ÷ 100 shown in ILS, distance at the displayed ILS price; currency mismatch -> "—"
 *   AC-12 acceptance table over every envelope; verified + budget exhausted still shows; action / budget never displayed
 *   AC-13 S2 table round-trips; AR-7f allowed / forbidden needles
 *   Planted negatives NEG-1..NEG-12 mutate the production source (never the test).
 */
const fs = require('fs');
const path = require('path');
const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const norm = s => s.replace(/\r\n/g, '\n');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── S2 table (plan.md §12 / apply-s2.js) — the lines the suite reverts for its byte-identity controls ──
const ONE_Y_LINE = '          <div class="rr-row"><span class="rr-lbl">1Y High Distance</span><span class="rr-val ${snap.hasHigh1y ? (snap.high1yDist < -15 ? \'warn\' : snap.high1yDist < -5 ? \'neutral-v\' : \'pos\') : \'neutral-v\'}">${snap.hasHigh1y ? fmtPct(snap.high1yDist) : \'—\'}</span></div>';
const RS_LINE = '    `  RS vs SPY (3M): ${fmt(s.rsSPY)}   RS vs QQQ (3M): ${fmt(s.rsQQQ)}${etfLabel}\\n`';
const ROW_BLOCK = [
  "  // B4 (Entry 34): All-time-high row — display only (never setup or score); verified records only; the distance is taken",
  "  // at the displayed price (P-2A: TASE prices in ILS = agorot ÷ 100). Gate OFF yields '' so the card bytes are unchanged.",
  "  const _athRowHtml = (() => {",
  "    if (window.PT_ENABLE_ATH_CLIENT !== true) return '';",
  "    const _a = _athCache[item.ticker] || null;",
  "    let _v = '—';",
  "    if (_a && _a.state === 'review') _v = 'ATH under review';",
  "    else if (_a && _a.state === 'verified') {",
  "      const _isTA = /\\.TA$/.test(item.ticker || '');",
  "      const _dispCur = _isTA ? 'ILS' : 'USD';",
  "      const _dispRaw = hasData ? _techPanelPrice(item) : null;",
  "      const _dispP = (typeof _dispRaw === 'number' && isFinite(_dispRaw) && _dispRaw > 0) ? (_isTA ? _dispRaw / 100 : _dispRaw) : null;",
  "      if (_a.currency === _dispCur) {",
  "        const _d = _dispP === null ? null : (_dispP - _a.athValue) / _a.athValue * 100;",
  "        _v = `${_a.athValue.toFixed(2)} ${_a.currency} · ${_a.athDate}` + (_d === null ? '' : ` · ${fmtPct(_d)}${_d >= 0 ? ' · at / above' : _d >= -2 ? ' · near' : ''}`);",
  "      }",
  "    }",
  "    return `<div class=\"rr-row\"><span class=\"rr-lbl\">All-time high</span><span class=\"rr-val neutral-v\">${_v}</span></div>\\n          `;",
  "  })();",
  ""
].join('\n');
const S2 = {
  buildTechSnapshotBlock: [
    { id: 'BTS-1', oldS: "  const etfLabel = s.sectorEtf ? ' vs ' + s.sectorEtf + ': ' + fmt(s.rsSector) : '';",
      newS: "  const etfLabel = s.sectorEtf ? ' vs ' + s.sectorEtf + ': ' + fmt(s.rsSector) : '';\n  const _ath = (typeof _athCache === 'object' && _athCache) ? _athCache[sym] : null; // B4 (Entry 34): memory cache; absent in harnesses\n  const _athLine = (_ath && _ath.state === 'verified') ? `  All-time high (verified): ${_ath.athValue.toFixed(2)} ${_ath.currency} (${_ath.athDate})\\n` : ''; // D-B4-2 = A: verified only, never the 1Y High, no distance" },
    { id: 'BTS-2', oldS: RS_LINE, newS: RS_LINE + ' + _athLine' }
  ],
  renderMainPanel: [
    { id: 'RM-A', oldS: "  // Backlog task 6 — gated row, filled post-render by _ts1FillRow. Gate OFF yields '' so the",
      newS: ROW_BLOCK + "  // Backlog task 6 — gated row, filled post-render by _ts1FillRow. Gate OFF yields '' so the" },
    { id: 'RM-B', oldS: ONE_Y_LINE, newS: '          ${_athRowHtml}' + ONE_Y_LINE.slice(10) }
  ]
};
function revertS2(fnSrc, name) {
  let out = fnSrc;
  for (const r of S2[name].slice().reverse()) { if (countOf(out, r.newS) !== 1) throw new Error('S2 new text not unique: ' + r.id); out = out.replace(r.newS, () => r.oldS); }
  return out;
}
function applyS2(fnSrc, name) {
  let out = fnSrc;
  for (const r of S2[name]) { if (countOf(out, r.oldS) !== 1) throw new Error('S2 old text not unique: ' + r.id); out = out.replace(r.oldS, () => r.newS); }
  return out;
}
const DEFAULT_LINE = '  window.PT_ENABLE_ATH_CLIENT = true;';
const AR7F_FORBIDDEN = ['ath-write', 'PT_ATH', 'PT_ENABLE_ATH_READ_SERVER', 'PT_ENABLE_ATH_ENSURE_SERVER', 'PT_ENABLE_ATH_WRITE_SERVER', 'ath-record-store', 'ath:v1', 'ath-verify-owner'];
const AR7F_ALLOWED = ['ath-ensure', 'ath-read', 'PT_ENABLE_ATH_CLIENT'];

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
const HELPERS = ['_athAccept', '_athFetch', '_athPrefetchScan', '_athReadForView'];

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const PRICE = 190.01;
const OK = over => Object.assign({ readContractVersion: 'ath-read-v2', status: 'OK', ticker: 'TST', recordStatus: 'verified', athValue: 191.37, athDate: '2025-07-15',
  unit: 'USD', currency: 'USD', basis: 'close', method: 'auto', verifiedAt: '2026-10-01T00:00:00.000Z' }, over || {});
const SUMMARY_NET = 'AI analysis unavailable — market data shown only. Technical panels reflect verified price and candle data. No AI-generated summary is available for this scan.';
const item = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment_score: 70, sentiment: 'positive',
  summary: 'KEY EVENT: x. ACTIONABLE TAKE: hold. Rating: Buy | PT: $200', action: 'buy', technical_setup: 'healthy_uptrend',
  _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});
const failedItem = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment: 'neutral', sentiment_score: null, summary: SUMMARY_NET,
  alerts: [], news: [], _aiUnavailable: true, _aiParseFailed: false, _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});
function panelSnap() {
  return { sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 };
}
const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const PRE_EXT = { marketState: 'PRE', regularPrice: 188.5, preMarketPrice: 191, preMarketChangePercent: null, postMarketPrice: null, postMarketChangePercent: null };

// ── Client sandbox: the four helpers with a stubbed fetch and injected state ────────────────────
function buildClient(src, winFlags, fetchImpl) {
  const parts = HELPERS.map(n => { const s = extractFn(src, n); if (!s) throw new Error('missing ' + n); return s; });
  const body = ['let _activeTicker = null; const _cockpitResults = []; const __renders = [];',
    'function renderMainPanel(item) { __renders.push(item.ticker); }',
    parts.join('\n'),
    'return { _athAccept, _athFetch, _athPrefetchScan, _athReadForView, __renders, _cockpitResults, setActive: v => { _activeTicker = v; } };'].join('\n');
  const cache = {}; const inflight = {};
  const api = new Function('window', 'fetch', '_athCache', '_athInflight', 'AbortSignal', 'console', body)(winFlags, fetchImpl, cache, inflight, AbortSignal, quiet);
  return Object.assign(api, { cache, inflight });
}
function makeFetch(responder) {   // responder(url, init) -> body object | Error ; records every call, lets AC-2 hold calls open
  const calls = []; const open = [];
  const f = (url, init) => {
    calls.push({ url, init, body: init && init.body });
    return new Promise((resolve, reject) => {
      const r = responder(url, init);
      const settle = () => (r instanceof Error) ? reject(r) : resolve({ ok: true, status: 200, json: async () => r });
      if (responder.hold) open.push(settle); else settle();
    });
  };
  f.calls = calls; f.open = open;
  return f;
}
const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setImmediate(r)); };

// ── buildTechSnapshotBlock sandbox ───────────────────────────────────────────────────────────────
function buildBlock(src, btsSrc, cache) {
  const sd = extractFn(src, '_setupDisplay');
  if (!sd || !btsSrc) throw new Error('block pieces missing');
  const args = cache === undefined ? [] : ['_athCache'];
  const fn = new Function(...args, sd + '\n' + btsSrc + '\nreturn buildTechSnapshotBlock;');
  return cache === undefined ? fn() : fn(cache);
}

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
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup', '_setupDisplay', '_ptScoreNorm', '_ptScoreText', '_ptScoreDial', '_nlmConsistencyChecks']; // R-6 (Entry 14 s1): the checker renderMainPanel now calls (brief S3.4 class c)
function buildRenderer(src, rmSrc) {
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = RENDER_REAL.map(n => { const s = extractFn(src, n); if (!s) throw new Error('missing ' + n); return s; });
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  // render(item, { gate, cache, ext }) -> innerHTML
  return function render(it, o) {
    const opts = o || {};
    const node = { innerHTML: '' };
    const win = { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false };
    if (Object.prototype.hasOwnProperty.call(opts, 'gate')) win.PT_ENABLE_ATH_CLIENT = opts.gate;
    const map = {
      window: win,
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: { [it.ticker]: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: panelSnap(), refInput: opts.ext ? opts.ext.regularPrice : it._verifiedPrice } },
      _extendedMktCache: opts.ext ? { [it.ticker]: opts.ext } : {},
      _athCache: opts.cache || {},
      _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(it);
    return node.innerHTML;
  };
}
const ROW_RE = /<span class="rr-lbl">All-time high<\/span><span class="rr-val ([^"]*)">([^<]*)<\/span>/;
const rowOf = html => { const m = ROW_RE.exec(html); return m ? { cls: m[1], text: m[2] } : null; };

// ── Evaluate every group on one source text ─────────────────────────────────────────────────────
async function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 220), false); } };
  const rm = extractFn(src, 'renderMainPanel') || '';
  const bts = extractFn(src, 'buildTechSnapshotBlock') || '';
  let rmPre = null, btsPre = null;
  try { rmPre = revertS2(rm, 'renderMainPanel'); } catch (e) { rmPre = null; }
  try { btsPre = revertS2(bts, 'buildTechSnapshotBlock'); } catch (e) { btsPre = null; }
  const VERIFIED = { state: 'verified', athValue: 191.37, athDate: '2025-07-15', currency: 'USD' };

  // AC-12 acceptance table (pure)
  await guard('AC-12', () => {
    const c = buildClient(src, { PT_ENABLE_ATH_CLIENT: true }, makeFetch(() => OK()));
    const acc = b => c._athAccept(b);
    chk('AC-12', 'verified OK body -> verified with value / date / currency', JSON.stringify(acc(OK())) === JSON.stringify(VERIFIED));
    chk('AC-12', 'stale-suspect -> review (no value)', acc(OK({ recordStatus: 'stale-suspect', athValue: null, athDate: null })).state === 'review');
    chk('AC-12', 'stale-suspect is "under review" whatever the envelope (non-OK status, other contract version) — S2.1 rule, Codex S2 finding 1',
      acc({ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE', ticker: 'TST', recordStatus: 'stale-suspect' }).state === 'review' &&
      acc(OK({ readContractVersion: 'ath-read-v1', recordStatus: 'stale-suspect', athValue: null, athDate: null })).state === 'review' &&
      acc(OK({ recordStatus: 'stale-suspect', athValue: 191.37 })).athValue === null);
    chk('AC-12', 'unresolved -> unavailable', acc(OK({ recordStatus: 'unresolved', athValue: null, athDate: null })).state === 'unavailable');
    for (const st of ['DISABLED', 'NOT_AVAILABLE', 'DEGRADED', 'INVALID_TICKER', 'INVALID_JSON', 'INVALID_SUBMISSION', 'METHOD_NOT_ALLOWED', 'ERROR']) {
      chk('AC-12', st + ' -> unavailable', acc({ status: st, reason: st, ticker: 'TST' }).state === 'unavailable');
    }
    chk('AC-12', 'wrong contract version -> unavailable', acc(OK({ readContractVersion: 'ath-read-v1' })).state === 'unavailable');
    chk('AC-12', 'non-finite / non-positive value -> unavailable', acc(OK({ athValue: NaN })).state === 'unavailable' && acc(OK({ athValue: 0 })).state === 'unavailable' && acc(OK({ athValue: '191.37' })).state === 'unavailable');
    chk('AC-12', 'bad date -> unavailable', acc(OK({ athDate: '15/07/2025' })).state === 'unavailable' && acc(OK({ athDate: null })).state === 'unavailable');
    chk('AC-12', 'null / non-object / thrown fetch bodies -> unavailable', acc(null).state === 'unavailable' && acc('x').state === 'unavailable' && acc(undefined).state === 'unavailable');
    chk('AC-12', 'ath-ensure extras: verified + budget exhausted still verified; action / budget never stored', (() => { const r = acc(OK({ action: 'derived', budget: 'exhausted' })); return r.state === 'verified' && !('action' in r) && !('budget' in r); })());
    chk('AC-12', 'budget exhausted without a verified record -> unavailable', acc({ status: 'NOT_AVAILABLE', reason: 'NO_RECORD', ticker: 'TST', action: 'checked', budget: 'exhausted' }).state === 'unavailable');
    chk('AC-12', 'unknown currency -> unavailable', acc(OK({ unit: 'EUR', currency: 'EUR' })).state === 'unavailable');
  });

  // AC-1 / AC-10 gate
  await guard('AC-1', async () => {
    for (const g of [false, 'true', 1, undefined]) {
      const f = makeFetch(() => OK());
      const win = g === undefined ? {} : { PT_ENABLE_ATH_CLIENT: g };
      const c = buildClient(src, win, f);
      const p = c._athPrefetchScan(['TST', 'AAA']); c._athReadForView('TST'); await c._athFetch('ath-read', 'TST'); await flush();
      chk('AC-1', 'gate ' + JSON.stringify(g) + ': zero requests from prefetch / view / fetch; cache stays empty', f.calls.length === 0 && Object.keys(c.cache).length === 0 && Object.keys(p).length === 0);
    }
    const render = buildRenderer(src, rm);
    chk('AC-1', 'pre-slice renderMainPanel buildable (S2 table reverts cleanly)', rmPre !== null);
    if (rmPre) {
      const renderPre = buildRenderer(src, rmPre);
      for (const [label, it, o] of [['normal', item(), {}], ['gate false', item(), { gate: false }], ['gate "true"', item(), { gate: 'true' }], ['failed item', failedItem(), {}], ['PRE refreshed', item(), { ext: PRE_EXT }]]) {
        chk('AC-1', label + ': gate off -> panel byte-identical to the pre-slice render (cache populated or not)', render(it, Object.assign({ cache: { TST: VERIFIED } }, o)) === renderPre(it, o));
      }
    }
    chk('AC-1', 'pre-slice buildTechSnapshotBlock buildable', btsPre !== null);
    if (btsPre) {
      const b = buildBlock(src, bts, { TST: { state: 'unavailable' } }); const bNo = buildBlock(src, bts); const bPre = buildBlock(src, btsPre);
      const snap = panelSnap();
      chk('AC-1', 'AI block byte-identical to the pre-slice function without a verified entry (cache absent / unavailable / review)',
        b('TST', snap, 'healthy_uptrend') === bPre('TST', snap, 'healthy_uptrend') && bNo('TST', snap, 'healthy_uptrend') === bPre('TST', snap, 'healthy_uptrend') &&
        buildBlock(src, bts, { TST: { state: 'review' } })('TST', snap, 'healthy_uptrend') === bPre('TST', snap, 'healthy_uptrend'));
    }
  });
  await guard('AC-10', async () => {
    const init = extractFn(src, 'init') || '';
    chk('AC-10', 'init() carries the default assignment exactly once', countOf(init, DEFAULT_LINE) === 1 && countOf(src, 'window.PT_ENABLE_ATH_CLIENT = ') === 1);
    chk('AC-10', 'the default sits after the Tech Score default (22a pattern) and before loadWatchlist()', init.indexOf('window.PT_ENABLE_TECH_SCORE = true;') < init.indexOf(DEFAULT_LINE) && init.indexOf(DEFAULT_LINE) < init.indexOf('loadWatchlist();'));
    for (const g of [false, 'true', 1]) {
      const f = makeFetch(() => OK());
      const c = buildClient(src, { PT_ENABLE_ATH_CLIENT: g }, f);
      await c._athFetch('ath-ensure', 'TST'); c._athPrefetchScan(['TST']); c._athReadForView('TST'); await flush();
      chk('AC-10', 'gate value ' + JSON.stringify(g) + ' -> zero requests (strict === true)', f.calls.length === 0);
    }
    chk('AC-10', 'static: every gate check in the client is strict (=== true)', HELPERS.every(n => { const s = extractFn(src, n) || ''; return /window\.PT_ENABLE_ATH_CLIENT !== true/.test(s) || n === '_athAccept'; }) && !/!window\.PT_ENABLE_ATH_CLIENT\b/.test(src) && /window\.PT_ENABLE_ATH_CLIENT !== true\) return '';/.test(rm));
  });

  // AC-2 prefetch contract
  await guard('AC-2', async () => {
    const responder = () => OK(); responder.hold = true;
    const f = makeFetch(responder);
    const c = buildClient(src, { PT_ENABLE_ATH_CLIENT: true }, f);
    const syms = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];
    const p = c._athPrefetchScan(syms);
    await flush();
    chk('AC-2', 'a promise exists for every scanned ticker immediately', syms.every(s => p[s] && typeof p[s].then === 'function'));
    chk('AC-2', 'at most 4 requests in flight before any settles', f.calls.length === 4);
    let maxOpen = f.calls.length;
    while (f.open.length) { f.open.shift()(); await flush(); maxOpen = Math.max(maxOpen, f.calls.length - (syms.length - f.open.length - (syms.length - f.calls.length))); }
    await Promise.all(Object.values(p)); await flush();
    chk('AC-2', 'exactly one ath-ensure per ticker, none twice, no retry', f.calls.length === 9 && syms.every(s => f.calls.filter(x => x.body === JSON.stringify({ ticker: s })).length === 1));
    chk('AC-2', 'every request is POST /.netlify/functions/ath-ensure with body exactly {ticker} and a 12 s timeout signal',
      f.calls.every(x => x.url === '/.netlify/functions/ath-ensure' && x.init.method === 'POST' && JSON.stringify(Object.keys(JSON.parse(x.body))) === '["ticker"]' && x.init.signal instanceof AbortSignal));
    chk('AC-2', 'the cache holds a verified entry for every ticker afterwards', syms.every(s => c.cache[s] && c.cache[s].state === 'verified'));
    // a thrown fetch -> unavailable, no retry
    const f2 = makeFetch(() => new Error('network down'));
    const c2 = buildClient(src, { PT_ENABLE_ATH_CLIENT: true }, f2);
    await Promise.all(Object.values(c2._athPrefetchScan(['T1']))); await flush();
    chk('AC-2', 'a thrown fetch -> unavailable, exactly one attempt', f2.calls.length === 1 && c2.cache.T1 && c2.cache.T1.state === 'unavailable');
    // ath-read once per ticker per page load
    const f3 = makeFetch(() => OK());
    const c3 = buildClient(src, { PT_ENABLE_ATH_CLIENT: true }, f3);
    c3.setActive('TST'); c3._cockpitResults.push(item());
    c3._athReadForView('TST'); c3._athReadForView('TST'); c3._athReadForView('tst'); await flush();
    chk('AC-2', 'ath-read: one request per ticker per page load, re-render once while the ticker is active', f3.calls.length === 1 && f3.calls[0].url === '/.netlify/functions/ath-read' && c3.__renders.join(',') === 'TST');
    c3.setActive('OTHER'); c3._athReadForView('AAA'); await flush();
    chk('AC-2', 'ath-read for a non-active ticker: fetched, no re-render', f3.calls.length === 2 && c3.__renders.length === 1);
  });

  // AC-3 / AC-4 / AC-9 / AC-11 the Technical Setup row
  await guard('AC-3', () => {
    const render = buildRenderer(src, rm);
    const row = rowOf(render(item(), { gate: true, cache: { TST: VERIFIED }, ext: PRE_EXT }));
    const d = (188.5 - 191.37) / 191.37 * 100;
    chk('AC-3', 'verified: value · date · distance at the DISPLAYED (PRE regular) price, "near" within 2 %', !!row && row.cls === 'neutral-v' && row.text === '191.37 USD · 2025-07-15 · ' + fmtPct(d) + ' · near');
    const above = rowOf(render(item(), { gate: true, cache: { TST: Object.assign({}, VERIFIED, { athValue: 180 }) } }));
    chk('AC-3', 'at / above the ATH -> "at / above" suffix, distance from the displayed price', !!above && above.text === '180.00 USD · 2025-07-15 · ' + fmtPct((PRICE - 180) / 180 * 100) + ' · at / above');
    const far = rowOf(render(item(), { gate: true, cache: { TST: Object.assign({}, VERIFIED, { athValue: 250 }) } }));
    chk('AC-3', 'far below -> no suffix', !!far && far.text === '250.00 USD · 2025-07-15 · ' + fmtPct((PRICE - 250) / 250 * 100));
    const noDataHtml = render(item({ _verifiedPrice: undefined, _verifiedChangePct: undefined }), { gate: true, cache: { TST: VERIFIED } });
    chk('AC-3', 'no verified market data -> the Technical Setup table (and so the row) is not rendered, as today', rowOf(noDataHtml) === null && noDataHtml.indexOf('1Y High Distance') === -1);
    chk('AC-3', 'the row appears exactly once, before the 1Y High Distance row', (() => { const h = render(item(), { gate: true, cache: { TST: VERIFIED } }); return countOf(h, 'All-time high') === 1 && h.indexOf('All-time high') < h.indexOf('1Y High Distance'); })());
  });
  await guard('AC-4', () => {
    const render = buildRenderer(src, rm);
    const review = rowOf(render(item(), { gate: true, cache: { TST: { state: 'review', athValue: null, athDate: null, currency: null } } }));
    chk('AC-4', 'stale-suspect -> "ATH under review"', !!review && review.text === 'ATH under review' && review.cls === 'neutral-v');
    const un = rowOf(render(item(), { gate: true, cache: { TST: { state: 'unavailable', athValue: null, athDate: null, currency: null } } }));
    const none = rowOf(render(item(), { gate: true, cache: {} }));
    chk('AC-4', 'unavailable / no entry -> "—"', !!un && un.text === '—' && !!none && none.text === '—');
    const oneY = fmtPct(panelSnap().high1yDist);
    chk('AC-4', 'the row never shows the 1Y High distance', [review, un, none].every(r => r && r.text.indexOf(oneY) === -1));
    chk('AC-4', 'the 1Y High Distance row is unchanged (−12 % -> neutral-v class as before)', render(item(), { gate: true, cache: {} }).indexOf('<span class="rr-lbl">1Y High Distance</span><span class="rr-val neutral-v">' + oneY + '</span>') !== -1);
  });
  await guard('AC-9', () => {
    const render = buildRenderer(src, rm);
    const row = rowOf(render(failedItem(), { gate: true, cache: { TST: VERIFIED } }));
    chk('AC-9', 'a failed (null-score) item still gets the ATH row with the value', !!row && row.text === '191.37 USD · 2025-07-15 · ' + fmtPct((PRICE - 191.37) / 191.37 * 100) + ' · near');
    const html = render(failedItem(), { gate: true, cache: { TST: VERIFIED } });
    chk('AC-9', 'the failed item still has no dial / chip (R-3 / R-5 behaviour kept)', countOf(html, 'at-dial-row') === 0 && countOf(html, 'ph-rating-chip') === 0);
  });
  await guard('AC-11', () => {
    const c = buildClient(src, { PT_ENABLE_ATH_CLIENT: true }, makeFetch(() => OK()));
    const ila = c._athAccept(OK({ ticker: 'TEVA.TA', athValue: 12345, athDate: '2025-01-02', unit: 'ILA', currency: 'ILS' }));
    chk('AC-11', 'ILA record -> ÷ 100, ILS', ila.state === 'verified' && ila.athValue === 123.45 && ila.currency === 'ILS');
    const render = buildRenderer(src, rm);
    const ta = item({ ticker: 'TEVA.TA', _verifiedPrice: 11000 });
    const row = rowOf(render(ta, { gate: true, cache: { 'TEVA.TA': ila } }));
    chk('AC-11', '.TA item: distance at the displayed ILS price (agorot ÷ 100 = 110.00)', !!row && row.text === '123.45 ILS · 2025-01-02 · ' + fmtPct((110 - 123.45) / 123.45 * 100));
    const usdOnTa = rowOf(render(ta, { gate: true, cache: { 'TEVA.TA': VERIFIED } }));
    const ilsOnUs = rowOf(render(item(), { gate: true, cache: { TST: Object.assign({}, VERIFIED, { currency: 'ILS' }) } }));
    chk('AC-11', 'currency mismatch (USD record on .TA, ILS record on a US ticker) -> "—"', !!usdOnTa && usdOnTa.text === '—' && !!ilsOnUs && ilsOnUs.text === '—');
    const block = buildBlock(src, bts, { 'TEVA.TA': ila })('TEVA.TA', panelSnap(), 'healthy_uptrend');
    chk('AC-11', 'AI line shows the ILS value', block.indexOf('  All-time high (verified): 123.45 ILS (2025-01-02)\n') !== -1);
  });

  // AC-5 AI line
  await guard('AC-5', () => {
    const snap = panelSnap();
    const withV = buildBlock(src, bts, { TST: VERIFIED })('TST', snap, 'healthy_uptrend');
    const noCache = buildBlock(src, bts)('TST', snap, 'healthy_uptrend');
    const LINE = '  All-time high (verified): 191.37 USD (2025-07-15)\n';
    chk('AC-5', 'verified -> exactly one "All-time high (verified)" line, nothing else changes', countOf(withV, LINE) === 1 && countOf(withV, 'All-time') === 1 && withV.replace(LINE, '') === noCache);
    chk('AC-5', 'the line is last, carries no distance / % and no 1Y value', withV.endsWith(LINE) && !/All-time[^\n]*%/.test(withV) && withV.split('\n').filter(l => /All-time/.test(l)).every(l => l.indexOf(fmtPct(snap.high1yDist)) === -1));
    chk('AC-5', 'the 1Y High Dist line is unchanged and never says all-time', withV.indexOf('  1Y High Dist: ' + fmtPct(snap.high1yDist)) !== -1 && !/1Y High Dist[^\n]*all-time/i.test(withV));
    for (const [label, cache] of [['review', { TST: { state: 'review' } }], ['unavailable', { TST: { state: 'unavailable' } }], ['other ticker only', { AAA: VERIFIED }], ['absent', undefined]]) {
      chk('AC-5', label + ' -> block byte-identical to the no-entry output (no "unavailable" line, no all-time wording)', buildBlock(src, bts, cache)('TST', snap, 'healthy_uptrend') === noCache && !/all-time/i.test(noCache));
    }
    chk('AC-5', 'signature unchanged: buildTechSnapshotBlock(sym, snap, setupState)', bts.startsWith('function buildTechSnapshotBlock(sym, snap, setupState) {'));
    chk('AC-5', 'empty snapshot still returns "" (no ATH line without a technical block)', buildBlock(src, bts, { TST: VERIFIED })('TST', {}, 'unknown') === '');
  });

  // AC-6 / AC-7 / AC-8 isolation statics
  await guard('AC-6', () => {
    for (const n of ['classifyTechnicalSetup', 'orchestrate', 'enforceScoreConsistency', '_isValidScanResult', 'mergeResultsByTicker', 'analyzeChunk', 'computeTechnicalSnapshot', '_techDeriveSnap']) {
      const s = extractFn(src, n) || '';
      chk('AC-6', n + ' has no ATH-client reference', s.length > 0 && !/\b_ath(?:Cache|Inflight|Accept|Fetch|PrefetchScan|ReadForView|Line|RowHtml)\b/.test(s));
    }
    for (const n of HELPERS) {
      const s = extractFn(src, n) || '';
      chk('AC-6', n + ' touches no _techCache / score / setup / storage / pt_* field', s.length > 0 && !/_techCache|sentiment_score|technical_setup|localStorage|sessionStorage|\bpt_[a-z]/.test(s));
    }
    chk('AC-6', 'the row block reads only _athCache, the displayed price and the item ticker (no setup / score / store)', !/sentiment_score|technical_setup|localStorage|_techCache|classifyTechnicalSetup/.test(ROW_BLOCK) && countOf(rm, ROW_BLOCK) === 1);
    chk('AC-6', 'index.html has no `_athCache` write outside _athFetch', countOf(src, '_athCache[t] = ') === 1 && (src.match(/_athCache\[[^\]]+\]\s*=(?!=)/g) || []).length === 1);
  });
  await guard('AC-7', () => {
    const all = HELPERS.map(n => extractFn(src, n) || '').join('\n') + '\n' + ROW_BLOCK;
    chk('AC-7', 'no web storage, cookie, URL or history use in the client or the row', !/localStorage|sessionStorage|indexedDB|document\.cookie|\blocation\b|\bhistory\b|URLSearchParams/.test(all));
    chk('AC-7', 'no token or auth header in the client', !/Authorization|token|cookie/i.test(all));
  });
  await guard('AC-8', () => {
    const refs = (rm.match(/\b_ath\w*\(/g) || []);
    chk('AC-8', 'renderMainPanel references no _ath* function (state read only)', refs.length === 0 && countOf(rm, '_athCache[item.ticker]') === 1);
    chk('AC-8', 'the ATH client functions are top-level and not called from renderMainPanel', HELPERS.every(n => !!extractFn(src, n) && rm.indexOf(n) === -1));
  });

  // AC-13 structure and AR-7f needles
  await guard('AC-13', () => {
    chk('AC-13', 'S2 table round-trips on renderMainPanel and buildTechSnapshotBlock', rmPre !== null && btsPre !== null && applyS2(rmPre, 'renderMainPanel') === rm && applyS2(btsPre, 'buildTechSnapshotBlock') === bts);
    chk('AC-13', 'forbidden ATH needles absent from index.html: ' + AR7F_FORBIDDEN.join(', '), AR7F_FORBIDDEN.every(n => src.indexOf(n) === -1));
    chk('AC-13', 'allowed needles present: ' + AR7F_ALLOWED.join(', '), AR7F_ALLOWED.every(n => src.indexOf(n) !== -1));
    chk('AC-13', 'the rr-lbl "Score" row is still exactly once in renderMainPanel', countOf(rm, '<span class="rr-lbl">Score</span>') === 1);
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
  { id: 'AC-1', label: 'gate check removed from _athFetch', f: s => mut(s, "  if (window.PT_ENABLE_ATH_CLIENT !== true) return null;\n  const t = String(sym || '').trim().toUpperCase();\n  if (!t) return null;\n  let body = null;", "  const t = String(sym || '').trim().toUpperCase();\n  if (!t) return null;\n  let body = null;") },
  { id: 'AC-2', label: 'a price added to the request body', f: s => mut(s, 'body: JSON.stringify({ ticker: t }), signal', 'body: JSON.stringify({ ticker: t, price: 1 }), signal') },
  { id: 'AC-3', label: 'distance from the scan price instead of the displayed price', f: s => mut(s, '      const _dispRaw = hasData ? _techPanelPrice(item) : null;', '      const _dispRaw = hasData ? item._verifiedPrice : null;') },
  { id: 'AC-4', label: '1Y High substituted for the review text', f: s => mut(s, "    if (_a && _a.state === 'review') _v = 'ATH under review';", "    if (_a && _a.state === 'review') _v = fmtPct(snap.high1yDist);") },
  { id: 'AC-5', label: 'an "unavailable" line emitted', f: s => mut(s, " : ''; // D-B4-2 = A: verified only, never the 1Y High, no distance", " : '  All-time high: unavailable\\n'; // D-B4-2 = A: verified only, never the 1Y High, no distance") },
  { id: 'AC-5', label: 'the 1Y High substituted in the AI line', f: s => mut(s, 'All-time high (verified): ${_ath.athValue.toFixed(2)} ${_ath.currency}', 'All-time high (verified): ${fmt(s.high1yDist)} ${_ath.currency}') },
  { id: 'AC-5', label: 'a distance appended to the AI line', f: s => mut(s, '${_ath.currency} (${_ath.athDate})\\n`', '${_ath.currency} (${_ath.athDate}) ${fmt(s.high1yDist)}\\n`') },
  { id: 'AC-6', label: '_athCache read by classifyTechnicalSetup', f: s => mut(s, 'function classifyTechnicalSetup(snap) {', "function classifyTechnicalSetup(snap) {\n  const _z = (typeof _athCache === 'object') ? _athCache : null;") },
  { id: 'AC-7', label: 'cache persisted to localStorage', f: s => mut(s, '  _athCache[t] = _athAccept(body);', "  _athCache[t] = _athAccept(body); localStorage.setItem('pt_ath_' + t, JSON.stringify(_athCache[t]));") },
  { id: 'AC-8', label: 'renderMainPanel calls the ATH client', f: s => mut(s, '    const _a = _athCache[item.ticker] || null;', '    const _a = _athCache[item.ticker] || _athReadForView(item.ticker) || null;') },
  { id: 'AC-9', label: 'row suppressed for a failed item', f: s => mut(s, "    if (window.PT_ENABLE_ATH_CLIENT !== true) return '';", "    if (window.PT_ENABLE_ATH_CLIENT !== true || item._aiUnavailable === true) return '';") },
  { id: 'AC-10', label: 'truthy gate check', f: s => mut(s, "  if (window.PT_ENABLE_ATH_CLIENT !== true) return null;\n  const t = String(sym || '').trim().toUpperCase();\n  if (!t) return null;\n  let body = null;", "  if (!window.PT_ENABLE_ATH_CLIENT) return null;\n  const t = String(sym || '').trim().toUpperCase();\n  if (!t) return null;\n  let body = null;") },
  { id: 'AC-11', label: 'ILA value left unconverted', f: s => mut(s, '? b.athValue / 100 : b.athValue; // agorot -> ILS (P-2A)', '? b.athValue : b.athValue; // agorot -> ILS (P-2A)') },
  { id: 'AC-12', label: 'action / budget stored on the record', f: s => mut(s, "      return { state: 'verified', athValue: v, athDate: b.athDate, currency: cur };", "      return { state: 'verified', athValue: v, athDate: b.athDate, currency: cur, action: b.action, budget: b.budget };") },
  { id: 'AC-12', label: 'stale-suspect recognised only inside an OK ath-read-v2 envelope', f: s => mut(s, "  if (b && b.recordStatus === 'stale-suspect') return { state: 'review'", "  if (b && b.status === 'OK' && b.readContractVersion === 'ath-read-v2' && b.recordStatus === 'stale-suspect') return { state: 'review'") }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };
  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const real = await evaluate(index);
  const order = ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-7', 'AC-8', 'AC-9', 'AC-10', 'AC-11', 'AC-12', 'AC-13'];
  for (const id of order) for (const c of (real[id] || [])) check(id + ' ' + c.name, c.ok);
  for (const g of order) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);
  const realClean = failures === 0;
  for (const n of NEGATIVES) {
    let mutated = null;
    try { mutated = n.f(index); } catch (e) { check('negative ' + n.id + ' (' + n.label + '): anchor unique — ' + e.message, false); continue; }
    const r = await evaluate(mutated);
    const bit = Array.isArray(r[n.id]) && r[n.id].some(c => !c.ok);
    check('negative ' + n.id + ' (' + n.label + ') is caught by ' + n.id + (realClean ? '' : ' [unproven: real run not clean]'), bit && realClean);
  }
  console.log(failures === 0
    ? 'ATH CLIENT OFFLINE: PASS (' + asserts + ' asserts)'
    : 'ATH CLIENT OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
