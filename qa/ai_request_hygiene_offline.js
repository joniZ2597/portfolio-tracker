#!/usr/bin/env node
'use strict';
/*
 * qa/ai_request_hygiene_offline.js - ai-request-hygiene-1 (G-1, G-2, P-5 note; Main Control D-18).
 *
 * Rows are derived from the brief's Risk & Test Design (section RT), written from the requirements before the
 * implementation was read; expected values come from the requirements, never from the edited code's own output.
 * The REAL functions are extracted from index.html and run with stubs (no network, no browser, no storage).
 *
 *   HY-1  scan request: max_tokens 2500 (number) on every attempt; model unchanged; Deep Dive and P-5 caps unchanged
 *   HY-2  2500 fits every limit on the path: proxy clamp >= 2500; proxy timeout > the 30.2 s DEV proof; no client timer
 *   HY-3  truncation handling unchanged: same returned text for a cut reply; retry / parse functions byte-identical
 *   HY-4  telemetry is memory-only: no storage, DOM or extra network access; returned text identical
 *   HY-5  telemetry keeps each attempt per ticker (a cut reply and its retry are both kept)
 *   HY-6  telemetry never changes behaviour and is bounded: reply shapes x hostile windows x a hostile response;
 *         <= 4 attempts per ticker and <= 100 tickers (least recently written dropped, digit-only symbols included)
 *   HY-7  invalid or missing price / volume / change % print n/a (>= 5 inputs per field kind)
 *   HY-8  USD prices: 2 decimals (up to 4 below $1); only price fields change; whole block vs the expected text
 *   HY-9  .TA: finite values byte-identical to the previous rule; invalid values print n/a
 *   HY-10 P-5 call-2 client timeout: proxy timeout < value <= 60000 (platform limit); comment names the 50 s proxy
 *   HY-11 out of scope unchanged: prompt and model (digest of the rendered request), protected functions (digests at d5a03fe)
 *   HY-N1..N11 planted negatives (each mutates index.html; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const PROXY = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'anthropic-proxy.js'), 'utf8').replace(/\r\n/g, '\n');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---- constants taken from the base (d5a03fe), not from the edited code ----
// Rendered request (system + messages + model) for the fixed inputs below; the task changes only max_tokens.
const BASE_PROMPT_DIGEST = 'f7279ba21eca41cc41e634778afd75eb33b1206e94e1c16dcafe8e009f00feb8';
// Functions this task must not change (extracted with index-pins-core, sha256 of the text at d5a03fe).
const BASE_DIGESTS = {
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  orchestrate: '2e352b3f1d4739e8f98fb079ed3c3865115263e12dcdc53dda70350bebf97dfb',
  enforceScoreConsistency: '28a3a5cac29be9a0b61e854182caaa7cac2ed241fe847fd5b65e8e05a8cbfc60',
  parseJSON: 'c02413e78fb8c027bcfc8518fc36615ca8294637b5e8403196e5a2212f94c4e9',
  repairJSON: '9a8db71f54bd5b191e671a26c9838c44a785c5b6eaa29b06896b6945dd4d9eaa',
  formatNewsContext: '2690087b1a615637b8c1f8175cae1ab2180bbf874ca94ba6c3f6d0cc99d3409c',
  buildTechSnapshotBlock: 'ee1528756a40c24ed1647b889ff13c06002c87e12ee4eb0c7c01cef5000289a1',
  renderMainPanel: '61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1',
  fetchPerplexityContext: '08c0d05765e5f07c138559978312bf6806dae72d5a16194cec2fbc93cb1b8e0d',
  parsePerplexityContext: '54a2feda31d3a7d4c3072f85dd10bb1e0ae5a1cd7d79cb1f87ab6bf5a367f6c5',
  _p5RequestSynthesis: '8152ce42c87fe272e5a9fa07f0af807c5d42c0564ea4187d19d196b94597e428',
  _dd0FetchAnalysis: 'bcec3745e3511b354337220208531e9a04143cd82df626f8348da57f39894a6c',
  fetchStockData: 'c3f2a021b72b9e6cf0ade43ad0ae7d9f316e64e9b6c6d3e9461cf1dc0542d752',
  fetchYahoo: 'da826004e7de4edbcd086a8def36ed775f3f656e9117eb37957a662bf2a899d1',   // market-data-daily-change-1 (V-1): session-aligned daily change
  fetchAlphaVantage: '506fc899c5f89a7d4150e04c316f80c2539afb1a0692d3ca388f8bd1ca446c2b',
  runAnalysis: '7d5c029bd336cdfadb93a542b38e45ee715f2a70a2fd14e501f1c0a29e2e1aa7'   // evidence-capture-1: one fire-and-forget capture call
};
const DEV_PROOF_MS = 30159;   // Check B (2026-10-16): a 2,500-token reply took 30,159 ms and returned 200

// ---- helpers ----
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
const reply = (text, extra) => Object.assign({ content: [{ type: 'text', text: text }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 900 } }, extra || {});
const GOOD = '"results":[{"ticker":"NVDA","summary":"ok"}]}';
const CUT = '"results":[{"ticker":"NVDA","summary":"cut mid';
const ARGS = (sym) => [[sym || 'NVDA'], '16.10.2026', 'STOCK BLOCK\n%%NEWS_CONTEXT_START%%\n{"NVDA":{}}', 'TECH SNAP'];

// Build fetchAnthropicAnalysis in an isolated context. `win`: undefined -> no window at all; otherwise the window object.
// Every access to storage / document is recorded; fetch returns the queued replies in order.
function makeAnalysis(src, opts) {
  const o = opts || {};
  const log = { fetches: [], touched: [] };
  const queue = (o.replies || []).slice();
  const spy = name => new Proxy({}, { get(t, k) { log.touched.push(name + '.' + String(k)); return () => null; }, set(t, k) { log.touched.push(name + '=' + String(k)); return true; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    formatNewsContext: (p, s) => 'NEWS ' + s,
    localStorage: spy('localStorage'), sessionStorage: spy('sessionStorage'), document: spy('document'), indexedDB: spy('indexedDB'),
    fetch: async (url, init) => {
      log.fetches.push({ url: url, init: init, body: JSON.parse(init.body) });
      const r = queue.length ? queue.shift() : { status: 200, body: reply(GOOD) };
      const res = { ok: r.status >= 200 && r.status < 300, json: async () => { if (r.badJson) throw new SyntaxError('bad json'); return r.body; } };
      if (o.hostileStatus) Object.defineProperty(res, 'status', { get() { throw new Error('hostile status'); } });
      else res.status = r.status;
      return res;
    }
  };
  if (o.win !== undefined) ctx.window = o.win;
  vm.createContext(ctx);
  vm.runInContext(fnText(src, 'fetchAnthropicAnalysis') + '\n;this.F = fetchAnthropicAnalysis;', ctx);
  return { F: ctx.F, log: log, ctx: ctx };
}
// telemetry entry of one ticker (the store is a Map; anything else counts as absent)
const tel = (w, k) => (w && w._aiReqDebug && typeof w._aiReqDebug.get === 'function') ? w._aiReqDebug.get(k) : undefined;
async function outcome(p) { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, v: String(e && e.message) }; } }

function makeContext(src) { return new Function(fnText(src, 'formatStockContext') + '\nreturn formatStockContext;')(); }
const row = (sym, over) => Object.assign({ symbol: sym, source: 'yahoo', price: 226.73, open: 225.1, previous_close: 224.6, high: 227.5, low: 224.9, volume: 1234567, change_percent: 0.95 }, over || {});
const WRAP = body => '\n=== LIVE MARKET DATA (verified, use exactly as provided) ===\n' + body + '\n=== END MARKET DATA ===';
const NOTE = '  NOTE: Do NOT estimate or infer November low / April low \u2192 mark as "not available" if unknown.';
const CUR = '  CURRENCY: ILS (Tel Aviv listing; prices converted from agorot). State every price level in ILS.';
const lineOf = (txt, label) => { const m = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ([^|\\n]*)').exec(txt); return m ? m[1].trim() : null; };

// ---- rows ----
async function rows(src, only) {
  const R = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in R) || R[id] === true) R[id] = cond ? true : (detail || 'fail'); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };

  if (want('HY-1')) await guard('HY-1', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT, { stop_reason: 'max_tokens' }) }, { status: 200, body: reply(GOOD) }] });
    await a.F.apply(null, ARGS()); await a.F.apply(null, ARGS());   // first attempt and the retry use the same function
    const caps = a.log.fetches.map(f => f.body.max_tokens), models = a.log.fetches.map(f => f.body.model);
    ok('HY-1', a.log.fetches.length === 2 && caps.every(c => c === 2500) && models.every(m => m === 'claude-haiku-4-5-20251001'),
      JSON.stringify({ caps, models }));
    const dd = fnText(src, '_dd0FetchAnalysis');
    ok('HY-1', /max_tokens: 1200\b/.test(dd) && (src.match(/var P5_CALL2_MAX_TOKENS = 700;/g) || []).length === 1, 'Deep Dive / P-5 cap changed');
  });

  if (want('HY-2')) await guard('HY-2', async () => {
    const clamp = /max_tokens:\s*Math\.min\(body\.max_tokens \|\| \d+,\s*(\d+)\)/.exec(PROXY);
    const tmo = /const TIMEOUT_MS\s*=\s*(\d+);/.exec(PROXY);
    const fa = fnText(src, 'fetchAnthropicAnalysis');
    ok('HY-2', !!clamp && Number(clamp[1]) >= 2500 && !!tmo && Number(tmo[1]) > DEV_PROOF_MS && !/AbortSignal|setTimeout|signal\s*:/.test(fa),
      JSON.stringify({ clamp: clamp && clamp[1], timeout: tmo && tmo[1] }));
  });

  if (want('HY-3')) await guard('HY-3', async () => {
    // a cut reply returns exactly the text it returns when the same body ends normally (cap and telemetry do not alter it)
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT, { stop_reason: 'max_tokens' }) }] });
    const b = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(CUT) }] });
    const x = await outcome(a.F.apply(null, ARGS())), y = await outcome(b.F.apply(null, ARGS()));
    ok('HY-3', x.ok && y.ok && x.v === y.v, JSON.stringify([x, y]));
    for (const n of ['analyzeChunk', 'parseJSON', 'repairJSON']) ok('HY-3', sha(fnText(src, n)) === BASE_DIGESTS[n], n + ' changed');
  });

  if (want('HY-4')) await guard('HY-4', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply(GOOD) }, { status: 504, body: { error: { message: 'Upstream timeout' } } }] });
    const v1 = await outcome(a.F.apply(null, ARGS())); const v2 = await outcome(a.F.apply(null, ARGS()));
    const fa = fnText(src, 'fetchAnthropicAnalysis');
    ok('HY-4', a.log.touched.length === 0 && a.log.fetches.length === 2 && a.log.fetches.every(f => f.url === '/.netlify/functions/anthropic-proxy') &&
      v1.ok && v1.v === '{"results":[{"ticker":"NVDA","summary":"ok"}]}' && !v2.ok && v2.v === 'Anthropic: Upstream timeout' &&
      !/localStorage|sessionStorage|indexedDB|document\.|pt_results/.test(fa), JSON.stringify({ touched: a.log.touched, v1, v2 }));
  });

  if (want('HY-5')) await guard('HY-5', async () => {
    const win = {};
    const a = makeAnalysis(src, { win: win, replies: [
      { status: 200, body: reply(CUT, { stop_reason: 'max_tokens', usage: { input_tokens: 5000, output_tokens: 2500 } }) },
      { status: 200, body: reply(GOOD, { usage: { input_tokens: 5000, output_tokens: 1400 } }) }] });
    await a.F.apply(null, ARGS()); await a.F.apply(null, ARGS());
    const e = tel(win, 'NVDA');
    ok('HY-5', Array.isArray(e) && e.length === 2 &&
      e[0].stopReason === 'max_tokens' && e[0].outputTokens === 2500 && e[0].inputTokens === 5000 && e[0].status === 200 && e[0].maxTokens === 2500 &&
      e[1].stopReason === 'end_turn' && e[1].outputTokens === 1400 && typeof e[0].at === 'number' &&
      Object.keys(e[0]).sort().join(',') === 'at,inputTokens,maxTokens,outputTokens,status,stopReason', JSON.stringify(e));
  });

  if (want('HY-6')) await guard('HY-6', async () => {
    const shapes = [
      ['no usage', { status: 200, body: { content: [{ type: 'text', text: GOOD }], stop_reason: 'end_turn' } }],
      ['usage strings', { status: 200, body: reply(GOOD, { usage: { input_tokens: '1200', output_tokens: '900' } }) }],
      ['usage NaN / negative / fraction', { status: 200, body: reply(GOOD, { usage: { input_tokens: NaN, output_tokens: -3.5 } }) }],
      ['usage not an object', { status: 200, body: reply(GOOD, { usage: 'many' }) }],
      ['stop_reason absent', { status: 200, body: { content: [{ type: 'text', text: GOOD }], usage: { input_tokens: 1, output_tokens: 2 } } }],
      ['stop_reason not a string', { status: 200, body: reply(GOOD, { stop_reason: { x: 1 } }) }],
      ['HTTP 504', { status: 504, body: { error: { message: 'Upstream timeout' } } }],
      ['HTTP 401 without message', { status: 401, body: {} }],
      ['JSON without content', { status: 200, body: { stop_reason: 'end_turn' } }],
      ['body not JSON', { status: 200, badJson: true }]
    ];
    const boom = () => { throw new Error('hostile'); };
    const wins = [() => undefined, () => ({}), () => ({ _aiReqDebug: 'not an object' }), () => ({ _aiReqDebug: { NVDA: 'junk' } }),
      () => { const w = {}; Object.defineProperty(w, '_aiReqDebug', { get: boom, set: boom }); return w; }, () => new Proxy({}, { get: boom, set: boom, has: boom })];
    const bad = [];
    for (const [label, r] of shapes) {
      let ref = null;
      // a response whose status getter throws must not change the outcome either (the status is read inside the helper)
      { const a = makeAnalysis(src, { win: {}, replies: [r], hostileStatus: true }); ref = JSON.stringify(await outcome(a.F.apply(null, ARGS()))); }
      for (let i = 0; i < wins.length; i++) {
        const w = wins[i]();
        const a = makeAnalysis(src, w === undefined ? { replies: [r] } : { win: w, replies: [r] });
        const out = JSON.stringify(await outcome(a.F.apply(null, ARGS())));
        if (ref === null) ref = out; else if (out !== ref) bad.push(label + ' / window#' + i + ': ' + out + ' vs ' + ref);
      }
      // the recorded values are null unless they are non-negative integers / strings
      const win = {}; const a = makeAnalysis(src, { win: win, replies: [r] }); await outcome(a.F.apply(null, ARGS()));
      const e = tel(win, 'NVDA');
      if (!r.badJson && !(Array.isArray(e) && e.length === 1)) bad.push(label + ': no record');
      if (Array.isArray(e) && e[0]) {
        for (const k of ['inputTokens', 'outputTokens', 'status']) if (!(e[0][k] === null || (Number.isInteger(e[0][k]) && e[0][k] >= 0))) bad.push(label + ': ' + k + '=' + e[0][k]);
        if (!(e[0].stopReason === null || typeof e[0].stopReason === 'string')) bad.push(label + ': stopReason');
      }
    }
    // bounded: six attempts for one ticker keep the last four; tickers are separate
    const win = {}; const a = makeAnalysis(src, { win: win, replies: Array.from({ length: 7 }, (_, i) => ({ status: 200, body: reply(GOOD, { usage: { input_tokens: i, output_tokens: i } }) })) });
    for (let i = 0; i < 6; i++) await a.F.apply(null, ARGS('NVDA'));
    await a.F.apply(null, ARGS('ARM'));
    const n = tel(win, 'NVDA') || [];
    if (!(n.length === 4 && n[0].inputTokens === 2 && n[3].inputTokens === 5 && (tel(win, 'ARM') || []).length === 1)) bad.push('bound ' + JSON.stringify(n.map(x => x.inputTokens)));
    // at most 100 tickers; the least recently written is dropped (writing a ticker again makes it the most recent)
    const w2 = {}; const b2 = makeAnalysis(src, { win: w2, replies: Array.from({ length: 130 }, () => ({ status: 200, body: reply(GOOD) })) });
    await b2.F.apply(null, ARGS('T0'));
    for (let i = 1; i <= 99; i++) await b2.F.apply(null, ARGS('T' + i));   // 100 tickers stored, T0 the oldest
    await b2.F.apply(null, ARGS('T0'));                                   // T0 rewritten while stored: now the most recent
    for (let i = 100; i <= 109; i++) await b2.F.apply(null, ARGS('T' + i)); // 10 more: T1..T10 must go, T0 must stay
    const ks = Array.from(w2._aiReqDebug.keys());
    if (!(ks.length === 100 && ks.indexOf('T0') !== -1 && ks.indexOf('T1') === -1 && ks.indexOf('T10') === -1 && ks.indexOf('T11') !== -1 && ks[ks.length - 1] === 'T109'))
      bad.push('ticker bound ' + ks.length + ' ' + JSON.stringify(ks.slice(0, 3)));
    // write order holds for every key form, including digit-only symbols (a plain object would list them first)
    const w3 = {}; const b3 = makeAnalysis(src, { win: w3, replies: Array.from({ length: 110 }, () => ({ status: 200, body: reply(GOOD) })) });
    await b3.F.apply(null, ARGS('A'));
    for (let i = 1; i <= 99; i++) await b3.F.apply(null, ARGS('B' + i));
    await b3.F.apply(null, ARGS('10'));                                   // the 101st ticker, digit-only: the oldest ('A') must go
    const k3 = Array.from(w3._aiReqDebug.keys());
    if (!(k3.length === 100 && k3.indexOf('A') === -1 && k3.indexOf('10') === k3.length - 1 && k3[0] === 'B1')) bad.push('digit-only order ' + JSON.stringify([k3.length, k3[0], k3[k3.length - 1]]));
    ok('HY-6', bad.length === 0, JSON.stringify(bad.slice(0, 6)));
  });

  if (want('HY-7')) await guard('HY-7', () => {
    const f = makeContext(src);
    const bad = [];
    // price fields: missing, non-number or not > 0 -> n/a (0 is the providers' "unavailable" fallback)
    const badPrices = [NaN, Infinity, -Infinity, undefined, null, '', '91.2', 0, -5, {}, [], true];
    for (const field of ['open', 'previous_close', 'high', 'low']) {
      const label = { open: 'Open', previous_close: 'Prev Close', high: 'Intraday High', low: 'Intraday Low' }[field];
      for (const v of badPrices) { const got = lineOf(f({ NVDA: row('NVDA', { [field]: v }) }), label); if (got !== 'n/a') bad.push(field + '=' + String(v) + ' -> ' + got); }
    }
    for (const v of [NaN, Infinity, undefined, null, '', '1.2', {}]) {        // change %: any non-finite / non-number
      const t = f({ NVDA: row('NVDA', { change_percent: v }) }); if (t.indexOf('Price: $226.73 (n/a) |') === -1) bad.push('chg=' + String(v));
    }
    for (const v of [NaN, Infinity, -1, undefined, null, '', '1000', {}]) {      // volume: non-number, non-finite or negative
      const got = lineOf(f({ NVDA: row('NVDA', { volume: v }) }), 'Volume'); if (got !== 'n/a') bad.push('vol=' + String(v) + ' -> ' + got);
    }
    ok('HY-7', bad.length === 0, JSON.stringify(bad.slice(0, 8)));
  });

  if (want('HY-8')) await guard('HY-8', () => {
    const f = makeContext(src);
    const cases = [[221.3000030517578, '$221.30'], [91.9, '$91.90'], [226.73, '$226.73'], [1, '$1.00'], [1e6, '$1000000.00'],
      [0.5, '$0.50'], [0.0345, '$0.0345'], [0.12, '$0.12'], [0.123, '$0.123'], [0.0001, '$0.0001'], [0.99999, '$1.00']];   // rounds to 1.0000; trailing zeros trimmed to 2 decimals
    const bad = cases.filter(([v, w]) => lineOf(f({ NVDA: row('NVDA', { open: v }) }), 'Open') !== w).map(([v, w]) => v + ' -> ' + lineOf(f({ NVDA: row('NVDA', { open: v }) }), 'Open') + ' want ' + w);
    // the whole block for a normal row: only the price formatting differs from the previous output
    const want = WRAP('NVDA [source: yahoo]\n  Price: $226.73 (+0.95%) | Open: $225.10 | Prev Close: $224.60\n  Intraday High: $227.50 | Intraday Low: $224.90 | Volume: 1,234,567\n' + NOTE);
    const got = f({ NVDA: row('NVDA') });
    if (got !== want) bad.push('block: ' + JSON.stringify(got));
    // change % and volume keep their previous formatting for valid values (not rounded, not re-formatted)
    const t = f({ NVDA: row('NVDA', { change_percent: -1.23456, volume: 0 }) });
    if (t.indexOf('(-1.23456%)') === -1 || lineOf(t, 'Volume') !== '0') bad.push('chg / volume reformatted');
    if (f({ NVDA: row('NVDA', { change_percent: 0 }) }).indexOf('(+0%)') === -1) bad.push('0% changed');
    if (f({}) !== '') bad.push('empty map');
    ok('HY-8', bad.length === 0, JSON.stringify(bad));
  });

  if (want('HY-9')) await guard('HY-9', () => {
    const f = makeContext(src);
    const ta = { symbol: 'MTRX.TA', source: 'yahoo', price: 8884, open: 8800, previous_close: 8800, high: 8950, low: 8790, volume: 1234567, change_percent: 0.95 };
    const want = WRAP('MTRX.TA [source: yahoo]\n  Price: 88.84 ILS (+0.95%) | Open: 88.00 ILS | Prev Close: 88.00 ILS\n  Intraday High: 89.50 ILS | Intraday Low: 87.90 ILS | Volume: 1,234,567\n' + CUR + '\n' + NOTE);
    const bad = [];
    if (f({ 'MTRX.TA': ta }) !== want) bad.push('block');
    // finite .TA values: exactly the previous rule (agorot / 100, toFixed(2), float rounding included), stated here as the oracle
    const prevRule = v => (v / 100).toFixed(2) + ' ILS';
    for (const v of [3.5, 45, 100000, 8884.5, 1, 12345.678]) {
      const got = lineOf(f({ 'MTRX.TA': Object.assign({}, ta, { open: v }) }), 'Open'); if (got !== prevRule(v)) bad.push(v + ' -> ' + got + ' want ' + prevRule(v));
    }
    for (const v of [NaN, 0, undefined, null, '8800']) { const got = lineOf(f({ 'MTRX.TA': Object.assign({}, ta, { previous_close: v }) }), 'Prev Close'); if (got !== 'n/a') bad.push('TA ' + String(v) + ' -> ' + got); }
    ok('HY-9', bad.length === 0, JSON.stringify(bad));
  });

  if (want('HY-10')) await guard('HY-10', () => {
    const m = /^var P5_CALL2_TIMEOUT_MS = (\d+);\s*\/\/ (.*)$/m.exec(src);
    const tmo = /const TIMEOUT_MS\s*=\s*(\d+);/.exec(PROXY);
    const n = m ? Number(m[1]) : NaN, p = tmo ? Number(tmo[1]) : NaN;
    ok('HY-10', !!m && !!tmo && n > p && n <= 60000 && n === 52000 && /50 ?s/.test(m[2]) && !/25 ?s/.test(m[2]) &&
      (src.match(/AbortSignal\.timeout\(P5_CALL2_TIMEOUT_MS\)/g) || []).length === 1, JSON.stringify({ n, p, comment: m && m[2] }));
  });

  if (want('HY-11')) await guard('HY-11', async () => {
    const a = makeAnalysis(src, { win: {}, replies: [{ status: 200, body: reply('"results":[]}') }] });
    await a.F(['NVDA'], '16.10.2026', 'STOCK BLOCK\n%%NEWS_CONTEXT_START%%\n{"NVDA":{}}', 'TECH SNAP');
    const b = a.log.fetches[0].body;
    const d = sha(JSON.stringify({ system: b.system, messages: b.messages, model: b.model }));
    const changed = Object.keys(BASE_DIGESTS).filter(n => { try { return sha(fnText(src, n)) !== BASE_DIGESTS[n]; } catch (e) { return true; } });
    ok('HY-11', d === BASE_PROMPT_DIGEST && Object.keys(b).sort().join(',') === 'max_tokens,messages,model,system' && changed.length === 0,
      JSON.stringify({ prompt: d === BASE_PROMPT_DIGEST, changed }));
  });
  return R;
}

// ---- planted negatives: each mutates index.html; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 60)); return s.replace(a, b); };
const NEG = [
  ['HY-N1 cap left at 1800', rep('  const _AI_MAX_TOKENS = 2500;', '  const _AI_MAX_TOKENS = 1800;'), ['HY-1']],
  ['HY-N2 Deep Dive cap raised too', s => { const t = fnText(s, '_dd0FetchAnalysis'); return s.replace(t, t.replace('max_tokens: 1200', 'max_tokens: 2500')); }, ['HY-1', 'HY-11']],
  ['HY-N3 telemetry written to localStorage', rep('      if (!(window._aiReqDebug instanceof Map)) window._aiReqDebug = new Map();',
    '      try { localStorage.setItem(\'pt_ai_tel\', JSON.stringify(rec)); } catch (_x) {}\n      if (!(window._aiReqDebug instanceof Map)) window._aiReqDebug = new Map();'), ['HY-4']],
  ['HY-N4 retry overwrites the first attempt', rep('store.set(key, prev.concat([rec]).slice(-4));', 'store.set(key, [rec]);'), ['HY-5', 'HY-6']],
  ['HY-N5 telemetry not contained', s => rep('    } catch (_e) { /* telemetry is best-effort */ }', '    } finally { /* not contained */ }')(s), ['HY-6']],
  ['HY-N6 n/a guard removed from prices', rep("const _px = v => !(_fin(v) && v > 0) ? 'n/a' : (_ta ?", "const _px = v => (_ta ?"), ['HY-7', 'HY-9']],
  ['HY-N7 flat toFixed(2) below $1', rep("const _usd = v => (v >= 1 ? v.toFixed(2) : v.toFixed(4).replace(/0{1,2}$/, ''));", 'const _usd = v => v.toFixed(2);'), ['HY-8']],
  ['HY-N8 USD rounding applied in the .TA branch', rep("(_ta ? (v / 100).toFixed(2) + ' ILS' :", "(_ta ? _usd(v / 100) + ' ILS' :"), ['HY-9']],
  ['HY-N9 P-5 timeout equal to the proxy', rep('var P5_CALL2_TIMEOUT_MS = 52000;', 'var P5_CALL2_TIMEOUT_MS = 50000;'), ['HY-10']],
  ['HY-N10 a 0 price accepted as valid', rep("const _px = v => !(_fin(v) && v > 0) ? 'n/a'", "const _px = v => !_fin(v) ? 'n/a'"), ['HY-7', 'HY-9']],
  ['HY-N12 P-5 timeout above the 60 s platform limit', rep('var P5_CALL2_TIMEOUT_MS = 52000;', 'var P5_CALL2_TIMEOUT_MS = 61000;'), ['HY-10']],
  ['HY-N13 ticker bound removed', rep('      for (const k of store.keys()) { if (store.size <= 100) break; store.delete(k); }', ''), ['HY-6']],
  ['HY-N14 status read outside the helper', rep('  _aiTel(response, data);', '  _aiTel({ status: response.status }, data);'), ['HY-6']],
  ['HY-N15 written ticker not moved to most recent', rep('      store.delete(key);                                  // re-insert so the key becomes the most recent\n', ''), ['HY-6']],
  ['HY-N11 volume guard removed', rep("const _vol = (_fin(d.volume) && d.volume >= 0) ? d.volume.toLocaleString() : 'n/a';", 'const _vol = String(d.volume.toLocaleString());'), ['HY-7']]
];

(async () => {
  const main = await rows(SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, mutate, wantFail] of NEG) {
    let r;
    try { r = await rows(mutate(SRC), wantFail); } catch (e) { fails++; console.log('  FAIL  ' + name + ': ' + e.message); continue; }
    const caught = wantFail.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + wantFail.join(', ') + ' fail' + (caught ? '' : '  (' + wantFail.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'AI REQUEST HYGIENE OFFLINE: FAIL (' + fails + ')' : 'AI REQUEST HYGIENE OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
