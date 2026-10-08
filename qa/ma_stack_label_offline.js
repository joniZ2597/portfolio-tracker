'use strict';

/*
 * MS — claim "20 > 50 > 150" only when the averages are actually stacked (R-2, BACKLOG Entry 35).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL renderMainPanel and its helpers
 * from index.html and executes them verbatim in the same `with (__scope)` render harness as
 * qa/tech_snapshot_cache_offline.js (buildRenderer) — never a re-implementation.
 *
 * Rows MS-1..MS-8 map 1:1 to brief work/r2-ma-stack/brief.md section 5.
 *   MS-1 stacked snapshot        -> today's text, byte-identical
 *   MS-2 ROK snapshot            -> "not fully stacked" text
 *   MS-3 equal averages          -> not stacked (strict >)
 *   MS-4 missing / NaN average   -> "Healthy uptrend — price above key moving averages"
 *   MS-5 every other setup       -> _tsAssessMap text (or nothing); unknown -> nothing
 *   MS-6 the stack test reads _panelSnap, never item.* / stored fields
 *   MS-7 renderMainPanel diff confined to the _tsAssess region; the R-2 revert table reproduces the pre-task source
 *        (after R-3, Entry 36, the later Score-row line is reverted first: revertR2(revertR3(rm)))
 *   MS-8 no new top-level function; classifyTechnicalSetup and the _tsAssessMap literal byte-identical
 *
 * Planted negatives mutate an in-memory copy of the production source (never the test) and the
 * named group must then FAIL. All text is compared LF-normalised; the CRLF form is derived.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

const norm = s => s.replace(/\r\n/g, '\n');
const crlf = s => norm(s).replace(/\n/g, '\r\n');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quietConsole = { log() {}, warn() {}, error() {} };

// ── Baseline values, captured at e7bbbbb (LF-normalised unless stated) ──────────────────────
// Pre-task renderMainPanel: LF form = the TS1 TX-3 pin, CRLF form = the caliper pin at e7bbbbb.
const PRE_RM_LF = 'ed2c8bdcac6070d442241c4138b5f3ed155794b378d34349ac20cf0dc25aae2a';
const PRE_RM_CRLF = 'aea925b1775bef6c1475ff00979dda4c12cdead55e49b45d8045175052654254';
const PIN_CLASSIFY_LF = 'c143eb08d982cff036dd5678def08dc38e7dede6e2a0f4ae11a79d277e3ab3ad';
// The `const _tsAssessMap = {...};` literal (regex-extracted, whole statement).
const PIN_TSASSESSMAP_LF = '79b78d1ed91f3d6f8c2b867378a1a228f83399c8931ddd150eea31143bb3a31e';
// index.html with renderMainPanel masked out: nothing outside the function changes in this task
// (hence no new top-level function anywhere).
const PIN_MASKED_MINUS_RM_LF = '96dfb952d9b9aa9ea1df3e9ea626fcfb0a3a27b3bfe26a2dbd4c07c5a7583189'; // re-pinned at R-3 (Entry 36)

// ── R-2 table: the one pre-task line and the four task lines (whole lines, exact bytes) ──────
const R2_OLD = "  const _tsAssess = _panelSetup !== 'unknown' ? (_tsAssessMap[_panelSetup] || '') : '';";
const R2_NEW = [
  "  const _maStackKey = _panelSetup === 'healthy_uptrend' || _panelSetup === 'bullish_stack'; // R-2 (Entry 35): the two setups whose text claims a stack",
  "  const _maStackAll = [_panelSnap.sma20, _panelSnap.sma50, _panelSnap.sma150].every(Number.isFinite);",
  "  const _maStacked  = _maStackAll && _panelSnap.sma20 > _panelSnap.sma50 && _panelSnap.sma50 > _panelSnap.sma150;",
  "  const _tsAssess = _panelSetup === 'unknown' ? '' : !_maStackKey ? (_tsAssessMap[_panelSetup] || '') : _maStacked ? (_tsAssessMap[_panelSetup] || '') : _maStackAll ? 'Price above all key moving averages — healthy uptrend; averages not fully stacked' : 'Healthy uptrend — price above key moving averages';"
];
const R2_BLOCK = R2_NEW.join('\n');
const TEXT_STACKED = '20 > 50 > 150 — Healthy uptrend, price above key moving averages';
const TEXT_NOT_STACKED = 'Price above all key moving averages — healthy uptrend; averages not fully stacked';
const TEXT_MISSING = 'Healthy uptrend — price above key moving averages';

function applyR2(preRm) {
  if (countOf(preRm, R2_OLD) !== 1) throw new Error('R-2 old line not unique');
  return preRm.replace(R2_OLD, () => R2_BLOCK);
}
function revertR2(taskRm) {
  if (countOf(taskRm, R2_BLOCK) !== 1) throw new Error('R-2 block not present exactly once');
  return taskRm.replace(R2_BLOCK, () => R2_OLD);
}
// ── R-3 table (work/r3-no-synthetic-50/brief.md section 2.6, Entry 36): the one Score-row line changed after R-2 ──
const R3_FROM_SCAN = "${_fromScan ? '<span style=\"color:var(--text3);font-size:10px;margin-left:6px\">from scan</span>' : ''}";
const R3_OLD = '          <div class="rr-row"><span class="rr-lbl">Score</span><span class="rr-val ${score>=65?\'pos\':score>=40?\'warn\':\'neg\'}">${score} / 100' + R3_FROM_SCAN + '</span></div>';
const R3_NEW = '          <div class="rr-row"><span class="rr-lbl">Score</span><span class="rr-val ${score===null?\'neutral-v\':score>=65?\'pos\':score>=40?\'warn\':\'neg\'}">${score===null?\'—\':`${score} / 100' + R3_FROM_SCAN + '`}</span></div>';
function applyR3(rm) {
  if (countOf(rm, R3_OLD) !== 1) throw new Error('R-3 old line not unique');
  return rm.replace(R3_OLD, () => R3_NEW);
}
function revertR3(taskRm) {
  if (countOf(taskRm, R3_NEW) !== 1) throw new Error('R-3 line not present exactly once');
  return taskRm.replace(R3_NEW, () => R3_OLD);
}

// ── Source extraction (same rule as qa/tech_snapshot_cache_offline.js) ──────────────────────
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
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(realStart, i + 1);
    }
  }
  return null;
}
function maskFn(content, name) {
  const s = extractFn(content, name);
  if (!s) return null;
  const i = content.indexOf(s);
  return content.slice(0, i) + '/*MASKED*/' + content.slice(i + s.length);
}

// ── Render harness (qa/tech_snapshot_cache_offline.js buildRenderer pattern) ────────────────
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
    apply() { return p; },
    construct() { return p; },
    set() { return true; },
    has() { return true; }
  });
  return p;
}
const NEUTRAL = makeNeutral();
function makeScope(map) {
  return new Proxy({}, {
    has(t, k) {
      if (typeof k === 'symbol') return false;
      if (k in map) return true;
      if (k in globalThis) return false;
      return true;
    },
    get(t, k) {
      if (k === Symbol.unscopables) return undefined;
      if (k in map) return map[k];
      return NEUTRAL;
    },
    set(t, k, v) { map[k] = v; return true; }
  });
}
const RENDER_REAL = ['hasVerifiedMarketData', '_techPanelPrice', '_techSnapFor', '_techRefInput', 'classifyTechnicalSetup',
  '_ptScoreNorm', '_ptScoreText', '_ptScoreDial'];
function buildRenderer(src) {
  const rmSrc = extractFn(src, 'renderMainPanel');
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = [];
  for (const n of RENDER_REAL) {
    const s = extractFn(src, n);
    if (!s) throw new Error('missing ' + n);
    helpers.push(s);
  }
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  if (!ratingRe) throw new Error('RATING_SUMMARY_RE not found');
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  // render(item, snap) -> innerHTML of #mainPanel; the fixture snapshot is cached for the item's price.
  return function render(item, snap) {
    const node = { innerHTML: '' };
    const cache = snap === null ? {} : { TST: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap, refInput: item._verifiedPrice } };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quietConsole,
      _techCache: cache,
      _extendedMktCache: {},
      _cockpitResults: [],
      _mktFailCache: {},
      findTicker: () => null,
      refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(item);
    return node.innerHTML;
  };
}
const assessOf = html => { const m = /<div class="ts-assess">([^<]*)<\/div>/.exec(html); return m ? m[1] : null; };
const assessCount = html => countOf(html, '<div class="ts-assess">');

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
const PRICE = 190.01;
const pct = (price, sma) => (Number.isFinite(sma) && sma > 0 ? (price - sma) / sma * 100 : null);
// A snapshot in the production key set; the distances follow the averages unless overridden.
function mkSnap(sma20, sma50, sma150, over) {
  const price = (over && over.price) || PRICE;
  const s = {
    sma20, sma50, sma150, sma200: 150,
    pct20: pct(price, sma20), pct50: pct(price, sma50), pct150: pct(price, sma150), pct200: pct(price, 150),
    hasMA20: sma20 != null, hasMA50: sma50 != null, hasMA150: sma150 != null, hasMA200: true,
    volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3
  };
  return Object.assign(s, over || {});
}
const mkItem = over => Object.assign({ ticker: 'TST', sentiment_score: 70, sentiment: 'positive', summary: 'Rating: Buy', action: 'buy',
  technical_setup: 'healthy_uptrend', _verifiedPrice: PRICE, _verifiedChangePct: 1.2 }, over || {});

const STACKED = () => mkSnap(180, 170, 160);                                   // 20 > 50 > 150
const ROK = () => mkSnap(428.11, 437.80, 429.35, { price: 445 });               // pilot 2026-10-03: MA20 < MA150 < MA50
const EQUAL = () => mkSnap(180, 180, 160);                                     // 20 = 50 > 150

// ── Evaluate every group on one source text ─────────────────────────────────────────────────
function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = (id, fn) => { try { fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 160), false); } };

  const rm = extractFn(src, 'renderMainPanel') || '';
  const classifySrc = extractFn(src, 'classifyTechnicalSetup') || '';
  const classify = classifySrc ? new Function(classifySrc + '\nreturn classifyTechnicalSetup;')() : () => null;
  const mapStmt = /const _tsAssessMap = (\{[\s\S]*?\n {2}\});/.exec(rm);
  const assessMap = mapStmt ? new Function('return ' + mapStmt[1])() : {};
  let render = null;
  try { render = buildRenderer(src); } catch (e) { chk('MS-1', 'render harness buildable: ' + e.message, false); }
  const renderOf = (item, snap) => (render ? render(item, snap) : '');

  // MS-1 stacked -> today's text, byte-identical
  guard('MS-1', () => {
    const snap = STACKED();
    chk('MS-1', 'fixture classifies healthy_uptrend', classify(snap) === 'healthy_uptrend');
    const text = assessOf(renderOf(mkItem(), snap));
    chk('MS-1', 'stacked snapshot shows today\'s text byte-identical', text === TEXT_STACKED);
    chk('MS-1', 'today\'s text is the _tsAssessMap.healthy_uptrend value', text === assessMap.healthy_uptrend);
    chk('MS-1', 'bullish_stack shares the same map text and the stack-key test names both keys',
      assessMap.bullish_stack === TEXT_STACKED && countOf(rm, "_panelSetup === 'healthy_uptrend' || _panelSetup === 'bullish_stack'") === 1);
    chk('MS-1', 'exactly one assessment div is rendered', assessCount(renderOf(mkItem(), snap)) === 1);
  });

  // MS-2 ROK -> "not fully stacked"
  guard('MS-2', () => {
    const snap = ROK();
    chk('MS-2', 'ROK fixture classifies healthy_uptrend (price above all three)', classify(snap) === 'healthy_uptrend');
    const text = assessOf(renderOf(mkItem({ _verifiedPrice: 445 }), snap));
    chk('MS-2', 'ROK snapshot (428.11 / 437.80 / 429.35) shows the "not fully stacked" text', text === TEXT_NOT_STACKED);
    chk('MS-2', 'ROK snapshot never claims the stack', text !== null && text.indexOf('20 > 50 > 150') === -1);
  });

  // MS-3 equal averages -> not stacked (strict >)
  guard('MS-3', () => {
    const snap = EQUAL();
    chk('MS-3', 'fixture classifies healthy_uptrend', classify(snap) === 'healthy_uptrend');
    chk('MS-3', 'MA20 = MA50 is "not fully stacked"', assessOf(renderOf(mkItem(), snap)) === TEXT_NOT_STACKED);
    const snap2 = mkSnap(180, 170, 170);
    chk('MS-3', 'MA50 = MA150 is "not fully stacked"', assessOf(renderOf(mkItem(), snap2)) === TEXT_NOT_STACKED);
  });

  // MS-4 any average null / NaN -> "Healthy uptrend — price above key moving averages"
  guard('MS-4', () => {
    for (const bad of [null, NaN]) {
      for (const key of ['sma20', 'sma50', 'sma150']) {
        const snap = STACKED();
        snap[key] = bad; // the distances stay positive, so the classification stays healthy_uptrend
        chk('MS-4', key + ' = ' + String(bad) + ': fixture still classifies healthy_uptrend', classify(snap) === 'healthy_uptrend');
        chk('MS-4', key + ' = ' + String(bad) + ': shows "Healthy uptrend — price above key moving averages"', assessOf(renderOf(mkItem(), snap)) === TEXT_MISSING);
      }
    }
    const all = STACKED(); all.sma20 = null; all.sma50 = null; all.sma150 = null;
    chk('MS-4', 'all three missing: the missing-average text', assessOf(renderOf(mkItem(), all)) === TEXT_MISSING);
  });

  // MS-5 every other setup -> _tsAssessMap text (or no div); unknown -> no div
  guard('MS-5', () => {
    const others = [
      ['extended_near_ath', mkSnap(169, 150, 140, { high1yDist: -2 })],              // pct20 > 10, within 5% of the 1Y high
      ['healthy_uptrend_near_ath', mkSnap(180, 170, 160, { high1yDist: -3 })],       // within 8%, pct20 > 2
      ['pullback_in_uptrend', mkSnap(194, 180, 170)],                               // below MA20, above MA50/MA150
      ['support_test', mkSnap(192, 191, 170)],                                      // below MA20, MA50 within -3..2
      ['breakdown_risk', mkSnap(205, 200, 190)],                                    // > 3% below MA50, MA150 within -5..2
      ['below_key_mas', mkSnap(200, 210, 220)]                                      // below all three
    ];
    for (const [key, snap] of others) {
      chk('MS-5', key + ': fixture classifies as intended', classify(snap) === key);
      const html = renderOf(mkItem({ technical_setup: key }), snap);
      const want = Object.prototype.hasOwnProperty.call(assessMap, key) ? assessMap[key] : null;
      chk('MS-5', key + ': assessment is exactly today\'s _tsAssessMap text (or absent when the map has no key)',
        assessOf(html) === want && assessCount(html) === (want ? 1 : 0));
    }
    chk('MS-5', 'the _tsAssessMap literal is byte-identical to the baseline (no other key\'s text changed)',
      !!mapStmt && sha256(mapStmt[0]) === PIN_TSASSESSMAP_LF);
    chk('MS-5', 'unknown (no snapshot for the panel price) -> no assessment div', assessCount(renderOf(mkItem(), null)) === 0);
    chk('MS-5', 'unknown (no verified data) -> no assessment div',
      assessCount(renderOf(mkItem({ _verifiedPrice: undefined, _verifiedChangePct: undefined }), STACKED())) === 0);
    chk('MS-5', 'unknown (distances missing) -> no assessment div',
      assessCount(renderOf(mkItem(), mkSnap(180, 170, 160, { pct20: null, pct50: null, hasMA20: false }))) === 0);
  });

  // MS-6 the stack test reads _panelSnap, never item.* or stored fields
  guard('MS-6', () => {
    const stored = { technical_setup: 'healthy_uptrend', technical_sma20: 180, technical_sma50: 170, technical_sma150: 160, sma20: 180, sma50: 170, sma150: 160 };
    chk('MS-6', 'stored fields stacked, snapshot not stacked -> the snapshot wins ("not fully stacked")',
      assessOf(renderOf(mkItem(Object.assign({ _verifiedPrice: 445 }, stored)), ROK())) === TEXT_NOT_STACKED);
    const storedBad = { technical_setup: 'healthy_uptrend', technical_sma20: 428.11, technical_sma50: 437.80, technical_sma150: 429.35, sma20: 428.11, sma50: 437.80, sma150: 429.35 };
    chk('MS-6', 'stored fields not stacked, snapshot stacked -> the snapshot wins (stack text)',
      assessOf(renderOf(mkItem(storedBad), STACKED())) === TEXT_STACKED);
    chk('MS-6', 'stale stored setup (below_key_mas) with a stacked snapshot -> the snapshot\'s stack text',
      assessOf(renderOf(mkItem({ technical_setup: 'below_key_mas' }), STACKED())) === TEXT_STACKED);
    const lines = R2_NEW.slice(1, 3).map(l => (countOf(rm, l) === 1 ? l : null));
    chk('MS-6', 'static: the stack-test lines are present exactly once', lines.every(Boolean));
    chk('MS-6', 'static: the stack test reads _panelSnap.sma20 / sma50 / sma150 and nothing from item.*',
      lines.every(Boolean) && lines.every(l => l.indexOf('item.') === -1) &&
      ['_panelSnap.sma20', '_panelSnap.sma50', '_panelSnap.sma150'].every(k => lines.join('\n').indexOf(k) !== -1));
  });

  // MS-7 diff confined to the _tsAssess region; the R-2 revert table reproduces the pre-task source
  guard('MS-7', () => {
    chk('MS-7', 'the four R-2 lines are present exactly once, as one block', countOf(rm, R2_BLOCK) === 1);
    const reverted = revertR2(revertR3(rm));
    chk('MS-7', 'reverting only the R-3 line and the R-2 lines restores the pre-R-2 renderMainPanel (LF pin)', sha256(reverted) === PRE_RM_LF);
    chk('MS-7', 'reverting only the R-3 line and the R-2 lines restores the pre-R-2 renderMainPanel (CRLF pin)', sha256(crlf(reverted)) === PRE_RM_CRLF);
    chk('MS-7', 'applying the R-2 then the R-3 table to the reverted source reproduces the task source byte-for-byte', applyR3(applyR2(reverted)) === rm);
    chk('MS-7', 'line count = pre-task + 3 (at most four lines in the region)', rm.split('\n').length === reverted.split('\n').length + 3);
    chk('MS-7', 'the _tsAssessHtml line and the template interpolation are untouched',
      countOf(rm, "const _tsAssessHtml = _tsAssess ? `<div class=\"ts-assess\">${_tsAssess}</div>` : '';") === 1 && countOf(rm, '${_tsAssessHtml}`}${_ts1RowHtml}') === 1);
  });

  // MS-8 no new top-level function; classifyTechnicalSetup and _tsAssessMap byte-identical
  guard('MS-8', () => {
    const masked = maskFn(src, 'renderMainPanel');
    chk('MS-8', 'index.html outside renderMainPanel is byte-identical to the baseline (no new top-level function, no other edit)',
      !!masked && sha256(masked) === PIN_MASKED_MINUS_RM_LF);
    chk('MS-8', 'classifyTechnicalSetup is byte-identical to the baseline', !!classifySrc && sha256(classifySrc) === PIN_CLASSIFY_LF);
    chk('MS-8', 'the _tsAssessMap literal is byte-identical to the baseline', !!mapStmt && sha256(mapStmt[0]) === PIN_TSASSESSMAP_LF);
    chk('MS-8', 'no top-level function is named in the R-2 lines (locals only)', !/\bfunction\b/.test(R2_BLOCK) && R2_NEW.every(l => l.startsWith('  const _')));
  });

  return R;
}

// ── Planted negatives: the mutation lands on the production source text ─────────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + from.slice(0, 60));
  return text.replace(from, () => to);
}
const NEGATIVES = [
  { id: 'MS-1', label: 'stack test inverted',
    f: s => mut(s, '_panelSnap.sma20 > _panelSnap.sma50 && _panelSnap.sma50 > _panelSnap.sma150', '_panelSnap.sma20 < _panelSnap.sma50 && _panelSnap.sma50 < _panelSnap.sma150') },
  { id: 'MS-2', label: 'stack claimed whenever the three averages exist',
    f: s => mut(s, R2_NEW[2], '  const _maStacked  = _maStackAll;') },
  { id: 'MS-3', label: '>= used instead of strict >',
    f: s => mut(s, '_panelSnap.sma20 > _panelSnap.sma50 && _panelSnap.sma50 > _panelSnap.sma150', '_panelSnap.sma20 >= _panelSnap.sma50 && _panelSnap.sma50 >= _panelSnap.sma150') },
  { id: 'MS-4', label: 'null / NaN average treated as present',
    f: s => mut(s, '.every(Number.isFinite)', '.every(v => v !== undefined)') },
  { id: 'MS-5', label: 'another key\'s text changed (pullback_in_uptrend)',
    f: s => mut(s, "pullback_in_uptrend:      'Pullback within an uptrend — watch for support to hold',", "pullback_in_uptrend:      'Pullback within an uptrend — watch for support to hold.',") },
  { id: 'MS-6', label: 'stack test reads the stored item fields',
    f: s => mut(mut(s, R2_NEW[1], R2_NEW[1].replace(/_panelSnap\.sma/g, 'item.technical_sma')), R2_NEW[2], R2_NEW[2].replace(/_panelSnap\.sma/g, 'item.technical_sma')) },
  { id: 'MS-7', label: 'a second renderMainPanel region changed',
    f: s => mut(s, "const hasCrit = (item.alerts||[]).some(a=>a.type==='critical');", "const hasCrit = (item.alerts||[]).some(a=>a.type==='warn');") },
  { id: 'MS-8', label: 'a new top-level function added',
    f: s => { const c = extractFn(s, 'classifyTechnicalSetup'); return mut(s, c, c + '\n\nfunction _maStackHelper(s) { return s; }'); } },
  { id: 'MS-8', label: 'classifyTechnicalSetup threshold changed',
    f: s => mut(s, "  if (pct150 != null && pct20 > 0 && pct50 > 0 && pct150 > 0)\n    return 'healthy_uptrend';", "  if (pct150 != null && pct20 > 0 && pct50 > 0 && pct150 >= 0)\n    return 'healthy_uptrend';") }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
let failures = 0;
let asserts = 0;
const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };

const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
const real = evaluate(index);
const GROUPS = ['MS-1', 'MS-2', 'MS-3', 'MS-4', 'MS-5', 'MS-6', 'MS-7', 'MS-8'];
for (const g of GROUPS) for (const c of (real[g] || [])) check(g + ' ' + c.name, c.ok);
for (const g of GROUPS) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);

// Negatives only mean something when the real run is clean; otherwise report them as unproven.
const realClean = failures === 0;
for (const n of NEGATIVES) {
  let mutated = null;
  try { mutated = n.f(index); } catch (e) { mutated = null; }
  check('negative anchor resolves: ' + n.id + ' / ' + n.label, mutated !== null && mutated !== index);
  if (mutated === null || !realClean) continue;
  const res = evaluate(mutated);
  const group = res[n.id] || [];
  check('negative: ' + n.id + ' rejects "' + n.label + '"', group.some(c => !c.ok));
}

console.log(failures === 0
  ? 'MA STACK LABEL OFFLINE: PASS (' + asserts + ' asserts)'
  : 'MA STACK LABEL OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
