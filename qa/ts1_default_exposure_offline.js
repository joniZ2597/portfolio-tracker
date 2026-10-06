'use strict';

/*
 * Entry 22a - Technical Score v1 exposed by default (work/tech-score-default).
 *
 * Pure Node, no network, no browser. Reads the REAL index.html (CRLF-normalised) and proves:
 *   TX-1  init() carries exactly one `window.PT_ENABLE_TECH_SCORE = true;` (the exact D1 block), after the
 *         PT_ENABLE_PORTFOLIO_RESEARCH block and before init()'s loadWatchlist();
 *   TX-2  no other live assignment to the gate anywhere in the file; no storage access with a tech-score key;
 *   TX-3  runTechScoreV1 / _ts1FillRow / _ts1RowText / renderMainPanel are byte-equal to the pre-D1 base
 *         (sha256 of the CRLF-normalised sources) and both strict `!== true` checks are still first;
 *   TX-4  the real D1 statement, run on a fixture window, makes the real _ts1RowHtml expression yield the row;
 *         `= false` and the string 'true' yield '';
 *   TX-5  no default exists for any other PT_ENABLE_* gate (only PORTFOLIO_RESEARCH, pre-existing, and TECH_SCORE).
 * Every row carries planted negatives: each mutates an in-memory COPY of index.html and the SAME checker
 * function must reject it. "Live" scanning skips comments and string literals (the D1 comment and several
 * console.warn strings legitimately contain `= true` / `= false` text).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const real = fs.readFileSync(INDEX_PATH, 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) { failures += 1; console.log('  FAIL  ' + name); }
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

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

// A match is "live" when it is not inside a // or /* comment line prefix and not inside a quoted string.
function isLive(src, idx) {
  const ls = src.lastIndexOf('\n', idx - 1) + 1;
  const pre = src.slice(ls, idx);
  let q = null;
  for (let i = 0; i < pre.length; i += 1) {
    const c = pre[i];
    if (q) { if (c === '\\') { i += 1; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && pre[i + 1] === '/') return false;
    if (c === '/' && pre[i + 1] === '*') {
      const close = pre.indexOf('*/', i + 2);
      if (close === -1) return false; // unclosed block comment: the match sits inside it
      i = close + 1; // closed inline block comment: code after it is live
    }
  }
  if (q) return false;
  if (/^\s*\*/.test(pre)) return false;
  return true;
}
function liveMatches(src, re) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) { if (isLive(src, m.index)) out.push(m); }
  return out;
}
function liveGateAssignments(src) {
  return liveMatches(src, /\bwindow\s*\.\s*(PT_ENABLE_[A-Z0-9_]+)\s*=(?!=)/g)
    .concat(liveMatches(src, /(?:^|[^\w.])(PT_ENABLE_[A-Z0-9_]+)\s*=(?!=)/g))
    .concat(liveMatches(src, /\bwindow\s*\[\s*(['"`])(PT_ENABLE_[A-Z0-9_]+)\1\s*\]\s*=(?!=)/g)
      .map(function (m) { return [m[0], m[2]]; }));
}

const D1_BLOCK = [
  '  } catch (_) {',
  '    window.PT_ENABLE_PORTFOLIO_RESEARCH = false;',
  '  }',
  '  // Entry 22a (Owner ruling 2026-10-03): Technical Score v1 is exposed by default.',
  '  // Re-applied on every load; every gate check stays strict (=== true). Nothing is',
  '  // persisted. Session kill switch: window.PT_ENABLE_TECH_SCORE = false (console).',
  '  window.PT_ENABLE_TECH_SCORE = true;'
].join('\n');
const D1_STMT = 'window.PT_ENABLE_TECH_SCORE = true;';

// -- TX-1 --------------------------------------------------------------------
function checkTx1(src) {
  const r = { ok: false, reason: null };
  if (src.split('function init(').length - 1 !== 1) { r.reason = 'init() not unique'; return r; }
  const init = extractFunctionSource(src, 'init');
  if (!init) { r.reason = 'init() not extractable'; return r; }
  const live = liveMatches(init, /window\.PT_ENABLE_TECH_SCORE = true;/g);
  if (live.length !== 1) { r.reason = 'live D1 statements in init(): ' + live.length; return r; }
  if (init.split(D1_BLOCK).length - 1 !== 1) { r.reason = 'exact D1 block not present exactly once'; return r; }
  const iBlock = init.indexOf(D1_BLOCK);
  const iPr = init.indexOf('window.PT_ENABLE_PORTFOLIO_RESEARCH =\n');
  const iLoad = init.indexOf('loadWatchlist();');
  if (iPr === -1 || iLoad === -1) { r.reason = 'anchors missing'; return r; }
  if (!(iPr < iBlock && iBlock < iLoad)) { r.reason = 'D1 not between PORTFOLIO_RESEARCH block and loadWatchlist()'; return r; }
  r.ok = true;
  return r;
}

// -- TX-2 --------------------------------------------------------------------
function checkTx2(src) {
  const r = { ok: false, reason: null };
  const mine = liveGateAssignments(src).filter(function (m) { return m[1] === 'PT_ENABLE_TECH_SCORE'; });
  if (mine.length !== 1) { r.reason = 'live assignments to the gate: ' + mine.length; return r; }
  if (liveMatches(src, /\bwindow\s*\[[^\]]*\]\s*=(?!=)/g).length) { r.reason = 'dynamic window[...] assignment'; return r; }
  if (liveMatches(src, /\bObject\.(?:assign|defineProperty)\s*\(\s*window\b[\s\S]{0,300}/g)
    .some(function (m) { return /PT_ENABLE_/.test(m[0]); })) { r.reason = 'Object.assign/defineProperty on window naming a gate'; return r; }
  const keyCalls = liveMatches(src, /\b(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\s*\(\s*(['"`])([^'"`]*)\1/g)
    .filter(function (m) { return /tech[_-]?score|ts1/i.test(m[2]); });
  if (keyCalls.length) { r.reason = 'storage access with a tech-score key: ' + keyCalls[0][2]; return r; }
  const lines = src.split('\n').filter(function (l) {
    return /\b(?:localStorage|sessionStorage|indexedDB)\b/.test(l) && /PT_ENABLE_TECH_SCORE|_ts1RowMemo|_techScoreDebug/.test(l);
  });
  if (lines.length) { r.reason = 'storage and tech-score state on one line'; return r; }
  r.ok = true;
  return r;
}

// -- TX-3 --------------------------------------------------------------------
// sha256 of the CRLF-normalised base sources, captured from the pre-D1 base (function text only).
const BASE_HASHES = {
  runTechScoreV1: 'f36bc4eb5cba98708d126414f9cad74c61faa0e8a66f80d7a6940a894fec504d',
  _ts1FillRow: '17c8863a09b38ed15b9126906185cfd35bf2107ad30e95523d19a62a6630ac5f',
  _ts1RowText: '6df1e8355698b11e89f5f01193184a17f536a57f047cac6eec322159f4f69a06',
  renderMainPanel: 'ed2c8bdcac6070d442241c4138b5f3ed155794b378d34349ac20cf0dc25aae2a'
};
function checkTx3(src) {
  const r = { ok: false, reason: null };
  for (const n of Object.keys(BASE_HASHES)) {
    const s = extractFunctionSource(src, n);
    if (!s) { r.reason = n + ' not extractable'; return r; }
    if (sha256(s) !== BASE_HASHES[n]) { r.reason = n + ' differs from base'; return r; }
  }
  const eng = extractFunctionSource(src, 'runTechScoreV1');
  const fill = extractFunctionSource(src, '_ts1FillRow');
  if (!/^function runTechScoreV1\(symbol\) \{\n  if \(window\.PT_ENABLE_TECH_SCORE !== true\) \{\n/.test(eng)) { r.reason = 'engine strict gate not first'; return r; }
  if (!/^function _ts1FillRow\(symbol\) \{\n  if \(window\.PT_ENABLE_TECH_SCORE !== true\) return;\n/.test(fill)) { r.reason = 'filler strict gate not first'; return r; }
  r.ok = true;
  return r;
}

// -- TX-4 --------------------------------------------------------------------
function checkTx4(src) {
  const r = { ok: false, reason: null };
  const init = extractFunctionSource(src, 'init');
  const panel = extractFunctionSource(src, 'renderMainPanel');
  if (!init || !panel) { r.reason = 'extraction failed'; return r; }
  const d1 = liveMatches(init, /window\.PT_ENABLE_TECH_SCORE = [^;\n]*;/g);
  if (d1.length !== 1) { r.reason = 'D1 statement count ' + d1.length; return r; }
  const rowMatch = panel.match(/const _ts1RowHtml = (window\.PT_ENABLE_TECH_SCORE(?: === true)?\s*\?[\s\S]*?:\s*'');/);
  if (!rowMatch) { r.reason = 'row expression not found'; return r; }
  // eslint-disable-next-line no-new-func
  const rowFn = new Function('window', 'item', 'return ' + rowMatch[1] + ';');
  // eslint-disable-next-line no-new-func
  const apply = new Function('window', d1[0][0]);
  const win = {};
  apply(win);
  if (win.PT_ENABLE_TECH_SCORE !== true) { r.reason = 'D1 does not set the boolean true'; return r; }
  const on = rowFn(win, { ticker: 'AAPL' });
  if (on.indexOf('Tech Score v1') === -1 || on.indexOf('id="ts1-val-AAPL"') === -1) { r.reason = 'row not rendered after D1'; return r; }
  if (rowFn({ PT_ENABLE_TECH_SCORE: false }, { ticker: 'AAPL' }) !== '') { r.reason = '= false does not hide the row'; return r; }
  if (rowFn({ PT_ENABLE_TECH_SCORE: 'true' }, { ticker: 'AAPL' }) !== '') { r.reason = "string 'true' shows the row"; return r; }
  if (rowFn({}, { ticker: 'AAPL' }) !== '') { r.reason = 'absent gate shows the row'; return r; }
  r.ok = true;
  return r;
}

// -- TX-5 --------------------------------------------------------------------
const ALLOWED_DEFAULTS = ['PT_ENABLE_PORTFOLIO_RESEARCH', 'PT_ENABLE_TECH_SCORE'];
const MUST_HAVE_NO_DEFAULT = [
  'PT_ENABLE_DEEP_DIVE', 'PT_ENABLE_RESEARCH_EVIDENCE_CLIENT', 'PT_ENABLE_CAPITAL_RETURNS_CLIENT',
  'PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT', 'PT_ENABLE_FUND_FACTS_READ_CLIENT', 'PT_ENABLE_EDGAR_FORM4'
];
function checkTx5(src) {
  const r = { ok: false, reason: null };
  const names = liveGateAssignments(src).map(function (m) { return m[1]; });
  const stray = names.filter(function (n) { return ALLOWED_DEFAULTS.indexOf(n) === -1; });
  if (stray.length) { r.reason = 'default assignment for ' + stray[0]; return r; }
  for (const n of MUST_HAVE_NO_DEFAULT) {
    if (names.indexOf(n) !== -1) { r.reason = n + ' has a default'; return r; }
  }
  if (liveMatches(src, /\bPT_ENABLE_[A-Z0-9_]+\s*:/g).length) { r.reason = 'PT_ENABLE_* object-literal default'; return r; }
  r.ok = true;
  return r;
}

const CHECKERS = { 'TX-1': checkTx1, 'TX-2': checkTx2, 'TX-3': checkTx3, 'TX-4': checkTx4, 'TX-5': checkTx5 };

// -- Real file: every row must PASS ------------------------------------------
for (const id of Object.keys(CHECKERS)) {
  const res = CHECKERS[id](real);
  check(id + ' holds on the real index.html' + (res.reason ? ' (' + res.reason + ')' : ''), res.ok === true);
}

// Live-scan positive controls: the scanner sees real assignments and ignores comment/string text.
check('scan control: a live assignment is detected', liveGateAssignments('x\n  window.PT_ENABLE_ZZ = true;\n').length === 1);
check('scan control: a // comment is ignored', liveGateAssignments('  // window.PT_ENABLE_ZZ = true\n').length === 0);
check('scan control: a string literal is ignored', liveGateAssignments("  console.warn('set window.PT_ENABLE_ZZ = true');\n").length === 0);
check('scan control: a line-spanning assignment is detected', liveGateAssignments('  window.PT_ENABLE_ZZ =\n    (a === b);\n').length === 1);
check('scan control: a comparison is not an assignment', liveGateAssignments('  if (window.PT_ENABLE_ZZ === true) {}\n').length === 0);
check('scan control: code after a closed inline block comment is live', liveGateAssignments('  /* note */ window.PT_ENABLE_ZZ = true;\n').length === 1);
check('scan control: text inside an unclosed block comment is ignored', liveGateAssignments('  /* window.PT_ENABLE_ZZ = true;\n').length === 0);
check('scan control: a computed literal-key assignment is detected', liveGateAssignments("  window['PT_ENABLE_ZZ'] = true;\n").length === 1);

// -- Planted negatives: mutate an in-memory COPY; the SAME checker must reject it --
function mutate(src, from, to) {
  if (src.split(from).length - 1 !== 1) throw new Error('mutation anchor not unique: ' + from.slice(0, 60));
  return src.replace(from, to);
}
const NEG = [
  { id: 'TX-1', label: 'assignment moved after loadWatchlist()', make: function () {
    return mutate(mutate(real, D1_BLOCK, D1_BLOCK.split('\n').slice(0, 3).join('\n')),
      '  // Phase 1: load + normalize watchlist from localStorage on startup\n  loadWatchlist();\n',
      '  // Phase 1: load + normalize watchlist from localStorage on startup\n  loadWatchlist();\n  ' + D1_STMT + '\n'); } },
  { id: 'TX-1', label: 'D1 comment text altered', make: function () {
    return mutate(real, 'is exposed by default.', 'is exposed by default!'); } },
  { id: 'TX-2', label: 'second assignment added', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + '\n  ' + D1_STMT); } },
  { id: 'TX-2', label: 'localStorage write with a tech-score key', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + "\n  localStorage.setItem('pt_tech_score', 'on');"); } },
  { id: 'TX-2', label: 'dynamic window[...] assignment', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + "\n  window['PT_ENABLE_' + 'X'] = true;"); } },
  { id: 'TX-2', label: 'Object.assign(window, ...) naming the gate', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + '\n  Object.assign(window, { PT_ENABLE_TECH_SCORE: true });'); } },
  { id: 'TX-3', label: 'renderMainPanel byte changed', make: function () {
    return mutate(real, 'function renderMainPanel(item) {\n', 'function renderMainPanel(item) {\n  /* x */\n'); } },
  { id: 'TX-3', label: 'filler strict gate loosened to truthy', make: function () {
    return mutate(real, 'if (window.PT_ENABLE_TECH_SCORE !== true) return;', 'if (!window.PT_ENABLE_TECH_SCORE) return;'); } },
  { id: 'TX-3', label: 'engine strict gate loosened to truthy', make: function () {
    return mutate(real, "if (window.PT_ENABLE_TECH_SCORE !== true) {\n    return { status: 'GATE_OFF'", "if (!window.PT_ENABLE_TECH_SCORE) {\n    return { status: 'GATE_OFF'"); } },
  { id: 'TX-3', label: '_ts1RowText degrade glyph changed', make: function () {
    return mutate(real, "result.status === 'UNAVAILABLE') return '—';", "result.status === 'UNAVAILABLE') return '-';"); } },
  { id: 'TX-4', label: 'D1 sets the string "true"', make: function () {
    return mutate(real, D1_STMT, "window.PT_ENABLE_TECH_SCORE = 'true';"); } },
  { id: 'TX-4', label: 'row gate loosened to truthy', make: function () {
    return mutate(real, 'const _ts1RowHtml = window.PT_ENABLE_TECH_SCORE === true\n', 'const _ts1RowHtml = window.PT_ENABLE_TECH_SCORE\n'); } },
  { id: 'TX-5', label: 'Deep Dive default added', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + '\n  window.PT_ENABLE_DEEP_DIVE = true;'); } },
  { id: 'TX-5', label: 'computed literal-key Deep Dive default added', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + "\n  window['PT_ENABLE_DEEP_DIVE'] = true;"); } },
  { id: 'TX-5', label: 'Deep Dive default hidden behind an inline block comment', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + '\n  /* note */ window.PT_ENABLE_DEEP_DIVE = true;'); } },
  { id: 'TX-5', label: 'unrelated gate default added', make: function () {
    return mutate(real, D1_BLOCK, D1_BLOCK + '\n  window.PT_ENABLE_FUND_FACTS_READ_CLIENT = true;'); } }
];
for (const n of NEG) {
  let mutant = null;
  try { mutant = n.make(); } catch (e) { mutant = null; }
  check('negative anchor resolves: ' + n.id + ' / ' + n.label, mutant !== null && mutant !== real);
  if (mutant === null) continue;
  const res = CHECKERS[n.id](mutant);
  check('negative: ' + n.id + ' rejects "' + n.label + '"', res.ok === false);
}

console.log(failures === 0
  ? 'TS1 DEFAULT EXPOSURE OFFLINE: PASS (' + asserts + ' asserts)'
  : 'TS1 DEFAULT EXPOSURE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
