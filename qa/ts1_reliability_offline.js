'use strict';

/*
 * tech-score-reliability-1 - Tech Score v1 fetch resilience and row freshness (work/tech-score-reliability-1).
 *
 * Pure Node, no network, no browser. Reads the REAL index.html (CRLF-normalised), evaluates the REAL SCORE-V1-S1
 * region plus the REAL _ts1FillRow / _ts1RowText in sandboxes with a stub fetch, an injected clock and explicit
 * free names (Node 24 has a global fetch, so every name the code can touch is passed in and a throwing
 * globalThis.fetch spy is installed for the whole run).
 *   TR-1   Polygon holding + Polygon benchmarks -> numeric score, 100 % coverage, no fail-closed code
 *   TR-2   Yahoo holding -> SERIES_PROVENANCE_UNESTABLISHED, score null, coverage 0   (I-1 / TSR-1, must stay green)
 *   TR-3   Polygon holding + Yahoo RS benchmarks (SPY, QQQ, sector ETF; the FROG shape) -> coverage 70 %, integrity code
 *          (must stay green; with only SPY/QQQ on Yahoo and the sector ETF on Polygon the engine reports 77.5 %)
 *   TR-4   benchmarks fetched once across two tickers within the TTL; one run <= 4 fetches
 *   TR-5   concurrent raw fetches of one symbol share one request; TR-5b the shared raw object is never mutated
 *   TR-6   Yahoo / HTTP error / rejected responses are never cached (Polygon success is - positive control)
 *   TR-7   degraded row results (UNAVAILABLE or a fail-closed reason) expire after 120 s; full results do not
 *   TR-8   a different _runId in _cockpitResults drops a full memo; the same _runId reuses it
 *   TR-9   no _cockpitResults (the protected T6 harness shape) behaves as before
 *   TR-10  SETUP: complete extraction, runTechScoreV1( x3, helper sources clean, _ts1ResolveMarket / _ts1RowText pins
 *   TR-11  after a _runId change the engine and snapshot builder run again, also when raw series come from the cache
 *   TR-12  a cached Polygon entry older than 15 min is refetched; a Yahoo refetch then fails closed (as TR-2)
 * Planted negatives mutate an in-memory COPY of index.html; the SAME row function must then fail. Each is paired with
 * a positive control (the unmutated source passes the row) and an anchor-count proof (exactly one match).
 *
 * node qa/ts1_reliability_offline.js --print-pins   prints the TR-10 pin literals for a deliberate refresh.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const real = fs.readFileSync(INDEX_PATH, 'utf8').replace(/\r\n/g, '\n');

// -- TR-10 pins (LF-normalised sha256 of the function source; refresh with --print-pins) -------------------------
const PIN_RESOLVE_MARKET = '88daede9f4b83a35bba2c5b674814a6df7dbed4854af98d2058fd9c9f270083f';
const PIN_ROW_TEXT = 'd81334a810a156f40f748ef96523109aa16243a819c77bd33e8583d627d638ff';
const REGION_TOPLEVEL_FN_COUNT = 24; // R-2: no new top-level function in the SCORE-V1 region

const TTL_MS = 15 * 60 * 1000;
const DEGRADED_MS = 120 * 1000;
const T0 = Date.parse('2026-10-09T21:00:00Z'); // Friday 17:00 ET, after the close; the seeded bars end that day

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) { failures += 1; console.log('  FAIL  ' + name); }
}
function sha(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function countOf(s, needle) { return s.split(needle).length - 1; }

function extractFn(content, name) {
  let start = content.indexOf('function ' + name + '(');
  if (start === -1) return null;
  if (content.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}
function regionOf(content) {
  const s = content.indexOf('// ═══ SCORE-V1-S1 — TECHNICAL SCORE');
  const e = content.indexOf('// ═══ end SCORE-V1-S1');
  if (s === -1 || e === -1 || e < s) return null;
  return content.slice(s, e);
}
// The text after an extracted function must be the next known construct: proves the brace match ended where it should.
function endsBefore(content, name, nextMarker) {
  const fn = extractFn(content, name);
  if (!fn) return false;
  const rest = content.slice(content.indexOf(fn) + fn.length).replace(/^\s+/, '');
  return rest.indexOf(nextMarker) === 0;
}

// -- seeded fixtures -------------------------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BARS = {};
function genBars(sym) {
  if (BARS[sym]) return BARS[sym];
  let seed = 7;
  for (const ch of sym) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry32(seed);
  const days = [];
  let d = Date.UTC(2026, 9, 9);
  while (days.length < 252) {
    const w = new Date(d).getUTCDay();
    if (w !== 0 && w !== 6) days.push(d);
    d -= 86400000;
  }
  days.reverse();
  const out = { timestamp: [], open: [], high: [], low: [], close: [], volume: [] };
  let p = 80 + rnd() * 120;
  for (const day of days) {
    const o = p;
    p = p * (1 + (rnd() - 0.48) * 0.03);
    out.timestamp.push((day + 13.5 * 3600000) / 1000);
    out.open.push(Math.round(o * 10000) / 10000);
    out.close.push(Math.round(p * 10000) / 10000);
    out.high.push(Math.round(Math.max(o, p) * 1.005 * 10000) / 10000);
    out.low.push(Math.round(Math.min(o, p) * 0.995 * 10000) / 10000);
    out.volume.push(1000000 + Math.floor(rnd() * 1000000));
  }
  BARS[sym] = out;
  return out;
}
function chartJson(mode, b) {
  const meta = { currency: 'USD', exchangeTimezoneName: 'America/New_York' };
  if (mode === 'polygon') meta._provider = 'polygon';
  return { chart: { result: [{ meta: meta, timestamp: b.timestamp, indicators: { quote: [{ open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }] } }] } };
}

// -- sandbox ---------------------------------------------------------------------------------------------------
function makeFakeDate(clock) {
  const RD = Date;
  function FD() {
    if (!(this instanceof FD)) return new RD(clock.t).toString();
    return arguments.length ? new (Function.prototype.bind.apply(RD, [null].concat(Array.prototype.slice.call(arguments))))() : new RD(clock.t);
  }
  FD.now = function () { return clock.t; };
  FD.parse = RD.parse;
  FD.UTC = RD.UTC;
  FD.prototype = RD.prototype;
  return FD;
}

// One world = one engine sandbox (fresh module state) + stub fetch + clock. The clock object is shared with fill sandboxes.
function makeWorld(src) {
  const clock = { t: T0 };
  const FD = makeFakeDate(clock);
  const modes = {};
  const calls = {};
  const world = { clock: clock, modes: modes, calls: calls, total: 0, FD: FD, win: { PT_ENABLE_TECH_SCORE: true } };
  function fetchStub(url) {
    world.total += 1;
    const m = /symbol=([^&]+)/.exec(String(url));
    const sym = m ? decodeURIComponent(m[1]) : '?';
    calls[sym] = (calls[sym] || 0) + 1;
    const mode = modes[sym] || 'polygon';
    if (world.reenter && world.reenter === sym) { // a synchronous re-entrant call from inside fetch()
      world.reenter = null;
      world.nested = world.fetchRaw(sym);
    }
    if (mode === 'polygon-empty') {
      const e = { timestamp: [], open: [], high: [], low: [], close: [], volume: [] };
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(chartJson('polygon', e)); } });
    }
    if (mode === 'reject') return Promise.reject(new Error('net down'));
    if (mode === 'http500') return Promise.resolve({ ok: false, status: 500 });
    const body = chartJson(mode, genBars(sym));
    return Promise.resolve().then(function () { return { ok: true, status: 200, json: function () { return Promise.resolve(body); } }; });
  }
  const region = regionOf(src);
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', 'fetch', 'localStorage', 'AbortSignal', 'Date',
    region + '\nreturn { runTechScoreV1: runTechScoreV1, fetchRaw: _ts1FetchRawSeries, codes: TS1_FAILCLOSED_INTEGRITY_CODES };');
  // Read-only pt_tickers mapping (the engine's approved sector source): every fixture holding maps to sector ETF XLK.
  const tickers = JSON.stringify(['AAA', 'BBB', 'CCC', 'DDD'].map(function (s) { return { symbol: s, sectorEtf: 'XLK' }; }));
  const ls = { getItem: function (k) { return k === 'pt_tickers' ? tickers : null; } };
  const api = factory(world.win, fetchStub, ls, { timeout: function () { return {}; } }, FD);
  world.run = api.runTechScoreV1;
  world.fetchRaw = api.fetchRaw;
  world.codes = api.codes;
  return world;
}
function hasFailClosed(world, r) {
  return Array.isArray(r && r.reasonCodes) && r.reasonCodes.some(function (c) { return world.codes.indexOf(c) !== -1; });
}

// Fill sandbox. shape 't6' = exactly the protected harness scope (window, document, runTechScoreV1 + the memo var).
function makeFill(src, engine, opts) {
  const fillSrc = extractFn(src, '_ts1FillRow');
  const textSrc = extractFn(src, '_ts1RowText');
  const elements = {};
  const doc = { getElementById: function (id) { return elements[id] || null; } };
  const calls = [];
  const eng = function (sym) { calls.push(sym); return engine(sym); };
  const names = ['window', 'document', 'runTechScoreV1'];
  const vals = [opts.win || {}, doc, eng];
  if (opts.extra) for (const k of Object.keys(opts.extra)) { names.push(k); vals.push(opts.extra[k]); }
  // eslint-disable-next-line no-new-func
  const factory = new Function(names.join(','), 'var _ts1RowMemo = {};\n' + textSrc + '\n' + fillSrc + '\nreturn { fill: _ts1FillRow, memo: _ts1RowMemo };');
  const api = factory.apply(null, vals);
  return { fill: api.fill, memo: api.memo, calls: calls, elements: elements };
}
const FULL = { score: 72, coveragePct: 100, reasonCodes: [] };
const UNAV = { status: 'UNAVAILABLE', reason: 'FETCH_FAILED' };
const INTEG = { score: null, coveragePct: 70, reasonCodes: ['SERIES_PROVENANCE_UNESTABLISHED'] };

// -- rows ------------------------------------------------------------------------------------------------------
const ROWS = [];
function row(id, fn) { ROWS.push({ id: id, fn: fn }); }

row('TR-1', async function (src) {
  const w = makeWorld(src);
  const r = await w.run('AAA');
  return typeof r.score === 'number' && r.coveragePct === 100 && !hasFailClosed(w, r);
});
row('TR-2', async function (src) {
  const w = makeWorld(src);
  w.modes.AAA = 'yahoo';
  const r = await w.run('AAA');
  return r.score === null && r.coveragePct === 0 && r.reasonCodes.indexOf('SERIES_PROVENANCE_UNESTABLISHED') !== -1;
});
row('TR-3', async function (src) {
  const w = makeWorld(src);
  // The FROG DEV shape: every RS benchmark (SPY, QQQ and the mapped sector ETF) came from Yahoo.
  w.modes.SPY = 'yahoo'; w.modes.QQQ = 'yahoo'; w.modes.XLK = 'yahoo';
  const r = await w.run('AAA');
  return r.coveragePct === 70 && r.reasonCodes.indexOf('SERIES_PROVENANCE_UNESTABLISHED') !== -1;
});
row('TR-4', async function (src) {
  const w = makeWorld(src);
  await w.run('AAA');
  const firstRun = w.total;
  await w.run('BBB');
  return firstRun <= 4 && w.calls.SPY === 1 && w.calls.QQQ === 1 && w.calls.XLK === 1;
});
row('TR-5', async function (src) {
  const w = makeWorld(src);
  const both = await Promise.all([w.fetchRaw('SPY'), w.fetchRaw('SPY')]);
  const shared = w.calls.SPY === 1 && both[0].provider === 'polygon' && both[1].provider === 'polygon';
  w.reenter = 'IWM'; // the stub calls fetchRaw('IWM') synchronously from inside fetch(): still one request
  const outer = await w.fetchRaw('IWM');
  const inner = await w.nested;
  return shared && w.calls.IWM === 1 && outer.provider === 'polygon' && inner.provider === 'polygon';
});
row('TR-5b', async function (src) {
  const w = makeWorld(src);
  const before = JSON.stringify(await w.fetchRaw('SPY'));
  await w.run('AAA');
  const after = JSON.stringify(await w.fetchRaw('SPY'));
  return before === after && JSON.parse(before).bars.length === 252;
});
row('TR-6', async function (src) {
  const w = makeWorld(src);
  w.modes.AAA = 'yahoo'; w.modes.BBB = 'http500'; w.modes.CCC = 'reject'; w.modes.EEE = 'polygon-empty';
  for (const s of ['AAA', 'BBB', 'CCC', 'EEE']) { try { await w.fetchRaw(s); await w.fetchRaw(s); } catch (e) { /* a rejected fetch may throw; it must still not be cached */ } }
  const neverCached = w.calls.AAA === 2 && w.calls.BBB === 2 && w.calls.CCC === 2 && w.calls.EEE === 2;
  w.modes.AAA = 'polygon'; // a later Polygon answer is returned, not masked by the earlier Yahoo one
  const later = await w.fetchRaw('AAA');
  await w.fetchRaw('DDD'); await w.fetchRaw('DDD'); // positive control: a Polygon success IS cached
  return neverCached && later.provider === 'polygon' && w.calls.DDD === 1;
});
row('TR-7', async function (src) {
  const w = makeWorld(src);
  const extra = { Date: w.FD, TS1_FAILCLOSED_INTEGRITY_CODES: w.codes };
  const cases = [['UNAV', UNAV, true], ['INTEG', INTEG, true], ['FULL', FULL, false]];
  let ok = true;
  for (const c of cases) {
    const f = makeFill(src, function () { return Promise.resolve(c[1]); }, { win: w.win, extra: extra });
    const base = w.clock.t;
    await f.fill(c[0]);
    w.clock.t = base + 60000; await f.fill(c[0]);
    if (f.calls.length !== 1) ok = false;
    w.clock.t = base + DEGRADED_MS + 1000; await f.fill(c[0]);
    if (f.calls.length !== (c[2] ? 2 : 1)) ok = false;
    w.clock.t = base + 600000; await f.fill(c[0]);
    if (f.calls.length !== (c[2] ? 3 : 1)) ok = false; // degraded: a fresh stamp each time; full: never expires
    w.clock.t = base;
  }
  return ok;
});
row('TR-8', async function (src) {
  const w = makeWorld(src);
  const results = [{ ticker: 'AAA', _runId: 'r1' }];
  const f = makeFill(src, function () { return Promise.resolve(FULL); }, { win: w.win, extra: { Date: w.FD, TS1_FAILCLOSED_INTEGRITY_CODES: w.codes, _cockpitResults: results } });
  await f.fill('AAA'); await f.fill('AAA');
  const same = f.calls.length === 1;
  results[0]._runId = 'r2';
  await f.fill('AAA');
  const changed = f.calls.length === 2;
  await f.fill('AAA');
  const reused = f.calls.length === 2;
  const g = makeFill(src, function () { return Promise.resolve(FULL); }, { win: w.win, extra: { Date: w.FD, TS1_FAILCLOSED_INTEGRITY_CODES: w.codes, _cockpitResults: [] } });
  await g.fill('ZZZ'); await g.fill('ZZZ'); // ticker absent from the scan results: plain memo
  // A fill superseded by a newer scan must not overwrite the newer fill's cell when it settles late.
  const res2 = [{ ticker: 'SLOW', _runId: 'r1' }];
  let release;
  const slow = new Promise(function (resolve) { release = resolve; });
  let n = 0;
  const h = makeFill(src, function () { n += 1; return n === 1 ? slow : Promise.resolve({ score: 90, coveragePct: 100, reasonCodes: [] }); },
    { win: w.win, extra: { Date: w.FD, TS1_FAILCLOSED_INTEGRITY_CODES: w.codes, _cockpitResults: res2 } });
  h.elements['ts1-val-SLOW'] = { textContent: '' };
  const first = h.fill('SLOW');
  res2[0]._runId = 'r2';
  // Bounded: a broken implementation that reuses the unresolved memo would otherwise wait on `slow` forever.
  await Promise.race([h.fill('SLOW'), new Promise(function (resolve) { setTimeout(resolve, 25); })]);
  release({ score: 10, coveragePct: 100, reasonCodes: [] });
  await first;
  const newest = h.elements['ts1-val-SLOW'].textContent === '90 / 100 · 100% coverage' && h.calls.length === 2;
  return same && changed && reused && g.calls.length === 1 && newest;
});
row('TR-9', async function (src) {
  const f = makeFill(src, function () { return Promise.resolve(FULL); }, { win: { PT_ENABLE_TECH_SCORE: true } });
  f.elements['ts1-val-AAA'] = { textContent: '' };
  await Promise.all([f.fill('AAA'), f.fill('AAA')]);
  await f.fill('AAA');
  const u = makeFill(src, function () { return Promise.resolve(UNAV); }, { win: { PT_ENABLE_TECH_SCORE: true } });
  await u.fill('BBB'); await u.fill('BBB');
  await f.fill('CCC');
  // A lone rejected engine call renders the em dash, never throws, drops its memo entry and may be retried (T6 behaviour).
  let rejects = 0;
  const rj = makeFill(src, function () { rejects += 1; return rejects === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(FULL); },
    { win: { PT_ENABLE_TECH_SCORE: true } });
  rj.elements['ts1-val-REJ'] = { textContent: '…' };
  let threw = false;
  try { await rj.fill('REJ'); } catch (e) { threw = true; }
  const dash = rj.elements['ts1-val-REJ'].textContent === '—' && Object.keys(rj.memo).length === 0 && !threw;
  await rj.fill('REJ');
  const retried = rj.calls.length === 2 && rj.elements['ts1-val-REJ'].textContent === '72 / 100 · 100% coverage';
  return dash && retried && f.calls.length === 2 && f.calls[0] === 'AAA' && f.calls[1] === 'CCC' && u.calls.length === 1 &&
    Object.keys(f.memo).sort().join(',') === 'AAA,CCC' && f.elements['ts1-val-AAA'].textContent === '72 / 100 · 100% coverage';
});
row('TR-10', async function (src) {
  const region = regionOf(src);
  if (!region) return false;
  const fetchFn = extractFn(src, '_ts1FetchRawSeries');
  const fillFn = extractFn(src, '_ts1FillRow');
  const textFn = extractFn(src, '_ts1RowText');
  const marketFn = extractFn(src, '_ts1ResolveMarket');
  if (!fetchFn || !fillFn || !textFn || !marketFn) return false;
  const complete = endsBefore(src, '_ts1FetchRawSeries', 'function _ts1SectorEtfFor(') &&
    endsBefore(src, '_ts1FillRow', '// ── Data-quality guard') &&
    endsBefore(src, '_ts1RowText', 'async function _ts1FillRow(');
  let compiles = true;
  try {
    // eslint-disable-next-line no-new-func
    new Function('return [' + fetchFn + ',' + fillFn + ',' + textFn + '];');
  } catch (e) { compiles = false; }
  const helperSrc = textFn + '\n' + fillFn;
  const helperClean = [/localStorage/, /sessionStorage/, /\bfetch\s*\(/, /document\.cookie/, /indexedDB/].every(function (p) { return !p.test(helperSrc); });
  return complete && compiles && helperClean &&
    countOf(src, 'runTechScoreV1(') === 3 && countOf(fillFn, 'runTechScoreV1(') === 1 &&
    fillFn.indexOf('async function _ts1FillRow(symbol) {\n  if (window.PT_ENABLE_TECH_SCORE !== true) return;\n') === 0 &&
    (region.match(/^(?:async )?function \w+\(/gm) || []).length === REGION_TOPLEVEL_FN_COUNT &&
    sha(marketFn) === PIN_RESOLVE_MARKET && sha(textFn) === PIN_ROW_TEXT &&
    /_ts1ResolveMarket\(/.test(fetchFn) && fetchFn.indexOf('America/New_York') === -1;
});
row('TR-11', async function (src) {
  const w = makeWorld(src);
  w.modes.QQQ = 'http500';
  const results = [{ ticker: 'AAA', _runId: 'r1' }];
  const f = makeFill(src, w.run, { win: w.win, extra: { Date: w.FD, TS1_FAILCLOSED_INTEGRITY_CODES: w.codes, _cockpitResults: results } });
  await f.fill('AAA');
  const first = w.win._techScoreDebug.AAA;
  const c1 = first.computedAt;
  w.modes.QQQ = 'yahoo';
  w.clock.t += 60000;
  results[0]._runId = 'r2';
  await f.fill('AAA');
  const dbg = w.win._techScoreDebug.AAA;
  // The builder ran again (fresh snapshot object stamped with the NEW computedAt) and so did the scorer (fresh result whose
  // own freshness echoes it) - a cached score or a skipped builder cannot satisfy all of these at once.
  return f.calls.length === 2 && dbg.computedAt !== c1 && dbg.snap !== first.snap && dbg.result !== first.result &&
    dbg.snap.snapshotAsOf === dbg.computedAt && dbg.result.freshness.snapshotAsOf === dbg.computedAt &&
    w.calls.AAA === 1 && w.calls.SPY === 1 && w.calls.XLK === 1 && w.calls.QQQ === 2 &&
    dbg.result.coveragePct < 100 && dbg.result.reasonCodes.indexOf('SERIES_PROVENANCE_UNESTABLISHED') !== -1;
});
row('TR-12', async function (src) {
  const w = makeWorld(src);
  await w.fetchRaw('SPY');
  w.clock.t = T0 + TTL_MS - 60000; await w.fetchRaw('SPY');
  const inside = w.calls.SPY === 1;
  w.clock.t = T0 + TTL_MS + 60000; await w.fetchRaw('SPY');
  const expired = w.calls.SPY === 2;
  const v = makeWorld(src);
  await v.run('AAA');
  v.clock.t = T0 + TTL_MS + 60000;
  v.modes.AAA = 'yahoo';
  const r = await v.run('AAA');
  return inside && expired && r.score === null && r.coveragePct === 0 && r.reasonCodes.indexOf('SERIES_PROVENANCE_UNESTABLISHED') !== -1;
});

async function evaluate(src, ids) {
  const out = {};
  for (const r of ROWS) {
    if (ids && ids.indexOf(r.id) === -1) continue;
    try { out[r.id] = { ok: (await r.fn(src)) === true, why: null }; }
    catch (e) { out[r.id] = { ok: false, why: e && e.message ? e.message : String(e) }; }
  }
  return out;
}

// -- planted negatives -----------------------------------------------------------------------------------------
// Each: anchor occurs exactly once in the production source; the mutated COPY must fail the named row; the real source passes it.
// A negative is a list of [anchor, replacement] edits applied in order to the copy.
const NEGATIVES = [
  { row: 'TR-2', label: 'Yahoo treated as explicit', edits: [
    ["var adjustedBasis = provider === 'polygon' ? 'explicit' : 'unknown';", "var adjustedBasis = 'explicit';"]] },
  { row: 'TR-10', label: 'third runTechScoreV1( literal', edits: [
    ['// ═══ end SCORE-V1-S1 technical score', '// runTechScoreV1( extra literal\n// ═══ end SCORE-V1-S1 technical score']] },
  { row: 'TR-10', label: '_ts1ResolveMarket byte changed', edits: [
    ["if (tz === 'America/New_York') { market = 'US'; marketBasis = 'provider-meta'; }", "if (tz === 'America/New_York') { market = 'US'; marketBasis = 'provider-meta '; }"]] },
  // S2
  { row: 'TR-6', label: 'Yahoo / any non-error result cached', edits: [
    ["if (!out.error && out.provider === 'polygon' && out.bars.length > 0) _ts1RawCache[sym]", "if (!out.error) _ts1RawCache[sym]"]] },
  { row: 'TR-5', label: 'in-flight dedupe removed', edits: [
    ['  if (hit && hit.pending) return hit.pending;\n', '']] },
  { row: 'TR-6', label: 'empty Polygon series cached', edits: [
    [" && out.bars.length > 0) _ts1RawCache[sym]", ") _ts1RawCache[sym]"]] },
  { row: 'TR-5', label: 'request starts before the pending entry is published (re-entrancy window)', edits: [
    ['entry.pending = Promise.resolve().then(async function () {', 'entry.pending = (async function () {'],
    ['  });\n  var out;', '  })();\n  var out;']] },
  { row: 'TR-12', label: 'cache TTL ignored', edits: [
    ['if (hit && hit.value && (Date.now() - hit.at) < 900000) return hit.value;', 'if (hit && hit.value) return hit.value;']] },
  { row: 'TR-11', label: 'scores cached instead of raw series (builder skipped)', edits: [
    ['var _ts1RawCache = {};', 'var _ts1RawCache = {}; var _tsScoreCache = {};'],
    ['  var raw = await _ts1FetchRawSeries(symbol);', '  if (_tsScoreCache[symbol]) return _tsScoreCache[symbol];\n  var raw = await _ts1FetchRawSeries(symbol);'],
    ['  return scored;\n}\n\n// ═══ end SCORE-V1-S1', '  _tsScoreCache[symbol] = scored;\n  return scored;\n}\n\n// ═══ end SCORE-V1-S1']] },
  // S3
  { row: 'TR-8', label: '_runId ignored', edits: [
    ['aged.rowRunId !== runId || (aged.rowExpiresAt', '(aged.rowExpiresAt']] },
  { row: 'TR-7', label: 'degraded result kept forever (no 120 s expiry)', edits: [
    ['    if (degraded && !pending.rowExpiresAt) pending.rowExpiresAt = Date.now() + 120000;\n', '']] },
  { row: 'TR-8', label: 'superseded fill overwrites the newer cell', edits: [
    ['  if (current && current !== pending) return; // superseded by a newer fill (new scan / expiry): it owns the cell\n', '']] }
];

async function main() {
  if (process.argv.indexOf('--print-pins') !== -1) {
    const region = regionOf(real);
    console.log('PIN_RESOLVE_MARKET = ' + sha(extractFn(real, '_ts1ResolveMarket')));
    console.log('PIN_ROW_TEXT = ' + sha(extractFn(real, '_ts1RowText')));
    console.log('REGION_TOPLEVEL_FN_COUNT = ' + (region.match(/^(?:async )?function \w+\(/gm) || []).length);
    return;
  }
  const realFetch = globalThis.fetch;
  let leaked = 0;
  globalThis.fetch = function () { leaked += 1; throw new Error('NETWORK ACCESS FORBIDDEN IN OFFLINE SUITE'); };
  try {
    const base = await evaluate(real);
    for (const r of ROWS) {
      check(r.id + (base[r.id].why ? ' [' + base[r.id].why + ']' : ''), base[r.id].ok);
    }
    for (const n of NEGATIVES) {
      let mutated = real;
      let unique = true;
      for (const e of n.edits) {
        if (countOf(mutated, e[0]) !== 1) { unique = false; break; }
        mutated = mutated.replace(e[0], function () { return e[1]; });
      }
      check('negative anchors unique: ' + n.row + ' / ' + n.label, unique);
      check('negative positive control (unmutated source passes the row): ' + n.row + ' / ' + n.label, base[n.row].ok === true);
      if (!unique) continue;
      const res = await evaluate(mutated, [n.row]);
      check('planted negative bites: ' + n.row + ' / ' + n.label, res[n.row].ok === false && res[n.row].why === null);
    }
    check('no leaked real network call', leaked === 0);
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(failures === 0
    ? 'TS1 RELIABILITY: PASS (' + asserts + ' asserts)'
    : 'TS1 RELIABILITY: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  completed = true;
  process.exit(failures === 0 ? 0 : 1);
}
// A promise that never settles drains the event loop and Node exits 0: never let that read as a pass.
let completed = false;
process.on('exit', function () {
  if (!completed) { console.log('TS1 RELIABILITY: ERROR event loop drained before the suite completed'); process.exitCode = 1; }
});
main().then(function () { completed = true; }, function (e) {
  completed = true;
  console.log('TS1 RELIABILITY: ERROR ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
