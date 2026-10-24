#!/usr/bin/env node
'use strict';
/**
 * qa/cop_display_offline.js — cop-display-fix-1 (C-3): the Company Overview Panel says what it measures and what is sourced.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL renderMainPanel (+ the helpers it needs) from index.html and
 * renders it in a sandbox; planted negatives mutate an in-memory copy of index.html, never this test.
 *
 *   CD-1  positive control: catalysts, no conflict / K warning -> "Data coverage: high", class pos
 *   CD-2  item.conflict -> coverage high in class warn (never pos), the note, the ⚠ Conflict row once
 *   CD-3  a K1–K6 warning (no conflict) -> warn + note; the badge and the Consistency line share one computation
 *   CD-4  "High confidence" / "Moderate confidence" appear nowhere, for every deriveDataConfidence level
 *   CD-5  deriveDataConfidence keeps its .level table and never reads `conflict`
 *   CD-6  Entry Zone / Invalidation values byte-identical; the "AI-written level" tag exactly once when either is present
 *   CD-7  the analyst line byte-identical; exactly one "own summary text" tag; none when there is no rating
 *   CD-8  _catalysts.sources: entries, escaped titles, http(s) links with rel, cap of 8
 *   CD-9  javascript: / data: / malformed URLs -> plain text, no href
 *   CD-10 empty sources -> one "No citations stored" line; no _catalysts -> no block
 *   CD-11 isolation: item unchanged, 0 localStorage writes, pt_results untouched
 *   CD-12 the literals other suites rely on are still present once each
 *   CD-13 nested helpers only; no scoring-engine call, _techCache token or storage in the new code
 *   Planted negatives N1..N10.
 */
const fs = require('fs');
const path = require('path');
const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const norm = s => s.replace(/\r\n/g, '\n');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const quiet = { log() {}, warn() {}, error() {} };
const esc = s => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

// ── Source extraction (qa/narrative_consistency_offline.js rule) ────────────────────────────────
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

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────
const TODAY = '2026-10-03T13:00:00.000Z';
const S = 'This is a valid synthetic summary body used purely for offline pin fixtures and exceeds fifty characters.';
const base = over => Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment_score: 45, sentiment: 'neutral', action: 'hold_wait',
  technical_setup: 'support_test', summary: S, _verifiedPrice: 100, _verifiedChangePct: 0.5, _orchestratedAt: TODAY }, over || {});
const CATS = () => ({ bullish: ['Phase 3 readout (Oct 3)'], bearish: [], macro: [] });
const SRC3 = [
  { url: 'https://www.reuters.com/markets/a?x=1&y=2', title: 'Reuters <b>Q3</b> beat', date: '2026-10-01' },
  { url: 'http://example.org/b', title: 'Plain item', date: '2026-09-30' },
  { url: 'https://sec.gov/c', title: 'Filing "8-K"', date: '2026-09-29' }
];
function panelSnap() {
  return { sma20: 180, sma50: 170, sma150: 160, sma200: 150, pct20: 5.56, pct50: 11.77, pct150: 18.76, pct200: 26.67,
    hasMA20: true, hasMA50: true, hasMA150: true, hasMA200: true, volRatio: 1.1, hasVolume: true, high1yDist: -12, hasHigh1y: true,
    rsSector: 1.5, rsSPY: 2.5, rsQQQ: -0.5, sectorEtf: 'XLK', candleCount: 220, spyChangePct: 0.5, qqqChangePct: -0.3 };
}

// ── renderMainPanel harness (qa/narrative_consistency_offline.js pattern) ───────────────────────
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
function buildRenderer(src) {
  const rmSrc = extractFn(src, 'renderMainPanel');
  if (!rmSrc) throw new Error('renderMainPanel not extractable');
  const helpers = RENDER_REAL.map(n => { const s = extractFn(src, n); if (!s) throw new Error('missing ' + n); return s; });
  const ratingRe = /var RATING_SUMMARY_RE = (\/[^\n]*\/[a-z]*);/.exec(src);
  const factory = new Function('__scope', 'with (__scope) {\n' + helpers.join('\n') + '\n' + rmSrc + '\nreturn renderMainPanel;\n}');
  return function render(it, o) {
    const opts = o || {};
    const node = { innerHTML: '' };
    const writes = { n: 0 };
    const map = {
      window: { PT_ENABLE_TECH_SCORE: false, PT_ENABLE_DEEP_DIVE: false, PT_ENABLE_ATH_CLIENT: false },
      document: { getElementById: id => (id === 'mainPanel' ? node : null) },
      console: quiet,
      localStorage: { setItem() { writes.n += 1; }, removeItem() { writes.n += 1; }, clear() { writes.n += 1; }, getItem() { return null; } },
      _techCache: { [it.ticker]: { base: {}, computedAt: 0, sectorEtf: 'XLK', snap: panelSnap(), refInput: it._verifiedPrice } },
      _extendedMktCache: {}, _athCache: {},
      _srHeldMap: () => { if (opts.calls) opts.calls.n += 1; return opts.held || {}; },
      _cockpitResults: [], _mktFailCache: {}, findTicker: () => null, refreshTechPanel: () => undefined,
      RATING_SUMMARY_RE: new Function('return ' + ratingRe[1])()
    };
    factory(makeScope(map))(it);
    return { html: node.innerHTML, writes: writes.n };
  };
}

// ── helpers over the rendered html ──────────────────────────────────────────────────────────────
const DC_RE = /<div class="dc-row"><div class="dc-dot ([\w-]+)"><\/div><span class="dc-lbl ([\w-]+)">([^<]*)<\/span><span class="dc-reason">([^<]*)<\/span>((?:<span class="dc-reason">[^<]*<\/span>)*)<\/div>/;
const dcOf = html => { const m = DC_RE.exec(html); return m ? { dot: m[1], lblCls: m[2], label: m[3], reason: m[4], extra: m[5] } : null; };
const NOTE = 'Coverage is not agreement: this result carries a conflict or consistency warning (see below).';
const LINE_RE = /<div class="mp-act-row mp-nlm"><span class="mp-act-lbl">Consistency<\/span><span class="mp-act-val"[^>]*>([^<]*)<\/span><\/div>/;
const val = (html, lbl) => { const m = new RegExp('<span class="mp-act-lbl">' + lbl + '<\\/span><span class="mp-act-val"[^>]*>([^<]*)<\\/span>').exec(html); return m ? m[1] : null; };
const UNV_LEVEL = '<div class="src-tag unv">AI-written level · not sourced</div>';
const UNV_ANALYST = '<div class="src-tag unv">Read from the AI\'s own summary text · not a sourced analyst feed</div>';
const srcBlock = html => { const a = html.indexOf('Cited sources · Perplexity'); const b = html.indexOf('<!-- AI SUMMARY'); return (a === -1 || b === -1 || b < a) ? '' : html.slice(a, b); };
const HIGH_FIX = () => base({ _catalysts: CATS() });
const SCORING_TOKENS = ['orchestrate(', 'analyzeChunk(', 'enforceScoreConsistency(', '_techCache'];

// ── Evaluate every group on one source text ─────────────────────────────────────────────────────
function evaluate(src) {
  const R = {};
  const chk = (id, name, ok) => { (R[id] = R[id] || []).push({ name, ok: !!ok }); };
  const guard = (id, fn) => { try { fn(); } catch (e) { chk(id, 'group threw: ' + String(e && e.message || e).slice(0, 220), false); } };
  let render = null;
  try { render = buildRenderer(src); } catch (e) { render = null; }
  const rm = extractFn(src, 'renderMainPanel') || '';
  const dcFn = extractFn(src, 'deriveDataConfidence') || '';
  const out = (it, o) => render(it, o).html;

  guard('CD-1', () => {
    const d = dcOf(out(HIGH_FIX()));
    chk('CD-1', 'the coverage badge renders', !!d);
    chk('CD-1', 'label is "Data coverage: high"', !!d && d.label.toLowerCase() === 'data coverage: high');
    chk('CD-1', 'class is pos (positive control)', !!d && d.dot === 'pos' && d.lblCls === 'pos');
    chk('CD-1', 'no note without a conflict or warning', !!d && d.extra === '' && out(HIGH_FIX()).indexOf(NOTE) === -1);
    chk('CD-1', 'the reason says present, not confident', !!d && /present/i.test(d.reason) && !/confiden/i.test(d.reason));
  });

  guard('CD-2', () => {
    const html = out(base({ _catalysts: CATS(), conflict: 'Technicals bullish but news bias bearish' }));
    const d = dcOf(html);
    chk('CD-2', 'coverage stays high', !!d && d.label.toLowerCase() === 'data coverage: high');
    chk('CD-2', 'class is warn on dot and label, never pos', !!d && d.dot === 'warn' && d.lblCls === 'warn' && !/dc-(dot|lbl) pos/.test(html));
    chk('CD-2', 'the note is present once, inside the badge row', !!d && countOf(html, NOTE) === 1 && d.extra.indexOf(NOTE) !== -1);
    chk('CD-2', 'the ⚠ Conflict row renders once with its text', countOf(html, '⚠ Conflict') === 1 && val(html, '⚠ Conflict').indexOf('news bias bearish') !== -1);
    chk('CD-2', 'an empty-string conflict does not trigger the warning', dcOf(out(base({ _catalysts: CATS(), conflict: '' }))).dot === 'pos');
  });

  guard('CD-3', () => {
    const it = base({ _catalysts: CATS(), _verifiedPrice: 271.26, action: 'add_on_pullback', entry_zone: '$270-$275', invalidation: 'Daily close below $272' });
    const html = out(it);
    const d = dcOf(html);
    const line = LINE_RE.exec(html);
    chk('CD-3', 'the K-warning fixture produces a Consistency line', !!line);
    chk('CD-3', 'coverage high in warn (no conflict set)', !!d && d.label.toLowerCase() === 'data coverage: high' && d.dot === 'warn' && !it.conflict);
    chk('CD-3', 'the note is present once', countOf(html, NOTE) === 1);
    chk('CD-3', 'the Consistency line and the badge note appear together (single computation)', !!line && countOf(html, NOTE) === 1);
    const clean = out(HIGH_FIX());
    chk('CD-3', 'no warning -> neither the line nor the note', !LINE_RE.test(clean) && clean.indexOf(NOTE) === -1);
    const failed = out(base({ _aiUnavailable: true, _catalysts: CATS(), summary: S + ' today exit score 42 downside $999' }));
    chk('CD-3', 'a failed analysis computes no warnings: no line, no note', !LINE_RE.test(failed) && failed.indexOf(NOTE) === -1);
    const callsFailed = { n: 0 };
    render(base({ _aiUnavailable: true, _catalysts: CATS() }), { calls: callsFailed });
    const callsOk = { n: 0 };
    render(HIGH_FIX(), { calls: callsOk });
    chk('CD-3', '_srHeldMap is not read for a failed analysis', callsFailed.n === 0);
    chk('CD-3', '_srHeldMap is read exactly once for a normal item (single computation)', callsOk.n === 1);
  });

  guard('CD-4', () => {
    const fixtures = {
      HIGH: HIGH_FIX(),
      MODERATE_trace: base({ _auditTrail: { sourceTrace: 'x' } }),
      MODERATE_plain: base({}),
      LIMITED: base({ _catalystDataMissing: true }),
      AI_UNAVAILABLE: base({ _aiUnavailable: true })
    };
    for (const k of Object.keys(fixtures)) {
      const html = out(fixtures[k]);
      chk('CD-4', k + ': no "High confidence" / "Moderate confidence" anywhere in the panel', !/high confidence|moderate confidence/i.test(html));
      chk('CD-4', k + ': the badge still renders', !!dcOf(html));
    }
    chk('CD-4', 'labels: moderate and limited are coverage labels, AI unavailable unchanged',
      dcOf(out(fixtures.MODERATE_plain)).label.toLowerCase() === 'data coverage: moderate' &&
      dcOf(out(fixtures.LIMITED)).label.toLowerCase() === 'data coverage: limited' &&
      dcOf(out(fixtures.AI_UNAVAILABLE)).label.toLowerCase() === 'ai unavailable');
  });

  guard('CD-5', () => {
    const f = new Function(dcFn + '\nreturn deriveDataConfidence;')();
    const table = [
      [{ _aiUnavailable: true }, 'AI_UNAVAILABLE'], [{ _aiUnavailable: true, _catalystDataMissing: true }, 'AI_UNAVAILABLE'],
      [{ _catalystDataMissing: true }, 'LIMITED'],
      [{ _catalysts: { bullish: ['x'] } }, 'HIGH'], [{ _catalysts: { bearish: ['x'] } }, 'HIGH'], [{ _catalysts: { analystActions: [{}] } }, 'HIGH'],
      [{ _auditTrail: { sourceTrace: 'x' } }, 'MODERATE'], [{}, 'MODERATE']
    ];
    chk('CD-5', 'the function is extractable', dcFn !== '');
    chk('CD-5', 'at least 6 fixed inputs', table.length >= 6);
    for (const [input, level] of table) chk('CD-5', JSON.stringify(input) + ' -> ' + level, f(input).level === level);
    chk('CD-5', 'its source has no `conflict` token', !/conflict/i.test(dcFn));
    chk('CD-5', 'it is still the original (labels and classes unchanged)', /label: 'High confidence'/.test(dcFn) && /label: 'Moderate confidence'/.test(dcFn));
  });

  guard('CD-6', () => {
    const both = out(base({ entry_zone: '$270-$275 <i>x</i>', invalidation: 'Close below $262 & "stop"' }));
    chk('CD-6', 'Entry Zone value byte-identical (escaped)', val(both, 'Entry Zone') === esc('$270-$275 <i>x</i>'));
    chk('CD-6', 'Invalidation value byte-identical (escaped)', val(both, 'Invalidation') === esc('Close below $262 & "stop"'));
    chk('CD-6', 'both rows present -> the tag exactly once', countOf(both, UNV_LEVEL) === 1);
    chk('CD-6', 'the tag follows the Invalidation row', both.indexOf(UNV_LEVEL) > both.indexOf('<span class="mp-act-lbl">Invalidation</span>') && both.indexOf('<span class="mp-act-lbl">Invalidation</span>') > both.indexOf('<span class="mp-act-lbl">Entry Zone</span>'));
    const onlyEntry = out(base({ entry_zone: '$270-$275' }));
    const onlyInv = out(base({ invalidation: 'Close below $262' }));
    chk('CD-6', 'only Entry Zone -> the tag once', countOf(onlyEntry, UNV_LEVEL) === 1);
    chk('CD-6', 'only Invalidation -> the tag once', countOf(onlyInv, UNV_LEVEL) === 1);
    chk('CD-6', 'neither row -> no tag', countOf(out(base({})), 'AI-written level') === 0);
    chk('CD-6', 'the tag is amber (unv), never green', both.indexOf('<div class="src-tag sourced">AI-written level') === -1 && /class="src-tag unv">AI-written level/.test(both));
    chk('CD-6', 'the CSS carries .src-tag.unv amber and .src-tag.sourced green', /\.src-tag\.unv\{[^}]*#F4B860/i.test(src) && /\.src-tag\.sourced\{[^}]*#22C58B/i.test(src));
  });

  guard('CD-7', () => {
    const withR = out(base({ summary: S + ' Rating: Sell | PT: $80' }));
    chk('CD-7', 'the analyst line is byte-identical', countOf(withR, 'Analyst view · SELL · PT $80') === 1);
    chk('CD-7', 'at-analyst-line occurs once', countOf(withR, 'at-analyst-line') === 1);
    chk('CD-7', 'exactly one own-summary tag, directly after the analyst line', countOf(withR, UNV_ANALYST) === 1 && new RegExp('PT \\$80</div>\\s*' + UNV_ANALYST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(withR));
    const none = out(base({}));
    chk('CD-7', 'no rating -> no analyst line and no tag', countOf(none, 'Analyst view ·') === 0 && countOf(none, 'summary text · not a sourced analyst feed') === 0);
  });

  guard('CD-8', () => {
    const html = out(base({ _catalysts: Object.assign(CATS(), { sources: SRC3 }) }));
    const blk = srcBlock(html);
    chk('CD-8', 'the block header renders', html.indexOf('Cited sources · Perplexity') !== -1);
    chk('CD-8', '3 sources -> 3 entries', countOf(blk, 'class="src-cite"') === 3);
    chk('CD-8', 'titles are escaped (no raw markup)', blk.indexOf('<b>Q3</b>') === -1 && blk.indexOf(esc('Reuters <b>Q3</b> beat')) !== -1 && blk.indexOf(esc('Filing "8-K"')) !== -1);
    const links = blk.match(/<a href="https?:\/\/[^"]*" rel="noopener noreferrer" target="_blank">/g) || [];
    chk('CD-8', 'every http(s) source is a link with rel="noopener noreferrer" target="_blank"', links.length === 3);
    chk('CD-8', 'the href is escaped', blk.indexOf('href="https://www.reuters.com/markets/a?x=1&amp;y=2"') !== -1);
    chk('CD-8', 'host and date shown', blk.indexOf('reuters.com') !== -1 && blk.indexOf('2026-10-01') !== -1);
    const many = Array.from({ length: 11 }, (_, i) => ({ url: 'https://example.com/' + i, title: 'S' + i, date: '2026-10-0' + (i % 9 + 1) }));
    chk('CD-8', '11 stored -> 8 shown', countOf(srcBlock(out(base({ _catalysts: Object.assign(CATS(), { sources: many }) }))), 'class="src-cite"') === 8);
    chk('CD-8', 'a long title is truncated like _trunc70', srcBlock(out(base({ _catalysts: Object.assign(CATS(), { sources: [{ url: 'https://e.com/', title: 'T'.repeat(90), date: '' }] }) }))).indexOf('T'.repeat(67) + '…') !== -1);
    chk('CD-8', 'the analyst-row header text renders with analyst rows', out(base({ _catalysts: Object.assign(CATS(), { analystActions: [{ bank: 'GS', action: 'raised', target: 90 }], sources: SRC3 }) })).indexOf('Analyst rows above are Perplexity-sourced actions') !== -1);
  });

  guard('CD-9', () => {
    const bad = [
      { url: 'javascript:alert(1)', title: 'JS item', date: '2026-10-01' },
      { url: 'data:text/html,<script>x</script>', title: 'Data item', date: '2026-10-01' },
      { url: 'not a url', title: 'Malformed item', date: '2026-10-01' },
      { url: 'JaVaScRiPt:alert(2)', title: 'Mixed case item', date: '2026-10-01' }
    ];
    const blk = srcBlock(out(base({ _catalysts: Object.assign(CATS(), { sources: bad }) })));
    chk('CD-9', 'all four entries are listed', countOf(blk, 'class="src-cite"') === 4);
    chk('CD-9', 'no href at all', blk.indexOf('href') === -1 && blk.indexOf('<a ') === -1);
    chk('CD-9', 'titles still shown as plain text', blk.indexOf('JS item') !== -1 && blk.indexOf('Malformed item') !== -1);
    chk('CD-9', 'no raw markup from the data: URL leaks', blk.indexOf('<script>') === -1);
  });

  guard('CD-10', () => {
    const empty = out(base({ _catalysts: Object.assign(CATS(), { sources: [] }) }));
    chk('CD-10', 'empty sources -> the "No citations stored" line once', countOf(empty, 'No citations stored for this result') === 1);
    chk('CD-10', 'the missing-field case (_catalysts present, no sources key) behaves the same', countOf(out(base({ _catalysts: CATS() })), 'No citations stored for this result') === 1);
    const absent = out(base({}));
    chk('CD-10', '_catalysts absent -> no sources block and no empty line', absent.indexOf('Cited sources') === -1 && absent.indexOf('No citations stored') === -1);
  });

  guard('CD-11', () => {
    const it = base({ _catalysts: Object.assign(CATS(), { sources: SRC3 }), conflict: 'c', entry_zone: '$1', invalidation: '$0.5', summary: S + ' Rating: Buy | PT: $120' });
    const before = JSON.stringify(it);
    const r = render(it);
    chk('CD-11', 'rendering mutates no field of the item (deep-equal)', JSON.stringify(it) === before);
    chk('CD-11', '0 localStorage writes', r.writes === 0);
    chk('CD-11', 'the panel rendered (not a vacuous pass)', r.html.length > 500);
    chk('CD-11', 'no global localStorage was created or touched', typeof globalThis.localStorage === 'undefined');
  });

  guard('CD-12', () => {
    const html = out(base({ summary: S + ' Rating: Sell | PT: $80', entry_zone: '$270', invalidation: '$262' }));
    chk('CD-12', 'the analyst line markup is present once', countOf(html, '<div class="at-analyst-line" style="margin-top:6px;font-family:var(--mono);font-size:10px;color:var(--text3)">Analyst view · SELL · PT $80</div>') === 1);
    chk('CD-12', 'Entry Zone and Invalidation row markup present once each', countOf(html, '<span class="mp-act-lbl">Entry Zone</span><span class="mp-act-val">$270</span>') === 1 && countOf(html, '<span class="mp-act-lbl">Invalidation</span><span class="mp-act-val">$262</span>') === 1);
    chk('CD-12', 'source keeps the "Analyst view ·" template once in renderMainPanel', countOf(rm, 'Analyst view · ${rating.toUpperCase()} · PT ${pt}') === 1);
    chk('CD-12', 'the Consistency line markup is untouched', countOf(rm, '<div class="mp-act-row mp-nlm"><span class="mp-act-lbl">Consistency</span>') === 1);
  });

  guard('CD-13', () => {
    const a = rm.indexOf('function _dcCoverage(');
    const b = rm.indexOf('panel.innerHTML = `');
    const region = (a !== -1 && b > a) ? rm.slice(a, b) : null;
    chk('CD-13', '_dcCoverage is nested in renderMainPanel, before panel.innerHTML', region !== null && countOf(rm, 'function _dcCoverage(') === 1);
    chk('CD-13', 'no _dcCoverage at top level of index.html', !/^function _dcCoverage\(/m.test(src) && !/^(?:async )?function (?:_srcBlock|_dcCoverage)/m.test(src));
    chk('CD-13', 'the new code region declares exactly one nested function', region !== null && countOf(region, 'function ') === 1);
    chk('CD-13', 'the new code region has no scoring-engine call or _techCache token', region !== null && SCORING_TOKENS.every(t => region.indexOf(t) === -1));
    chk('CD-13', 'the new code region has no storage or network access', region !== null && !/localStorage|sessionStorage|fetch\(|XMLHttpRequest|indexedDB/.test(region));
    chk('CD-13', 'renderMainPanel calls no scoring-engine function', ['orchestrate(', 'analyzeChunk(', 'enforceScoreConsistency('].every(t => rm.indexOf(t) === -1));
    chk('CD-13', '_nlmConsistencyChecks is computed once in renderMainPanel (_nlmKs reused by _nlmLine)', countOf(rm, '_nlmConsistencyChecks(') === 1 && countOf(rm, 'const _nlmKs') === 1);
  });
  return R;
}

// ── Planted negatives (mutate the production source in memory; never this test) ────────────────
function mut(text, from, to) {
  const n = countOf(text, from);
  if (n !== 1) throw new Error('anchor occurs ' + n + 'x: ' + from.slice(0, 70));
  return text.replace(from, () => to);
}
const NEGATIVES = [
  { id: 'CD-4', label: 'N1 "High confidence" label restored', f: s => mut(s, "HIGH: 'Data coverage: high'", "HIGH: 'High confidence'") },
  { id: 'CD-2', label: 'N2 _dcCoverage ignores the conflict', f: s => mut(s, "(typeof item.conflict === 'string' && item.conflict.length > 0)", 'false') },
  { id: 'CD-3', label: 'N3 _dcCoverage ignores the K warnings', f: s => mut(s, '(Array.isArray(ks) && ks.length > 0)', 'false') },
  { id: 'CD-6', label: 'N4 the Entry/Invalidation tag dropped', f: s => mut(s, '<div class="src-tag unv">AI-written level · not sourced</div>', '') },
  { id: 'CD-7', label: 'N5 the analyst tag dropped', f: s => mut(s, '<div class="src-tag unv">Read from the AI\'s own summary text · not a sourced analyst feed</div>', '') },
  { id: 'CD-8', label: 'N6 sources no longer rendered', f: s => mut(s, '_c.sources.slice(0, 8)', '_c.sources.slice(0, 0)') },
  { id: 'CD-9', label: 'N7 any URL scheme becomes an href', f: s => mut(s, '/^https?:$/.test(', '/^[a-z]+:$/.test(') },
  { id: 'CD-11', label: 'N8 a localStorage write inside a helper (CD-11 sees the write)', f: s => mut(s, 'function _dcCoverage(dc, item, ks) {', "function _dcCoverage(dc, item, ks) { localStorage.setItem('pt_x', '1');") },
  { id: 'CD-13', label: 'N8 a localStorage write inside a helper (CD-13 sees the token)', f: s => mut(s, 'function _dcCoverage(dc, item, ks) {', "function _dcCoverage(dc, item, ks) { localStorage.setItem('pt_x', '1');") },
  { id: 'CD-3', label: 'N11 the failed-analysis guard on _nlmKs removed (_srHeldMap read for a failed item)', f: s => mut(s, 'const _nlmKs = (item._aiUnavailable === true) ? [] : (() => {', 'const _nlmKs = (() => {') },
  { id: 'CD-5', label: 'N9deriveDataConfidence reads conflict', f: s => mut(s, 'function deriveDataConfidence(it) {', 'function deriveDataConfidence(it) { const _x = it.conflict;') },
  { id: 'CD-6', label: 'N10 the unverified tag coloured green', f: s => mut(s, '<div class="src-tag unv">AI-written level · not sourced</div>', '<div class="src-tag sourced">AI-written level · not sourced</div>') }
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────
(() => {
  let failures = 0;
  let asserts = 0;
  const check = (name, cond) => { asserts += 1; if (!cond) { failures += 1; console.log('  FAIL  ' + name); } };
  const index = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
  const real = evaluate(index);
  const order = ['CD-1', 'CD-2', 'CD-3', 'CD-4', 'CD-5', 'CD-6', 'CD-7', 'CD-8', 'CD-9', 'CD-10', 'CD-11', 'CD-12', 'CD-13'];
  for (const id of order) for (const c of (real[id] || [])) check(id + ' ' + c.name, c.ok);
  for (const g of order) check(g + ' group ran', Array.isArray(real[g]) && real[g].length > 0);
  const realClean = failures === 0;
  for (const n of NEGATIVES) {
    let mutated = null;
    try { mutated = n.f(index); } catch (e) { check('negative ' + n.label + ': anchor unique — ' + e.message, false); continue; }
    const r = evaluate(mutated);
    const bit = Array.isArray(r[n.id]) && r[n.id].some(c => !c.ok);
    check('negative ' + n.label + ' is caught by ' + n.id + (realClean ? '' : ' [unproven: real run not clean]'), bit && realClean);
  }
  console.log(failures === 0
    ? 'COP DISPLAY OFFLINE: PASS (' + asserts + ' asserts)'
    : 'COP DISPLAY OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
