'use strict';

/*
 * SG — scan action gate (scan-action-gate-1, DR-1 / DR-2).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL orchestrate + classifyTechnicalSetup from
 * index.html (brace matching) and runs them verbatim in a new Function sandbox (pattern: qa/no_synthetic_score_offline.js
 * buildOrchestrate, qa/tech_snapshot_cache_offline.js TC-4) — never a re-implementation.
 *
 * Rows SG-1..SG-10 map 1:1 to brief work/scan-action-gate-1/brief.md section 3 (S1).
 *   SG-1  mapping for setups 1-6 (normalised input -> canonical allowed value, else the row fallback)
 *   SG-2  setup 7 below_key_mas: every input -> avoid (existing gate, positive control)
 *   SG-3  never an add: a non-add input never becomes an add; an invalid add never becomes another add
 *   SG-4  risk warnings kept: trim / avoid preserved; the code never writes trim from a non-trim input
 *   SG-5a known limitation pinned: deterministic unknown -> the AI action is unchanged (D11-D)
 *   SG-5b DR-2: deterministic unknown + AI-claimed setup -> technical_setup === 'unknown'
 *   SG-6  D10: the 62 cap does not fire on an AI-claimed extended_near_ath when the code says unknown
 *   SG-7  failed (_aiUnavailable) items: no action key, setup assigned as today, score null
 *   SG-8  no score logic: >= 1000 cases equal the gate-removed oracle in every field except the gated ones
 *   SG-9  audit trail + exactly one override console.warn per changed action, in the existing form
 *   SG-10 static: signature, marker comments, local tables, forbidden names, R-3 lines, DR-2 line, pin-map functions
 *
 * Planted negatives (PN-1..PN-10) mutate an in-memory copy of the production source (never the test); the named
 * group must then FAIL, and the unmutated source is the positive control. All text is compared LF-normalised.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const IDX_CORE = require('./lib/index-pins-core.js');
const IDX_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'index-pins.json'), 'utf8'));

const norm = s => s.replace(/\r\n/g, '\n');
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

function extractFn(content, name) {
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

const BEGIN = '// scan-action-gate-1 (DR-1) begin';
const END = '// scan-action-gate-1 (DR-1) end';
const SIG = 'function orchestrate(claudeResults, pplxData, stockData, techSnaps) {';
const DR2_NEW = "    else item.technical_setup = 'unknown';";
const DR2_OLD = "    else item.technical_setup = item.technical_setup || 'unknown';";
const TABLE_NAMES = ['_sagAllowed', '_sagFallback'];
// The six R-3 lines of orchestrate (qa/no_synthetic_score_offline.js R3.orchestrate, task side): each occurs exactly once.
const R3_LINES = [
  "    if (typeof item.sentiment_score === 'number' && chg < -5 && item.sentiment_score > 60) {",
  "    if (typeof item.sentiment_score === 'number' && chg > 5  && item.sentiment_score < 40) {",
  "    if (item._aiUnavailable !== true && item.technical_setup === 'extended_near_ath' && item.sentiment_score > 62) {",
  "    if (item._aiUnavailable !== true && _setup6a === 'extended_near_ath') {",
  "    if (item._aiUnavailable !== true && _setup6a === 'below_key_mas' && item.sentiment_score > 45) {",
  "    if (item._aiUnavailable !== true && _setup6a === 'below_key_mas') {"
];

// ── Spec (brief section 1 table): setup -> allowed (canonical) set and the single fallback ─────────────────────
const ADD = ['add_on_pullback', 'add_on_breakout', 'add_on_reclaim'];
const ENUM = ['hold', 'hold_wait', 'add_on_pullback', 'add_on_breakout', 'add_on_reclaim', 'trim', 'avoid'];
const ROWS = {
  extended_near_ath:        { allowed: ['hold_wait', 'trim', 'avoid'], fallback: 'hold_wait' },
  healthy_uptrend_near_ath: { allowed: ['hold_wait', 'add_on_pullback', 'trim', 'avoid'], fallback: 'hold_wait' },
  healthy_uptrend:          { allowed: ['hold', 'add_on_pullback', 'add_on_breakout', 'trim', 'avoid'], fallback: 'hold' },
  pullback_in_uptrend:      { allowed: ['add_on_reclaim', 'add_on_pullback', 'hold_wait', 'trim', 'avoid'], fallback: 'hold_wait' },
  support_test:             { allowed: ['add_on_pullback', 'hold_wait', 'trim', 'avoid'], fallback: 'hold_wait' },
  breakdown_risk:           { allowed: ['trim', 'avoid'], fallback: 'avoid' }
};
const GATED = Object.keys(ROWS);
const MISSING = Symbol('missing');
const INPUTS = [...ENUM, 'buy', MISSING, null, 'strong_buy', 'Accumulate', ' Add_On_Pullback ', 'HOLD_WAIT'];
const isAdd = v => typeof v === 'string' && v.startsWith('add_');
const expectFor = (setup, input) => {
  const n = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return ROWS[setup].allowed.includes(n) ? n : ROWS[setup].fallback;
};

// Snapshots that the REAL classifyTechnicalSetup maps to each setup (sanity-asserted in the preamble).
const SNAPS = {
  extended_near_ath:        { pct20: 12, pct50: 20, pct150: 30, high1yDist: -2 },
  healthy_uptrend_near_ath: { pct20: 5,  pct50: 10, pct150: 15, high1yDist: -6 },
  healthy_uptrend:          { pct20: 5,  pct50: 10, pct150: 15, high1yDist: -20 },
  support_test:             { pct20: -2, pct50: 1,  pct150: 10, high1yDist: -20 },
  pullback_in_uptrend:      { pct20: -2, pct50: 5,  pct150: 10, high1yDist: -20 },
  breakdown_risk:           { pct20: -5, pct50: -4, pct150: 0,  high1yDist: -20 },
  below_key_mas:            { pct20: -5, pct50: -8, pct150: -10, high1yDist: -20 },
  unknown:                  {}
};
for (const k of Object.keys(SNAPS)) if (k !== 'unknown') Object.assign(SNAPS[k], { sma20: 180, sma50: 170, sma150: 160, rsSPY: 2.5, rsQQQ: -0.5, rsSector: 1.5, volRatio: 1.1 });
const SETUPS = Object.keys(SNAPS);
const SUMMARY = 'This is a valid synthetic summary body used purely for offline fixtures and exceeds fifty characters.';

// ── Sandbox ──────────────────────────────────────────────────────────────────────────────────────────────────────
function build(orchSrc, classSrc) {
  const spy = { warns: [] };
  const con = { log() {}, error() {}, warn(...a) { spy.warns.push(a.join(' ')); } };
  const body = [
    'const _extendedMktCache = {}; const window = {};',
    'function findTicker() { return null; } function formatNewsContext() { return ""; }',
    classSrc, orchSrc, 'return orchestrate;'
  ].join('\n');
  const FIXED = { toISOString: () => '2026-10-22T00:00:00.000Z' };
  function FixedDate() { return FIXED; }
  const orchestrate = new Function('Date', 'console', body)(FixedDate, con);
  return { orchestrate, spy };
}
function load(idx) {
  const orch = extractFn(idx, 'orchestrate');
  const cls = extractFn(idx, 'classifyTechnicalSetup');
  if (!orch || !cls) throw new Error('orchestrate / classifyTechnicalSetup not found in index.html');
  return { orch, cls, sb: build(orch, cls) };
}
function mkItem(over, action) {
  const it = Object.assign({ ticker: 'TST', company_name: 'Test Co', sentiment: 'neutral', sentiment_score: 70, summary: SUMMARY, alerts: [], news: [], key_risk: '', news_bias: 'neutral' }, over || {});
  if (action !== MISSING) it.action = action;
  return it;
}
function run(sb, setup, action, over, chg) {
  sb.spy.warns = [];
  const stock = { TST: { price: 190.01, change_percent: chg === undefined ? 0 : chg, source: 'yahoo', marketState: 'REGULAR' } };
  const out = sb.orchestrate([mkItem(over, action)], {}, stock, { TST: SNAPS[setup] })[0];
  return { out, warns: sb.spy.warns.slice() };
}
const lbl = v => (v === MISSING ? '<missing>' : JSON.stringify(v));
function guard(fn) { try { return fn(); } catch (e) { return ['threw: ' + String(e && e.message || e).slice(0, 160)]; } }

// ── Rows: each takes the (possibly mutated) LF-normalised index.html and returns failures (empty = pass) ─────────
const GROUPS = {};

GROUPS['SG-1'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const setup of GATED) {
    for (const input of INPUTS.concat(setup === 'extended_near_ath' ? [] : [7])) {
      const got = run(sb, setup, input).out.action;
      const want = expectFor(setup, input);
      if (got !== want) f.push(`${setup} ${lbl(input)} -> ${lbl(got)}, want ${want}`);
    }
  }
  return f;
});

GROUPS['SG-2'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const input of INPUTS.concat([7])) {
    if (input === 7) continue; // the existing below_key_mas gate maps every input; a non-string is outside the pinned domain
    const got = run(sb, 'below_key_mas', input).out.action;
    if (got !== 'avoid') f.push(`below_key_mas ${lbl(input)} -> ${lbl(got)}, want avoid`);
  }
  return f;
});

GROUPS['SG-3'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const setup of GATED) {
    for (const input of INPUTS.concat(setup === 'extended_near_ath' ? [] : [7])) {
      const got = run(sb, setup, input).out.action;
      const n = typeof input === 'string' ? input.trim().toLowerCase() : '';
      const validAdd = ROWS[setup].allowed.includes(n) && isAdd(n);
      if (!isAdd(input) && !isAdd(n) && isAdd(got)) f.push(`${setup} ${lbl(input)}: non-add became ${got}`);
      if (isAdd(n) && !validAdd && isAdd(got)) f.push(`${setup} ${lbl(input)}: invalid add became ${got}`);
      if (validAdd && got !== n) f.push(`${setup} ${lbl(input)}: valid add changed to ${lbl(got)}`);
    }
  }
  return f;
});

GROUPS['SG-4'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const setup of GATED) {
    for (const input of INPUTS.concat(setup === 'extended_near_ath' ? [] : [7])) {
      const got = run(sb, setup, input).out.action;
      const n = typeof input === 'string' ? input.trim().toLowerCase() : '';
      if ((n === 'trim' || n === 'avoid') && got !== n) f.push(`${setup} ${lbl(input)} -> ${lbl(got)}, risk warning not kept`);
      if (n !== 'trim' && got === 'trim') f.push(`${setup} ${lbl(input)} -> trim written from a non-trim input`);
    }
  }
  return f;
});

GROUPS['SG-5a'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const input of INPUTS.concat([7])) {
    const out = run(sb, 'unknown', input).out;
    const same = input === MISSING ? !('action' in out) : out.action === input;
    if (!same) f.push(`unknown ${lbl(input)} -> ${lbl(out.action)}, want unchanged`);
  }
  return f;
});

GROUPS['SG-5b'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const claim of SETUPS.concat(['made_up_setup'])) {
    const got = run(sb, 'unknown', 'hold_wait', { technical_setup: claim }).out.technical_setup;
    if (got !== 'unknown') f.push(`code unknown + AI claim ${claim} -> ${got}, want unknown`);
  }
  for (const setup of SETUPS.filter(s => s !== 'unknown')) {
    const got = run(sb, setup, 'hold_wait', { technical_setup: 'healthy_uptrend' === setup ? 'breakdown_risk' : 'healthy_uptrend' }).out.technical_setup;
    if (got !== setup) f.push(`deterministic ${setup} lost to the AI claim (${got})`);
  }
  return f;
});

GROUPS['SG-6'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  const a = run(sb, 'unknown', 'hold_wait', { technical_setup: 'extended_near_ath', sentiment_score: 90 }).out;
  if (a.sentiment_score !== 90) f.push(`AI-claimed extended_near_ath + code unknown: score ${a.sentiment_score}, want 90`);
  const b = run(sb, 'extended_near_ath', 'buy', { sentiment_score: 90 }).out;
  if (b.sentiment_score !== 62) f.push(`code extended_near_ath: score ${b.sentiment_score}, want 62`);
  if (b.action !== 'hold_wait') f.push(`code extended_near_ath: action ${lbl(b.action)}, want hold_wait`);
  return f;
});

GROUPS['SG-7'] = idx => guard(() => {
  const { sb, cls } = load(idx); const f = [];
  const classify = new Function(cls + '\nreturn classifyTechnicalSetup;')();
  for (const setup of SETUPS) {
    for (const action of [MISSING, 'buy', 'add_on_pullback', 'hold']) {
      const over = { sentiment_score: null, _aiUnavailable: true };
      const out = run(sb, setup, action, over).out;
      // a failed item carries no action key at all when none was supplied (R-3 / Entry 36)
      if (action === MISSING && 'action' in out) f.push(`failed ${setup}: action key written (${lbl(out.action)})`);
      if (action !== MISSING && out.action !== action) f.push(`failed ${setup} ${lbl(action)} -> ${lbl(out.action)}, want untouched`);
      if (out.technical_setup !== classify(SNAPS[setup])) f.push(`failed ${setup}: setup ${out.technical_setup}`);
      if (out.sentiment_score !== null) f.push(`failed ${setup}: score ${out.sentiment_score}, want null`);
    }
  }
  return f;
});

// SG-8: the oracle is the task function with the gate block removed and the DR-2 line restored.
const SG8_EXCLUDED = ['action', 'technical_setup', '_orchestratedAt'];
function stripBlock(orchSrc) {
  const b = orchSrc.indexOf(BEGIN); const e = orchSrc.indexOf(END);
  if (b < 0 || e < 0 || e < b) throw new Error('gate block markers absent');
  const from = orchSrc.lastIndexOf('\n', b) + 1;
  const to = orchSrc.indexOf('\n', e) + 1;
  return orchSrc.slice(0, from) + orchSrc.slice(to);
}
GROUPS['SG-8'] = idx => guard(() => {
  const { orch, cls, sb } = load(idx); const f = [];
  let oracleSrc = stripBlock(orch);
  if (countOf(oracleSrc, DR2_NEW) !== 1) throw new Error('DR-2 line absent or not unique in the task source');
  oracleSrc = oracleSrc.replace(DR2_NEW, () => DR2_OLD);
  const oracle = build(oracleSrc, cls);
  const cases = [];
  const ACTIONS = [...ENUM, 'buy', null, 'strong_buy'];
  for (const setup of SETUPS) for (const chg of [-7, 0, 7]) for (const score of [0, 30, 70, 90]) for (const action of ACTIONS)
    for (const bias of ['bullish', 'neutral', 'bearish']) for (const kr of ['', 'Some key risk.']) cases.push({ setup, chg, score, action, bias, kr });
  if (!(cases.length >= 1000)) return ['fewer than 1000 cases: ' + cases.length];
  const strip = o => {
    const c = JSON.parse(JSON.stringify(o));
    for (const k of SG8_EXCLUDED) delete c[k];
    if (c._auditTrail && c._auditTrail.finalDecision) delete c._auditTrail.finalDecision.action;
    return JSON.stringify(c);
  };
  for (const c of cases) {
    const over = { sentiment_score: c.score, news_bias: c.bias, key_risk: c.kr };
    const a = strip(run(sb, c.setup, c.action, over, c.chg).out);
    const b = strip(run(oracle, c.setup, c.action, over, c.chg).out);
    if (a !== b && f.length < 5) f.push(`${c.setup} chg ${c.chg} score ${c.score} ${lbl(c.action)}: differs from the gate-removed oracle`);
    else if (a !== b) f.push('+');
  }
  return f;
});

GROUPS['SG-9'] = idx => guard(() => {
  const { sb } = load(idx); const f = [];
  for (const setup of GATED.concat(['below_key_mas', 'unknown'])) {
    for (const input of INPUTS.concat(setup === 'extended_near_ath' ? [] : [7])) {
      const { out, warns } = run(sb, setup, input);
      const initial = input === MISSING ? undefined : input;
      const overrides = warns.filter(w => w.includes('action override'));
      // the specified final action: gated rows per the section-1 table, row 7 -> avoid, unknown unchanged
      const want = ROWS[setup] ? expectFor(setup, input) : (setup === 'below_key_mas' ? 'avoid' : initial);
      if (out.action !== want) f.push(`${setup} ${lbl(input)}: action ${lbl(out.action)}, want ${lbl(want)}`);
      const changed = want !== initial;
      if (out._auditTrail.finalDecision.action !== (out.action || null)) f.push(`${setup} ${lbl(input)}: audit action ${lbl(out._auditTrail.finalDecision.action)}`);
      if (overrides.length !== (changed ? 1 : 0)) f.push(`${setup} ${lbl(input)}: ${overrides.length} override warns, changed=${changed}`);
      if (changed && overrides.length === 1) {
        const want = `[PT] Orchestrate: action override TST ${setup} → ${out.action} (was: ${initial})`;
        if (overrides[0] !== want) f.push(`${setup} ${lbl(input)}: warn form "${overrides[0]}"`);
      }
    }
  }
  return f;
});

GROUPS['SG-10'] = idx => guard(() => {
  const f = [];
  const orch = extractFn(idx, 'orchestrate');
  if (!orch) return ['orchestrate not found'];
  if (countOf(idx, SIG) !== 1) f.push('orchestrate signature changed or duplicated');
  for (const [name, m] of [['begin', BEGIN], ['end', END]]) {
    if (countOf(idx, m) !== 1) f.push(`${name} marker occurs ${countOf(idx, m)} times in index.html, want 1`);
    if (countOf(orch, m) !== 1) f.push(`${name} marker is not inside orchestrate`);
  }
  const b = orch.indexOf(BEGIN); const e = orch.indexOf(END);
  const block = (b >= 0 && e > b) ? orch.slice(b, e + END.length) : '';
  if (!block) f.push('gate block not delimited by the two markers');
  for (const t of TABLE_NAMES) {
    if (!block.includes(t)) f.push(`table ${t} is not in the block`);
    if (new RegExp('^(?:var|let|const|function)\\s+' + t + '\\b', 'm').test(idx)) f.push(`top-level declaration of ${t}`);
    if (countOf(idx, t) !== countOf(orch, t)) f.push(`${t} is used outside orchestrate`);
  }
  const FORBIDDEN = /sentiment|_techCache|(?:^|[^A-Za-z0-9])_ath|_nlmConsistencyChecks|localStorage|(?:^|[^A-Za-z0-9])pt_|market-structure|analyzeMarketStructure/;
  if (block && FORBIDDEN.test(block)) f.push('forbidden name in the gate block: ' + block.match(FORBIDDEN)[0].trim());
  for (const l of R3_LINES) if (countOf(orch, l) !== 1) f.push('R-3 line count != 1: ' + l.trim().slice(0, 70));
  if (countOf(orch, DR2_NEW) !== 1) f.push('DR-2 line (setup always deterministic) not present exactly once');
  if (countOf(orch, DR2_OLD) !== 0) f.push('the pre-DR-2 setup line is still present');
  const mism = IDX_CORE.entryMismatches(idx, IDX_MAP, ['functions.fetchAnthropicAnalysis', 'functions.renderMainPanel', 'functions.classifyTechnicalSetup']);
  if (mism && mism.length) f.push('pin-map mismatch: ' + JSON.stringify(mism).slice(0, 160));
  return f;
});

// ── Planted negatives: [id, group, edits[[old,new]...]] on the LF-normalised production source ───────────────────
const ALLOWED_R2 = "        healthy_uptrend_near_ath: ['hold_wait', 'add_on_pullback', 'trim', 'avoid'],\n";
const NEGATIVES = [
  ['PN-1', 'SG-1', [[ALLOWED_R2, '']]],
  ['PN-2', 'SG-3', [["healthy_uptrend_near_ath: 'hold_wait',", "healthy_uptrend_near_ath: 'add_on_pullback',"]]],
  ['PN-3', 'SG-4', [["'add_on_breakout', 'trim', 'avoid'],", "'add_on_breakout', 'avoid'],"]]],
  ['PN-4', 'SG-5a', [["        breakdown_risk:           ['trim', 'avoid']\n", "        breakdown_risk:           ['trim', 'avoid'],\n        unknown:                  ['hold_wait']\n"], ["breakdown_risk: 'avoid' };", "breakdown_risk: 'avoid', unknown: 'hold_wait' };"]]],
  ['PN-5', 'SG-5b', [[DR2_NEW, DR2_OLD]]],
  ['PN-5b', 'SG-6', [[DR2_NEW, DR2_OLD]]],
  ['PN-6', 'SG-7', [["if (item._aiUnavailable !== true) {\n      const _sagAllowed = {", "if (true) {\n      const _sagAllowed = {"]]],
  ['PN-7', 'SG-8', [["          item.action = _sagNow;\n", "          item.action = _sagNow;\n          item.sentiment_score = 50;\n"]]],
  ['PN-7b', 'SG-10', [["          item.action = _sagNow;\n", "          item.action = _sagNow;\n          item.sentiment_score = 50;\n"]]],
  ['PN-8', 'SG-1', [["_sagWas.trim().toLowerCase()", "_sagWas"]]],
  ['PN-9', 'SG-9', [["          console.warn(`[PT] Orchestrate: action override ${sym} ${_setup6a} → ${_sagNow} (was: ${_sagWas})`);\n", '']]],
  ['PN-10', 'SG-10', [[SIG, 'var _sagAllowed = {};\n' + SIG]]]
];
function mutate(idx, edits) {
  let s = idx;
  for (const [a, b] of edits) {
    if (countOf(s, a) !== 1) throw new Error('planted-negative anchor not unique/absent: ' + JSON.stringify(a.slice(0, 70)));
    s = s.replace(a, () => b);
  }
  return s;
}

// ── Runner ───────────────────────────────────────────────────────────────────────────────────────────────────────
const idx = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
let failed = 0;
const say = (ok, label, detail) => { if (!ok) failed += 1; console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  ' + detail : '')); };

// fixture sanity: the real classifier maps every snapshot to its setup
{
  const cls = extractFn(idx, 'classifyTechnicalSetup');
  const classify = new Function(cls + '\nreturn classifyTechnicalSetup;')();
  const bad = SETUPS.filter(s => classify(SNAPS[s]) !== s);
  say(bad.length === 0, 'fixture sanity: snapshots map to their setups through the real classifier', bad.join(','));
}

const ids = ['SG-1', 'SG-2', 'SG-3', 'SG-4', 'SG-5a', 'SG-5b', 'SG-6', 'SG-7', 'SG-8', 'SG-9', 'SG-10'];
const baseline = {};
for (const id of ids) {
  const f = GROUPS[id](idx);
  baseline[id] = f;
  say(f.length === 0, id, f.length ? `${f.length} failure(s); first: ${f[0]}` : '');
}
for (const [id, group, edits] of NEGATIVES) {
  let detail = ''; let ok;
  try {
    const mutated = mutate(idx, edits);
    const f = GROUPS[group](mutated);
    ok = baseline[group].length === 0 && f.length > 0;
    if (baseline[group].length) detail = `positive control ${group} is not green`;
    else if (!f.length) detail = `${group} did not fail on the mutation`;
  } catch (e) { ok = false; detail = String(e.message || e); }
  say(ok, `negative ${id} -> ${group} fail`, detail);
}

if (failed) { console.log(`SCAN ACTION GATE OFFLINE: FAIL (${failed} failing)`); process.exit(1); }
console.log(`SCAN ACTION GATE OFFLINE: PASS (${ids.length} rows, ${NEGATIVES.length} negatives)`);
