#!/usr/bin/env node
'use strict';
/*
 * qa/market_daily_change_offline.js - market-data-daily-change-1 (V-1; Main Control D-26).
 *
 * The daily change belongs to the session of the price: S = exchange-local date of regularMarketTime; S-1 = the
 * previous trading session (governed calendar TS1_POLICY_V1 when S is covered, else the latest earlier candle);
 * previous close = the close of the candle dated S-1; change = (price - previous close) / previous close.
 * Unknown S-1 close -> previous close and change are null: never an older close, never chartPreviousClose.
 *
 * Rows are derived from the brief's spec-first matrix (risk-test-design.spec-first.md), written before the code;
 * expected values come from the requirements and from independent closes, never from the new code's output.
 * The REAL functions (fetchYahoo, _dailySessionChange, the calendar helpers and constant, isValidStockData) are
 * extracted from index.html and run with a stubbed fetchYahooChart. Pure Node: no network, no browser, no storage.
 *
 *   DC-1  the four observed mismatches (DEV 2026-10-17; Friday candle close null after the close)
 *   DC-2  independent closes collected before the change (MSTR, MRNA, ARM, IGV)
 *   DC-3  intraday: the price, not the current candle's close, is compared
 *   DC-4  after the close with the day's candle finalised; pre-market Monday (provider stamps Friday)
 *   DC-5  time zones: exchange-local dates (US late evening UTC rollover, TASE, a non-calendar zone, US DST end)
 *   DC-6  weekends and holidays per the calendar (US Labor Day, Thanksgiving; TASE holidays and Mon-Fri week)
 *   DC-7  NO SUBSTITUTION: previous-session candle missing / null / only chartPreviousClose -> null (and a property
 *         over 200 seeded candle arrays against an independent oracle)
 *   DC-8  inputs: no time stamp, bad price, no meta, price stamped on a non-trading day, outside calendar coverage
 *   DC-9  duplicate candles for one date: the last valid close of that date
 *   DC-10 fetchYahoo end to end: fields, unknown change -> null + invalid + one warning; other fields unchanged
 *   DC-11 .TA stays in provider units (agorot)
 *   DC-12 scope: protected functions byte-identical to the base; the helper never throws
 *   DC-N1..N8 planted negatives (each mutates index.html; its named rows must fail)
 *
 * Appendix deltas (brief section C+ / W, added by the Worker; the rows above are the reference text):
 *   W1 candle time-stamp convention (US 13:30/14:30 UTC, TASE 06:30/07:30 UTC) + UTC-midnight candles documented out of contract (R-5)
 *   W2 duplicate candles (array order, valid/null mixes) and out-of-order arrays
 *   W3 fetchStockData fallback flow: unknown Yahoo change -> Alpha Vantage accepted / failed -> null
 *   W4 targeted assertions: zone boundaries, calendar-specific skips, non-positive closes, fields + exact warning text, +/-5 % guard input
 *   W5 gaps between candles: candle basis is explicit (S-1c), weekend / holiday stamps outside coverage
 *   W-N1..N8 planted negatives of the deltas
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'qa', 'lib', 'index-pins-core.js'));
const SRC = core.normalizeText(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// digests at the base (1b48971 / 6f094f5): functions this task must not change
const BASE_DIGESTS = {
  orchestrate: '2e352b3f1d4739e8f98fb079ed3c3865115263e12dcdc53dda70350bebf97dfb',
  isValidStockData: 'c785375bd6be1f80594d5e581794e4c78a6a7fcc6eab18c9ca5512703348d828',
  fetchStockData: 'c3f2a021b72b9e6cf0ade43ad0ae7d9f316e64e9b6c6d3e9461cf1dc0542d752',
  fetchAlphaVantage: '506fc899c5f89a7d4150e04c316f80c2539afb1a0692d3ca388f8bd1ca446c2b',
  formatStockContext: '4833b20da3470692c54d183d185c2e83581a93a71c981a8fd75fba46d697abd0',
  _pfLiveNormalize: 'c9e3b362c10d3325df9417d99f9abb7f5aba1f7b4cb4dddc9954e4df1cc5b6f1',
  computeTechnicalSnapshot: '373e9290a82129cb1ec2ec053ceb5263e81159fc7acc8a589a91defad8d2fc9d',
  enforceScoreConsistency: '28a3a5cac29be9a0b61e854182caaa7cac2ed241fe847fd5b65e8e05a8cbfc60',
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  fetchYahooChart: '2a55af04a7a6d1eb8e82cbf97d16a8685ed0747a163023dce4c1a9946d75ce6c',
  _refreshPriceRow: 'a0462f9876be6093ba2fd4c37fc82f00cd650a4b821cb39c926e39f1fbbd12d4',
  _ts1ExchangeLocalParts: 'f38e324cb412a233add7493f6551064b596bbd8da328a52db54216745ad89f60',
  _ts1IsTradingSession: 'e955dd6cd8f27f5d1e771efdce6469e935f4c8be2fcfb81eac872980ae9292df',
  _ts1RuleFor: 'dd62a58b61a09de395243d1b18169289ea4ba443eb74e119eed40093d3fe1ef6',
  _ts1ResolveMarket: '88daede9f4b83a35bba2c5b674814a6df7dbed4854af98d2058fd9c9f270083f',
  _pfSessionDateFor: '3f3954a128f39a99c781a4bb8a53a7394a3b2dbc18d092784a2d6f25c8747731',
  runAnalysis: '7d5c029bd336cdfadb93a542b38e45ee715f2a70a2fd14e501f1c0a29e2e1aa7',   // evidence-capture-1: one fire-and-forget capture call
  renderMainPanel: '61e663bf2e3a734df928a4a8f59e6cc01691782edd0e51467caa5baebdeaecd1'
};

function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once');
  return hit[0].text;
}
function varText(src, decl) {
  const st = src.indexOf(decl);
  if (st === -1 || src.indexOf(decl, st + 1) !== -1) throw new Error(decl + ' not found exactly once');
  const bi = src.indexOf('{', st); let d = 0;
  for (let i = bi; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(st, i + 1) + ';'; } }
  throw new Error('unbalanced ' + decl);
}
// Build the real functions in an isolated context; fetchYahooChart returns the queued payload.
function build(src) {
  const ctx = { console: { log() {}, warn(...a) { ctx.__warns.push(a.join(' ')); }, error() {} }, __warns: [], __payload: null };
  ctx.fetchYahooChart = async () => ctx.__payload;
  vm.createContext(ctx);
  const names = ['_ts1ExchangeLocalParts', '_ts1RuleFor', '_ts1IsTradingSession', '_ts1ResolveMarket', '_dailySessionChange', 'fetchYahoo', 'isValidStockData'];
  vm.runInContext(varText(src, 'var TS1_POLICY_V1 = {') + '\n' + names.map(n => fnText(src, n)).join('\n') +
    '\nthis.H = _dailySessionChange; this.Y = fetchYahoo; this.V = isValidStockData;', ctx);
  return ctx;
}
// W3: the same real functions plus fetchStockData, with stubbed fetchYahooChart and fetchAlphaVantage (fallback flow).
function build3(src) {
  const ctx = { console: { log() {}, warn(...a) { ctx.__warns.push(a.join(' ')); }, error() {} }, __warns: [], __payload: null, __av: null, __avCalls: 0 };
  ctx.fetchYahooChart = async () => ctx.__payload;
  ctx.fetchAlphaVantage = async s => { ctx.__avCalls++; return typeof ctx.__av === 'function' ? ctx.__av(s) : ctx.__av; };
  vm.createContext(ctx);
  const names = ['_ts1ExchangeLocalParts', '_ts1RuleFor', '_ts1IsTradingSession', '_ts1ResolveMarket', '_dailySessionChange', 'fetchYahoo', 'isValidStockData', 'fetchStockData'];
  vm.runInContext('var _stockDataInflight = {};\n' + varText(src, 'var TS1_POLICY_V1 = {') + '\n' + names.map(n => fnText(src, n)).join('\n') + '\nthis.S = fetchStockData;', ctx);
  return ctx;
}
const ep = iso => Date.parse(iso) / 1000;
// payload: candles = [[isoTimestamp, close], ...]
function payload(o) {
  const meta = Object.assign({ symbol: o.sym || 'TST', regularMarketPrice: o.price, regularMarketTime: o.rmt === undefined ? undefined : ep(o.rmt),
    exchangeTimezoneName: o.tz === undefined ? 'America/New_York' : o.tz, chartPreviousClose: o.chartPrev, currency: o.currency || 'USD',
    regularMarketDayHigh: o.high, regularMarketDayLow: o.low, regularMarketVolume: o.vol }, o.meta || {});
  if (o.rmt === undefined) delete meta.regularMarketTime;
  if (o.tz === null) delete meta.exchangeTimezoneName;
  return { chart: { result: [{ meta: meta, timestamp: (o.candles || []).map(c => ep(c[0])), indicators: { quote: [{ close: (o.candles || []).map(c => c[1]) }] } }] } };
}
const R = (ctx, o) => ctx.H(payload(o).chart.result[0], o.sym || 'TST');
const WEEK = d => ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((day, i) => [day + 'T13:30:00Z', d[i]]);

// The four payloads as captured on DEV (2026-10-17 00:06 UTC; closes at the precision shown by the capture)
const OBS = {
  PLTR: { sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, null]), chartPrev: 209.05, high: 203.55, low: 184.45, vol: 33027354,
    want: { prev: 200.50, chg: -7.22, old: -0.23 } },
  FOXF: { sym: 'FOXF', price: 16.04, rmt: '2026-10-16T20:00:00Z', candles: WEEK([18.02, 17.97, 17.48, 18.50, null]), chartPrev: 18.05, high: 17.18, low: 15.00, vol: 2658741,
    want: { prev: 18.50, chg: -13.30, old: 5.84 } },
  AA: { sym: 'AA', price: 41.45, rmt: '2026-10-16T20:02:00Z', candles: WEEK([41.67, 41.49, 40.08, 40.42, null]), chartPrev: 42.2, high: 44.35, low: 41.08, vol: 13631448,
    want: { prev: 40.42, chg: 2.55, old: 0.85 } },
  CRWV: { sym: 'CRWV', price: 61.39, rmt: '2026-10-16T20:00:00Z', candles: WEEK([80.26, 77.81, 65.78, 69.69, null]), chartPrev: 82.08, high: 66.69, low: 59.90, vol: 94362732,
    want: { prev: 69.69, chg: -11.91, old: 5.94 } }
};
// Independent closes (Bootstrap, plan rev 3 section 2a; Yahoo quote / 5-minute data, collected before this change)
const IND = { MSTR: [151.29, 136.83, -9.56], MRNA: [236.50, 218.01, -7.82], ARM: [244.79, 227.80, -6.94], IGV: [109.60, 104.34, -4.80] };

async function rows(src, only) {
  const out = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in out) || out[id] === true) out[id] = cond ? true : (detail || 'fail'); };
  const guard = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };
  const ctx = build(src);
  const same = (r, prev, chg, s, p, basis) => r.prevClose === prev && r.changePct === chg && (s === undefined || r.sessionDate === s) && (p === undefined || r.prevSessionDate === p) && (basis === undefined || r.basis === basis);

  if (want('DC-1')) await guard('DC-1', async () => {
    const bad = [];
    for (const t of Object.keys(OBS)) {
      const r = R(ctx, OBS[t]);
      if (!same(r, OBS[t].want.prev, OBS[t].want.chg, '2026-10-16', '2026-10-15', 'calendar')) bad.push(t + ' helper ' + JSON.stringify(r));
      // end to end: what fetchYahoo hands to the scan (the observed defect was in this output)
      ctx.__payload = payload(OBS[t]);
      const y = await ctx.Y(t);
      if (!(y.change_percent === OBS[t].want.chg && y.previous_close === OBS[t].want.prev && y.change_percent !== OBS[t].want.old)) bad.push(t + ' fetchYahoo ' + y.change_percent + ' / ' + y.previous_close);
    }
    ok('DC-1', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-2')) await guard('DC-2', () => {
    const bad = [];
    for (const t of Object.keys(IND)) {
      const [prev, price, chg] = IND[t];
      const r = R(ctx, { sym: t, price: price, rmt: '2026-10-16T20:00:01Z', candles: WEEK([prev * 1.01, prev * 1.02, prev * 0.99, prev, null]) });
      if (!same(r, prev, chg, '2026-10-16', '2026-10-15')) bad.push(t + ' ' + JSON.stringify(r));
    }
    ok('DC-2', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-3')) await guard('DC-3', () => {
    // 11:00 ET on Friday: Friday's candle carries a live close (190.10) that differs from the price (188.00)
    const r = R(ctx, { price: 188.00, rmt: '2026-10-16T15:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 190.10]) });
    ok('DC-3', same(r, 200.50, -6.23, '2026-10-16', '2026-10-15'), JSON.stringify(r));
  });

  if (want('DC-4')) await guard('DC-4', () => {
    const fin = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]) });
    // pre-market Monday 08:00 ET: the provider still stamps Friday's regular session; a Monday candle with no close
    const pre = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]).concat([['2026-10-19T13:30:00Z', null]]) });
    ok('DC-4', same(fin, 200.50, -7.22, '2026-10-16', '2026-10-15') && same(pre, 200.50, -7.22, '2026-10-16', '2026-10-15'), JSON.stringify([fin, pre]));
  });

  if (want('DC-5')) await guard('DC-5', () => {
    const bad = [];
    // 00:30 UTC Saturday = 20:30 ET Friday
    const late = R(ctx, { price: 186.03, rmt: '2026-10-17T00:30:00Z', candles: WEEK([209.00, 208.67, 200.97, 200.50, null]) });
    if (!same(late, 200.50, -7.22, '2026-10-16', '2026-10-15')) bad.push('US late ' + JSON.stringify(late));
    // TASE (Asia/Jerusalem): 22:30 UTC Thursday = 01:30 IDT Friday; candles stamped 07:00 UTC
    const tase = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-15T22:30:00Z',
      candles: [['2026-10-14T07:00:00Z', 8700], ['2026-10-15T07:00:00Z', 8800], ['2026-10-16T07:00:00Z', null]] });
    if (!same(tase, 8800, 0.95, '2026-10-16', '2026-10-15', 'calendar')) bad.push('TASE ' + JSON.stringify(tase));
    // a zone without a governed calendar: candles stamped 23:00 UTC the previous UTC day are local next-day sessions
    const syd = R(ctx, { sym: 'XYZ.AX', tz: 'Australia/Sydney', price: 10.50, rmt: '2026-10-16T05:10:00Z',
      candles: [['2026-10-13T23:00:00Z', 9.80], ['2026-10-14T23:00:00Z', 10.00], ['2026-10-15T23:00:00Z', 10.40]] });
    if (!same(syd, 10.00, 5.00, '2026-10-16', '2026-10-15', 'candles')) bad.push('Sydney ' + JSON.stringify(syd));
    // US DST ended Sunday 2026-11-01: Monday candles at 14:30 UTC
    const dst = R(ctx, { price: 103, rmt: '2026-11-02T21:00:00Z', candles: [['2026-10-29T13:30:00Z', 99], ['2026-10-30T13:30:00Z', 100], ['2026-11-02T14:30:00Z', null]] });
    if (!same(dst, 100, 3.00, '2026-11-02', '2026-10-30', 'calendar')) bad.push('DST ' + JSON.stringify(dst));
    ok('DC-5', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-6')) await guard('DC-6', () => {
    const bad = [];
    const labor = R(ctx, { price: 110, rmt: '2026-09-08T20:00:00Z', candles: [['2026-09-03T13:30:00Z', 95], ['2026-09-04T13:30:00Z', 100], ['2026-09-08T13:30:00Z', null]] });
    if (!same(labor, 100, 10.00, '2026-09-08', '2026-09-04')) bad.push('Labor Day ' + JSON.stringify(labor));
    const thanks = R(ctx, { price: 99, rmt: '2026-11-27T18:00:00Z', candles: [['2026-11-24T14:30:00Z', 90], ['2026-11-25T14:30:00Z', 100], ['2026-11-27T14:30:00Z', null]] });
    if (!same(thanks, 100, -1.00, '2026-11-27', '2026-11-25')) bad.push('Thanksgiving ' + JSON.stringify(thanks));
    // TASE: Tue 2026-09-22 after holidays 09-18 (Fri) and 09-21 (Mon) and the weekend -> previous session Thu 09-17
    const taseHol = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', price: 9000, rmt: '2026-09-22T14:00:00Z',
      candles: [['2026-09-16T07:00:00Z', 8000], ['2026-09-17T07:00:00Z', 8800], ['2026-09-22T07:00:00Z', null]] });
    if (!same(taseHol, 8800, 2.27, '2026-09-22', '2026-09-17')) bad.push('TASE holidays ' + JSON.stringify(taseHol));
    // TASE Monday after a weekend (Mon-Fri week since 2026-01-04)
    const taseMon = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', price: 9100, rmt: '2026-10-19T14:00:00Z',
      candles: [['2026-10-15T07:00:00Z', 8900], ['2026-10-16T07:00:00Z', 9000], ['2026-10-19T07:00:00Z', null]] });
    if (!same(taseMon, 9000, 1.11, '2026-10-19', '2026-10-16')) bad.push('TASE Monday ' + JSON.stringify(taseMon));
    const usMon = R(ctx, { price: 101, rmt: '2026-10-19T20:00:00Z', candles: WEEK([1, 1, 1, 99, 100]).concat([['2026-10-19T13:30:00Z', null]]) });
    if (!same(usMon, 100, 1.00, '2026-10-19', '2026-10-16')) bad.push('US Monday ' + JSON.stringify(usMon));
    ok('DC-6', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-7')) await guard('DC-7', () => {
    const bad = [];
    const nul = r => r.prevClose === null && r.changePct === null;
    // Thursday candle absent: Wednesday's close must NOT stand in
    const absent = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: [['2026-10-12T13:30:00Z', 209], ['2026-10-13T13:30:00Z', 208.67], ['2026-10-14T13:30:00Z', 200.97], ['2026-10-16T13:30:00Z', null]] });
    if (!(nul(absent) && absent.prevSessionDate === '2026-10-15')) bad.push('absent ' + JSON.stringify(absent));
    const notYet = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]) });
    if (!nul(notYet)) bad.push('null close ' + JSON.stringify(notYet));
    const onlyRange = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([null, null, null, null, null]), chartPrev: 209.05 });
    if (!nul(onlyRange)) bad.push('chartPreviousClose ' + JSON.stringify(onlyRange));
    // property: 200 seeded candle arrays for the week of 10-12; independent oracle: the previous session of Fri 10-16
    // is Thu 10-15 (no US holiday that week), so the change is vs Thursday's close or unknown
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 200; n++) {
      const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].filter(() => rnd() > 0.25);
      const cs = days.map(d => [d + 'T13:30:00Z', rnd() < 0.3 ? null : Math.round((50 + rnd() * 100) * 100) / 100]);
      const price = Math.round((50 + rnd() * 100) * 100) / 100;
      const r = R(ctx, { price: price, rmt: '2026-10-16T20:00:00Z', candles: cs, chartPrev: 77.77 });
      const thu = cs.find(c => c[0].startsWith('2026-10-15'));
      const exp = thu && typeof thu[1] === 'number' ? parseFloat(((price - thu[1]) / thu[1] * 100).toFixed(2)) : null;
      if (r.changePct !== exp || r.prevClose !== (exp === null ? null : thu[1])) { bad.push('property #' + n + ' ' + JSON.stringify({ cs, price, r })); break; }
    }
    ok('DC-7', bad.length === 0, JSON.stringify(bad).slice(0, 600));
  });

  if (want('DC-8')) await guard('DC-8', () => {
    const bad = [];
    const allNull = r => r.prevClose === null && r.changePct === null;
    const base = { price: 186.03, candles: WEEK([209.00, 208.67, 200.97, 200.50, 186.03]) };
    const noTime = R(ctx, Object.assign({}, base, { rmt: undefined }));
    if (!(allNull(noTime) && noTime.sessionDate === null)) bad.push('no time ' + JSON.stringify(noTime));
    for (const p of [0, -5, NaN, 'x']) { const r = R(ctx, Object.assign({}, base, { price: p, rmt: '2026-10-16T20:00:00Z' })); if (!allNull(r)) bad.push('price ' + p); }
    const noMeta = ctx.H({ timestamp: [], indicators: {} }, 'TST');
    if (!allNull(noMeta)) bad.push('no meta');
    // a price stamped on Saturday 11:00 ET (calendar mode): unknown, even though Friday's close exists
    const sat = R(ctx, Object.assign({}, base, { rmt: '2026-10-17T15:00:00Z' }));
    if (!(allNull(sat) && sat.sessionDate === '2026-10-17')) bad.push('saturday ' + JSON.stringify(sat));
    // outside the calendar's coverage (2028): latest earlier candle
    const out = R(ctx, { price: 105, rmt: '2028-01-05T20:00:00Z', candles: [['2028-01-03T14:30:00Z', 90], ['2028-01-04T14:30:00Z', 100], ['2028-01-05T14:30:00Z', null]] });
    if (!same(out, 100, 5.00, '2028-01-05', '2028-01-04', 'candles')) bad.push('coverage ' + JSON.stringify(out));
    // no time zone and no market: unknown (never a guessed zone)
    const noTz = R(ctx, Object.assign({}, base, { rmt: '2026-10-16T20:00:00Z', tz: null }));
    if (!allNull(noTz)) bad.push('no tz ' + JSON.stringify(noTz));
    ok('DC-8', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-9')) await guard('DC-9', () => {
    const two = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209, 208.67, 200.97, 200.10, null]).concat([['2026-10-15T19:59:00Z', 200.50]]).sort((a, b) => a[0] < b[0] ? -1 : 1) });
    const lastNull = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209, 208.67, 200.97, 200.10, null]).concat([['2026-10-15T19:59:00Z', null]]).sort((a, b) => a[0] < b[0] ? -1 : 1) });
    ok('DC-9', same(two, 200.50, -7.22) && same(lastNull, 200.10, -7.03), JSON.stringify([two, lastNull]));
  });

  if (want('DC-10')) await guard('DC-10', async () => {
    const bad = [];
    ctx.__payload = payload(OBS.PLTR); ctx.__warns = [];
    const y = await ctx.Y('PLTR');
    const exp = { symbol: 'PLTR', price: 186.03, change_percent: -7.22, previous_close: 200.50, high: 203.55, low: 184.45, volume: 33027354,
      timestamp: '2026-10-16T20:00:00.000Z', source: 'yahoo', sessionDate: '2026-10-16', prevSessionDate: '2026-10-15', dailyBasis: 'calendar' };
    for (const k of Object.keys(exp)) if (y[k] !== exp[k]) bad.push(k + '=' + y[k]);
    if (!Number.isNaN(y.open)) bad.push('open should stay NaN when the provider gives none');
    if (!ctx.V(y) || ctx.__warns.length !== 0) bad.push('valid / no warning');   // the gate returns a truthy value, not true
    // unknown change: null, invalid for the existing gate (-> the existing Alpha Vantage fallback), one named warning
    ctx.__payload = payload({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]), chartPrev: 209.05, high: 1, low: 1, vol: 1 }); ctx.__warns = [];
    const u = await ctx.Y('PLTR');
    if (!(u.change_percent === null && u.previous_close === null && u.sessionDate === '2026-10-16' && u.prevSessionDate === '2026-10-15')) bad.push('unknown ' + JSON.stringify(u));
    if (ctx.V(u)) bad.push('unknown must fail isValidStockData');
    if (!(ctx.__warns.length === 1 && /PLTR/.test(ctx.__warns[0]) && /2026-10-15/.test(ctx.__warns[0]))) bad.push('warning ' + JSON.stringify(ctx.__warns));
    // never the old silent "+0 %": a payload with no candles at all
    ctx.__payload = payload({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: [], chartPrev: 209.05, high: 1, low: 1, vol: 1 });
    const z = await ctx.Y('PLTR');
    if (z.change_percent !== null) bad.push('no candles -> ' + z.change_percent);
    ok('DC-10', bad.length === 0, JSON.stringify(bad));
  });

  if (want('DC-11')) await guard('DC-11', async () => {
    ctx.__payload = payload({ sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-16T10:50:00Z',
      candles: [['2026-10-14T07:00:00Z', 8700], ['2026-10-15T07:00:00Z', 8800], ['2026-10-16T07:00:00Z', null]], high: 8950, low: 8790, vol: 1234567 });
    const y = await ctx.Y('NXSN.TA');
    ok('DC-11', y.price === 8884 && y.previous_close === 8800 && y.change_percent === 0.95 && y.high === 8950, JSON.stringify(y));
  });

  if (want('DC-12')) await guard('DC-12', () => {
    const changed = Object.keys(BASE_DIGESTS).filter(n => { try { return sha(fnText(src, n)) !== BASE_DIGESTS[n]; } catch (e) { return true; } });
    const boom = () => { throw new Error('hostile'); };
    const hostile = [null, undefined, 1, 'x', [], {}, { meta: new Proxy({}, { get: boom }) },
      { meta: { regularMarketPrice: 1, regularMarketTime: 1 }, get timestamp() { throw new Error('t'); } }];
    const threw = [];
    for (const h of hostile) { try { const r = ctx.H(h, 'TST'); if (!r || r.changePct !== null) threw.push('shape'); } catch (e) { threw.push('threw'); } }
    ok('DC-12', changed.length === 0 && threw.length === 0, JSON.stringify({ changed, threw }));
  });

  // ---- section W (Appendix deltas W1-W5, brief C+): expected values worked out by hand from the requirements ----
  const nul = r => r.prevClose === null && r.changePct === null;
  const FRI = [209.00, 208.67, 200.97, 200.50, null];   // Mon-Fri 2026-10-12..16: Thursday's close 200.50, Friday not finalised

  if (want('W1')) await guard('W1', () => {
    const bad = [];
    // the verified Yahoo convention (A-3): US daily candles at 13:30 UTC (09:30 EDT) / 14:30 UTC (09:30 EST); TASE at 06:30 UTC (IDT) / 07:30 UTC (IST)
    const us = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK(FRI) });
    if (!same(us, 200.50, -7.22, '2026-10-16', '2026-10-15', 'calendar')) bad.push('US 13:30Z ' + JSON.stringify(us));
    const usWinter = R(ctx, { price: 103, rmt: '2026-12-01T21:00:00Z', candles: [['2026-11-30T14:30:00Z', 100], ['2026-12-01T14:30:00Z', null]] });
    if (!same(usWinter, 100, 3.00, '2026-12-01', '2026-11-30', 'calendar')) bad.push('US 14:30Z ' + JSON.stringify(usWinter));
    const taseSummer = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-16T10:50:00Z',
      candles: [['2026-10-14T06:30:00Z', 8700], ['2026-10-15T06:30:00Z', 8800], ['2026-10-16T06:30:00Z', null]] });
    if (!same(taseSummer, 8800, 0.95, '2026-10-16', '2026-10-15', 'calendar')) bad.push('TASE 06:30Z ' + JSON.stringify(taseSummer));
    const taseWinter = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 9000, rmt: '2026-11-12T15:00:00Z',
      candles: [['2026-11-11T07:30:00Z', 8900], ['2026-11-12T07:30:00Z', null]] });
    if (!same(taseWinter, 8900, 1.12, '2026-11-12', '2026-11-11', 'calendar')) bad.push('TASE 07:30Z ' + JSON.stringify(taseWinter));
    // OUT OF CONTRACT (risk R-5): candles stamped at UTC midnight are dated one local day early (ET). This documents what A1 does with them:
    // Friday's (finalised) candle is read as Thursday's, so the change is taken against the wrong session WITHOUT a null; an unfinalised one gives null.
    const mid = FRI.slice(0, 4).concat([186.03]);
    const utcMid = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d, i) => [d + 'T00:00:00Z', mid[i]]) });
    if (!same(utcMid, 186.03, 0, '2026-10-16', '2026-10-15', 'calendar')) bad.push('UTC-midnight (finalised) ' + JSON.stringify(utcMid));
    const utcMidNull = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d, i) => [d + 'T00:00:00Z', FRI[i]]) });
    if (!(nul(utcMidNull) && utcMidNull.prevSessionDate === '2026-10-15')) bad.push('UTC-midnight (null) ' + JSON.stringify(utcMidNull));
    ok('W1', bad.length === 0, JSON.stringify(bad));
  });

  if (want('W2')) await guard('W2', () => {
    const bad = [];
    const head = [['2026-10-12T13:30:00Z', 209.00], ['2026-10-13T13:30:00Z', 208.67], ['2026-10-14T13:30:00Z', 200.97]];
    const fri = ['2026-10-16T13:30:00Z', null];
    const run = thu => R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: head.concat(thu, [fri]) });
    // several candles on Thursday: the LAST ONE WITH A VALID CLOSE IN ARRAY ORDER (A-3), not by timestamp
    const t1 = '2026-10-15T13:30:00Z', t2 = '2026-10-15T19:59:00Z';
    const cases = [
      ['valid then null', [[t1, 200.50], [t2, null]], 200.50, -7.22],
      ['null then valid', [[t1, null], [t2, 200.50]], 200.50, -7.22],
      ['two valid (array order = time order)', [[t1, 200.10], [t2, 200.50]], 200.50, -7.22],
      ['two valid (array order against time order)', [[t2, 200.50], [t1, 200.10]], 200.10, -7.03],
      ['valid, null, valid', [[t1, 200.10], [t2, null], ['2026-10-15T15:00:00Z', 200.50]], 200.50, -7.22],
      ['valid, valid, null (array order against time order)', [[t2, 200.50], [t1, 200.10], ['2026-10-15T15:00:00Z', null]], 200.10, -7.03]
    ];
    for (const [label, thu, prev, chg] of cases) { const r = run(thu); if (!same(r, prev, chg, '2026-10-16', '2026-10-15', 'calendar')) bad.push(label + ' ' + JSON.stringify(r)); }
    const allNull = run([[t1, null], [t2, null]]);
    if (!nul(allNull)) bad.push('only nulls ' + JSON.stringify(allNull));
    // out-of-order arrays with DISTINCT dates give the sorted result (reversed, and 20 seeded permutations)
    const sorted = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK(FRI) });
    const week = WEEK(FRI);
    const rev = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: week.slice().reverse() });
    if (JSON.stringify(rev) !== JSON.stringify(sorted) || !same(sorted, 200.50, -7.22)) bad.push('reversed ' + JSON.stringify(rev));
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 20; n++) {
      const p = week.slice();
      for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
      const r = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: p });
      if (JSON.stringify(r) !== JSON.stringify(sorted)) { bad.push('permutation #' + n + ' ' + JSON.stringify(p.map(c => c[0].slice(5, 10)))); break; }
    }
    ok('W2', bad.length === 0, JSON.stringify(bad).slice(0, 700));
  });

  if (want('W3')) await guard('W3', async () => {
    const bad = [];
    const c3 = build3(src);
    const AV = { symbol: 'PLTR', price: 186.5, change_percent: 1.23, high: 190, low: 180, volume: 5, timestamp: '2026-10-16T20:00:00.000Z', source: 'alphavantage' };
    const unknown = payload({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]), chartPrev: 209.05, high: 203.55, low: 184.45, vol: 1 });
    // 1. Yahoo result unknown (Thursday's close missing) -> Alpha Vantage is called; its valid result is accepted as ITS OWN quote, untouched
    c3.__payload = unknown; c3.__av = AV; c3.__avCalls = 0;
    const a = await c3.S('PLTR');
    if (!(c3.__avCalls === 1 && a && a.source === 'alphavantage' && a.change_percent === 1.23 && a.price === 186.5 && !('sessionDate' in a))) bad.push('AV accepted ' + JSON.stringify(a) + ' calls=' + c3.__avCalls);
    // 2. Alpha Vantage fails (throws / returns nothing / invalid change) -> null = "no market data"; never the Yahoo price with a substituted change
    for (const [label, av] of [['throws', () => { throw new Error('AV down'); }], ['returns null', null], ['invalid change', Object.assign({}, AV, { change_percent: null })], ['text change', Object.assign({}, AV, { change_percent: '1.23' })]]) {
      c3.__payload = unknown; c3.__av = av; c3.__avCalls = 0;
      const b = await c3.S('PLTR');
      if (!(b === null && c3.__avCalls === 1)) bad.push('AV ' + label + ' -> ' + JSON.stringify(b) + ' calls=' + c3.__avCalls);
    }
    // 3. Yahoo result known -> returned as is, Alpha Vantage not called
    c3.__payload = payload(OBS.PLTR); c3.__av = AV; c3.__avCalls = 0;
    const d = await c3.S('PLTR');
    if (!(d && d.source === 'yahoo' && d.change_percent === -7.22 && d.previous_close === 200.50 && c3.__avCalls === 0)) bad.push('Yahoo valid ' + JSON.stringify(d) + ' calls=' + c3.__avCalls);
    // 4. no price time stamp: fetchYahoo itself rejects (unchanged behaviour) -> the same fallback applies
    c3.__payload = payload({ sym: 'PLTR', price: 186.03, candles: WEEK(FRI), high: 1, low: 1, vol: 1 }); c3.__av = AV; c3.__avCalls = 0;
    const e = await c3.S('PLTR');
    if (!(c3.__avCalls === 1 && e && e.source === 'alphavantage')) bad.push('no time ' + JSON.stringify(e) + ' calls=' + c3.__avCalls);
    ok('W3', bad.length === 0, JSON.stringify(bad));
  });

  if (want('W4')) await guard('W4', async () => {
    const bad = [];
    // DC-5 (zones): the boundaries of the exchange-local date, not only a mid-evening time
    const wk = WEEK(FRI);
    const b1 = R(ctx, { price: 186.03, rmt: '2026-10-16T23:59:59Z', candles: wk });                 // 19:59:59 EDT Friday
    if (!same(b1, 200.50, -7.22, '2026-10-16', '2026-10-15', 'calendar')) bad.push('US 19:59 ' + JSON.stringify(b1));
    const b2 = R(ctx, { price: 186.03, rmt: '2026-10-17T03:59:59Z', candles: wk });                 // 23:59:59 EDT Friday
    if (!same(b2, 200.50, -7.22, '2026-10-16', '2026-10-15', 'calendar')) bad.push('US 23:59 ' + JSON.stringify(b2));
    const b3 = R(ctx, { price: 186.03, rmt: '2026-10-17T04:00:00Z', candles: wk });                 // 00:00:00 EDT Saturday: non-trading day
    if (!(nul(b3) && b3.sessionDate === '2026-10-17' && b3.prevSessionDate === null && b3.basis === null)) bad.push('US Saturday 00:00 ' + JSON.stringify(b3));
    const b4 = R(ctx, { price: 103, rmt: '2026-11-02T04:59:59Z', candles: [['2026-10-30T13:30:00Z', 100], ['2026-11-02T14:30:00Z', null]] });   // 23:59:59 EST Sunday (DST ended 11-01)
    if (!(nul(b4) && b4.sessionDate === '2026-11-01')) bad.push('US Sunday 23:59 EST ' + JSON.stringify(b4));
    const b5 = R(ctx, { price: 103, rmt: '2026-11-02T05:00:00Z', candles: [['2026-10-30T13:30:00Z', 100], ['2026-11-02T14:30:00Z', null]] });   // 00:00:00 EST Monday
    if (!same(b5, 100, 3.00, '2026-11-02', '2026-10-30', 'calendar')) bad.push('US Monday 00:00 EST ' + JSON.stringify(b5));
    const tc = [['2026-10-14T06:30:00Z', 8700], ['2026-10-15T06:30:00Z', 8800], ['2026-10-16T06:30:00Z', null]];
    const t1 = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-15T20:59:59Z', candles: tc });   // 23:59:59 IDT Thursday
    if (!same(t1, 8700, 2.11, '2026-10-15', '2026-10-14', 'calendar')) bad.push('TASE 23:59 ' + JSON.stringify(t1));
    const t2 = R(ctx, { sym: 'NXSN.TA', tz: 'Asia/Jerusalem', currency: 'ILA', price: 8884, rmt: '2026-10-15T21:00:00Z', candles: tc });   // 00:00:00 IDT Friday
    if (!same(t2, 8800, 0.95, '2026-10-16', '2026-10-15', 'calendar')) bad.push('TASE 00:00 ' + JSON.stringify(t2));
    // DC-6 / DC-N6 (calendar-specific): a candle on a non-session day must be skipped; the calendar's previous session wins and the basis says so
    const holiday = R(ctx, { price: 110, rmt: '2026-09-08T20:00:00Z', candles: [['2026-09-03T13:30:00Z', 95], ['2026-09-04T13:30:00Z', 100], ['2026-09-07T13:30:00Z', 5], ['2026-09-08T13:30:00Z', null]] });
    if (!same(holiday, 100, 10.00, '2026-09-08', '2026-09-04', 'calendar')) bad.push('spurious Labor Day candle ' + JSON.stringify(holiday));
    const sunday = R(ctx, { price: 101, rmt: '2026-10-19T20:00:00Z', candles: WEEK([1, 1, 1, 99, 100]).concat([['2026-10-18T13:30:00Z', 5], ['2026-10-19T13:30:00Z', null]]) });
    if (!same(sunday, 100, 1.00, '2026-10-19', '2026-10-16', 'calendar')) bad.push('spurious Sunday candle ' + JSON.stringify(sunday));
    // DC-7: a Thursday close that is zero, negative, NaN or text is "not known" - sessions and basis stay reported
    for (const v of [0, -1, NaN, '200.5']) {
      const r = R(ctx, { price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, v, null]), chartPrev: 209.05 });
      if (!(nul(r) && r.sessionDate === '2026-10-16' && r.prevSessionDate === '2026-10-15' && r.basis === 'calendar')) bad.push('Thursday close ' + String(v) + ' ' + JSON.stringify(r));
    }
    // DC-8: a price stamped on a Sunday or on a market holiday is unknown (calendar mode), with the session reported
    const sun = R(ctx, { price: 186.03, rmt: '2026-10-18T15:00:00Z', candles: wk });
    if (!(nul(sun) && sun.sessionDate === '2026-10-18' && sun.prevSessionDate === null && sun.basis === null)) bad.push('Sunday ' + JSON.stringify(sun));
    const lab = R(ctx, { price: 110, rmt: '2026-09-07T15:00:00Z', candles: [['2026-09-04T13:30:00Z', 100], ['2026-09-07T13:30:00Z', null]] });
    if (!(nul(lab) && lab.sessionDate === '2026-09-07' && lab.basis === null)) bad.push('Labor Day price ' + JSON.stringify(lab));
    // DC-10: the three new fields and the exact warning text on every unknown path (and none on the known path)
    const warnFor = async (o, sym) => { ctx.__payload = payload(o); ctx.__warns = []; let y = null, err = null; try { y = await ctx.Y(sym || o.sym); } catch (e) { err = e; } return { y, err, w: ctx.__warns.slice() }; };
    const u1 = await warnFor({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: WEEK([209.00, 208.67, 200.97, null, null]), chartPrev: 209.05, high: 1, low: 1, vol: 1 });
    if (!(u1.y && u1.y.sessionDate === '2026-10-16' && u1.y.prevSessionDate === '2026-10-15' && u1.y.dailyBasis === 'calendar' && u1.y.change_percent === null && u1.y.previous_close === null &&
      u1.w.length === 1 && u1.w[0] === '[market-data] daily change unknown for PLTR (session 2026-10-16, previous session 2026-10-15 close not available)')) bad.push('unknown (close missing) ' + JSON.stringify(u1.y) + JSON.stringify(u1.w));
    const u2 = await warnFor({ sym: 'PLTR', price: 186.03, rmt: '2026-10-17T15:00:00Z', candles: wk, chartPrev: 209.05, high: 1, low: 1, vol: 1 });
    if (!(u2.y && u2.y.sessionDate === '2026-10-17' && u2.y.prevSessionDate === null && u2.y.dailyBasis === null && u2.y.change_percent === null && u2.y.previous_close === null &&
      u2.w.length === 1 && u2.w[0] === '[market-data] daily change unknown for PLTR (session 2026-10-17, previous session null close not available)')) bad.push('unknown (Saturday) ' + JSON.stringify(u2.y) + JSON.stringify(u2.w));
    const u3 = await warnFor({ sym: 'PLTR', price: 186.03, candles: wk, chartPrev: 209.05, high: 1, low: 1, vol: 1 });   // no price time stamp: warns, then the existing Date step rejects
    if (!(u3.err && u3.w.length === 1 && u3.w[0] === '[market-data] daily change unknown for PLTR (session null, previous session null close not available)')) bad.push('unknown (no time) ' + JSON.stringify(u3.w) + ' ' + (u3.err && u3.err.message));
    const u4 = await warnFor(OBS.PLTR);
    if (!(u4.y && u4.y.dailyBasis === 'calendar' && u4.w.length === 0)) bad.push('known path warned ' + JSON.stringify(u4.w));
    // DC-N1 branches: Thursday absent, range-start chartPreviousClose present - the result is null / null, never 0 and never the range-start close
    const u5 = await warnFor({ sym: 'PLTR', price: 186.03, rmt: '2026-10-16T20:00:00Z', candles: [['2026-10-12T13:30:00Z', 209], ['2026-10-14T13:30:00Z', 200.97], ['2026-10-16T13:30:00Z', null]], chartPrev: 209.05, high: 1, low: 1, vol: 1 });
    if (!(u5.y && u5.y.change_percent === null && u5.y.previous_close === null && u5.w.length === 1)) bad.push('absent candle ' + JSON.stringify(u5.y) + JSON.stringify(u5.w));
    // D-27b: the corrected change reaches the existing +/-5 % guard input in orchestrate (value flow), where the old value did not
    const orch = fnText(src, 'orchestrate');
    const gDown = /const chg = mkt\?\.change_percent \?\? 0;[\s\S]*?chg < (-?\d+) && item\.sentiment_score > (\d+)/.exec(orch);
    const gUp = /chg > (-?\d+)\s+&& item\.sentiment_score < (\d+)/.exec(orch);
    if (!gDown || !gUp || !/item\._verifiedChangePct = mkt\.change_percent;/.test(orch)) bad.push('orchestrate guard shape not found');
    else {
      const c3 = build3(src); c3.__av = null;
      const pl = OBS.PLTR; c3.__payload = payload(pl);
      const live = await c3.S('PLTR');
      if (!(live && live.change_percent < Number(gDown[1]) && pl.want.old >= Number(gDown[1]))) bad.push('PLTR does not reach the down guard ' + (live && live.change_percent));
      const cr = OBS.CRWV; c3.__payload = payload(cr);
      const cl = await c3.S('CRWV');
      if (!(cl && cl.change_percent < Number(gDown[1]) && cr.want.old > Number(gUp[1]))) bad.push('CRWV (old +5.94 crossed the up guard, true -11.91 reaches the down guard) ' + (cl && cl.change_percent));
    }
    ok('W4', bad.length === 0, JSON.stringify(bad).slice(0, 900));
  });

  if (want('W5')) await guard('W5', () => {
    const bad = [];
    const cand = r => r.basis === 'candles';
    // a zone without a governed calendar: the latest EARLIER CANDLE is used, even across a missing session (S-1c) - explicit, never 'calendar'
    const gap = R(ctx, { sym: 'XYZ.AX', tz: 'Australia/Sydney', price: 10.50, rmt: '2026-10-16T05:10:00Z',
      candles: [['2026-10-12T23:00:00Z', 9.80], ['2026-10-13T23:00:00Z', 10.00]] });             // local 10-13, 10-14; the 10-15 candle is missing
    if (!(same(gap, 10.00, 5.00, '2026-10-16', '2026-10-14') && cand(gap))) bad.push('Sydney gap ' + JSON.stringify(gap));
    const nogap = R(ctx, { sym: 'XYZ.AX', tz: 'Australia/Sydney', price: 10.50, rmt: '2026-10-16T05:10:00Z',
      candles: [['2026-10-12T23:00:00Z', 9.80], ['2026-10-13T23:00:00Z', 10.00], ['2026-10-14T23:00:00Z', 10.40]] });
    if (!(same(nogap, 10.40, 0.96, '2026-10-16', '2026-10-15') && cand(nogap))) bad.push('Sydney no gap ' + JSON.stringify(nogap));
    // a date outside the calendar's coverage (2028): a missing candle between S and the latest earlier candle
    const gap28 = R(ctx, { price: 105, rmt: '2028-01-07T20:00:00Z', candles: [['2028-01-03T14:30:00Z', 90], ['2028-01-04T14:30:00Z', 100], ['2028-01-07T14:30:00Z', null]] });
    if (!(same(gap28, 100, 5.00, '2028-01-07', '2028-01-04') && cand(gap28))) bad.push('2028 gap ' + JSON.stringify(gap28));
    // a weekend / holiday stamp outside coverage cannot be detected: the accepted candle basis applies (Saturday 2028-01-08, MLK Monday 2028-01-17)
    const sat28 = R(ctx, { price: 101, rmt: '2028-01-08T15:00:00Z', candles: [['2028-01-07T14:30:00Z', 100], ['2028-01-08T14:30:00Z', null]] });
    if (!(same(sat28, 100, 1.00, '2028-01-08', '2028-01-07') && cand(sat28))) bad.push('Saturday 2028 ' + JSON.stringify(sat28));
    const mlk28 = R(ctx, { price: 102, rmt: '2028-01-17T15:00:00Z', candles: [['2028-01-13T14:30:00Z', 98], ['2028-01-14T14:30:00Z', 100], ['2028-01-17T14:30:00Z', null]] });
    if (!(same(mlk28, 100, 2.00, '2028-01-17', '2028-01-14') && cand(mlk28))) bad.push('holiday 2028 ' + JSON.stringify(mlk28));
    // the same weekend stamp INSIDE coverage is unknown (calendar mode), so the candle basis is the only place it can pass
    const sat26 = R(ctx, { price: 101, rmt: '2026-10-17T15:00:00Z', candles: [['2026-10-16T13:30:00Z', 100], ['2026-10-17T13:30:00Z', null]] });
    if (!(nul(sat26) && sat26.basis === null)) bad.push('Saturday 2026 ' + JSON.stringify(sat26));
    // no candle before S at all (candle basis) -> unknown, basis null
    const none = R(ctx, { price: 105, rmt: '2028-01-07T20:00:00Z', candles: [['2028-01-07T14:30:00Z', null]] });
    if (!(nul(none) && none.prevSessionDate === null && none.basis === null)) bad.push('no earlier candle ' + JSON.stringify(none));
    ok('W5', bad.length === 0, JSON.stringify(bad));
  });
  return out;
}

// ---- planted negatives: each mutates index.html; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 70)); return s.replace(a, b); };
const NEW_BLOCK = '  const _sess = _dailySessionChange(result, symbol);\n  const change_percent = _sess.changePct;\n  const previous_close = _sess.prevClose;\n';
const OLD_BLOCK = '  const _sess = _dailySessionChange(result, symbol);\n' +
  '  let change_percent = 0;\n  let previous_close = 0;\n' +
  '  const closes = result?.indicators?.quote?.[0]?.close || [];\n' +
  '  const validCloses = closes.filter(c => c !== null && !isNaN(c) && c > 0);\n' +
  '  if (validCloses.length >= 2) {\n    previous_close = validCloses[validCloses.length - 2];\n' +
  '    change_percent = parseFloat(((validCloses[validCloses.length - 1] - previous_close) / previous_close * 100).toFixed(2));\n  }\n';
const NEG = [
  ['DC-N1 the old "last two non-null closes"', rep(NEW_BLOCK, OLD_BLOCK), ['DC-1', 'DC-10']],
  ['DC-N2 UTC date instead of the exchange-local date', rep('      var p = _ts1ExchangeLocalParts(d.toISOString(), tz);\n      return p ? p.dateStr : null;\n', '      return d.toISOString().slice(0, 10);\n'), ['DC-5']],
  ['DC-N3 an older close substituted when the previous session has none', rep('    var pc = Object.prototype.hasOwnProperty.call(byDate, prevDate) ? byDate[prevDate] : null;\n',
    '    var pc = null;\n    Object.keys(byDate).filter(function (d) { return d <= prevDate && byDate[d] !== null; }).sort().forEach(function (d) { pc = byDate[d]; });\n'), ['DC-7']],
  ['DC-N4 chartPreviousClose fallback restored', rep('    if (typeof pc !== \'number\' || !isFinite(pc) || pc <= 0) return out;   // missing or not yet published: unknown\n',
    '    if (typeof pc !== \'number\' || !isFinite(pc) || pc <= 0) pc = parseFloat(meta.chartPreviousClose);\n    if (!isFinite(pc) || pc <= 0) return out;\n'), ['DC-7']],
  ['DC-N5 the current candle close used instead of the price', rep('    out.changePct = parseFloat(((price - pc) / pc * 100).toFixed(2));\n',
    '    var lastC = (Object.prototype.hasOwnProperty.call(byDate, sDate) && byDate[sDate]) ? byDate[sDate] : price;\n    out.changePct = parseFloat(((lastC - pc) / pc * 100).toFixed(2));\n'), ['DC-3']],
  ['DC-N6 calendar ignored', rep('    var inCal = cal ? _ts1IsTradingSession(sDate, cal) : null;\n', '    var inCal = null;\n'), ['DC-7', 'DC-8']],
  ['DC-N7 the first candle of a date wins', rep('      if (typeof c === \'number\' && isFinite(c) && c > 0) byDate[cd] = c;\n', '      if (typeof c === \'number\' && isFinite(c) && c > 0) { if (!byDate[cd]) byDate[cd] = c; }\n'), ['DC-9']],
  ['DC-N8 a price stamped on a non-trading day accepted', rep('    if (inCal === false) return out;                       // a price stamped on a non-trading day: unknown\n', ''), ['DC-8']],
  // ---- negatives of the Appendix deltas (W1-W5): mutations of the appendix code that the W rows must catch ----
  ['W-N1 duplicate candles resolved by time stamp, not array order', s => rep('    var byDate = {};\n', '    var byDate = {}, tsOf = {};\n')(rep('      if (typeof c === \'number\' && isFinite(c) && c > 0) byDate[cd] = c;\n',
    '      if (typeof c === \'number\' && isFinite(c) && c > 0) { if (!(cd in tsOf) || ts[i] >= tsOf[cd]) { byDate[cd] = c; tsOf[cd] = ts[i]; } }\n')(s)), ['W2']],
  ['W-N2 candles dated by the UTC date (price session stays local)', rep('      var cd = localDate(ts[i]);\n', '      var cd = new Date(ts[i] * 1000).toISOString().slice(0, 10);\n'), ['W1']],
  ['W-N3 US dates taken at a fixed UTC-5 (no DST, no zone rules)', rep('      var p = _ts1ExchangeLocalParts(d.toISOString(), tz);\n      return p ? p.dateStr : null;\n',
    '      var p = _ts1ExchangeLocalParts(d.toISOString(), tz);\n      return tz === \'America/New_York\' ? new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10) : (p ? p.dateStr : null);\n'), ['W4']],
  ['W-N4 calendar ignored: a non-session candle can be the previous close', rep('    var inCal = cal ? _ts1IsTradingSession(sDate, cal) : null;\n', '    var inCal = null;\n'), ['W4']],
  ['W-N5 fetchYahoo falls back to the range-start chartPreviousClose again', rep('  const change_percent = _sess.changePct;\n  const previous_close = _sess.prevClose;\n',
    '  let change_percent = _sess.changePct;\n  let previous_close = _sess.prevClose;\n  if (previous_close === null) { previous_close = parseFloat(meta.chartPreviousClose) || 0; if (previous_close > 0 && previous_close !== price) change_percent = parseFloat(((price - previous_close) / previous_close * 100).toFixed(2)); }\n'), ['W3', 'W4']],
  ['W-N6 fetchYahoo defaults an unknown change to +0 % again', rep('  const change_percent = _sess.changePct;\n  const previous_close = _sess.prevClose;\n',
    '  const change_percent = _sess.changePct === null ? 0 : _sess.changePct;\n  const previous_close = _sess.prevClose === null ? 0 : _sess.prevClose;\n'), ['W3', 'W4']],
  ['W-N7 candle basis presented as the calendar basis', rep("      basis = 'candles';\n", "      basis = 'calendar';\n"), ['W5']],
  ['W-N8 the warning drops the sessions', rep("'[market-data] daily change unknown for ' + symbol + ' (session ' + _sess.sessionDate +\n      ', previous session ' + _sess.prevSessionDate + ' close not available)'", "'[market-data] daily change unknown for ' + symbol"), ['W4']]
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
  console.log(fails ? 'MARKET DAILY CHANGE OFFLINE: FAIL (' + fails + ')' : 'MARKET DAILY CHANGE OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
