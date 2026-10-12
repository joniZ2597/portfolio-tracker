'use strict';

/*
 * market-status-pill-1 - market-status pill offline QA (work/market-status-pill-1/brief.md,
 * MP-1..MP-13 + planted negatives). Pure Node, no network, no browser.
 *
 * Extracts the REAL TS1_POLICY_V1, _ts1RuleFor / _ts1ExchangeLocalParts / _ts1IsTradingSession /
 * _ts1SessionCloseMinutes and _ptUsMarketPill from index.html (CRLF-normalised), plus the REAL
 * pill-computation segment of renderMainPanel (the lines between the "// Market status" comment
 * and the "// EG-18" comment), and evaluates them in a sandbox with an injected clock (the
 * sandbox shadows `Date` so the no-argument constructor returns a fixed instant). No
 * re-implementation of production logic.
 *
 * Planted negatives (MP-N1..N6) mutate the EXTRACTED PRODUCTION SOURCE and assert the matching
 * MP row then fails.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const IDX_CORE = require('./lib/index-pins-core.js');
const IDX_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'index-pins.json'), 'utf8'));

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

function extractFunctionSource(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
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
function extractVarObjectSource(content, name) {
  const sig = 'var ' + name;
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const semi = content.indexOf(';', i);
        return semi === -1 ? null : content.slice(start, semi + 1);
      }
    }
  }
  return null;
}
function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

const content = IDX_CORE.normalizeText(fs.readFileSync(INDEX_PATH, 'utf8'));

// ── extraction ───────────────────────────────────────────────────────────────
const CAL_FNS = ['_ts1RuleFor', '_ts1ExchangeLocalParts', '_ts1IsTradingSession', '_ts1SessionCloseMinutes'];
const src = { TS1_POLICY_V1: extractVarObjectSource(content, 'TS1_POLICY_V1') };
CAL_FNS.forEach(n => { src[n] = extractFunctionSource(content, n); });
src._ptUsMarketPill = extractFunctionSource(content, '_ptUsMarketPill'); // absent before S2

const SEG_START = '  // Market status';
const SEG_END = '  // EG-18: display-only pill qualification';
check('SETUP: segment anchors each appear exactly once',
  countOf(content, SEG_START) === 1 && countOf(content, SEG_END) === 1);
const segA = content.indexOf(SEG_START);
const segB = content.indexOf(SEG_END);
const SEGMENT = (segA !== -1 && segB > segA) ? content.slice(segA, segB) : '';
check('SETUP: real TS1_POLICY_V1 + 4 calendar helpers + pill segment extracted',
  !!src.TS1_POLICY_V1 && CAL_FNS.every(n => !!src[n]) && SEGMENT.length > 0);
if (!src.TS1_POLICY_V1 || !CAL_FNS.every(n => !!src[n]) || !SEGMENT) {
  console.log('market_pill_offline: ' + failures + ' failure(s)');
  process.exit(1);
}

// ── sandbox ──────────────────────────────────────────────────────────────────
// opts: { nowIso, ticker, ms, withHelper (default true), mutHelper(fn), mutSegment(fn) }
function runPill(opts) {
  const helper = (opts.withHelper !== false) ? src._ptUsMarketPill : null;
  let helperSrc = helper || '';
  if (opts.mutHelper && !helper) return { error: 'mutation target (helper) missing' };
  if (helper && opts.mutHelper) helperSrc = opts.mutHelper(helperSrc);
  let seg = SEGMENT;
  if (opts.mutSegment) seg = opts.mutSegment(seg);
  const body = src.TS1_POLICY_V1 + '\n' + CAL_FNS.map(n => src[n]).join('\n') + '\n' + helperSrc +
    '\n' + seg + '\nreturn { label: mktLabel, cls: mktCls };';
  const fixed = opts.nowIso;
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('Date', 'item', '_ms', '"use strict";\n' + body);
    return fn(FakeDate, { ticker: opts.ticker || 'AAPL' }, opts.ms === undefined ? null : opts.ms);
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}
function is(r, cls, label) { return !!r && !r.error && r.cls === cls && r.label === label; }
function isOpen4(r) { return is(r, 'open', 'Market open · closes 4:00 PM ET'); }
const UNAVAIL = 'Market status unavailable';

// ── MP-1: EDT 09:45 -> open (integer-hour compare bug) ───────────────────────
check('MP-1: 2026-10-30 13:45Z (EDT 09:45) -> open', isOpen4(runPill({ nowIso: '2026-10-30T13:45:00Z' })));

// ── MP-2: 09:29 EDT -> Pre-market / closed ───────────────────────────────────
(function () {
  const r = runPill({ nowIso: '2026-10-30T13:29:00Z' });
  check('MP-2: 2026-10-30 13:29Z class closed', !!r && !r.error && r.cls === 'closed');
  check('MP-2: 2026-10-30 13:29Z label Pre-market (D1)', is(r, 'closed', 'Pre-market'));
})();

// ── MP-3: 15:59 EDT open; 16:00 EDT After-hours ──────────────────────────────
(function () {
  check('MP-3: 2026-10-30 19:59Z -> open', isOpen4(runPill({ nowIso: '2026-10-30T19:59:00Z' })));
  const r = runPill({ nowIso: '2026-10-30T20:00:00Z' });
  check('MP-3: 2026-10-30 20:00Z class closed', !!r && !r.error && r.cls === 'closed');
  check('MP-3: 2026-10-30 20:00Z label After-hours (D1)', is(r, 'closed', 'After-hours'));
})();

// ── MP-4: EST 09:00 (post DST end) -> not open ───────────────────────────────
check('MP-4: 2026-11-02 14:00Z (EST 09:00) -> not open',
  (function () { const r = runPill({ nowIso: '2026-11-02T14:00:00Z' }); return !!r && !r.error && r.cls === 'closed'; })());

// ── MP-5: EST session edges ──────────────────────────────────────────────────
check('MP-5: 2026-11-02 14:30Z (EST 09:30) -> open', isOpen4(runPill({ nowIso: '2026-11-02T14:30:00Z' })));
check('MP-5: 2026-11-02 20:30Z (EST 15:30) -> open', isOpen4(runPill({ nowIso: '2026-11-02T20:30:00Z' })));
check('MP-5: 2026-11-02 21:00Z (EST 16:00) -> closed',
  (function () { const r = runPill({ nowIso: '2026-11-02T21:00:00Z' }); return !!r && !r.error && r.cls === 'closed'; })());

// ── MP-6: Thanksgiving ───────────────────────────────────────────────────────
check('MP-6: 2026-11-26 16:00Z (Thanksgiving) -> Market closed',
  is(runPill({ nowIso: '2026-11-26T16:00:00Z' }), 'closed', 'Market closed'));

// ── MP-7: shortened session ──────────────────────────────────────────────────
check('MP-7: 2026-11-27 17:59Z -> open, closes 1:00 PM ET',
  is(runPill({ nowIso: '2026-11-27T17:59:00Z' }), 'open', 'Market open · closes 1:00 PM ET'));
check('MP-7: 2026-11-27 18:00Z -> After-hours',
  is(runPill({ nowIso: '2026-11-27T18:00:00Z' }), 'closed', 'After-hours'));

// ── MP-8: weekend / outside coverage ─────────────────────────────────────────
check('MP-8: Saturday 2026-10-31 15:00Z -> Market closed',
  is(runPill({ nowIso: '2026-10-31T15:00:00Z' }), 'closed', 'Market closed'));
check('MP-8: 2028-01-03 15:00Z (outside coverage, D4) -> Market status unavailable',
  is(runPill({ nowIso: '2028-01-03T15:00:00Z' }), 'closed', UNAVAIL));

// ── MP-9: DST start edge 2027 ────────────────────────────────────────────────
check('MP-9: 2027-03-09 13:45Z (EST 08:45) -> not open',
  (function () { const r = runPill({ nowIso: '2027-03-09T13:45:00Z' }); return !!r && !r.error && r.cls === 'closed'; })());
check('MP-9: 2027-03-15 13:45Z (EDT 09:45) -> open', isOpen4(runPill({ nowIso: '2027-03-15T13:45:00Z' })));

// ── MP-10: .TA without marketState ───────────────────────────────────────────
check('MP-10: .TA ticker, no marketState, US-open instant -> Market status unavailable (D2)',
  is(runPill({ nowIso: '2026-10-30T15:00:00Z', ticker: 'TEVA.TA' }), 'closed', UNAVAIL));

// ── MP-11: Yahoo marketState precedence, labels byte-identical (I-1) ─────────
(function () {
  const exp = {
    REGULAR: ['open', 'Market open · closes 4:00 PM ET'],
    PRE: ['closed', 'Pre-market'],
    POST: ['closed', 'After-hours'],
    CLOSED: ['closed', 'Market closed']
  };
  ['2026-10-30T15:00:00Z', '2026-11-26T16:00:00Z', '2028-01-03T15:00:00Z'].forEach(iso => {
    Object.keys(exp).forEach(ms => {
      check('MP-11: marketState ' + ms + ' @ ' + iso + ' -> ' + exp[ms][1],
        is(runPill({ nowIso: iso, ms: ms }), exp[ms][0], exp[ms][1]));
    });
  });
  check('MP-11: marketState wins over .TA fallback',
    is(runPill({ nowIso: '2026-10-30T15:00:00Z', ticker: 'TEVA.TA', ms: 'REGULAR' }), 'open', 'Market open · closes 4:00 PM ET'));
})();

// ── MP-12: harness without the helper (D3) ───────────────────────────────────
check('MP-12: helper absent -> Market status unavailable, no throw',
  is(runPill({ nowIso: '2026-10-30T15:00:00Z', withHelper: false }), 'closed', UNAVAIL));

// ── MP-13: static / SETUP ────────────────────────────────────────────────────
(function () {
  check('MP-13: _ptUsMarketPill exists, exactly once, before renderMainPanel',
    countOf(content, 'function _ptUsMarketPill(') === 1 &&
    content.indexOf('function _ptUsMarketPill(') < content.indexOf('function renderMainPanel('));
  const code = src._ptUsMarketPill ? stripComments(src._ptUsMarketPill) : '';
  check('MP-13: helper is pure (no Date.now / new Date() / storage / DOM / network / random)',
    code.length > 0 &&
    !/Date\.now|new\s+Date\s*\(\s*\)|localStorage|sessionStorage|indexedDB|\bdocument\b|\bwindow\b|fetch\s*\(|XMLHttpRequest|Math\.random/.test(code));
  check('MP-13: _ts1* calendar helpers byte-identical (pin map)',
    IDX_CORE.entryMismatches(content, IDX_MAP, CAL_FNS.map(n => 'functions.' + n)).length === 0);
  const polHash = crypto.createHash('sha256').update(src.TS1_POLICY_V1).digest('hex');
  check('MP-13: TS1_POLICY_V1 byte-identical (pinned digest)',
    polHash === 'f0d5bdad837a7d3a332bf168909ffd87125fb679721e68704c0c87822555eef6');
  check('MP-13: fixed UTC-4 offset (getUTCHours() - 4) no longer present in index.html',
    countOf(content, 'getUTCHours() - 4') === 0);
  check('MP-13: renderMainPanel pill segment references the helper only behind typeof',
    countOf(SEGMENT, '_ptUsMarketPill') === 2 && /typeof _ptUsMarketPill === 'function'/.test(SEGMENT));
})();

// ── planted negatives: mutate PRODUCTION source, the matching row must fail ──
function mutate(s, from, to) {
  if (typeof s !== 'string' || s.indexOf(from) === -1) throw new Error('mutation anchor missing: ' + from);
  return s.replace(from, to);
}
function bites(name, fn) {
  let ok = false;
  try { ok = fn() === true; } catch (e) { ok = false; }
  check(name, ok);
}
bites('MP-N1: fixed -4 offset makes MP-4 fail', () => {
  const r = runPill({
    nowIso: '2026-11-02T14:00:00Z',
    mutHelper: h => mutate(h, 'var loc = _ts1ExchangeLocalParts(nowIso, cal.timeZone);',
      'var _u = new Date(nowIso); var loc = { dateStr: new Date(_u.getTime() - 4 * 3600000).toISOString().slice(0, 10), minutes: ((_u.getUTCHours() - 4 + 24) % 24) * 60 + _u.getUTCMinutes() };')
  });
  return !!r && !r.error && r.cls === 'open'; // wrongly open at EST 09:00 -> the MP-4 expectation (closed) fails
});
bites('MP-N2: integer-hour compare makes MP-1 fail', () => {
  const r = runPill({
    nowIso: '2026-10-30T13:45:00Z',
    mutHelper: h => mutate(h, 'm >= 570 && m < closeMin', 'Math.floor(m / 60) >= 9.5 && m < closeMin')
  });
  return !!r && !r.error && !isOpen4(r);
});
bites('MP-N3: holiday check dropped makes MP-6 fail', () => {
  const r = runPill({
    nowIso: '2026-11-26T16:00:00Z',
    mutHelper: h => mutate(h, 'if (isSession === false) return', 'if (false) return')
  });
  return !!r && !r.error && !is(r, 'closed', 'Market closed');
});
bites('MP-N4: shortened session ignored makes MP-7 fail', () => {
  const r = runPill({
    nowIso: '2026-11-27T18:00:00Z',
    mutHelper: h => mutate(h, '_ts1SessionCloseMinutes(loc.dateStr, cal)', '960')
  });
  return !!r && !r.error && !is(r, 'closed', 'After-hours');
});
bites('MP-N5: US hours applied to .TA makes MP-10 fail', () => {
  const r = runPill({
    nowIso: '2026-10-30T15:00:00Z', ticker: 'TEVA.TA',
    mutSegment: s => mutate(s, "/\\.TA$/i.test(item.ticker || '')", "false && /\\.TA$/i.test(item.ticker || '')")
  });
  return !is(r, 'closed', UNAVAIL);
});
bites('MP-N6: unguarded helper reference makes MP-12 fail', () => {
  const r = runPill({
    nowIso: '2026-10-30T15:00:00Z', withHelper: false,
    mutSegment: s => mutate(s, "typeof _ptUsMarketPill === 'function' ? ", 'true ? ')
  });
  return !is(r, 'closed', UNAVAIL);
});

if (failures > 0) {
  console.log('market_pill_offline: ' + failures + ' failure(s) of ' + asserts + ' assertion(s)');
  process.exit(1);
}
console.log('market_pill_offline: PASS (' + asserts + ' assertions)');
