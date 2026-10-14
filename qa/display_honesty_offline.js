'use strict';
/*
 * display_honesty_offline.js — display-honesty-1 (CB-3 part 1; PA-03 + PA-12). Offline: no network, no browser, no storage, no file writes.
 *   DH-1 header change amount = price - price/(1+chg%)  (FROG 97.52, -4.61% -> 4.71, not 4.50)
 *   DH-2 same with the TASE agorot -> ILS division; US figure         DH-3 1+chg/100 <= 0 -> dash; null chg -> the existing dash
 *   DH-4 Actionable Take "Updated:" shows the result's own time (60-day-old result)
 *   DH-5 today's result: equals the header "updated" time; no timestamp -> dash
 * The REAL renderMainPanel is extracted from index.html (LF and CRLF both load) with the qa/tase_units_offline.js harness.
 * Planted negatives mutate an in-memory COPY of the source, never the file on disk.
 */
const fs = require('fs');
const path = require('path');
const core = require('./lib/index-pins-core');

const SRC = core.normalizeText(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
const countOf = (h, n) => (n ? h.split(n).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── extraction (qa/tase_units_offline.js pattern) ──────────────────────────────────────────────────
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error('function not uniquely extractable: ' + name + ' (' + hit.length + ')');
  return hit[0].text;
}
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
    const map = {
      window: win,
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: { [it.ticker]: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: opts.snap || US_SNAP, refInput: it._verifiedPrice } },
      _extendedMktCache: {}, _athCache: {},
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
const US_SNAP = snapOf(1);
const TA_SNAP = snapOf(100);
const mkItem = (ticker, price, chg, ts) => {
  const it = { ticker, company_name: 'Test Co', sentiment_score: 70, sentiment: 'positive',
    summary: 'KEY EVENT: x. ACTIONABLE TAKE: hold. Rating: Buy | PT: $200', action: 'buy', technical_setup: 'healthy_uptrend',
    _verifiedPrice: price, _verifiedChangePct: chg };
  if (ts) it._timestamp = ts;
  return it;
};
const grab = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };
const chgText = html => grab(html, /<span class="ph-chg [^"]*">([^<]*)<\/span>/);
const takeUpdated = html => grab(html, /<div class="mp-action-time"[^>]*>Updated: ([^<]*)<\/div>/);
const headerUpdated = html => grab(html, /<span class="ph-updated[^"]*">updated ([^<]*)<\/span>/);
const hhmm = d => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const eq = (a, b, m) => { if (a !== b) throw new Error(m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };

// ── rows ───────────────────────────────────────────────────────────────────────────────────────────
const ROWS = [];
const row = (id, label, fn) => ROWS.push({ id, label, fn });

row('DH-1', 'FROG 97.52 / -4.61% -> header change ▼4.71 (-4.61%), not ▼4.50', src => {
  const r = buildRenderer(src);
  eq(chgText(r(mkItem('FROG', 97.52, -4.61))), '▼4.71 (-4.61%)', 'FROG change');
});
row('DH-2', '.TA 8884 agorot / +0.95% -> ▲0.84; US 226.73 / +0.95% -> ▲2.13', src => {
  const r = buildRenderer(src);
  eq(chgText(r(mkItem('MTRX.TA', 8884, 0.95), { snap: TA_SNAP })), '▲0.84 (+0.95%)', '.TA change');
  eq(chgText(r(mkItem('NVDA', 226.73, 0.95))), '▲2.13 (+0.95%)', 'US change');
});
row('DH-3', 'chg -100 -> dash (no Infinity / NaN); chg null -> the existing dash', src => {
  const r = buildRenderer(src);
  const t = chgText(r(mkItem('FROG', 97.52, -100)));
  if (/Infinity|NaN/.test(String(t))) throw new Error('chg -100 rendered ' + JSON.stringify(t));
  if (!/^▼— /.test(String(t))) throw new Error('chg -100: got ' + JSON.stringify(t) + ' want the amount replaced by a dash');
  const n = chgText(r(mkItem('FROG', 97.52, null)));
  if (/Infinity|NaN/.test(String(n))) throw new Error('chg null rendered ' + JSON.stringify(n));
  eq(n, '—', 'chg null');
});
row('DH-4', '60-day-old result -> Actionable Take reads "Updated: <Mon D · time>" of that timestamp, never today\'s time', src => {
  const r = buildRenderer(src);
  const d = new Date(Date.now() - 60 * 86400000);
  const want = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + hhmm(d);
  const html = r(mkItem('FROG', 97.52, -4.61, d.toISOString()));
  eq(takeUpdated(html), want, 'Actionable Take Updated');
  eq(headerUpdated(html), want, 'header updated');
});
row('DH-5', 'today\'s result -> Updated equals the header "updated" time; no timestamp -> "Updated: —"', src => {
  const r = buildRenderer(src);
  const d = new Date();
  const html = r(mkItem('FROG', 97.52, -4.61, d.toISOString()));
  eq(takeUpdated(html), hhmm(d), 'today Updated');
  eq(takeUpdated(html), headerUpdated(html), 'Updated vs header');
  eq(takeUpdated(r(mkItem('FROG', 97.52, -4.61))), '—', 'no timestamp');
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
const E1_NEW = "((1 + chg/100) > 0 ? Math.abs((_displayPriceBase - _displayPriceBase / (1 + chg/100)) / _pxDiv).toFixed(2) : '—')";
const E1_OLD = 'Math.abs(chg * _displayPriceBase/100 / _pxDiv).toFixed(2)';
const E1_NOGUARD = 'Math.abs((_displayPriceBase - _displayPriceBase / (1 + chg/100)) / _pxDiv).toFixed(2)';
const E2_NEW = 'Updated: ${lastUpdated || \'—\'}';
const E2_OLD = "Updated: ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}";
const NEGS = [
  { id: 'DH-N1', row: 'DH-1', label: 'E-1 reverted (price x %)', f: s => mut(s, E1_NEW, E1_OLD) },
  { id: 'DH-N2', row: 'DH-3', label: 'guard removed (1 + chg/100 <= 0 divides by zero)', f: s => mut(s, E1_NEW, E1_NOGUARD) },
  { id: 'DH-N3', row: 'DH-4', label: 'E-2 reverted (render-time clock)', f: s => mut(s, E2_NEW, E2_OLD) }
];
for (const n of NEGS) {
  let bit = null;
  try { bit = evaluate(n.f(SRC))[n.row]; } catch (e) { bit = 'setup: ' + e.message; }
  if (bit !== null && String(bit).indexOf('setup:') !== 0) console.log('  PASS  negative caught: ' + n.id + ' ' + n.label + ' → ' + n.row + ' fails (' + String(bit).split('\n')[0].slice(0, 90) + ')');
  else { failed += 1; console.log('  FAIL  negative NOT caught: ' + n.id + ' ' + n.label + ' (' + n.row + ': ' + (bit === null ? 'still passes' : bit) + ')'); }
}
console.log(failed === 0 ? '  PASS  ' + ROWS.length + ' display-honesty assertion(s) passed' : '  FAIL  ' + failed + ' of ' + ROWS.length + ' display-honesty assertion(s) failed');
process.exit(failed === 0 ? 0 : 1);
