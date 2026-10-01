'use strict';

/*
 * Entry 11 — Selected only watchlist view offline QA.
 *
 * Pure Node, static assertions over index.html. Every checker is a function of
 * (content) and is run against the real file and against a planted-negative
 * fixture that must FAIL, so the checker is shown to fire.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

function extractFunctionSource(content, name) {
  const start = content.indexOf('function ' + name + '(');
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

const content = fs.readFileSync(INDEX_PATH, 'utf8');

// ── SO-1 toggle markup present, directly inside .sb-scan-section, between ──
// #scanNote and the key-warn comment that immediately follows it in source.
function count(hay, needle) {
  return hay.split(needle).length - 1;
}
function so1(c) {
  const sectionAt = c.indexOf('class="sb-scan-section"');
  const noteAt = c.indexOf('id="scanNote"');
  const toggleAt = c.indexOf('id="selectedOnlyToggle"');
  // anchor: the HTML comment right after the toggle (CSS has an earlier, unrelated
  // comment with the same words, so search strictly after the toggle itself)
  const keyWarnAt = toggleAt === -1 ? -1 : c.indexOf('Missing key warning', toggleAt);
  const staleAt = c.indexOf('id="stale-banner"'); // first markup after .sb-scan-section closes
  const found = sectionAt !== -1 && noteAt !== -1 && toggleAt !== -1 && keyWarnAt !== -1 && staleAt !== -1 &&
    sectionAt < noteAt && noteAt < toggleAt && toggleAt < keyWarnAt && keyWarnAt < staleAt;
  if (!found) return false;
  // Every anchor must be unique, or a duplicate elsewhere could satisfy the
  // ordering check without the real control actually being in position.
  return count(c, 'class="sb-scan-section"') === 1 &&
    count(c, 'id="scanNote"') === 1 &&
    count(c, 'id="selectedOnlyToggle"') === 1 &&
    count(c, 'id="stale-banner"') === 1;
}
check('SO-1 Selected only toggle exists in .sb-scan-section, directly after #scanNote', so1(content));
check('SO-1 control: fixture without the toggle fails',
  !so1('<div class="sb-scan-section"><div id="scanNote"></div><!-- Missing key warning --></div><div id="stale-banner"></div>'));
check('SO-1 control: fixture with the toggle moved outside the section fails',
  !so1('<div class="sb-scan-section"><div id="scanNote"></div><!-- Missing key warning --></div><div id="stale-banner"></div><div id="selectedOnlyToggle"></div>'));
check('SO-1 control: fixture with a duplicated #scanNote anchor fails',
  !so1('<div class="sb-scan-section"><div id="scanNote"></div><div id="selectedOnlyToggle"></div><!-- Missing key warning --></div><div id="stale-banner"></div><div id="scanNote"></div>'));

// ── SO-2 session-only state, never persisted ────────────────────────────────
// Extracts each localStorage.{setItem,getItem,removeItem}(...) call's FULL
// argument list via balanced-paren matching (no fixed-width window, so an
// arbitrarily long argument expression is still fully covered).
function callArgs(c, startAt) {
  const openAt = c.indexOf('(', startAt);
  if (openAt === -1) return null;
  let depth = 0;
  for (let i = openAt; i < c.length; i += 1) {
    if (c[i] === '(') depth += 1;
    else if (c[i] === ')') {
      depth -= 1;
      if (depth === 0) return c.slice(openAt + 1, i);
    }
  }
  return null;
}
function so2(c) {
  const hasState = c.includes('_selectedOnly') && c.includes('_selectedOnlyPinned');
  let persisted = false;
  const callRe = /localStorage\.(setItem|getItem|removeItem)/g;
  let m;
  while ((m = callRe.exec(c))) {
    const args = callArgs(c, m.index + m[0].length);
    if (args && args.toLowerCase().includes('selectedonly')) { persisted = true; break; }
  }
  return hasState && !persisted;
}
check('SO-2 _selectedOnly/_selectedOnlyPinned declared and never persisted', so2(content));
check('SO-2 control: fixture persisting the toggle fails',
  !so2("let _selectedOnly=false; let _selectedOnlyPinned=null; localStorage.setItem('_selectedOnly', _selectedOnly);"));
check('SO-2 control: fixture persisting under a different key-argument order fails',
  !so2("let _selectedOnly=false; let _selectedOnlyPinned=null; localStorage.setItem(_selectedOnly ? 'on':'off', 'selectedOnlyFlag');"));
check('SO-2 control: fixture persisting via a very long argument expression (beyond any fixed window) fails',
  !so2("let _selectedOnly=false; localStorage.setItem('k', [" + Array(40).fill("'padding-value-to-exceed-a-small-fixed-window'").join(', ') + ", 'selectedOnlyFlag'].join(','));"));

// ── SO-3 / SO-4 — selected-only filter is a second, separate statement ─────
// (never chained onto the frozen 5-field search `.filter(e => ...)` call)
const PREDICATE_FNS = ['updateScanColToggle', 'toggleAllVisibleScanInclusion', 'renderWatchlistRows'];
const FIELD_TO_WORD = { symbol: 'ticker', name: 'company', exchange: 'exchange', sector: 'sector', sectorEtf: 'benchmark' };
const EXPECTED_FIELDS = Object.keys(FIELD_TO_WORD).sort();

// Mirrors qa/ui_hygiene_offline.js's own UH-3 extraction exactly, so this suite
// re-proves (independently) that the search-filter field set is unaffected.
function searchFilterBody(fnSrc) {
  if (!fnSrc) return null;
  const at = fnSrc.indexOf('.filter(e =>');
  if (at === -1) return null;
  const end = fnSrc.indexOf(');', at);
  if (end === -1) return null;
  return fnSrc.slice(at, end);
}
function predicateFields(body) {
  if (!body) return null;
  const fields = [];
  const re = /\be\.([A-Za-z]+)/g;
  let m;
  while ((m = re.exec(body))) if (!fields.includes(m[1])) fields.push(m[1]);
  return fields.sort();
}
const sameSet = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

function so3(c) {
  return PREDICATE_FNS.every(fn => {
    const body = searchFilterBody(extractFunctionSource(c, fn));
    if (!body) return false;
    // A chained `.filter(e => A).filter(e => B)` pulls both calls into this
    // body (the first `);` then lands at the end of the *second* filter).
    // A correct, separate-statement implementation leaves exactly one.
    const occurrences = body.split('.filter(e =>').length - 1;
    return occurrences === 1;
  });
}
check('SO-3 selected-only filter is never chained onto the search filter', so3(content));
check('SO-3 control: a chained fixture fails', !so3(
  'function renderWatchlistRows(x) { let rows = watchlist.filter(e => e.symbol.includes(q) || e.name || e.exchange || e.sector || e.sectorEtf).filter(e => _selectedOnlyPinned.has(e.symbol)); }'
));

function so4(c) {
  return PREDICATE_FNS.every(fn => sameSet(predicateFields(searchFilterBody(extractFunctionSource(c, fn))), EXPECTED_FIELDS));
}
check('SO-4 the frozen 5-field search predicate is unaffected in all three functions', so4(content));
check('SO-4 control: a fixture where the filter is chained (breaking extraction) fails', !so4(
  'function renderWatchlistRows(x) { let rows = watchlist.filter(e => e.symbol.includes(q) || e.name || e.exchange || e.sector || e.sectorEtf).filter(e => _selectedOnlyPinned.has(e.symbol)); }'
));

// ── SO-5 empty-state copy, directly gated on _selectedOnly (ternary form) ──
function so5(c) {
  const fnSrc = extractFunctionSource(c, 'renderWatchlistRows');
  if (!fnSrc) return false;
  // Must be the literal `_selectedOnly ? '<copy>'` ternary condition —
  // not merely co-located with an unrelated `_selectedOnly` reference.
  const re = /_selectedOnly\s*\?\s*\r?\n?\s*'<div class="wl-empty">No tickers selected for the next scan\.<\/div>'/;
  return re.test(fnSrc);
}
check('SO-5 empty-state copy exact and directly gated by the _selectedOnly ternary', so5(content));
check('SO-5 control: fixture missing the copy fails',
  !so5('function renderWatchlistRows(x) { if (_selectedOnly) { return "nothing"; } }'));
check('SO-5 control: fixture where _selectedOnly is merely nearby (not the gating condition) fails',
  !so5('function renderWatchlistRows(x) { if (_selectedOnly) { /* noop */ } return watchlist.length === 0 ? "a" : "\'<div class=\\"wl-empty\\">No tickers selected for the next scan.</div>\'"; }'));

// ── SO-6 toggleSelectedOnly refreshes render + counts ───────────────────────
function so6(c) {
  const fnSrc = extractFunctionSource(c, 'toggleSelectedOnly');
  return !!fnSrc && fnSrc.includes('renderWatchlistRows()') && fnSrc.includes('updateRunScanCount()');
}
check('SO-6 toggleSelectedOnly() calls renderWatchlistRows() and updateRunScanCount()', so6(content));
check('SO-6 control: fixture missing updateRunScanCount() fails',
  !so6('function toggleSelectedOnly() { _selectedOnly = !_selectedOnly; renderWatchlistRows(); }'));

// ── SO-7 filterWatchlistRows re-pins only on an actual query change ────────
// Proves the pin assignment is syntactically INSIDE an `if (_selectedOnly) { ... }`
// block (via brace-depth matching, not just nearby text) that itself appears
// after the "query actually changed" early-return guard.
function blockExtent(src, ifOpenAt) {
  const braceStart = src.indexOf('{', ifOpenAt);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return [braceStart, i];
    }
  }
  return null;
}
function so7(c) {
  const fnSrc = extractFunctionSource(c, 'filterWatchlistRows');
  if (!fnSrc) return false;
  const guardAt = fnSrc.indexOf('if (normalised === _filterQuery) return');
  const ifSelectedOnlyAt = fnSrc.indexOf('if (_selectedOnly)');
  const pinAt = fnSrc.indexOf('_selectedOnlyPinned =');
  if (guardAt === -1 || ifSelectedOnlyAt === -1 || pinAt === -1) return false;
  if (ifSelectedOnlyAt < guardAt) return false; // must come after the "actually changed" guard
  const extent = blockExtent(fnSrc, ifSelectedOnlyAt);
  return !!extent && pinAt > extent[0] && pinAt < extent[1];
}
check('SO-7 pin refresh is syntactically inside an if(_selectedOnly) block, after the query-changed guard', so7(content));
check('SO-7 control: fixture re-pinning unconditionally on every call fails',
  !so7('function filterWatchlistRows(query) { _selectedOnlyPinned = new Set(); if (normalised === _filterQuery) return; }'));
check('SO-7 control: fixture where the if(_selectedOnly) block does not contain the assignment fails',
  !so7('function filterWatchlistRows(query) { if (normalised === _filterQuery) return; if (_selectedOnly) { renderWatchlistRows(); } _selectedOnlyPinned = new Set(); }'));

if (failures > 0) {
  console.log(failures + ' failure(s) in qa/selected_only_watchlist_offline.js');
  process.exit(1);
} else {
  console.log('PASS  qa/selected_only_watchlist_offline.js (SO-1..SO-7)');
}
