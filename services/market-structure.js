'use strict';

/**
 * services/market-structure.js
 *
 * Pure market-structure engine (market-structure-1). Given daily candles and an explicit asOf
 * date it describes, from past observations only:
 *   - data sufficiency per horizon (1y / 3y);
 *   - ATR14 and the volatility regime;
 *   - confirmed swings and the nearest support / resistance levels;
 *   - the historical move / correction profile, with a minimum-sample gate.
 *
 * Not wired into the app. No network, no DOM, no storage, no clock, no randomness: every input is
 * an argument and every date is handled as a YYYY-MM-DD string with integer day arithmetic.
 * Output is descriptive and historical (basis HISTORICAL_DESCRIPTIVE); it never presents a past
 * observation as an expected outcome.
 *
 * Ruled values (MS-1..MS-6) are the named constants below; changing one is an Owner ruling.
 */

var SCHEMA = 'market-structure/v1';
var BASIS = 'HISTORICAL_DESCRIPTIVE';

// MS-3 horizons.
var WINDOW_1Y = 252;
var MIN_1Y = 240;
var WINDOW_3Y = 756;
var MIN_3Y = 720;
var GAP_MAX_DAYS = 7;

// ---------- dates (pure integer arithmetic) ----------

var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(y, m) {
  if (m === 2) return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
  return (m === 4 || m === 6 || m === 9 || m === 11) ? 30 : 31;
}

// Day number for a valid YYYY-MM-DD string, or null when the string is not a real calendar day.
function dayNumber(s) {
  if (typeof s !== 'string') return null;
  var m = DATE_RE.exec(s);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  // days-from-civil (proleptic Gregorian)
  var yy = mo <= 2 ? y - 1 : y;
  var era = Math.floor(yy / 400);
  var yoe = yy - era * 400;
  var doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function assertAsOf(asOf) {
  if (dayNumber(asOf) === null) throw new TypeError('asOf must be a real YYYY-MM-DD date');
}

// ---------- S1: input + sufficiency ----------

function isPositiveFinite(v) {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

// Normalise: drop invalid rows, drop rows dated after asOf, drop exact duplicate dates (keep the
// last input row), sort ascending. Each dropped row is counted once, in the order
// invalid -> future -> duplicate.
function normalizeCandles(candles, asOf) {
  assertAsOf(asOf);
  var dropped = { invalid: 0, duplicate: 0, future: 0 };
  var byDate = {};
  var dates = [];
  if (!Array.isArray(candles)) return { candles: [], dropped: dropped };
  for (var i = 0; i < candles.length; i++) {
    var row = candles[i];
    if (!row || typeof row !== 'object' || dayNumber(row.date) === null ||
        !isPositiveFinite(row.open) || !isPositiveFinite(row.high) ||
        !isPositiveFinite(row.low) || !isPositiveFinite(row.close) || row.high < row.low) {
      dropped.invalid += 1;
      continue;
    }
    if (row.date > asOf) {
      dropped.future += 1;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(byDate, row.date)) {
      dropped.duplicate += 1;
    } else {
      dates.push(row.date);
    }
    byDate[row.date] = row;
  }
  dates.sort();
  var out = [];
  for (var j = 0; j < dates.length; j++) {
    var r = byDate[dates[j]];
    out.push({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
  }
  return { candles: out, dropped: dropped };
}

// Status of one horizon over the last `window` sessions: INSUFFICIENT below `min`, GAPPED when any
// two consecutive sessions in the window are more than GAP_MAX_DAYS calendar days apart.
function horizonStatus(sessions, window, min) {
  var n = sessions.length;
  var count = n < window ? n : window;
  if (n < min) return { status: 'INSUFFICIENT', sessions: count };
  var win = sessions.slice(n - count);
  for (var i = 1; i < win.length; i++) {
    if (dayNumber(win[i].date) - dayNumber(win[i - 1].date) > GAP_MAX_DAYS) {
      return { status: 'GAPPED', sessions: count };
    }
  }
  return { status: 'OK', sessions: count };
}

function assessSufficiency(candles, asOf) {
  var sessions = normalizeCandles(candles, asOf).candles;
  var h1 = horizonStatus(sessions, WINDOW_1Y, MIN_1Y);
  var h3 = horizonStatus(sessions, WINDOW_3Y, MIN_3Y);
  return { h1y: h1.status, h3y: h3.status, sessions1y: h1.sessions, sessions3y: h3.sessions };
}

// ---------- S2: volatility, swings, levels ----------

// DEF: ATR14 semantics of _ts1Atr14 (index.html): simple mean of the last 14 true ranges, null below 15 candles.
var ATR_PERIOD = 14;
// MS-5 volatility regime.
var REGIME_WINDOW = 252;
var REGIME_MIN_VALUES = 120;
// MS-1 ZigZag threshold multiple of ATR14.
var ZIGZAG_K = 2.0;
// MS-6 level clustering width (multiple of ATR14) and cap per side.
var LEVEL_CLUSTER_ATR = 0.5;
var LEVELS_PER_SIDE = 3;

function asArray(candles) {
  return Array.isArray(candles) ? candles : [];
}

function trueRange(c, prev) {
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
}

// ATR14 evaluated at every bar (null before the 15th candle). Summation order matches the oracle.
function atrSeries(candles) {
  var cs = asArray(candles);
  var out = [];
  for (var i = 0; i < cs.length; i++) {
    if (i < ATR_PERIOD) {
      out.push(null);
      continue;
    }
    var s = 0;
    for (var j = i - ATR_PERIOD + 1; j <= i; j++) s += trueRange(cs[j], cs[j - 1]);
    out.push(s / ATR_PERIOD);
  }
  return out;
}

function atr14(candles) {
  var series = atrSeries(candles);
  return series.length === 0 ? null : series[series.length - 1];
}

// Linear interpolation, Hyndman-Fan type 7. sortedAsc ascending; p in [0, 1]. Null when empty.
function percentile(sortedAsc, p) {
  var n = sortedAsc.length;
  if (n === 0) return null;
  var h = (n - 1) * p;
  var lo = Math.floor(h);
  var hi = lo + 1 < n ? lo + 1 : n - 1;
  return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function numericAsc(a, b) { return a - b; }

// MS-5: the latest ATR% against its own trailing distribution (last 252 values, itself included).
function classifyRegime(atrPctValues) {
  var vals = asArray(atrPctValues);
  if (vals.length < REGIME_MIN_VALUES) return { regime: 'UNKNOWN', p33: null, p67: null };
  var win = vals.slice(vals.length > REGIME_WINDOW ? vals.length - REGIME_WINDOW : 0);
  var value = win[win.length - 1];
  var sorted = win.slice().sort(numericAsc);
  var p33 = percentile(sorted, 0.33);
  var p67 = percentile(sorted, 0.67);
  var regime = 'NORMAL';
  if (value < p33) regime = 'LOW';
  else if (value > p67) regime = 'HIGH';
  return { regime: regime, p33: p33, p67: p67 };
}

function volatilityRegime(candles) {
  var cs = asArray(candles);
  var series = atrSeries(cs);
  var last = series.length === 0 ? null : series[series.length - 1];
  if (last === null) return { atr14: null, atrPct: null, regime: 'UNKNOWN' };
  var pcts = [];
  for (var i = 0; i < series.length; i++) {
    if (series[i] !== null) pcts.push((series[i] * 100) / cs[i].close);
  }
  return { atr14: last, atrPct: pcts[pcts.length - 1], regime: classifyRegime(pcts).regime };
}

function argMinLow(candles, from, to) {
  var idx = from;
  for (var i = from + 1; i <= to; i++) if (candles[i].low < candles[idx].low) idx = i;
  return idx;
}

function argMaxHigh(candles, from, to) {
  var idx = from;
  for (var i = from + 1; i <= to; i++) if (candles[i].high > candles[idx].high) idx = i;
  return idx;
}

// A reversal confirms when the move against the running extreme is at least k x ATR14 measured at
// the extreme bar. A bar without an ATR can never confirm.
function swingConfirmed(atrValue, move, k) {
  return atrValue !== null && move >= k * atrValue;
}

// MS-1 ZigZag on highs / lows. dir 0: no pivot yet (both extremes tracked); dir 1: last pivot is a
// LOW (tracking the running high); dir -1: last pivot is a HIGH (tracking the running low). The
// extreme bar must precede the confirming bar; ties keep the earliest extreme. Pivots carry the
// candle index (i) for internal use.
function zigzagCore(candles, k) {
  var cs = asArray(candles);
  var atr = atrSeries(cs);
  var pivots = [];
  var dir = 0, hiI = 0, loI = 0;
  for (var t = 1; t < cs.length; t++) {
    if (dir >= 0 && cs[t].high > cs[hiI].high) hiI = t;
    if (dir <= 0 && cs[t].low < cs[loI].low) loI = t;
    var turnDown = dir >= 0 && hiI < t && swingConfirmed(atr[hiI], cs[hiI].high - cs[t].low, k);
    var turnUp = dir <= 0 && loI < t && swingConfirmed(atr[loI], cs[t].high - cs[loI].low, k);
    if (turnDown && turnUp) {
      if (hiI <= loI) turnUp = false;
      else turnDown = false;
    }
    if (turnDown) {
      pivots.push({ i: hiI, date: cs[hiI].date, type: 'HIGH', price: cs[hiI].high });
      dir = -1; loI = argMinLow(cs, hiI + 1, t);
    } else if (turnUp) {
      pivots.push({ i: loI, date: cs[loI].date, type: 'LOW', price: cs[loI].low });
      dir = 1; hiI = argMaxHigh(cs, loI + 1, t);
    }
  }
  var open = null;
  if (dir === 1) open = { i: hiI, date: cs[hiI].date, type: 'HIGH', price: cs[hiI].high };
  else if (dir === -1) open = { i: loI, date: cs[loI].date, type: 'LOW', price: cs[loI].low };
  return { k: k, pivots: pivots, open: open };
}

function publicPivot(p) {
  return { date: p.date, type: p.type, price: p.price };
}

// Confirmed pivots plus the open (unconfirmed) running extreme, which is reported separately.
function zigzagSwings(candles, k) {
  var core = zigzagCore(candles, k === undefined ? ZIGZAG_K : k);
  return { k: core.k, pivots: core.pivots.map(publicPivot), open: core.open === null ? null : publicPivot(core.open) };
}

// MS-6: pivots inside the last 252 sessions, pooled (HIGH and LOW), clustered within
// LEVEL_CLUSTER_ATR x ATR14 of the cluster's lowest price; each level is the cluster mean with its
// touch count and last-touch date. Support is at or below the last close, resistance above it;
// nearest first, LEVELS_PER_SIDE per side.
function levels(candles, pivots) {
  var cs = asArray(candles);
  var empty = { support: [], resistance: [] };
  var atr = atr14(cs);
  if (atr === null || !Array.isArray(pivots)) return empty;
  var windowStart = cs[cs.length > WINDOW_1Y ? cs.length - WINDOW_1Y : 0].date;
  var inWindow = pivots.filter(function (p) { return p.date >= windowStart; })
    .sort(function (a, b) { return a.price - b.price || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
  if (inWindow.length === 0) return empty;
  var width = LEVEL_CLUSTER_ATR * atr;
  var clusters = [];
  var cur = null;
  for (var i = 0; i < inWindow.length; i++) {
    var p = inWindow[i];
    if (cur !== null && p.price - cur.anchor <= width) {
      cur.sum += p.price; cur.touches += 1;
      if (p.date > cur.lastTouch) cur.lastTouch = p.date;
    } else {
      cur = { anchor: p.price, sum: p.price, touches: 1, lastTouch: p.date };
      clusters.push(cur);
    }
  }
  var close = cs[cs.length - 1].close;
  var all = clusters.map(function (c) { return { price: c.sum / c.touches, touches: c.touches, lastTouch: c.lastTouch }; });
  var support = all.filter(function (l) { return l.price <= close; })
    .sort(function (a, b) { return (close - a.price) - (close - b.price); });
  var resistance = all.filter(function (l) { return l.price > close; })
    .sort(function (a, b) { return (a.price - close) - (b.price - close); });
  return { support: support.slice(0, LEVELS_PER_SIDE), resistance: resistance.slice(0, LEVELS_PER_SIDE) };
}

// ---------- S3: move profile, current leg, public entry ----------

// MS-2 minimum comparable moves per type and horizon.
var MIN_SAMPLE = 8;
var QUANTILES = [['p25', 0.25], ['p50', 0.5], ['p75', 0.75], ['p90', 0.9]];

// MS-4 rounding: 0.1 for percentages, symmetric about zero (-0 is normalised to 0).
function roundTenth(x) {
  var m = Math.round(Math.abs(x) * 10) / 10;
  return (x < 0 ? -m : m) + 0;
}

function roundSessions(x) {
  return Math.round(x);
}

function quantiles(sortedAsc, scale, roundFn) {
  var out = {};
  for (var i = 0; i < QUANTILES.length; i++) {
    out[QUANTILES[i][0]] = roundFn(scale * percentile(sortedAsc, QUANTILES[i][1]));
  }
  return out;
}

// Legs from consecutive confirmed pivots: LOW -> HIGH is an UP leg, HIGH -> LOW a DOWN leg. pct is
// (end / start - 1) x 100 (negative for DOWN); sessions is the candle-index distance.
function buildLegs(candles, pivots) {
  var cs = asArray(candles);
  var pos = {};
  for (var i = 0; i < cs.length; i++) pos[cs[i].date] = i;
  var ps = asArray(pivots);
  var legs = [];
  for (var j = 1; j < ps.length; j++) {
    var a = ps[j - 1], b = ps[j];
    if (a.type === b.type || pos[a.date] === undefined || pos[b.date] === undefined) continue;
    legs.push({
      direction: a.type === 'LOW' ? 'UP' : 'DOWN',
      pct: (b.price / a.price - 1) * 100,
      sessions: pos[b.date] - pos[a.date]
    });
  }
  return legs;
}

function legsOf(legs, direction) {
  return asArray(legs).filter(function (l) { return l.direction === direction; });
}

// One direction's profile. DOWN percentiles are taken over drawdown magnitude and reported with a
// negative sign, so p90 is the most severe correction.
function profileLeaf(dirLegs, scale) {
  if (dirLegs.length < MIN_SAMPLE) return { status: 'INSUFFICIENT_SAMPLE', n: dirLegs.length, pct: null, sessions: null };
  var mags = dirLegs.map(function (l) { return Math.abs(l.pct); }).sort(numericAsc);
  var durs = dirLegs.map(function (l) { return l.sessions; }).sort(numericAsc);
  return { status: 'OK', n: dirLegs.length, pct: quantiles(mags, scale, roundTenth), sessions: quantiles(durs, 1, roundSessions) };
}

function moveProfile(legs) {
  return { up: profileLeaf(legsOf(legs, 'UP'), 1), down: profileLeaf(legsOf(legs, 'DOWN'), -1) };
}

function insufficientHorizon() {
  var leaf = { status: 'INSUFFICIENT', n: null, pct: null, sessions: null };
  return { up: leaf, down: { status: 'INSUFFICIENT', n: null, pct: null, sessions: null } };
}

// The open leg runs from the last confirmed pivot to the running (unconfirmed) extreme. Its rank is
// the share of matching historical 1y legs of equal or smaller magnitude; context compares the
// reported magnitude with the reported P75 / P90. legs1y is null when the 1y horizon is insufficient.
function currentLeg(candles, swings, legs1y) {
  var none = { direction: 'NONE', pct: null, sessions: null, rank1y: null, context: 'UNKNOWN' };
  var cs = asArray(candles);
  if (!swings || !swings.open || !Array.isArray(swings.pivots) || swings.pivots.length === 0) return none;
  var last = swings.pivots[swings.pivots.length - 1];
  var open = swings.open;
  var pos = {};
  for (var i = 0; i < cs.length; i++) pos[cs[i].date] = i;
  if (pos[open.date] === undefined || pos[last.date] === undefined) return none;
  var direction = open.type === 'HIGH' ? 'UP' : 'DOWN';
  var rawPct = (open.price / last.price - 1) * 100;
  var out = { direction: direction, pct: roundTenth(rawPct), sessions: pos[open.date] - pos[last.date], rank1y: null, context: 'UNKNOWN' };
  if (legs1y === null || legs1y === undefined) return out;
  var matching = legsOf(legs1y, direction);
  if (matching.length < MIN_SAMPLE) return out;
  var mags = matching.map(function (l) { return Math.abs(l.pct); }).sort(numericAsc);
  var current = Math.abs(rawPct);
  var atOrBelow = 0;
  for (var k = 0; k < mags.length; k++) if (mags[k] <= current) atOrBelow += 1;
  out.rank1y = roundTenth((100 * atOrBelow) / mags.length);
  var shown = Math.abs(out.pct);
  var p75 = roundTenth(percentile(mags, 0.75));
  var p90 = roundTenth(percentile(mags, 0.9));
  if (shown <= p75) out.context = 'WITHIN_TYPICAL';
  else if (shown <= p90) out.context = 'EXTENDED';
  else out.context = 'BEYOND_P90';
  return out;
}

// Legs inside the last `window` sessions (both pivots dated within it), or null when that horizon
// has too few sessions.
function horizonLegs(cs, pivots, status, window) {
  if (status === 'INSUFFICIENT') return null;
  var start = cs[cs.length > window ? cs.length - window : 0].date;
  return buildLegs(cs, pivots.filter(function (p) { return p.date >= start; }));
}

function analyzeMarketStructure(candles, options) {
  var asOf = options && options.asOf;
  assertAsOf(asOf);
  var norm = normalizeCandles(candles, asOf);
  var cs = norm.candles;
  var suff = assessSufficiency(cs, asOf);
  var swings = zigzagSwings(cs);
  var legs1y = horizonLegs(cs, swings.pivots, suff.h1y, WINDOW_1Y);
  var legs3y = horizonLegs(cs, swings.pivots, suff.h3y, WINDOW_3Y);
  return {
    schema: SCHEMA,
    basis: BASIS,
    asOf: asOf,
    input: {
      sessions: cs.length,
      firstDate: cs.length ? cs[0].date : null,
      lastDate: cs.length ? cs[cs.length - 1].date : null,
      dropped: norm.dropped
    },
    sufficiency: suff,
    volatility: volatilityRegime(cs),
    swings: { k: swings.k, pivots: swings.pivots },
    levels: suff.h1y === 'INSUFFICIENT' ? { support: [], resistance: [] } : levels(cs, swings.pivots),
    profile: {
      h1y: legs1y === null ? insufficientHorizon() : moveProfile(legs1y),
      h3y: legs3y === null ? insufficientHorizon() : moveProfile(legs3y)
    },
    current: currentLeg(cs, swings, legs1y)
  };
}

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain
// script (matching services/research-evidence-client.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCandles: normalizeCandles,
    assessSufficiency: assessSufficiency,
    atrSeries: atrSeries,
    atr14: atr14,
    percentile: percentile,
    classifyRegime: classifyRegime,
    volatilityRegime: volatilityRegime,
    zigzagSwings: zigzagSwings,
    levels: levels,
    buildLegs: buildLegs,
    moveProfile: moveProfile,
    currentLeg: currentLeg,
    analyzeMarketStructure: analyzeMarketStructure
  };
}
