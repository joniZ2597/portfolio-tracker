#!/usr/bin/env node
'use strict';
/**
 * qa/pulse_analyst_view_offline.js — nlm-consistency-1 Slice 1 (R-5, Entry 37): Pulse vs Analyst separation.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL functions from index.html and runs them in
 * sandboxes (qa/no_synthetic_score_offline.js / qa/tech_snapshot_cache_offline.js patterns).
 *
 *   PA-1  dial / chip colour from the Pulse score band (65 green, 64 / 41 blue, 40 red, null = no-score style)
 *   PA-2  MRNA-type: 38 · hold_wait · Rating: Sell -> red dial, "hold wait", neutral "Analyst view · SELL · PT $80"
 *   PA-3  ROK-type: 62 · add_on_pullback · Rating: Neutral -> blue dial, "add on pullback", neutral analyst line
 *   PA-4  no Rating: -> no analyst line, no "Neutral" anywhere; Scan Results / Daily Review cells "—"; portfolio chip omitted
 *   PA-5  dial word and chip text equal the Action row's existing rendering for every action enum value
 *   PA-6  Daily Review membership identical to the pre-change (S1-reverted) function on a 20-ticker fixture with ties
 *   PA-7  equal scores keep source order; a different analyst rating never reorders; rRank gone
 *   PA-8  Ranked order unchanged (_ptScoreCmp)
 *   PA-9  the prompt (fetchAnthropicAnalysis) and RATING_SUMMARY_RE byte-identical
 *   PA-10 header chip NEEDS REVIEW / DATA UNAVAILABLE branches byte-identical and still rendered
 *   PA-11 R-3's "Analysis failed — rescan" group and membership unchanged; failed items show no dial / chip / analyst line
 *   Planted negatives NEG-1..NEG-11 mutate the production source (never the test).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const norm = s => s.replace(/\r\n/g, '\n');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };

// ── Pre-task pins (LF, captured at e8a4bab) ─────────────────────────────────────────────────────
const PIN_PROMPT_FN_LF = 'be916d0c24c40940d2cb9bc3338aba631292a708041003b15d7b28e1fddd70de'; // fetchAnthropicAnalysis (PA-9)
const RATING_RE_LINE = 'var RATING_SUMMARY_RE = /Rating:\\s*(Buy|Neutral|Sell)/i;';           // PA-9
const ACTION_ENUM = ['hold_wait', 'add_on_pullback', 'add_on_reclaim', 'add_on_breakout', 'trim', 'avoid', 'hold', 'buy'];
const PROMPT_ACTION_LINE = '"action":"hold_wait/add_on_pullback/add_on_reclaim/add_on_breakout/trim/avoid/hold"';
const FAILED_GROUP = 'Analysis failed — rescan';
const ACTION_RENDER = "_esc(item.action).replace(/_/g,' ')";

// ── S1 table (plan.md §6 / apply-s1.js): exact old -> new lines per function ────────────────────
const DIAL_LBL = "<div class=\"at-dial-lbl\">Score${_fromScan ? '<span style=\"margin-left:6px;text-transform:none;font-weight:400\">from scan</span>' : ''}</div>";
const S1 = {
  _srGroupResults: [
    { id: 'SG-1',
      oldS: "  const rRank = r => {\n    const m = (r.summary || '').match(RATING_SUMMARY_RE);\n    const v = r.rating || (m ? m[1] : 'Neutral');\n    return v.toLowerCase() === 'buy' ? 0 : v.toLowerCase() === 'sell' ? 2 : 1;\n  };\n  const items = source.slice().sort((a, b) => {\n    const d = _ptScoreCmp(a, b);\n    return d !== 0 ? d : rRank(a) - rRank(b);\n  });",
      newS: '  const items = source.slice().sort(_ptScoreCmp); // R-5 (Entry 37, ruling B1): Pulse-only ordering; equal scores keep source order' }
  ],
  openScanResultsOverlay: [
    { id: 'OV-1',
      oldS: "      // Use explicit r.rating field if present; fallback to summary regex (same method as renderMainPanel)\n      const rM     = (r.summary || '').match(RATING_SUMMARY_RE);\n      const rating = r.rating || (rM ? rM[1] : 'Neutral');\n      const rCls   = rating.toLowerCase() === 'buy' ? 'pos' : rating.toLowerCase() === 'sell' ? 'neg' : 'neutral-v';",
      newS: "      // Use explicit r.rating field if present; fallback to summary regex (same method as renderMainPanel); R-5 (Entry 37): no \"Neutral\" fallback\n      const rM     = (r.summary || '').match(RATING_SUMMARY_RE);\n      const rating = r.rating || (rM ? rM[1] : null);\n      const rCls   = 'neutral-v'; // R-5 (Entry 37): the analyst rating never colours the ranked cell" },
    { id: 'OV-2',
      oldS: '        <td class="r sr-score">${_vscCellHtml(score)}</td>\n        <td class="sr-rating ${rCls}">${rating.toUpperCase()}</td>',
      newS: '        <td class="r sr-score">${_vscCellHtml(score)}</td>\n        <td class="sr-rating ${rCls}">${rating ? rating.toUpperCase() : \'—\'}</td>' }
  ],
  _srRenderGrouped: [
    { id: 'SR-1',
      oldS: "      const rating = r.rating || (rM ? rM[1] : 'Neutral');\n      const rCls   = rating.toLowerCase() === 'buy' ? 'pos' : rating.toLowerCase() === 'sell' ? 'neg' : 'neutral-v';",
      newS: "      const rating = r.rating || (rM ? rM[1] : null); // R-5 (Entry 37): no \"Neutral\" fallback\n      const rCls   = 'neutral-v'; // R-5 (Entry 37): the analyst rating never colours the review cell" },
    { id: 'SR-2',
      oldS: '        <td class="r sr-score"><span>${_ptScoreText(score)}</span><div class="sr-score-track">${_ptScoreFillHtml(score)}</div></td>\n        <td class="sr-rating ${rCls}">${rating.toUpperCase()}</td>',
      newS: '        <td class="r sr-score"><span>${_ptScoreText(score)}</span><div class="sr-score-track">${_ptScoreFillHtml(score)}</div></td>\n        <td class="sr-rating ${rCls}">${rating ? rating.toUpperCase() : \'—\'}</td>' }
  ],
  renderMainPanel: [
    { id: 'RM-1', oldS: "  const rating = rM?rM[1]:'Neutral';", newS: "  const rating = rM ? rM[1] : null; // R-5 (Entry 37): no silent \"Neutral\" fallback" },
    { id: 'RM-2', oldS: "  const rCls   = rating.toLowerCase()==='buy'?'pos':rating.toLowerCase()==='sell'?'neg':'neutral-v';",
      newS: "  const _pulseBand = score === null ? 'neutral-v' : score >= 65 ? 'pos' : score <= 40 ? 'neg' : 'neutral-v'; // R-5 (Entry 37, ruling A1): the Pulse score band colours the dial and the chip" },
    { id: 'RM-3', oldS: "  const _dialColor = rCls === 'pos' ? 'var(--green2)' : rCls === 'neg' ? 'var(--red2)' : 'var(--blue2)';",
      newS: "  const _dialColor = _pulseBand === 'pos' ? 'var(--green2)' : _pulseBand === 'neg' ? 'var(--red2)' : 'var(--blue2)';" },
    { id: 'RM-4',
      oldS: '    ? `<div class="at-dial-row"><div class="${_dial.cls}" style="${_dial.style}"><span class="at-dial-num" style="color:${_dial.numColor}">${_ptScoreText(score)}</span></div><div>' + DIAL_LBL + '<div class="at-dial-val ${rCls}">${rating}</div></div></div>`',
      newS: '    ? `<div class="at-dial-row"><div class="${_dial.cls}" style="${_dial.style}"><span class="at-dial-num" style="color:${_dial.numColor}">${_ptScoreText(score)}</span></div><div>' + DIAL_LBL + '<div class="at-dial-val ${_pulseBand}">${item.action ? ' + ACTION_RENDER + " : ''}</div></div></div>`" },
    { id: 'RM-5', oldS: '          ? `<span class="ph-rating-chip ${rCls}">RATING · ${rating.toUpperCase()}</span>`',
      newS: '          ? `<span class="ph-rating-chip ${_pulseBand}">PULSE · ${' + ACTION_RENDER + '}</span>`' },
    { id: 'RM-6', oldS: '        ${_dialHtml}',
      newS: '        ${_dialHtml}\n        ${rating ? `<div class="at-analyst-line" style="margin-top:6px;font-family:var(--mono);font-size:10px;color:var(--text3)">Analyst view · ${rating.toUpperCase()} · PT ${pt}</div>` : \'\'}' },
    { id: 'RM-7',
      oldS: '        <div class="rr-table" style="margin-top:8px;border-top:1px solid var(--border2);padding-top:8px">\n          <div class="rr-row"><span class="rr-lbl">Rating</span><span class="rr-val ${rCls}">${rating.toUpperCase()} · PT ${pt}</span></div>\n        </div>',
      newS: '        ${rating ? `<div class="rr-table" style="margin-top:8px;border-top:1px solid var(--border2);padding-top:8px"><div class="rr-row"><span class="rr-lbl">Analyst view</span><span class="rr-val neutral-v">${rating.toUpperCase()} · PT ${pt}</span></div></div>` : \'\'}' }
  ],
  _renderPortfolioPanel: [
    { id: 'PP-1',
      oldS: "            var rCls = rM[1].toLowerCase() === 'buy' ? 'pos' : rM[1].toLowerCase() === 'sell' ? 'neg' : 'neutral-v';\n            var rEl = document.createElement('span');\n            rEl.className = 'pf-res-rating ' + rCls;\n            rEl.textContent = rM[1].toUpperCase();",
      newS: "            var rEl = document.createElement('span');\n            rEl.className = 'pf-res-rating neutral-v'; // R-5 (Entry 37): the analyst view is shown neutral; the Pulse view is the score\n            rEl.textContent = 'Analyst ' + rM[1].toUpperCase();" }
  ]
};
const TH = { oldS: '          <th>Rating</th>', newS: '          <th>Analyst</th>' };
function applyS1(fnSrc, name) {
  let out = fnSrc;
  for (const r of S1[name]) { if (countOf(out, r.oldS) !== 1) throw new Error('S1 old text not unique: ' + r.id); out = out.replace(r.oldS, () => r.newS); }
  return out;
}
function revertS1(fnSrc, name) {
  let out = fnSrc;
  for (const r of S1[name].slice().reverse()) { if (countOf(out, r.newS) !== 1) throw new Error('S1 new text not unique: ' + r.id); out = out.replace(r.newS, () => r.oldS); }
  return out;
}

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
function extractTopLevelFn(content, name) {   // prompt text carries unbalanced braces: column-0 closing brace rule
  const balanced = extractFn(content, name);
  if (balanced) return balanced;
  const start = content.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const realStart = (start >= 6 && content.slice(start - 6, start) === 'async ') ? start - 6 : start;
  const closeAt = content.indexOf('\n}\n', start);
  return closeAt === -1 ? null : content.slice(realStart, closeAt + 2);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const PRICE = 190.01;
const S = 'This is a valid synthetic summary body used purely for offline pin fixtures and exceeds fifty characters.';
const SUMMARY_NET = 'AI analysis unavailable — market data shown only. Technical panels reflect verified price and candle data. No AI-generated summary is available for this scan.';
function panelSnap() {
  return { sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 };
}
const item = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment_score: 70, sentiment: 'positive',
  summary: 'KEY EVENT: x. ACTIONABLE TAKE: hold. Rating: Buy | PT: $200', action: 'buy', technical_setup: 'healthy_uptrend',
  _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});
const failedItem = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment: 'neutral', sentiment_score: null, summary: SUMMARY_NET,
  alerts: [], news: [], _aiUnavailable: true, _aiParseFailed: false, _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});

// ── Scan Results sandbox (vm context with the real functions) ────────────────────────────────────
const SR_FNS = ['_ptScoreNorm', '_ptScoreText', '_ptScoreCmp', '_ptScoreStates', '_ptScoreFillHtml', '_vscCellHtml',
  '_srGroupResults', '_crEsc', '_srHeldMap', '_srHeldHtml', '_nlmConsistencyChecks', '_srRenderGrouped', 'openScanResultsOverlay']; // R-6 (Entry 14 s1): the renderers call the checker (brief S3.4 class c)
function buildScanResults(src, over) {
  const srcs = SR_FNS.map(n => (over && over[n]) ? over[n] : extractFn(src, n));
  if (srcs.some(s => !s)) throw new Error('scan results pieces missing');
  const state = { tbody: { innerHTML: '' } };
  const els = { scanResultsOverlay: { style: {} }, srRows: state.tbody, srCount: { textContent: '' } };
  const ctx = {
    console: quiet, _cockpitResults: [], _srMode: 'ranked', _srDensity: 'regular',
    RATING_SUMMARY_RE: /Rating:\s*(Buy|Neutral|Sell)/i,
    _SR_BULLISH_TIER: new Set(['healthy_uptrend', 'healthy_uptrend_near_ath', 'pullback_in_uptrend']),
    _SR_BEARISH_TIER: new Set(['breakdown_risk', 'below_key_mas']),
    document: { getElementById: id => els[id] || null },
    loadHoldings: () => ({}), _srSafeParseResults: () => []
  };
  vm.createContext(ctx);
  vm.runInContext(srcs.join('\n'), ctx);
  const render = (mode, results) => { ctx._cockpitResults = results; ctx._srMode = mode; state.tbody.innerHTML = ''; vm.runInContext('openScanResultsOverlay()', ctx); return state.tbody.innerHTML; };
  const group = results => { ctx.__in = results; return vm.runInContext('_srGroupResults(__in)', ctx); };
  const grouped = results => { state.tbody.innerHTML = ''; ctx.__in = results; vm.runInContext('_srRenderGrouped(__in, document.getElementById("srRows"))', ctx); return state.tbody.innerHTML; };
  const cmp = results => { ctx.__in = results; return vm.runInContext('__in.slice().sort(_ptScoreCmp)', ctx); };
  return { render, group, grouped, cmp };
}

// ── renderMainPanel harness (with(__scope), real helpers, neutral stubs) ─────────────────────────
function makeNeutral() {
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (typeof k === 'symbol') return undefined;
      if (k === 'then') return undefined;
      if (k === 'toString' || k === 'valueOf' || k === 'toJSON') return () => '';
      return p;
    },
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
  '_ptScoreNorm', '_ptScoreText', '_ptScoreDial', '_nlmConsistencyChecks']; // R-6 (Entry 14 s1): the checker renderMainPanel now calls (brief S3.4 class c)
function buildRenderer(src, rmSrc) {
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = RENDER_REAL.map(n => { const s = extractFn(src, n); if (!s) throw new Error('missing ' + n); return s; });
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  if (!ratingRe) throw new Error('RATING_SUMMARY_RE not found');
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  // render(item, { mktFailed }) -> innerHTML of #mainPanel
  return function render(it, opts) {
    const node = { innerHTML: '' };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      _techCache: { TST: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: panelSnap(), refInput: PRICE } },
      _extendedMktCache: {},
      _cockpitResults: [], _mktFailCache: (opts && opts.mktFailed) ? { TST: true } : {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(it);
    return node.innerHTML;
  };
}
// Parsers for the rendered panel
const DIAL_RE = /<div class="at-dial-row"><div class="([^"]*)" style="([^"]*)"><span class="at-dial-num" style="color:([^"]*)">([^<]*)<\/span><\/div><div><div class="at-dial-lbl">[\s\S]*?<\/div><div class="at-dial-val ([^"]*)">([^<]*)<\/div><\/div><\/div>/;
const dialOf = html => { const m = DIAL_RE.exec(html); return m ? { cls: m[1], style: m[2], numColor: m[3], num: m[4], wordCls: m[5], word: m[6], raw: m[0] } : null; };
const CHIP_RE = /<span class="ph-rating-chip ([^"]*)">([^<]*)<\/span>/;
const chipOf = html => { const m = CHIP_RE.exec(html); return m ? { cls: m[1], text: m[2] } : null; };
const ANALYST_RE = /<div class="at-analyst-line"([^>]*)>([^<]*)<\/div>/;
const analystOf = html => { const m = ANALYST_RE.exec(html); return m ? { attrs: m[1], text: m[2] } : null; };
const RESEARCH_RE = /<span class="rr-lbl">Analyst view<\/span><span class="rr-val ([^"]*)">([^<]*)<\/span>/;
const researchOf = html => { const m = RESEARCH_RE.exec(html); return m ? { cls: m[1], text: m[2] } : null; };
const ACTION_ROW_RE = /<span class="mp-act-lbl">Action<\/span><span class="mp-act-val">([^<]*)<\/span>/;
const actionRowOf = html => { const m = ACTION_ROW_RE.exec(html); return m ? m[1] : null; };
const CELL_RE = /<td class="sr-rating ([^"]*)">([^<]*)<\/td>/g;
const cellsOf = html => { const out = []; let m; CELL_RE.lastIndex = 0; while ((m = CELL_RE.exec(html))) out.push({ cls: m[1], text: m[2] }); return out; };
const tickersOf = html => (html.match(/data-ticker="([^"]+)"/g) || []).map(m => m.slice(13, -1));

// ── Evaluate every group on one source text ─────────────────────────────────────────────────────
function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = (id, fn) => { try { fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 200), false); } };
  const fns = {};
  for (const n of Object.keys(S1)) fns[n] = extractFn(src, n) || '';
  const pre = {};
  for (const n of Object.keys(S1)) { try { pre[n] = revertS1(fns[n], n); } catch (e) { pre[n] = null; } }
  const hasGroup = pre._srGroupResults !== null;

  // PA-1 band colours
  guard('PA-1', () => {
    const render = buildRenderer(src, fns.renderMainPanel);
    const table = [[65, 'pos', 'var(--green2)'], [64, 'neutral-v', 'var(--blue2)'], [41, 'neutral-v', 'var(--blue2)'], [40, 'neg', 'var(--red2)']];
    for (const [sc, cls, colour] of table) {
      const html = render(item({ sentiment_score: sc, action: 'hold_wait', summary: 'ACTIONABLE TAKE: x. Rating: Sell | PT: $80' }));
      const d = dialOf(html); const c = chipOf(html);
      chk('PA-1', sc + ': dial class and colour from the score band (' + cls + ', ' + colour + '), never from the analyst rating', !!d && d.wordCls === cls && d.numColor === colour && d.style.indexOf(colour) !== -1 && d.num === String(sc));
      chk('PA-1', sc + ': header chip class from the score band', !!c && c.cls === cls);
    }
    const html = render(item({ sentiment_score: null, action: 'hold_wait' }));
    const d = dialOf(html); const c = chipOf(html);
    chk('PA-1', 'null score (no failure marker): dashed no-score dial, neutral class, "—" number', !!d && d.cls === 'at-dial no-score' && d.style === '' && d.num === '—' && d.wordCls === 'neutral-v');
    chk('PA-1', 'null score: chip neutral, no green / red', !!c && c.cls === 'neutral-v');
  });

  // PA-2 MRNA-type
  guard('PA-2', () => {
    const render = buildRenderer(src, fns.renderMainPanel);
    const html = render(item({ sentiment_score: 38, action: 'hold_wait', summary: 'KEY EVENT: trial. ACTIONABLE TAKE: wait. Rating: Sell | PT: $80' }));
    const d = dialOf(html); const c = chipOf(html); const a = analystOf(html); const r = researchOf(html);
    chk('PA-2', 'red dial (neg, var(--red2)) showing 38', !!d && d.wordCls === 'neg' && d.numColor === 'var(--red2)' && d.num === '38');
    chk('PA-2', 'dial word is "hold wait" (the Action row rendering), not SELL', !!d && d.word === 'hold wait');
    chk('PA-2', 'header chip "PULSE · hold wait" in the neg class', !!c && c.cls === 'neg' && c.text === 'PULSE · hold wait');
    chk('PA-2', 'analyst line "Analyst view · SELL · PT $80" present once, neutral (no pos / neg class)', !!a && a.text === 'Analyst view · SELL · PT $80' && countOf(html, 'at-analyst-line') === 1 && !/\b(pos|neg)\b/.test(a.attrs));
    chk('PA-2', 'research row "Analyst view" reads "SELL · PT $80" in neutral-v', !!r && r.cls === 'neutral-v' && r.text === 'SELL · PT $80');
    chk('PA-2', 'no "RATING ·" chip and no "Rating" research label remain', html.indexOf('RATING ·') === -1 && html.indexOf('<span class="rr-lbl">Rating</span>') === -1);
  });

  // PA-3 ROK-type
  guard('PA-3', () => {
    const render = buildRenderer(src, fns.renderMainPanel);
    const html = render(item({ sentiment_score: 62, action: 'add_on_pullback', summary: 'ACTIONABLE TAKE: add. Rating: Neutral | PT: $350' }));
    const d = dialOf(html); const c = chipOf(html); const a = analystOf(html);
    chk('PA-3', 'blue dial (neutral-v, var(--blue2)) showing 62', !!d && d.wordCls === 'neutral-v' && d.numColor === 'var(--blue2)' && d.num === '62');
    chk('PA-3', 'dial word "add on pullback"', !!d && d.word === 'add on pullback');
    chk('PA-3', 'chip "PULSE · add on pullback" neutral', !!c && c.cls === 'neutral-v' && c.text === 'PULSE · add on pullback');
    chk('PA-3', 'analyst line "Analyst view · NEUTRAL · PT $350" neutral', !!a && a.text === 'Analyst view · NEUTRAL · PT $350' && !/\b(pos|neg)\b/.test(a.attrs));
  });

  // PA-4 no Rating:
  guard('PA-4', () => {
    const render = buildRenderer(src, fns.renderMainPanel);
    const html = render(item({ sentiment_score: 70, action: 'buy', summary: 'KEY EVENT: x. ACTIONABLE TAKE: buy the dip.' }));
    chk('PA-4', 'panel: no analyst line, no "Analyst view" research row', analystOf(html) === null && researchOf(html) === null && html.indexOf('Analyst view') === -1);
    const d4 = dialOf(html); const c4 = chipOf(html);
    chk('PA-4', 'panel: no "Neutral" fallback on any analyst surface (dial word, chip, analyst line, research row)',
      !!d4 && d4.word !== 'Neutral' && !!c4 && c4.text.indexOf('NEUTRAL') === -1 && html.indexOf('NEUTRAL · PT') === -1 && html.indexOf('· NEUTRAL') === -1 && html.indexOf('RATING · NEUTRAL') === -1);
    chk('PA-4', 'panel: the dial and the Pulse chip still render (score 70 -> pos)', !!dialOf(html) && dialOf(html).wordCls === 'pos' && !!chipOf(html) && chipOf(html).text === 'PULSE · buy');
    const sr = buildScanResults(src);
    const rows = [{ ticker: 'AAA', sentiment_score: 70, technical_setup: 'healthy_uptrend', summary: S }, { ticker: 'BBB', sentiment_score: 40, technical_setup: 'support_test', summary: S, rating: 'Sell' }];
    const ranked = cellsOf(sr.render('ranked', rows)); const review = cellsOf(sr.grouped(rows));
    chk('PA-4', 'Scan Results: no rating -> "—"; an explicit rating -> its text; both cells neutral-v', ranked.length === 2 && ranked[0].text === '—' && ranked[1].text === 'SELL' && ranked.every(c => c.cls === 'neutral-v'));
    chk('PA-4', 'Daily Review: same rule, neutral-v, no "NEUTRAL" fallback', review.length === 2 && review.some(c => c.text === '—') && review.some(c => c.text === 'SELL') && review.every(c => c.cls === 'neutral-v') && sr.grouped(rows).indexOf('NEUTRAL') === -1);
    const pp = fns._renderPortfolioPanel;
    chk('PA-4', 'portfolio panel: the analyst chip is created only inside the `if (rM)` guard, neutral, text "Analyst <RATING>"',
      countOf(pp, "rEl.className = 'pf-res-rating neutral-v';") === 1 && countOf(pp, "rEl.textContent = 'Analyst ' + rM[1].toUpperCase();") === 1 &&
      countOf(pp, "'pf-res-rating ' + rCls") === 0 && /if \(rM\) \{\s*var rEl = document\.createElement\('span'\);\s*rEl\.className = 'pf-res-rating neutral-v';/.test(pp));
    chk('PA-4', 'no `: \'Neutral\'` fallback remains in the five functions', Object.keys(S1).every(n => fns[n].indexOf("'Neutral'") === -1));
  });

  // PA-5 action rendering equality
  guard('PA-5', () => {
    const render = buildRenderer(src, fns.renderMainPanel);
    chk('PA-5', 'the prompt still offers the seven action enum values', countOf(src, PROMPT_ACTION_LINE) === 1);
    for (const act of ACTION_ENUM) {
      const html = render(item({ sentiment_score: 70, action: act, summary: 'ACTIONABLE TAKE: x. Rating: Buy | PT: $200' }));
      const d = dialOf(html); const c = chipOf(html); const row = actionRowOf(html);
      chk('PA-5', act + ': dial word === Action row rendering', !!d && row !== null && d.word === row && d.word === act.replace(/_/g, ' '));
      chk('PA-5', act + ': chip text === "PULSE · " + Action row rendering', !!c && row !== null && c.text === 'PULSE · ' + row);
    }
    chk('PA-5', 'static: the dial and chip use the Action row expression, no label map', countOf(fns.renderMainPanel, ACTION_RENDER) === 3 && !/hold_wait\s*:\s*'/.test(fns.renderMainPanel));
  });

  // PA-6 / PA-7 / PA-8 / PA-11 grouping and ordering
  const fixture20 = [
    { ticker: 'A', sentiment_score: 0,    technical_setup: 'support_test',      rating: 'Neutral', summary: S },
    { ticker: 'B', sentiment_score: 40,   technical_setup: 'support_test',      rating: 'Neutral', summary: S },
    { ticker: 'C', sentiment_score: null, technical_setup: 'support_test',      rating: 'Neutral', summary: S },
    { ticker: 'D', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
    { ticker: 'E', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Sell',    summary: S },
    { ticker: 'F', sentiment_score: 60,   technical_setup: 'healthy_uptrend',   rating: 'Neutral', summary: S },
    { ticker: 'G', sentiment_score: null, technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
    { ticker: 'H', sentiment_score: 0,    technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
    { ticker: 'I', sentiment_score: 80,   technical_setup: 'extended_near_ath', rating: 'Buy',     summary: S },
    { ticker: 'J', sentiment_score: 20,   technical_setup: 'below_key_mas',     rating: 'Sell',    summary: S },
    { ticker: 'K', sentiment_score: 80,   technical_setup: 'extended_near_ath', rating: 'Sell',    summary: S },
    { ticker: 'L', sentiment_score: 20,   technical_setup: 'breakdown_risk',    rating: 'Buy',     summary: S },
    { ticker: 'M', sentiment_score: 55,   technical_setup: 'pullback_in_uptrend', summary: 'Rating: Sell ' + S },
    { ticker: 'N', sentiment_score: 55,   technical_setup: 'pullback_in_uptrend', summary: 'Rating: Buy ' + S },
    { ticker: 'O', sentiment_score: 55,   technical_setup: 'healthy_uptrend_near_ath', summary: S },
    { ticker: 'P', sentiment_score: 54,   technical_setup: 'healthy_uptrend',   rating: 'Buy',     summary: S },
    { ticker: 'Q', sentiment_score: 40,   technical_setup: 'unknown',           rating: 'Sell',    summary: S },
    { ticker: 'R', sentiment_score: null, sentiment: 'neutral', technical_setup: 'healthy_uptrend', summary: SUMMARY_NET, _aiUnavailable: true },
    { ticker: 'T', sentiment_score: 50,   sentiment: 'neutral', technical_setup: 'below_key_mas',   summary: SUMMARY_NET, _aiUnavailable: true },
    { ticker: 'U', sentiment_score: 100,  technical_setup: 'healthy_uptrend',   rating: 'Sell',    summary: S }
  ];
  const ids = g => g.items.map(r => r.ticker).join(',');
  guard('PA-6', () => {
    const sr = buildScanResults(src);
    chk('PA-6', 'pre-change variant buildable (S1 table reverts cleanly)', hasGroup);
    if (!hasGroup) return;
    const preSr = buildScanResults(src, { _srGroupResults: pre._srGroupResults });
    const g = sr.group(fixture20); const pg = preSr.group(fixture20);
    chk('PA-6', 'five groups on both variants, same names in the same order', g.length === 5 && pg.length === 5 && g.map(x => x.name).join('|') === pg.map(x => x.name).join('|'));
    const set = x => x.items.map(r => r.ticker).sort().join(',');
    chk('PA-6', 'per-group membership (as a set) identical to the pre-change function on the 20-ticker fixture', g.every((x, i) => set(x) === set(pg[i])));
    // Membership of the real base function at e8a4bab (recorded once; the rules are untouched by S1): a changed rule fails here.
    const EXPECTED_SETS = ['D,E,F,M,N,O,U', 'A,B,C,G,H,P,Q', 'I,K', 'J,L', 'R,T'];
    chk('PA-6', 'per-group membership equals the recorded base membership (Strong Setup / Watch / Extended / Caution / failed)', g.map(set).join('|') === EXPECTED_SETS.join('|'));
    chk('PA-6', 'fixture sanity: every group non-empty and the fixture has score ties', g.every(x => x.items.length > 0));
  });
  guard('PA-7', () => {
    const sr = buildScanResults(src);
    const g = sr.group(fixture20);
    chk('PA-7', 'Strong Setup: equal scores keep source order (U, D,E,F, M,N,O)', ids(g[0]) === 'U,D,E,F,M,N,O');
    chk('PA-7', 'Watch: numeric first, then genuine zeros, then missing — source order within each tier (B,Q,P?..)', ids(g[1]).indexOf('A,H') !== -1 && ids(g[1]).indexOf('C,G') !== -1 && ids(g[1]).indexOf('H,A') === -1);
    const swapped = fixture20.map(r => r.ticker === 'E' ? Object.assign({}, r, { rating: 'Buy' }) : r.ticker === 'D' ? Object.assign({}, r, { rating: 'Sell' }) : r);
    chk('PA-7', 'changing the analyst ratings never reorders', ids(sr.group(swapped)[0]) === ids(g[0]) && ids(sr.group(swapped)[1]) === ids(g[1]));
    chk('PA-7', 'static: rRank and RATING_SUMMARY_RE are gone from _srGroupResults; the sort is _ptScoreCmp only',
      fns._srGroupResults.indexOf('rRank') === -1 && fns._srGroupResults.indexOf('RATING_SUMMARY_RE') === -1 && countOf(fns._srGroupResults, '.sort(_ptScoreCmp)') === 1);
    if (hasGroup) {
      const preSr = buildScanResults(src, { _srGroupResults: pre._srGroupResults });
      chk('PA-7', 'fixture sanity: the pre-change function reordered the D,E,F tie by rating (D,F,E)', ids(preSr.group(fixture20)[0]).indexOf('D,F,E') !== -1);
    }
  });
  guard('PA-8', () => {
    const sr = buildScanResults(src);
    const expected = sr.cmp(fixture20).map(r => r.ticker).join(',');
    chk('PA-8', 'Ranked order equals source.slice().sort(_ptScoreCmp)', tickersOf(sr.render('ranked', fixture20)).join(',') === expected);
    chk('PA-8', 'Ranked: 100 first, nulls last', expected.indexOf('U') === 0 && /(,C|,G|,R)/.test(expected.slice(-6)));
  });
  guard('PA-11', () => {
    const sr = buildScanResults(src);
    const g = sr.group(fixture20);
    const last = g[g.length - 1];
    chk('PA-11', 'the fifth group is named exactly "' + FAILED_GROUP + '" and is last', g.length === 5 && last.name === FAILED_GROUP);
    chk('PA-11', 'every _aiUnavailable item is in it (R before T? legacy 50 sorts first) and nowhere else', ids(last) === 'T,R' && g.slice(0, 4).every(x => x.items.every(r => r._aiUnavailable !== true)));
    const html = sr.grouped(fixture20);
    chk('PA-11', 'Daily Review renders the failed group header once, last', countOf(html, FAILED_GROUP) === 1 && html.lastIndexOf('sr-group-hdr') < html.indexOf(FAILED_GROUP));
    const render = buildRenderer(src, fns.renderMainPanel);
    const panel = render(failedItem());
    chk('PA-11', 'failed item panel: no dial, no Pulse chip, no analyst line', countOf(panel, 'at-dial-row') === 0 && countOf(panel, 'ph-rating-chip') === 0 && panel.indexOf('Analyst view') === -1);
    const ok = render(item());
    chk('PA-11', 'positive control: a normal item renders the dial, the Pulse chip and the analyst line once each', countOf(ok, 'at-dial-row') === 1 && countOf(ok, 'ph-rating-chip') === 1 && countOf(ok, 'at-analyst-line') === 1);
  });

  // PA-9 prompt and regex untouched
  guard('PA-9', () => {
    const fa = extractTopLevelFn(src, 'fetchAnthropicAnalysis') || '';
    chk('PA-9', 'fetchAnthropicAnalysis is byte-identical to the baseline (LF pin)', sha256(fa) === PIN_PROMPT_FN_LF);
    chk('PA-9', 'RATING_SUMMARY_RE line is byte-identical and occurs once', countOf(src, RATING_RE_LINE) === 1);
    chk('PA-9', 'the prompt still ends the summary with "Rating: Buy/Neutral/Sell"', fa.indexOf('Rating: Buy/Neutral/Sell') !== -1);
  });

  // PA-10 NEEDS REVIEW / DATA UNAVAILABLE branches
  guard('PA-10', () => {
    const rm = fns.renderMainPanel;
    chk('PA-10', 'NEEDS REVIEW branch line byte-identical, once', countOf(rm, '            ? `<span class="ph-rating-chip warn">NEEDS REVIEW</span>`') === 1);
    chk('PA-10', 'DATA UNAVAILABLE branch line byte-identical, once', countOf(rm, '              ? `<span class="ph-rating-chip err">DATA UNAVAILABLE</span>`') === 1);
    chk('PA-10', 'chip condition lines byte-identical', countOf(rm, '        ${item.action && hasData && !_mktFailed') === 1 && countOf(rm, '          : item.action && _mktFailed && hasData') === 1 && countOf(rm, '            : item.action && !hasData') === 1);
    const render = buildRenderer(src, rm);
    const failed = chipOf(render(item(), { mktFailed: true }));
    chk('PA-10', 'render: market-data failure -> NEEDS REVIEW (warn)', !!failed && failed.cls === 'warn' && failed.text === 'NEEDS REVIEW');
    const nodata = chipOf(render(item({ _verifiedPrice: undefined, _verifiedChangePct: undefined })));
    chk('PA-10', 'render: no verified data -> DATA UNAVAILABLE (err)', !!nodata && nodata.cls === 'err' && nodata.text === 'DATA UNAVAILABLE');
  });

  // PA-12 (structural) the S1 table round-trips and the static header reads "Analyst"
  guard('PA-12', () => {
    for (const n of Object.keys(S1)) {
      chk('PA-12', n + ': the S1 table reverts cleanly and re-applies byte-for-byte', pre[n] !== null && applyS1(pre[n], n) === fns[n]);
    }
    chk('PA-12', 'static overlay header: "<th>Analyst</th>" once, "<th>Rating</th>" gone', countOf(src, TH.newS) === 1 && countOf(src, TH.oldS) === 0);
    chk('PA-12', 'no new top-level function: the S1 lines name no function', Object.keys(S1).every(n => S1[n].every(r => !/\bfunction\b/.test(r.newS))));
    chk('PA-12', 'renderMainPanel: the band const exists once and is not named rs / rsCls', countOf(fns.renderMainPanel, 'const _pulseBand = ') === 1 && !/\bconst rs\s|\brsCls\b/.test(fns.renderMainPanel));
  });
  return R;
}

// ── Planted negatives (mutations on the production source text) ─────────────────────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + from.slice(0, 70));
  return text.replace(from, () => to);
}
const rm = n => S1.renderMainPanel.find(r => r.id === n).newS;
const NEGATIVES = [
  { id: 'PA-1', label: 'dial / chip colour from the analyst rating restored', f: s => mut(s, rm('RM-2'), "  const _pulseBand = rating === 'Buy' ? 'pos' : rating === 'Sell' ? 'neg' : 'neutral-v';") },
  { id: 'PA-2', label: 'dial word = the analyst rating', f: s => mut(s, '<div class="at-dial-val ${_pulseBand}">${item.action ? ' + ACTION_RENDER + " : ''}</div>", '<div class="at-dial-val ${_pulseBand}">${rating}</div>') },
  { id: 'PA-3', label: 'analyst line coloured by the rating', f: s => mut(s, 'Analyst view · ${rating.toUpperCase()} · PT ${pt}</div>', 'Analyst view · <span class="${rating === \'Sell\' ? \'neg\' : \'pos\'}">${rating.toUpperCase()}</span> · PT ${pt}</div>') },
  { id: 'PA-4', label: '"Neutral" fallback restored in renderMainPanel', f: s => mut(s, rm('RM-1'), "  const rating = rM ? rM[1] : 'Neutral'; // R-5 (Entry 37): no silent \"Neutral\" fallback") },
  { id: 'PA-4', label: '"Neutral" fallback restored in the Daily Review cell', f: s => mut(s, "      const rating = r.rating || (rM ? rM[1] : null); // R-5 (Entry 37): no \"Neutral\" fallback", "      const rating = r.rating || (rM ? rM[1] : 'Neutral'); // R-5 (Entry 37): no \"Neutral\" fallback") },
  { id: 'PA-4', label: '"Neutral" fallback restored in the ranked cell', f: s => mut(s, "      const rating = r.rating || (rM ? rM[1] : null);\n      const rCls   = 'neutral-v'; // R-5 (Entry 37): the analyst rating never colours the ranked cell", "      const rating = r.rating || (rM ? rM[1] : 'Neutral');\n      const rCls   = 'neutral-v'; // R-5 (Entry 37): the analyst rating never colours the ranked cell") },
  { id: 'PA-4', label: 'portfolio chip coloured again', f: s => mut(s, "            rEl.className = 'pf-res-rating neutral-v'; // R-5 (Entry 37): the analyst view is shown neutral; the Pulse view is the score", "            rEl.className = 'pf-res-rating ' + rCls;") },
  { id: 'PA-5', label: 'a new label map for the dial word', f: s => mut(s, '<div class="at-dial-val ${_pulseBand}">${item.action ? ' + ACTION_RENDER + " : ''}</div>", "<div class=\"at-dial-val ${_pulseBand}\">${item.action ? ({hold_wait:'WAIT',buy:'BUY'}[item.action] || item.action) : ''}</div>") },
  { id: 'PA-6', label: 'a group rule changed (Strong Setup threshold 55 -> 50)', f: s => mut(s, 'sc !== null && sc >= 55)  groups[0].items.push(r);', 'sc !== null && sc >= 50)  groups[0].items.push(r);') },
  { id: 'PA-7', label: 'rRank tie-break restored', f: s => mut(s, S1._srGroupResults[0].newS, S1._srGroupResults[0].oldS) },
  { id: 'PA-9', label: 'prompt rating vocabulary edited', f: s => mut(s, 'Summary MUST end: "Rating: Buy/Neutral/Sell', 'Summary MUST end: "Rating: Buy/Hold/Sell') },
  { id: 'PA-9', label: 'RATING_SUMMARY_RE edited', f: s => mut(s, RATING_RE_LINE, 'var RATING_SUMMARY_RE = /Rating:\\s*(Buy|Hold|Sell)/i;') },
  { id: 'PA-10', label: 'NEEDS REVIEW branch changed', f: s => mut(s, 'NEEDS REVIEW</span>', 'NEEDS A REVIEW</span>') },
  { id: 'PA-11', label: 'failed group merged into Watch', f: s => mut(s, 'if (r._aiUnavailable === true)                groups[4].items.push(r);', 'if (r._aiUnavailable === true)                groups[1].items.push(r);') }
  // "no new top-level function anywhere" is owned by qa/no_synthetic_score_offline.js NS-11 (PRE_MASKED_FIVE) and
  // qa/ma_stack_label_offline.js MS-8; PA-12 only checks the S1 table itself and the static header.
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
(() => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };
  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const real = evaluate(index);
  const order = ['PA-1', 'PA-2', 'PA-3', 'PA-4', 'PA-5', 'PA-6', 'PA-7', 'PA-8', 'PA-9', 'PA-10', 'PA-11', 'PA-12'];
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
    ? 'PULSE ANALYST VIEW OFFLINE: PASS (' + asserts + ' asserts)'
    : 'PULSE ANALYST VIEW OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
