#!/usr/bin/env node
'use strict';
/*
 * qa/evidence_capture_offline.js - evidence-capture-1 (Main Control D-22; R-3; evidence-memory-1 S1 contract).
 *
 * Every finished scan stores one S1 snapshot per scanned ticker in the browser, without changing the scan. Rows are
 * derived from the brief's spec-first matrix (risk-test-design.spec-first.md), written before this suite. The REAL
 * code is extracted from index.html: the inlined S1 module and the capture section, runAnalysis, mergeResultsByTicker,
 * _isValidScanResult and parsePerplexityContext (run on the 8 live captures of qa/fixtures/research-live-2026-10-15.json).
 * Pure Node: no network, no browser, no real storage (S1's memory backend, recording / failing / hanging backends and
 * a counting indexedDB fake).
 *
 *   CP-1  isolation: the inlined module is byte-identical to services/evidence-memory.js; one new global only
 *   CP-2  privacy: raw AI text, the debug record, AI free text and holdings never reach the store (positive control)
 *   CP-3  source: the full parser output (real live captures; rating-only, guidance, contracts kept), not _catalysts
 *   CP-4  no effect on the scan: runAnalysis output identical with capture off / on / throwing / rejecting / hanging
 *   CP-5  gate: only PT_EVIDENCE_CAPTURE === true captures; the controls work in every gate state
 *   CP-6  lazy: no indexedDB.open at load or for a scan with capture off; opened on first control use
 *   CP-7  controls: status text, Export (valid S1 document, downloaded once), Clear only after confirmation
 *   CP-8  AI-failed results, unavailable research, missing / stale debug entries, hostile items
 *   CP-9  captures are serialized across back-to-back scans
 *   CP-10 scope: removing the three insertions gives the base index.html byte-for-byte; the call is not awaited
 *   CP-N1..N9 planted negatives (each mutates index.html; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const MODULE_FILE = core.normalizeText(fs.readFileSync(path.join(ROOT, 'services', 'evidence-memory.js'), 'utf8'));
const LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa', 'fixtures', 'research-live-2026-10-15.json'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const S1_SHA = '378bd80a3875592f4119b8daa1a6a18816700292655477da838413a1d6b77a78';
const BASE_INDEX_SHA = '2166c8b16d83b0856d49f19bc9cbb281b9e04aa7dfbca0313f6f4455e9b628d4'; // index.html at the base (LF), before the three insertions // portfolio-today-1
const HEAD_MARK = '\n// ═══ services/evidence-memory.js — inlined (evidence-capture-1) ═══════════\n';
const END_MARK = '// ── end evidence-capture-1 ─────────────────────────────────────────────────────────────────────────────\n';
const WRAP_OPEN = 'var PulseEvidenceMemory = (function (module) {\n';
const WRAP_CLOSE = 'return module.exports;\n})({ exports: {} });\n';
const CALL_LINES = "    // evidence-capture-1 (D-22): keep this scan's research history after the results are saved and shown.\n" +
  "    // Fire-and-forget: not awaited, changes no result; every failure is contained inside _ehCaptureScan.\n" +
  "    _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);\n";
const BOX_OPEN = '    <details class="labs-box" id="ehBox"';

function between(src, a, b) {
  const i = src.indexOf(a);
  if (i === -1 || src.indexOf(a, i + 1) !== -1) throw new Error('marker not found exactly once: ' + a.slice(0, 50));
  const j = src.indexOf(b, i + a.length);
  if (j === -1) throw new Error('end marker not found: ' + b.slice(0, 50));
  return { start: i, end: j + b.length, inner: src.slice(i + a.length, j) };
}
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
function parserFrom(src) {
  const st = src.indexOf('function parsePerplexityContext(');
  const bi = src.indexOf('{', st); let d = 0, end = -1;
  for (let i = bi; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
  const ctx = { console: { log() {}, warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(st, end) + ';this.P = parsePerplexityContext;', ctx);
  return ctx.P;
}
const PARSE = parserFrom(SRC);
const parsedOf = cap => { const p = PARSE(cap.raw, []); return p[cap.ticker] || p.__raw__ || null; };

// ---------- the page sandbox ----------
// Loads the capture region (inlined module + capture section) and the scan functions from `src` into one context.
function page(src, opt) {
  const o = opt || {};
  const region = between(src, HEAD_MARK, END_MARK);
  const regionText = src.slice(region.start, region.end);
  const store = Object.create(null), writes = [], renders = [], toasts = [], downloads = [], warns = [];
  const idb = o.idb === undefined ? undefined : o.idb;
  const els = {
    cardsGrid: { innerHTML: '' }, runBtn: { disabled: false, className: '', onclick: null, innerHTML: '' },
    errorBox: { style: {} }, emptyState: null, resultsSection: { style: {} }, ehStatus: { textContent: '' }
  };
  const ctx = {
    console: { log() {}, error() {}, warn: (...a) => { warns.push(a.join(' ')); } },
    setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Number, Boolean, Error, Map, Set, Date, RegExp, isFinite, parseFloat,
    document: { getElementById: id => (Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null), querySelectorAll: () => [] },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); writes.push([k, k === 'pt_date' ? '<date>' : String(v)]); },
      removeItem: k => { delete store[k]; }
    },
    Blob: function (parts, meta) { this.parts = parts; this.type = meta && meta.type; },
    showToast: m => toasts.push(m), _ptDownload: (b, n) => downloads.push({ name: n, text: b.parts.join('') }),
    _ptTimestamp: () => '2026-10-17_10-00-00',
    setProgress() {}, hideProgress() {}, showError() {}, _hideStaleBanner() {}, cancelScan() {},
    renderResults: (r, d) => { renders.push(JSON.stringify(r)); },
    getScanSymbols: () => (o.symbols || ['AAA', 'BBB']).slice(),
    _athPrefetchScan: () => ({}),
    analyzeChunk: o.analyzeChunk || (async batch => batch.map(sym => (o.resultFor || defaultResult)(sym, ctx)))
  };
  if (idb !== undefined) ctx.indexedDB = idb;
  ctx.window = ctx;
  ctx.window.confirm = o.confirm || (() => true);
  vm.createContext(ctx);
  const prelude = 'var results = []; var _analysisRunning = false, _cancelRequested = false, _currentScanTicker = null;\n';
  vm.runInContext(prelude + regionText + '\n' + fnText(src, 'mergeResultsByTicker') + '\n' + fnText(src, '_isValidScanResult') + '\n' +
    fnText(src, 'runAnalysis') + '\nthis.__get = function () { return results; };', ctx);
  return { ctx, store, writes, renders, toasts, downloads, warns, els, regionText };
}

const TOK = { raw: 'ZQXRAWTEXT', dbg: 'ZQXDEBUGFIELD', summary: 'ZQXSUMMARY', risk: 'ZQXKEYRISK', entry: 'ZQXENTRYZONE', inval: 'ZQXINVALIDATION', hold: 'ZQXHOLDING', pos: 'ZQXSTOREDCATALYST' };
function parsedFor(sym) {
  return {
    analystActions: [{ bank: 'Mizuho', action: 'raised', ratingAction: null, rating: 'Outperform', target: 210, ptFrom: 190, ptAction: 'raised', raw: 'Mizuho raised PT to $210 from $190 (October 15)' }],
    ratingOnlyActions: [{ bank: 'Bernstein', action: 'upgraded', ratingAction: 'upgrade', rating: 'Buy', raw: 'Bernstein upgraded to Buy (October 15)' }],
    bullishCatalysts: [sym + ' won a contract ' + TOK.pos], bearishCatalysts: [], macroDrivers: [],
    earnings: null, guidance: 'raised full-year guidance', contracts: 'a $1 billion five-year contract', peerMove: null,
    revisionDirection: 'upgrading', revisionRecency: 'this week', dataFreshness: 'today', sources: []
  };
}
function defaultResult(sym, ctx) {
  ctx.window._pplxDebug[sym] = { rawText: TOK.raw + ' ' + sym, parsed: parsedFor(sym), model: TOK.dbg, errorReason: TOK.dbg, parsedFrom: 'ticker-header' };
  return {
    ticker: sym, company_name: sym + ' Corp', sentiment: 'positive', sentiment_score: 66, action: 'add_on_pullback', technical_setup: 'healthy_uptrend',
    _catalystDirection: 'bullish', _verifiedPrice: 101.5, summary: 'A long enough summary for the validator to accept it as a result. ' + TOK.summary,
    key_risk: TOK.risk, entry_zone: TOK.entry, invalidation: TOK.inval, _catalysts: { bullish: ['lossy copy'] }
  };
}
const memWith = (P, backend) => P.ctx.PulseEvidenceMemory.createEvidenceMemory({ backend: backend || P.ctx.PulseEvidenceMemory.memoryBackend() });
async function exported(P) { return P.ctx._ehMem.exportJson(); }
async function settle(p, ms) { let t; const to = new Promise(r => { t = setTimeout(() => r('TIMEOUT'), ms || 400); }); const v = await Promise.race([p, to]); clearTimeout(t); return v; }
// The run's own id and timestamp (Date.now / toISOString at the end of the scan) differ between any two runs; everything else must be equal.
const unstamp = s => s.replace(/\\?"_runId\\?":\d+/g, '"_runId":0').replace(/\\?"_timestamp\\?":\\?"[^"\\]*\\?"/g, '"_timestamp":0');
const norm = P => unstamp(JSON.stringify({ writes: P.writes, results: P.ctx.__get(), renders: P.renders }));

// ---------- rows ----------
const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };
const ok = (c, m) => { if (!c) throw new Error(m); };

row('CP-1', async src => {
  const inner = between(src, WRAP_OPEN, WRAP_CLOSE).inner;
  // W4: the wrapper is strict at run time (S1's 'use strict' directive applies inside it, as in Node)
  const sb = between(src, HEAD_MARK, WRAP_CLOSE);
  const sctx = vm.createContext({});
  vm.runInContext(src.slice(sb.start, sb.end).replace(WRAP_CLOSE, 'module.exports.__strictProbe = (function () { return this === undefined; })();\n' + WRAP_CLOSE), sctx);
  ok(vm.runInContext('PulseEvidenceMemory.__strictProbe', sctx) === true, 'the inlined module is not strict at run time');
  ok(sha(inner) === S1_SHA && inner === MODULE_FILE, 'inlined text differs from services/evidence-memory.js');
  const P = page(src);
  const block = between(src, HEAD_MARK, WRAP_CLOSE);
  const ref = new Set(Object.getOwnPropertyNames(vm.runInNewContext('this')));
  const fresh = vm.createContext({});
  vm.runInContext(src.slice(block.start, block.end), fresh);
  const added = Object.getOwnPropertyNames(vm.runInContext('this', fresh)).filter(k => !ref.has(k));
  ok(added.length === 1 && added[0] === 'PulseEvidenceMemory', 'globals added by the module block: ' + added.join(','));
  ok(typeof P.ctx.PulseEvidenceMemory.createEvidenceMemory === 'function' && typeof P.ctx.PulseEvidenceMemory.validateExport === 'function', 'exports missing');
});

row('CP-2', async src => {
  const P = page(src);
  P.store.pt_holdings = JSON.stringify({ AAA: { shares: 5, note: TOK.hold } });
  P.ctx._ehMem = memWith(P);
  await P.ctx.runAnalysis();
  await settle(P.ctx._ehQueue, 1000);
  const doc = await exported(P);
  ok(typeof doc === 'string', 'no export');
  for (const k of ['raw', 'dbg', 'summary', 'risk', 'entry', 'inval', 'hold']) ok(doc.indexOf(TOK[k]) === -1, 'token reached the store: ' + k);
  ok(doc.indexOf(TOK.pos) !== -1, 'positive control: a parsed catalyst must be stored');
  ok(JSON.parse(doc).snapshotCount === 2, 'one snapshot per scanned ticker');
});

row('CP-3', async src => {
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  const items = [], dbg = {};
  LIVE.captures.forEach((c, i) => {
    const t = c.ticker; if (dbg[t]) return;
    dbg[t] = { rawText: c.raw, parsed: parsedOf(c) };
    items.push({ ticker: t, action: 'hold_wait', technical_setup: 'healthy_uptrend', sentiment: 'neutral', sentiment_score: 50, _catalystDirection: 'mixed', _verifiedPrice: 100 + i, _catalysts: { bullish: [] } });
  });
  dbg.ZZZ = { parsed: parsedFor('ZZZ') };
  items.push({ ticker: 'ZZZ', action: 'hold_wait', sentiment: 'neutral', sentiment_score: 50, _verifiedPrice: 9, _catalysts: { bullish: [] } });
  const tally = await P.ctx._ehCaptureScan(items, dbg, new Date().toISOString());
  ok(tally.captured === items.length && tally.failed === 0, 'captured ' + JSON.stringify(tally) + ' of ' + items.length);
  const doc = JSON.parse(await exported(P));
  const z = doc.snapshots.find(s => s.ticker === 'ZZZ');
  ok(z && z.research.ratingOnlyActions.length === 1 && z.research.guidance && z.research.contracts, 'rating-only / guidance / contracts lost');
  for (const t of Object.keys(dbg).filter(k => k !== 'ZZZ')) {
    const s = doc.snapshots.find(x => x.ticker === t), p = dbg[t].parsed;
    ok(s, 'live ticker not stored ' + t);
    const want = (p.bullishCatalysts || []).filter(x => typeof x === 'string' && x.length <= 300 && !/[\n\r]/.test(x)).length;
    ok(s.research.bullish.length === Math.min(want, 10), t + ' bullish ' + s.research.bullish.length + ' vs parsed ' + want);
    // W3: the other parser fields of the live captures
    const lines = a => Math.min((a || []).filter(x => typeof x === 'string' && x.length <= 300 && !/[\n\r]/.test(x)).length, 10);
    ok(s.research.bearish.length === lines(p.bearishCatalysts), t + ' bearish ' + s.research.bearish.length + ' vs parsed ' + lines(p.bearishCatalysts));
    ok(s.research.macro.length === lines(p.macroDrivers), t + ' macro ' + s.research.macro.length + ' vs parsed ' + lines(p.macroDrivers));
    for (const k of ['earnings', 'guidance', 'contracts', 'peerMove']) {
      const v = typeof p[k] === 'string' ? p[k].replace(/[ \t]+/g, ' ').trim() : '';
      const wantScalar = (v && v.length <= 300 && !/^(?:none|n\/a|unknown)\b/i.test(v)) ? v : null;
      ok(s.research[k] === wantScalar, t + ' ' + k + ': ' + JSON.stringify(s.research[k]) + ' vs parsed ' + JSON.stringify(wantScalar));
    }
    const firmOk = a => a && typeof a.bank === 'string' && /^[A-Za-z0-9][A-Za-z0-9&.,' \-]{0,39}$/.test(a.bank.trim()) && a.bank.trim().split(' ').length <= 6;
    const acts = (p.analystActions || []).filter(firmOk), rated = (p.ratingOnlyActions || []).filter(firmOk);
    ok(s.research.analystActions.length === Math.min(acts.length, 10) && s.research.analystActions.every((x, i) => x.firm === acts[i].bank.trim()), t + ' analyst actions mismapped');
    ok(s.research.ratingOnlyActions.length === Math.min(rated.length, 10) && s.research.ratingOnlyActions.every((x, i) => x.firm === rated[i].bank.trim()), t + ' rating-only actions mismapped');
  }
  // W3: every parser field of one fully populated output lands in its snapshot field
  const W = page(src);
  W.ctx._ehMem = memWith(W);
  const rich = {
    analystActions: [{ bank: 'Mizuho', action: 'raised', ratingAction: 'upgraded', rating: 'Outperform', target: 210, ptFrom: 190, ptAction: 'raised', raw: 'Mizuho raised PT to $210 from $190 (October 15)' }],
    ratingOnlyActions: [{ bank: 'Bernstein', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Bernstein upgraded to Buy (October 14)' }],
    bullishCatalysts: ['bull one', 'bull two'], bearishCatalysts: ['bear one'], macroDrivers: ['macro one', 'macro two'],
    earnings: 'beat on revenue and EPS', guidance: 'raised full-year guidance', contracts: 'a five-year supply contract', peerMove: 'peer group up 3%',
    revisionDirection: 'downgrading', revisionRecency: 'October 12', dataFreshness: 'this week',
    sources: [{ url: 'https://example.com/a', title: 'Example title', date: '2026-10-14' }]
  };
  const wt = await W.ctx._ehCaptureScan([{ ticker: 'RICH', action: 'trim', technical_setup: 'support_test', sentiment: 'negative', sentiment_score: 33, _catalystDirection: 'bearish', _verifiedPrice: 77.25, _catalysts: { bullish: [] } }], { RICH: { parsed: rich } }, new Date().toISOString());
  ok(wt.captured === 1, 'rich capture ' + JSON.stringify(wt));
  const snap = JSON.parse(await exported(W)).snapshots[0];
  const cj = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
  const wantResearch = {
    unavailable: false, allNone: false,
    analystActions: [{ firm: 'Mizuho', action: 'raised', ratingAction: 'upgraded', rating: 'Outperform', date: 'October 15', target: 210, targetFrom: 190, targetAction: 'raised' }],
    ratingOnlyActions: [{ firm: 'Bernstein', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', date: 'October 14' }],
    bullish: ['bull one', 'bull two'], bearish: ['bear one'], macro: ['macro one', 'macro two'],
    earnings: 'beat on revenue and EPS', guidance: 'raised full-year guidance', contracts: 'a five-year supply contract', peerMove: 'peer group up 3%',
    revisionDirection: 'downgrading', revisionRecency: 'October 12', dataFreshness: 'this week'
  };
  for (const k of Object.keys(wantResearch)) ok(cj(snap.research[k]) === cj(wantResearch[k]), 'research.' + k + ' mismapped: ' + cj(snap.research[k]));
  ok(cj(snap.sources) === cj([{ url: 'https://example.com/a', domain: 'example.com', title: 'Example title', date: '2026-10-14' }]), 'sources mismapped: ' + cj(snap.sources));
  ok(cj(snap.assessment) === cj({ action: 'trim', technicalSetup: 'support_test', sentiment: 'negative', sentimentScore: 33, catalystDirection: 'bearish' }), 'assessment mismapped: ' + cj(snap.assessment));
  ok(cj(snap.market) === cj({ price: 77.25, currency: null }), 'market mismapped: ' + cj(snap.market));
});

row('CP-4', async src => {
  const run = async mode => {
    const P = page(src);
    if (mode === 'off') P.ctx.PT_EVIDENCE_CAPTURE = false;
    if (mode === 'memory') P.ctx._ehMem = memWith(P);
    if (mode === 'throwing') P.ctx._ehMem = { put() { throw new Error('x'); } };
    if (mode === 'rejecting') P.ctx._ehMem = { put() { return Promise.reject(new Error('x')); } };
    if (mode === 'hanging') P.ctx._ehMem = { put() { return new Promise(() => {}); } };
    if (mode === 'factory') { P.ctx._ehMem = null; P.ctx.PulseEvidenceMemory = { createEvidenceMemory() { throw new Error('x'); }, indexedDbBackend() { throw new Error('x'); } }; }
    const done = await settle(P.ctx.runAnalysis().then(() => 'DONE'), 1500);
    ok(done === 'DONE', mode + ': runAnalysis did not finish');
    await settle(P.ctx._ehQueue, 50);
    return norm(P);
  };
  const ref = await run('off');
  for (const m of ['memory', 'throwing', 'rejecting', 'hanging', 'factory']) ok(await run(m) === ref, 'scan output changed with capture ' + m);
});

row('CP-5', async src => {
  for (const [v, expect] of [[true, 2], ['true', 0], [1, 0], [false, 0], [undefined, 0]]) {
    const P = page(src);
    P.ctx._ehMem = memWith(P);
    P.ctx.PT_EVIDENCE_CAPTURE = v;
    await P.ctx.runAnalysis();
    await settle(P.ctx._ehQueue, 1000);
    const st = await P.ctx._ehMem.stats();
    ok(st.snapshots === expect, 'gate ' + String(v) + ' stored ' + st.snapshots);
  }
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  P.ctx.PT_EVIDENCE_CAPTURE = true; await P.ctx.runAnalysis(); await settle(P.ctx._ehQueue, 1000);
  P.ctx.PT_EVIDENCE_CAPTURE = false;
  ok((await P.ctx._ehRender()).snapshots === 2 && /^2 snapshots/.test(P.els.ehStatus.textContent), 'status with the gate off');
  ok(await P.ctx._ehExport() === true && P.downloads.length === 1, 'export with the gate off');
  ok(await P.ctx._ehClear() === true && (await P.ctx._ehMem.stats()).snapshots === 0, 'clear with the gate off');
});

row('CP-6', async src => {
  let opens = 0;
  const idb = { open() { opens += 1; const req = {}; setTimeout(() => { req.error = new Error('no'); if (req.onerror) req.onerror(); }, 0); return req; } };
  const P = page(src, { idb });
  ok(opens === 0, 'indexedDB opened at load');
  P.ctx.PT_EVIDENCE_CAPTURE = false;
  await P.ctx.runAnalysis();
  ok(opens === 0 && P.ctx._ehMem === null, 'store touched by a scan with capture off');
  await P.ctx._ehRender();
  ok(opens >= 1, 'first control use must open the store');
  ok(P.els.ehStatus.textContent === 'Research history is not available in this browser.', 'unavailable wording: ' + P.els.ehStatus.textContent);
});

row('CP-7', async src => {
  const P = page(src, { confirm: () => false });
  P.ctx._ehMem = memWith(P);
  await P.ctx.runAnalysis(); await settle(P.ctx._ehQueue, 1000);
  ok(await P.ctx._ehClear() === false && (await P.ctx._ehMem.stats()).snapshots === 2, 'cleared without confirmation');
  ok(await P.ctx._ehExport() === true && P.downloads.length === 1, 'export');
  const d = P.downloads[0];
  ok(d.name === 'pulse-research-history_2026-10-17_10-00-00.json' && P.ctx.PulseEvidenceMemory.validateExport(JSON.parse(d.text)), 'export not a valid S1 document');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 2, tickers: 2, oldestDay: '2026-10-16', newestDay: '2026-10-17' }) === '2 snapshots · 2 tickers · 2026-10-16 to 2026-10-17', 'status wording');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 1, tickers: 1, oldestDay: '2026-10-17', newestDay: '2026-10-17' }) === '1 snapshot · 1 ticker · 2026-10-17', 'singular wording');
  ok(P.ctx._ehStatusText({ ok: true, snapshots: 0 }) === 'No research history stored yet.', 'empty wording');
  const F = page(src, { confirm: () => true });
  const bad = () => Promise.reject(new Error('x'));
  F.ctx._ehMem = memWith(F, { kind: 'bad', get: bad, put: bad, del: bad, keys: bad });
  ok(await F.ctx._ehExport() === false && F.downloads.length === 0 && F.toasts.indexOf('Research history export failed') !== -1, 'failed export worded as success');
  ok(await F.ctx._ehClear() === false && F.toasts.indexOf('Research history could not be cleared') !== -1, 'failed clear worded as success');
  const C = page(src, { confirm: () => true });
  C.ctx._ehMem = memWith(C);
  await C.ctx.runAnalysis(); await settle(C.ctx._ehQueue, 1000);
  ok(await C.ctx._ehClear() === true && (await C.ctx._ehMem.stats()).snapshots === 0 && C.toasts.indexOf('Research history cleared') !== -1, 'confirmed clear');
});

row('CP-8', async src => {
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  const now = new Date().toISOString();
  const dbg = { AIF: { parsed: parsedFor('AIF') }, UNA: { unavailable: true, rawText: TOK.raw }, NOD: null, STALE: { parsed: parsedFor('STALE') } };
  const evil = {}; Object.defineProperty(evil, 'ticker', { get() { throw new Error('boom'); } });
  const items = [
    { ticker: 'AIF', _aiUnavailable: true, sentiment: 'neutral', sentiment_score: null, action: 'hold_wait', technical_setup: 'below_key_mas', _catalystDirection: 'bearish', _verifiedPrice: 12 },
    { ticker: 'UNA', sentiment: 'positive', sentiment_score: 70, action: 'hold_wait', _verifiedPrice: 5 },
    { ticker: 'NOD', sentiment: 'positive', sentiment_score: 70 },
    { ticker: 'MISSING', sentiment: 'positive', sentiment_score: 70 },
    null, 'AAA', [], evil, { ticker: 'bad ticker!' }
  ];
  dbg['bad ticker!'] = { parsed: parsedFor('X') };
  const tally = await P.ctx._ehCaptureScan(items, dbg, now);
  ok(tally.captured === 2 && tally.skipped === 6 && tally.failed === 1, 'tally ' + JSON.stringify(tally)); // 6 skipped: no / null debug entry, null, string, array, throwing getter; 1 refused by S1 (bad ticker)
  const doc = JSON.parse(await exported(P));
  const aif = doc.snapshots.find(s => s.ticker === 'AIF'), una = doc.snapshots.find(s => s.ticker === 'UNA');
  ok(aif && aif.assessment.action === null && aif.assessment.sentiment === null && aif.assessment.sentimentScore === null, 'AI placeholders stored');
  ok(aif.assessment.technicalSetup === 'below_key_mas' && aif.assessment.catalystDirection === 'bearish' && aif.market.price === 12, 'non-AI fields lost');
  ok(una && una.research.unavailable === true, 'unavailable research not captured');
  ok(!doc.snapshots.some(s => s.ticker === 'STALE' || s.ticker === 'NOD' || s.ticker === 'MISSING'), 'stale / missing entry captured');
  const empty = await P.ctx._ehCaptureScan([], dbg, now);
  ok(empty.captured === 0 && empty.skipped === 0, 'empty scan');
});

row('CP-9', async src => {
  const P = page(src);
  const order = [];
  const base = P.ctx.PulseEvidenceMemory.memoryBackend();
  const slow = f => function () { const a = arguments; return new Promise(r => setTimeout(r, 3)).then(() => f.apply(null, a)); };
  P.ctx._ehMem = memWith(P, { kind: 'slow', get: slow(base.get), del: slow(base.del), keys: slow(base.keys), put: slow((k, v) => { order.push(v.ticker); return base.put(k, v); }) });
  const now = new Date().toISOString(), later = new Date(Date.now() + 1000).toISOString();
  const dbg = { AAA: { parsed: parsedFor('AAA') }, BBB: { parsed: parsedFor('BBB') }, CCC: { parsed: parsedFor('CCC') }, DDD: { parsed: parsedFor('DDD') } };
  const r = t => ({ ticker: t, sentiment: 'positive', sentiment_score: 60, _verifiedPrice: 10 });
  const a = P.ctx._ehCaptureScan([r('AAA'), r('BBB')], dbg, now);
  const b = P.ctx._ehCaptureScan([r('CCC'), r('DDD')], dbg, later);
  await Promise.all([a, b]);
  ok(order.join(',') === 'AAA,BBB,CCC,DDD', 'interleaved captures: ' + order.join(','));
});

row('CP-10', async src => {
  let s = src;
  const region = between(s, HEAD_MARK, END_MARK);
  s = s.slice(0, region.start) + s.slice(region.end);
  ok(s.split(CALL_LINES).length === 2, 'capture call lines not found exactly once');
  s = s.replace(CALL_LINES, '');
  const bi = s.indexOf(BOX_OPEN), be = s.indexOf('    </details>\n', bi);
  ok(bi !== -1 && be !== -1 && s.indexOf(BOX_OPEN, bi + 1) === -1, 'history box not found exactly once');
  s = s.slice(0, bi) + s.slice(be + '    </details>\n'.length);
  ok(sha(s) === BASE_INDEX_SHA, 'index.html differs from the base outside the three insertions: ' + sha(s));
  const ra = fnText(src, 'runAnalysis');
  ok(ra.split('_ehCaptureScan(').length === 2 && !/await\s+_ehCaptureScan/.test(ra), 'capture call awaited or repeated');
  ok(ra.indexOf('_ehCaptureScan(') > ra.indexOf('renderResults(finalResults, dateStr);') && ra.indexOf('_ehCaptureScan(') < ra.indexOf('} catch (err) {'), 'capture call misplaced');
});

// W4: scan-flow gaps (cancellation, a second scan while a capture is pending, only this run's tickers)
row('CP-11', async src => {
  const forAll = (P, syms) => syms.forEach(t => { P.ctx.window._pplxDebug[t] = { parsed: parsedFor(t) }; });
  // (a) a scan cancelled after its first ticker completes captures only that ticker
  const A = page(src, {
    symbols: ['AAA', 'BBB', 'CCC'],
    analyzeChunk: async batch => { forAll(A, ['AAA', 'BBB', 'CCC']); A.ctx._cancelRequested = true; return batch.map(s => defaultResult(s, A.ctx)); }
  });
  A.ctx._ehMem = memWith(A);
  await A.ctx.runAnalysis();
  await settle(A.ctx._ehQueue, 1000);
  ok(A.ctx.__get().length === 1, 'precondition: the scan was cancelled after one ticker');
  const da = JSON.parse(await exported(A)).snapshots.map(s => s.ticker).join(',');
  ok(da === 'AAA', 'cancelled scan stored: ' + da);
  // (b) a second scan started while the first capture is pending: its puts stay behind the first's
  const syms = ['AAA', 'BBB'], order = [];
  const B = page(src, { symbols: syms });
  const base = B.ctx.PulseEvidenceMemory.memoryBackend();
  const slow = f => function () { const a = arguments; return new Promise(r => setTimeout(r, 15)).then(() => f.apply(null, a)); };
  B.ctx._ehMem = memWith(B, { kind: 'slow', get: slow(base.get), del: slow(base.del), keys: slow(base.keys), put: slow((k, v) => { order.push(v.ticker); return base.put(k, v); }) });
  await B.ctx.runAnalysis();
  ok(order.length === 0, 'the scan waited for its capture');
  syms.splice(0, 2, 'CCC', 'DDD');
  await B.ctx.runAnalysis();
  await settle(B.ctx._ehQueue, 3000);
  ok(order.join(',') === 'AAA,BBB,CCC,DDD', 'second scan overtook the first capture: ' + order.join(','));
  // (c) the capture receives only the tickers scanned in this run, not the merged earlier results
  const C = page(src, { symbols: ['AAA', 'BBB'] });
  C.ctx._ehMem = memWith(C);
  C.ctx.window._pplxDebug = {};
  const old = defaultResult('OLD', C.ctx);
  vm.runInContext('results = ' + JSON.stringify([old]) + ';', C.ctx);
  const seen = [], real = C.ctx._ehCaptureScan;
  C.ctx._ehCaptureScan = function (items, dbg, at) { seen.push((items || []).map(r => r.ticker).join(',')); return real(items, dbg, at); };
  await C.ctx.runAnalysis();
  await settle(C.ctx._ehQueue, 1000);
  ok(JSON.parse(C.store.pt_results).some(r => r.ticker === 'OLD'), 'precondition: the saved results still hold the earlier ticker');
  ok(seen.join('|') === 'AAA,BBB', 'capture received: ' + seen.join('|'));
  ok(JSON.parse(await exported(C)).snapshots.every(s => s.ticker !== 'OLD'), 'an earlier result was captured again');
});

// W1: a Clear and a queued capture are serialized
row('CP-12', async src => {
  const slowMem = P => {
    const b = P.ctx.PulseEvidenceMemory.memoryBackend();
    const slow = f => function () { const a = arguments; return new Promise(r => setTimeout(r, 5)).then(() => f.apply(null, a)); };
    return memWith(P, { kind: 'slow', get: slow(b.get), put: slow(b.put), del: slow(b.del), keys: slow(b.keys) });
  };
  const now = new Date().toISOString();
  const dbg = { AAA: { parsed: parsedFor('AAA') }, BBB: { parsed: parsedFor('BBB') } };
  const items = ['AAA', 'BBB'].map(t => ({ ticker: t, sentiment: 'positive', sentiment_score: 60, _verifiedPrice: 10 }));
  // a capture queued before a confirmed Clear must not re-create the history the Clear deleted
  const A = page(src, { confirm: () => true });
  A.ctx._ehMem = slowMem(A);
  const capA = A.ctx._ehCaptureScan(items, dbg, now);
  const clrA = A.ctx._ehClear();
  await Promise.all([capA, clrA]);
  const sa = await A.ctx._ehMem.stats();
  ok(sa.snapshots === 0, 'a queued capture re-created cleared history: ' + sa.snapshots);
  // a capture that arrives after the Clear is a new capture and is kept (it is not swallowed by the Clear)
  const B = page(src, { confirm: () => true });
  B.ctx._ehMem = slowMem(B);
  const clrB = B.ctx._ehClear();
  const capB = B.ctx._ehCaptureScan(items, dbg, now);
  await Promise.all([clrB, capB]);
  const sb = await B.ctx._ehMem.stats();
  ok(sb.snapshots === 2, 'a capture queued after the Clear was lost: ' + sb.snapshots);
});

// W2: a throwing download is contained; the status line is announced
row('CP-13', async src => {
  const P = page(src);
  P.ctx._ehMem = memWith(P);
  await P.ctx._ehCaptureScan([{ ticker: 'AAA', sentiment: 'positive', sentiment_score: 60, _verifiedPrice: 10 }], { AAA: { parsed: parsedFor('AAA') } }, new Date().toISOString());
  P.ctx._ptDownload = () => { throw new Error('download blocked'); };
  const res = await settle(P.ctx._ehExport(), 1000);
  ok(res === false, 'a throwing download was not contained: ' + String(res));
  ok(P.toasts.indexOf('Research history export failed') !== -1 && P.downloads.length === 0, 'no failure toast, or something downloaded');
  const tag = /<[a-z]+\b[^>]*\bid="ehStatus"[^>]*>/.exec(src);
  ok(tag && (/\brole="status"/.test(tag[0]) || /\baria-live="polite"/.test(tag[0])), 'the status element is not announced to assistive technology');
});

// ---------- planted negatives ----------
const NEG = [
  ['CP-N1 wrapper removed (top-level paste)', ['CP-1'], s => s.replace(WRAP_OPEN, '').replace(WRAP_CLOSE,
    'var PulseEvidenceMemory = { createEvidenceMemory: createEvidenceMemory, indexedDbBackend: indexedDbBackend, memoryBackend: memoryBackend, validateExport: validateExport };\n')],
  ['CP-N2 debug record passed as research', ['CP-2'], s => s.replace('research = d.parsed;', 'research = d;')],
  ['CP-N3 lossy _catalysts used as the source', ['CP-3'], s => s.replace("if (d && d.parsed && typeof d.parsed === 'object' && !Array.isArray(d.parsed)) research = d.parsed;",
    "if (d && d.parsed && typeof d.parsed === 'object' && !Array.isArray(d.parsed)) research = r._catalysts || {};")],
  ['CP-N4 capture awaited by the scan', ['CP-4', 'CP-10'], s => s.replace('    _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);', '    await _ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);')],
  ['CP-N5 truthy gate', ['CP-5'], s => s.replace('if (PT_EVIDENCE_CAPTURE !== true) return', 'if (!PT_EVIDENCE_CAPTURE) return')],
  ['CP-N6 store opened at page load', ['CP-6'], s => s.replace('var _ehQueue = Promise.resolve();', 'var _ehQueue = Promise.resolve(); _ehMemory().prune();')],
  ['CP-N7 clear without confirmation', ['CP-7'], s => s.replace("if (!window.confirm('Delete all research history stored on this device? This cannot be undone.')) return Promise.resolve(false);", '')],
  ['CP-N8 AI placeholders kept', ['CP-8'], s => s.replace('var ai = r._aiUnavailable !== true;', 'var ai = true;')],
  ['CP-N9 no capture queue', ['CP-9'], s => s.replace('var run = _ehQueue.then(function () {', 'var run = Promise.resolve().then(function () {')],
  // §W planted negatives (evidence-capture-1 W1..W4)
  ['CP-N10 one parser field dropped (peerMove)', ['CP-3'], s => s.replace('research = d.parsed;', 'research = Object.assign({}, d.parsed, { peerMove: null });')],
  ['CP-N11 capture receives the merged results', ['CP-11'], s => s.replace('_ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);', '_ehCaptureScan(finalResults, window._pplxDebug, runTimestamp);')],
  ['CP-N12 Clear bypasses the capture queue', ['CP-12'], s => s.replace('_ehQueue.then(function () { return _ehMemory().clear(); })', 'Promise.resolve().then(function () { return _ehMemory().clear(); })')],
  ['CP-N13 export download failure not contained', ['CP-13'], s => s.replace("catch (e) { showToast('Research history export failed'); return false; }", 'catch (e) { throw e; }')],
  ['CP-N14 status element not announced', ['CP-13'], s => s.replace(' role="status" aria-live="polite"', '')],
  ['CP-N15 strict directive removed from the inlined module', ['CP-1'], s => s.replace(WRAP_OPEN + "'use strict';\n", WRAP_OPEN)],
  ['CP-N16 capture ignores the cancellation (every scan symbol captured)', ['CP-11'], s => s.replace('_ehCaptureScan(dedupedNew, window._pplxDebug, runTimestamp);', "_ehCaptureScan(scanSymbols.map(function (t) { return { ticker: t, sentiment: 'neutral', sentiment_score: 50, _verifiedPrice: 1 }; }), window._pplxDebug, runTimestamp);")],
  ['CP-N17 no capture queue (back-to-back scans)', ['CP-11'], s => s.replace('var run = _ehQueue.then(function () {', 'var run = Promise.resolve().then(function () {')]
];

async function runRow(id, src) {
  try { await ROWS[id](src); return null; } catch (e) { return (e && e.message) || String(e); }
}

(async () => {
  let fails = 0;
  for (const id of ORDER) {
    const err = await runRow(id, SRC);
    if (err) { fails++; console.log('  FAIL  ' + id + '  ' + err); } else console.log('  PASS  ' + id);
  }
  for (const [label, rows, mutate] of NEG) {
    const m = mutate(SRC);
    if (m === SRC) { fails++; console.log('  FAIL  negative ' + label + ': mutation did not apply'); continue; }
    const res = [];
    for (const id of rows) res.push(await runRow(id, m));
    if (res.every(Boolean)) console.log('  PASS  negative ' + label + ' -> ' + rows.join(' / ') + ' fail');
    else { fails++; console.log('  FAIL  negative ' + label + ': ' + rows.filter((r, i) => !res[i]).join(' / ') + ' still pass'); }
  }
  console.log(fails ? 'EVIDENCE CAPTURE OFFLINE: FAIL (' + fails + ')' : 'EVIDENCE CAPTURE OFFLINE: PASS (' + ORDER.length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
