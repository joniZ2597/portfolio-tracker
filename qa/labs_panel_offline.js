'use strict';
/*
 * labs_panel_offline.js — surface-1b / S1 (Entry 22b, LB-R1): session-only Labs switches in the API-status modal.
 * Offline: no network, no browser, no storage, no file writes. Rows LB-1..LB-11 map 1:1 to
 * work/surface-1b/brief.md section S1.3. The REAL L2 markup and L3 source are extracted from index.html;
 * the L3 source runs in a sandbox whose storage / network globals throw or are spies.
 * Planted negatives mutate an in-memory COPY of the source (never the file on disk) and the named row must then FAIL.
 * Seed: the archived surface-1 S2 suite (reference only); its mutation anchors are rewritten to the S1.1 text.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const core = require('./lib/index-pins-core');

const SRC = core.normalizeText(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
const countOf = (h, n) => h.split(n).length - 1;

const FLAGS = ['PT_ENABLE_DEEP_DIVE', 'PT_ENABLE_PORTFOLIO_RESEARCH'];
// Function digests at the task base (LF-normalised, pin-map method) — S1 must leave these byte-identical (LB-8).
const BASE_PINS = {
  renderMainPanel: 'a248cfabfa0b8d859e2951888a33cdb7d92e008b9de2f2b5e709270c10bed57b',
  _renderPortfolioPanel: '08286eba02162c12523e0984c6e9bae6639bb6bfe6b737f44ccc6e5816bf78cf',
  _calcPortfolioAggregates: '8e480394b86711f35a77e0b4cd7e38864c0ef653bb1e4ab47ff148025c16914b',
  renderApiTable: '6ab781fd896bb61a4120a7b6c3529e93e0adf16fb844fd7ba25e5c5d4b245c12',
  init: '588e95f019465d9c2a15fd1d5786121a5356ee947a16c32c56d032e759608828',
};
const DD_STMT = '    window.PT_ENABLE_DEEP_DIVE = (on === true);\n';
// Slice 2's only edit inside _renderPortfolioPanel (Entry 30), as after / before text.
const S2_AFTER = "resStEl.textContent = isStale ? _dhLabel('state', 'stale') : 'Research';";
const S2_BEFORE = "resStEl.textContent = isStale ? 'Stale' : 'Research';";
// setLabsFlag exactly as the brief's S1.1 quotes it (LF; the function source ends at its closing brace).
const SETTER_S11 = [
  "function setLabsFlag(flag, on) {",
  "  if (flag === 'PT_ENABLE_DEEP_DIVE') {",
  "    window.PT_ENABLE_DEEP_DIVE = (on === true);",
  "    if (_activeTicker) {",
  "      const item = _cockpitResults.find(r => r.ticker === _activeTicker);",
  "      if (item) renderMainPanel(item);",
  "    }",
  "  } else if (flag === 'PT_ENABLE_PORTFOLIO_RESEARCH') {",
  "    window.PT_ENABLE_PORTFOLIO_RESEARCH = (on === true);",
  "    if (_pfIsPortfolioViewActive() && !_pfLiveRunCanceller) _renderPortfolioPanel();",
  "  } else {",
  "    return;",
  "  }",
  "  renderLabsToggles();",
  "}"
].join('\n');

// Reading used (brief L3 mandates a comment saying "no storage write, no fetch, no scan, no computed-key write"): token scans
// look at code only, i.e. lines that are not // comments.
const codeOnly = s => s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
// A match is "live" when it is not inside a // or /* comment and not inside a quoted string (the same rule as TX-2 / TX-5 in
// qa/ts1_default_exposure_offline.js, so the two suites cannot disagree about what a write is).
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
      if (close === -1) return false;
      i = close + 1;
    }
  }
  if (q) return false;
  if (/^\s*\*/.test(pre)) return false;
  return true;
}
function liveCount(src, re) {
  let n = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) { if (isLive(src, m.index)) n += 1; }
  return n;
}
function l3Block(src) {
  const m = /\/\/ Entry 22b[\s\S]*?\nfunction setLabsFlag\([\s\S]*?\n}\n/.exec(src);
  if (!m) throw new Error('no L3 block');
  return m[0];
}
function fnSrc(src, name) {
  const i = src.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  if (i === -1) throw new Error('no top-level ' + name);
  return src.slice(i, src.indexOf('\n}\n', i) + 2);
}
function modalSrc(src) {
  const i = src.indexOf('id="apiOverlay"');
  const j = src.indexOf('<!-- SCAN RESULTS OVERLAY', i);
  if (i === -1 || j === -1) throw new Error('api modal not found');
  return src.slice(i, j);
}
function labsBoxSrc(src) {
  const m = modalSrc(src);
  const i = m.indexOf('<div class="labs-box" id="labsBox">');
  if (i === -1) throw new Error('no #labsBox in the api modal');
  return { all: m, i, box: m.slice(i, m.indexOf('\n    </div>\n', i) + 11) };
}

// Sandbox for the L3 source. Storage globals throw on any touch; fetch is a spy; redraw functions are spies.
function build(src) {
  const calls = { fetch: 0, renderMainPanel: [], renderPortfolioPanel: 0 };
  const boom = name => new Proxy({}, { get() { throw new Error(name + ' touched'); }, set() { throw new Error(name + ' touched'); } });
  const checks = {};
  const doc = { getElementById: id => (checks[id] || null), cookie: undefined };
  const win = {};
  const body =
    'let _activeTicker = null, _cockpitResults = [], _pfLiveRunCanceller = null, __viewActive = false;\n' +
    'function _pfIsPortfolioViewActive() { return __viewActive; }\n' +
    l3Block(src) +
    '\nreturn { PT_LABS_FLAGS: PT_LABS_FLAGS, renderLabsToggles: renderLabsToggles, setLabsFlag: setLabsFlag,' +
    ' set: function (k, v) { if (k === "active") _activeTicker = v; else if (k === "results") _cockpitResults = v;' +
    ' else if (k === "live") _pfLiveRunCanceller = v; else if (k === "view") __viewActive = v; } };';
  const api = new Function('window', 'document', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
    'renderMainPanel', '_renderPortfolioPanel', body)(
    win, doc, () => { calls.fetch += 1; }, function () { calls.fetch += 1; }, boom('localStorage'), boom('sessionStorage'), boom('indexedDB'),
    item => { calls.renderMainPanel.push(item); }, () => { calls.renderPortfolioPanel += 1; });
  return { api, calls, win, checks };
}

const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };

row('LB-1 #labsBox in the api modal after api-info-box, exactly two switches, nothing else', src => {
  const { all, i, box } = labsBoxSrc(src);
  assert.ok(all.indexOf('api-info-box') !== -1 && all.indexOf('api-info-box') < i, 'labs box must follow api-info-box');
  assert.strictEqual(countOf(box, 'type="checkbox"'), 2, 'exactly two switches');
  for (const f of FLAGS) assert.strictEqual(countOf(box, 'id="labs-' + f + '"'), 1, f);
  for (const bad of ['TECH_SCORE', 'RESEARCH_EVIDENCE', 'FUND_FACTS', 'PT_ENABLE_CAPITAL', 'FINANCE_SEARCH']) assert.strictEqual(countOf(box, bad), 0, bad);
  assert.strictEqual(countOf(src, 'id="labsBox"'), 1);
  assert.ok(/\.api-info-text\{[^}]*\}\n\.labs-box\{/.test(src), 'L1 CSS follows the .api-info-text rule');
});
row('LB-2 PT_LABS_FLAGS is exactly the two flags; any other name changes nothing', src => {
  const { api, calls, win } = build(src);
  assert.deepStrictEqual(Array.from(api.PT_LABS_FLAGS), FLAGS);
  for (const other of ['PT_ENABLE_TECH_SCORE', 'PT_ENABLE_RESEARCH_EVIDENCE_CLIENT', 'PT_ENABLE_FUND_FACTS_READ_CLIENT', '__proto__', 'constructor', '', null, undefined]) {
    api.setLabsFlag(other, true);
  }
  assert.deepStrictEqual(Object.keys(win), [], 'no window key was written');
  assert.strictEqual(calls.renderMainPanel.length + calls.renderPortfolioPanel, 0);
});
row('LB-3 strict booleans', src => {
  const { api, win } = build(src);
  for (const f of FLAGS) {
    api.setLabsFlag(f, true); assert.strictEqual(win[f], true, f);
    for (const v of [false, 'true', 1, undefined, null, {}]) {
      api.setLabsFlag(f, true);
      api.setLabsFlag(f, v);
      assert.strictEqual(win[f], false, f + ' value ' + String(v));
    }
  }
});
row('LB-4 no persistence: no storage tokens, sandbox storage never touched, init read still exactly once', src => {
  const blk = codeOnly(l3Block(src)) + fnSrc(src, 'toggleApiStatus');
  for (const t of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) assert.strictEqual(countOf(blk, t), 0, t);
  const { api } = build(src);
  api.setLabsFlag(FLAGS[0], true); api.setLabsFlag(FLAGS[1], true); api.setLabsFlag(FLAGS[1], false); api.renderLabsToggles();
  assert.strictEqual(countOf(src, 'pt_enable_portfolio_research'), 1);
});
row('LB-5 no network or jobs reachable from the setter', src => {
  const blk = codeOnly(l3Block(src));
  for (const t of ['fetch', 'XMLHttpRequest', '_dd0RunCard', '_dd0FetchAnalysis', '_pfLiveBatch', '_pfEodManualRefresh', 'orchestrate', 'analyzeChunk', 'runScan', 'enforceScoreConsistency', 'setTimeout', 'setInterval']) {
    assert.strictEqual(countOf(blk, t), 0, t);
  }
  const { api, calls } = build(src);
  api.set('active', 'NVDA'); api.set('results', [{ ticker: 'NVDA' }]); api.set('view', true);
  api.setLabsFlag(FLAGS[0], true); api.setLabsFlag(FLAGS[1], true);
  assert.strictEqual(calls.fetch, 0);
});
row('LB-6 Deep Dive redraw: active ticker with a result -> renderMainPanel once; none -> not called', src => {
  const a = build(src);
  const item = { ticker: 'NVDA' };
  a.api.set('active', 'NVDA'); a.api.set('results', [{ ticker: 'AAPL' }, item]);
  a.api.setLabsFlag('PT_ENABLE_DEEP_DIVE', true);
  assert.strictEqual(a.calls.renderMainPanel.length, 1);
  assert.strictEqual(a.calls.renderMainPanel[0], item);
  const b = build(src);
  b.api.set('results', [item]);
  b.api.setLabsFlag('PT_ENABLE_DEEP_DIVE', true);
  assert.strictEqual(b.calls.renderMainPanel.length, 0);
  const c = build(src);
  c.api.set('active', 'ZZZ'); c.api.set('results', [item]);
  c.api.setLabsFlag('PT_ENABLE_DEEP_DIVE', true);
  assert.strictEqual(c.calls.renderMainPanel.length, 0, 'active ticker without a result');
  const d = build(src);
  d.api.set('active', 'NVDA'); d.api.set('results', [item]);
  d.api.setLabsFlag('PT_ENABLE_PORTFOLIO_RESEARCH', true);
  assert.strictEqual(d.calls.renderMainPanel.length, 0, 'the Portfolio switch never redraws the ticker panel');
});
row('LB-7 Portfolio redraw: view active and no live run -> once; live run or inactive view -> not called', src => {
  const a = build(src);
  a.api.set('view', true);
  a.api.setLabsFlag('PT_ENABLE_PORTFOLIO_RESEARCH', true);
  assert.strictEqual(a.calls.renderPortfolioPanel, 1);
  const b = build(src);
  b.api.set('view', true); b.api.set('live', function () {});
  b.api.setLabsFlag('PT_ENABLE_PORTFOLIO_RESEARCH', true);
  assert.strictEqual(b.calls.renderPortfolioPanel, 0);
  const c = build(src);
  c.api.setLabsFlag('PT_ENABLE_PORTFOLIO_RESEARCH', true);
  assert.strictEqual(c.calls.renderPortfolioPanel, 0);
  const d = build(src);
  d.api.set('view', true);
  d.api.setLabsFlag('PT_ENABLE_DEEP_DIVE', true);
  assert.strictEqual(d.calls.renderPortfolioPanel, 0, 'the Deep Dive switch never redraws the portfolio panel');
});
row('LB-8 renderMainPanel, _renderPortfolioPanel, _calcPortfolioAggregates, renderApiTable, init byte-identical to the base', src => {
  const fns = core.extractFunctions(src);
  for (const name of Object.keys(BASE_PINS)) {
    const hit = fns.filter(f => f.name === name);
    assert.strictEqual(hit.length, 1, name);
    // Reading used (the brief's LB-8 says "unchanged" while its own Slice 2 edits _renderPortfolioPanel): that one function may
    // differ from the base only by Slice 2's single line, which is reverted here before hashing; any other change still fails.
    const text = name === '_renderPortfolioPanel' ? hit[0].text.replace(S2_AFTER, S2_BEFORE) : hit[0].text;
    assert.strictEqual(core.sha256(text), BASE_PINS[name], name + ' changed since the base');
  }
});
row('LB-9 toggleApiStatus syncs on open; renderLabsToggles reflects window[flag] === true only', src => {
  const t = fnSrc(src, 'toggleApiStatus');
  assert.ok(t.includes('if (!isOpen) { renderApiTable(); renderLabsToggles(); }'), 'L4 line');
  assert.strictEqual(countOf(t, 'renderLabsToggles()'), 1);
  const { api, win, checks } = build(src);
  for (const f of FLAGS) checks['labs-' + f] = { checked: null };
  win[FLAGS[0]] = true; win[FLAGS[1]] = 'true';
  api.renderLabsToggles();
  assert.strictEqual(checks['labs-' + FLAGS[0]].checked, true);
  assert.strictEqual(checks['labs-' + FLAGS[1]].checked, false, "'true' string is not on");
  delete win[FLAGS[0]];
  api.renderLabsToggles();
  assert.strictEqual(checks['labs-' + FLAGS[0]].checked, false);
});
row('LB-10 no live window[...] write anywhere; one live writer per Labs gate inside setLabsFlag; other Portfolio writers only the init() ones', src => {
  assert.strictEqual(liveCount(src, /\bwindow\s*\[[^\]]*\]\s*=(?!=)/g), 0, 'computed-key window write');
  const setter = fnSrc(src, 'setLabsFlag');
  assert.strictEqual(countOf(src, 'function setLabsFlag('), 1);
  const wr = (s, gate) => liveCount(s, new RegExp('\\bwindow\\s*\\.\\s*' + gate + '\\s*=(?!=)', 'g'));
  assert.strictEqual(wr(setter, 'PT_ENABLE_DEEP_DIVE'), 1, 'Deep Dive writer inside setLabsFlag');
  assert.strictEqual(wr(src, 'PT_ENABLE_DEEP_DIVE'), 1, 'Deep Dive writer anywhere');
  assert.strictEqual(wr(setter, 'PT_ENABLE_PORTFOLIO_RESEARCH'), 1, 'Portfolio writer inside setLabsFlag');
  const init = fnSrc(src, 'init');
  assert.strictEqual(wr(src, 'PT_ENABLE_PORTFOLIO_RESEARCH'), 1 + wr(init, 'PT_ENABLE_PORTFOLIO_RESEARCH'), 'Portfolio writers outside setLabsFlag must be init() ones');
  assert.strictEqual(wr(init, 'PT_ENABLE_PORTFOLIO_RESEARCH'), 2, 'the existing init() read and its false fallback');
  // Indirect workarounds named by LB-R1 (dot and bracket forms through a global alias, Reflect writes): none anywhere.
  assert.strictEqual(liveCount(src, /\b(?:globalThis|self|top|parent|frames)\s*(?:\.\s*PT_ENABLE_[A-Z0-9_]+|\[[^\]]*\])\s*=(?!=)/g), 0, 'gate write through a global alias');
  assert.strictEqual(liveCount(src, /\bReflect\s*\.\s*(?:set|defineProperty)\s*\(\s*(?:window|globalThis|self)\b/g), 0, 'Reflect write on the global object');
  // The setter is pinned to the exact S1.1 text, so no write can hide in a nested function or wrapper inside it.
  assert.strictEqual(setter, SETTER_S11, 'setLabsFlag differs from the S1.1 text');
});
row('LB-11 each Labs writer right-hand side is exactly (on === true)', src => {
  const setter = codeOnly(fnSrc(src, 'setLabsFlag'));
  const rhs = setter.match(/\bwindow\s*\.\s*PT_ENABLE_[A-Z0-9_]+\s*=(?!=)\s*([^;]*);/g) || [];
  assert.strictEqual(rhs.length, 2);
  for (const r of rhs) assert.ok(/=\s*\(on === true\);$/.test(r), 'non-strict writer: ' + r);
});

// ── planted negatives ─────────────────────────────────────────────────────────
const sw = (a, b) => s => { assert.ok(countOf(s, a) === 1, 'mutation anchor not unique (' + countOf(s, a) + '): ' + a.slice(0, 60)); return s.replace(a, b); };
const PR_STMT = '    window.PT_ENABLE_PORTFOLIO_RESEARCH = (on === true);\n';
const NEG = [
  ['LB-1 a third switch', 'LB-1', sw('<label class="labs-row"><input type="checkbox" id="labs-PT_ENABLE_PORTFOLIO_RESEARCH"', '<label class="labs-row"><input type="checkbox" id="labs-PT_ENABLE_TECH_SCORE"></label>\n      <label class="labs-row"><input type="checkbox" id="labs-PT_ENABLE_PORTFOLIO_RESEARCH"')],
  ['LB-2 unknown flag writes a computed key', 'LB-2', sw('  } else {\n    return;\n  }\n  renderLabsToggles();', '  } else {\n    window[flag] = (on === true);\n  }\n  renderLabsToggles();')],
  ['LB-2 third flag in the list', 'LB-2', sw("'PT_ENABLE_PORTFOLIO_RESEARCH'];\nfunction renderLabsToggles", "'PT_ENABLE_PORTFOLIO_RESEARCH', 'PT_ENABLE_TECH_SCORE'];\nfunction renderLabsToggles")],
  ['LB-3 truthy instead of strict', 'LB-3', sw(DD_STMT, '    window.PT_ENABLE_DEEP_DIVE = !!on;\n')],
  ['LB-4 storage write', 'LB-4', sw(DD_STMT, DD_STMT + '    localStorage.setItem("x", String(on));\n')],
  ['LB-5 fetch in the setter', 'LB-5', sw(DD_STMT, DD_STMT + "    fetch('/x');\n")],
  ['LB-6 no Deep Dive redraw', 'LB-6', sw('      if (item) renderMainPanel(item);\n    }\n  } else if (flag === ', '    }\n  } else if (flag === ')],
  ['LB-7 redraw during a live run', 'LB-7', sw('_pfIsPortfolioViewActive() && !_pfLiveRunCanceller', '_pfIsPortfolioViewActive()')],
  ['LB-8 init read edited', 'LB-8', sw("localStorage.getItem('pt_enable_portfolio_research') === 'true'", "localStorage.getItem('pt_enable_portfolio_research') !== 'false'")],
  ['LB-8 _renderPortfolioPanel changed beyond Slice 2 line', 'LB-8', sw("resStEl.className = 'pf-res-state ' + (isStale ? 'stale' : 'found');", "resStEl.className = 'pf-res-state ' + (isStale ? 'found' : 'stale');")],
  ['LB-4 init read duplicated', 'LB-4', s => s + "\n// pt_enable_portfolio_research\n"],
  ['LB-9 no sync on open', 'LB-9', sw('if (!isOpen) { renderApiTable(); renderLabsToggles(); }', 'if (!isOpen) renderApiTable();')],
  ['LB-9 truthy reflection', 'LB-9', sw('el.checked = (window[flag] === true);', 'el.checked = !!window[flag];')],
  ['LB-10 computed-key setter', 'LB-10', sw(DD_STMT, '    window[flag] = (on === true);\n')],
  ['LB-10 second Portfolio-research writer', 'LB-10', sw(PR_STMT, PR_STMT + PR_STMT)],
  ['LB-10 Deep Dive writer outside setLabsFlag', 'LB-10', s => s.replace('function renderLabsToggles() {', 'function renderLabsToggles() {\n  window.PT_ENABLE_DEEP_DIVE = (1 === 1);')],
  ['LB-10 globalThis bracket-form write outside the setter', 'LB-10', s => s + "\nglobalThis['PT_ENABLE_DEEP_DIVE'] = true;\n"],
  ['LB-10 Reflect.set write outside the setter', 'LB-10', s => s + "\nReflect.set(window, 'PT_ENABLE_DEEP_DIVE', true);\n"],
  ['LB-10 Deep Dive write hidden in a nested function inside setLabsFlag', 'LB-10', sw(DD_STMT, '    (function () {\n      window.PT_ENABLE_DEEP_DIVE = (on === true);\n    })();\n')],
  ['LB-11 non-strict write (= on)', 'LB-11', sw(DD_STMT, '    window.PT_ENABLE_DEEP_DIVE = on;\n')],
  ['LB-11 non-strict write (= true)', 'LB-11', sw(PR_STMT, '    window.PT_ENABLE_PORTFOLIO_RESEARCH = true;\n')],
];

(async () => {
  let pass = 0;
  const failures = [];
  for (const id of ORDER) {
    try { await ROWS[id](SRC); pass += 1; console.log('  PASS  ' + id); }
    catch (e) { failures.push(id); console.log('  FAIL  ' + id + ' — ' + String(e && e.message || e).split('\n')[0]); }
  }
  for (const [label, rowId, mutate] of NEG) {
    const full = ORDER.find(i => i.startsWith(rowId + ' '));
    let mutated;
    try { mutated = mutate(SRC); } catch (e) { failures.push('negative anchor: ' + label); console.log('  FAIL  negative mutation did not apply: ' + label + ' — ' + String(e.message).split('\n')[0]); continue; }
    let caught = false;
    try { await ROWS[full](mutated); } catch (e) { caught = true; }
    if (caught) { pass += 1; console.log('  PASS  negative caught: ' + label); }
    else { failures.push('negative: ' + label); console.log('  FAIL  negative NOT caught: ' + label); }
  }
  if (failures.length) { console.log('\nlabs-panel: ' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\n' + pass + ' labs-panel assertion(s) passed');
})();
