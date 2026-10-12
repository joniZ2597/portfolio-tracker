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

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain
// script (matching services/research-evidence-client.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCandles: normalizeCandles,
    assessSufficiency: assessSufficiency
  };
}
