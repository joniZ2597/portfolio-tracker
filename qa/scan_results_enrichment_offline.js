'use strict';

/*
 * Entry 10 (narrowed by Owner ruling 2026-09-26) — Scan Results row enrichment offline QA.
 *
 * Scope: HELD marker in the ticker cell of both result renderers. Scan Results must NOT
 * present Risk / Reward (they are score-derived, not independent metrics).
 * Real functions are extracted from index.html into a vm sandbox.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const content = fs.readFileSync(INDEX_PATH, 'utf8');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) { failures += 1; console.log('  FAIL  ' + name); }
}
function count(h, n) { return h.split(n).length - 1; }

function extractFunctionSource(c, name) {
  const start = c.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const braceStart = c.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < c.length; i += 1) {
    if (c[i] === '{') depth += 1;
    else if (c[i] === '}') { depth -= 1; if (depth === 0) return c.slice(start, i + 1); }
  }
  return null;
}

const FNS = ['_ptScoreNorm', '_ptScoreText', '_ptScoreCmp', '_ptScoreStates', '_ptScoreFillHtml',
  '_vscCellHtml', '_srGroupResults', '_crEsc', '_srHeldMap', '_srHeldHtml',
  '_srRenderGrouped', 'openScanResultsOverlay'];
const srcs = {};
for (const f of FNS) {
  srcs[f] = extractFunctionSource(content, f);
  check('extract ' + f, srcs[f] !== null);
}
if (FNS.some(f => srcs[f] === null)) {
  console.log('scan_results_enrichment_offline: ' + failures + ' failure(s) of ' + asserts);
  process.exit(1);
}

// Sandbox with a counted loadHoldings stub ('THROW' simulates a corrupt store).
function makeSandbox(holdings, results) {
  const state = { loadCalls: 0, tbody: { innerHTML: '' } };
  const els = { scanResultsOverlay: { style: {} }, srRows: state.tbody, srCount: { textContent: '' } };
  const ctx = {
    console,
    _cockpitResults: results,
    _srMode: 'ranked', _srDensity: 'regular',
    RATING_SUMMARY_RE: /Rating:\s*(Buy|Neutral|Sell)/i,
    _SR_BULLISH_TIER: new Set(['healthy_uptrend', 'healthy_uptrend_near_ath', 'pullback_in_uptrend']),
    _SR_BEARISH_TIER: new Set(['breakdown_risk', 'below_key_mas']),
    document: { getElementById: (id) => els[id] || null },
    loadHoldings: () => { state.loadCalls += 1; if (holdings === 'THROW') throw new Error('corrupt'); return holdings; },
    _srSafeParseResults: () => [],
  };
  vm.createContext(ctx);
  vm.runInContext(FNS.map(f => srcs[f]).join('\n'), ctx);
  return { ctx, state };
}

function nullProto(o) { return Object.assign(Object.create(null), o); }

const ITEMS = [
  { ticker: 'AAA', company_name: 'Alpha', sentiment_score: 80, technical_setup: 'healthy_uptrend', rating: 'Buy', _verifiedChangePct: 1.2 },
  { ticker: 'bbb', company_name: 'Beta', sentiment_score: 50, technical_setup: 'support_test', rating: 'Neutral' },
  { ticker: 'CCC', company_name: 'Gamma', sentiment_score: 20, technical_setup: 'breakdown_risk', rating: 'Sell' },
  { ticker: 'DDD', company_name: 'Delta', sentiment_score: null, technical_setup: 'extended_near_ath', rating: 'Neutral' },
];

function render(mode, holdings, items) {
  const { ctx, state } = makeSandbox(holdings, items || ITEMS);
  ctx._srMode = mode;
  vm.runInContext('openScanResultsOverlay()', ctx);
  return { html: state.tbody.innerHTML, loadCalls: state.loadCalls };
}
const rowsOf = (html) => html.split('<tr').slice(1).map(r => '<tr' + r);
const tickerOrder = (html) => (html.match(/data-ticker="([^"]*)"/g) || []).map(s => s.slice(13, -1));
const markers = (html) => count(html, 'class="sr-held"');

const held = nullProto({ AAA: { symbol: 'AAA' }, CCC: { symbol: 'CCC' } });

// ── SE-4 held marker is presentation only ───────────────────────────────────
for (const mode of ['ranked', 'review']) {
  const withH = render(mode, held);
  const noH = render(mode, nullProto({}));
  const heldTickers = rowsOf(withH.html).filter(r => r.includes('class="sr-held"')).map(r => tickerOrder(r)[0]).sort();
  check('SE-4 ' + mode + ': marker on exactly AAA, CCC', JSON.stringify(heldTickers) === JSON.stringify(['AAA', 'CCC']));
  check('SE-4 ' + mode + ': marker sits inside the sr-sym cell',
    withH.html.includes('<td class="sr-sym">AAA<span class="sr-held">HELD</span></td>'));
  check('SE-4 ' + mode + ': order identical to empty-holdings run', JSON.stringify(tickerOrder(withH.html)) === JSON.stringify(tickerOrder(noH.html)));
  check('SE-4 ' + mode + ': markup minus markers byte-identical to empty-holdings run',
    withH.html.split('<span class="sr-held">HELD</span>').join('') === noH.html);
  check('SE-4 control ' + mode + ': empty holdings => 0 markers', markers(noH.html) === 0);
  const thrown = render(mode, 'THROW');
  check('SE-4 control ' + mode + ': throwing holdings => 0 markers, no not-held text', markers(thrown.html) === 0 && !/not held/i.test(thrown.html));
  check('SE-4 ' + mode + ': lower-case row ticker matches upper-case holding', markers(render(mode, nullProto({ BBB: {} })).html) === 1);
  check('SE-4 ' + mode + ': prototype keys are not holdings',
    markers(render(mode, nullProto({}), [{ ticker: 'constructor', sentiment_score: 50 }, { ticker: 'toString', sentiment_score: 50 }]).html) === 0);
  check('SE-4 ' + mode + ': plain-object holdings do not match inherited keys',
    markers(render(mode, {}, [{ ticker: 'constructor', sentiment_score: 50 }]).html) === 0);
}

// ── SE-5 one holdings read per render ───────────────────────────────────────
for (const mode of ['ranked', 'review']) {
  check('SE-5 ' + mode + ': loadHoldings called exactly once (4 rows)', render(mode, held).loadCalls === 1);
  const many = Array.from({ length: 40 }, (_, i) => ({ ticker: 'T' + i, sentiment_score: i }));
  check('SE-5 ' + mode + ': still once for 40 rows', render(mode, held, many).loadCalls === 1);
}

// ── SE-3 grouping and order unchanged ───────────────────────────────────────
{
  const { ctx } = makeSandbox(nullProto({}), ITEMS);
  const groups = vm.runInContext('_srGroupResults(_cockpitResults)', ctx);
  const expected = groups.filter(g => g.items.length).flatMap(g => g.items.map(r => r.ticker));
  check('SE-3 review order equals _srGroupResults', JSON.stringify(tickerOrder(render('review', held).html)) === JSON.stringify(expected));
  const ranked = ITEMS.slice().sort(vm.runInContext('_ptScoreCmp', ctx)).map(r => r.ticker);
  check('SE-3 ranked order equals sort(_ptScoreCmp)', JSON.stringify(tickerOrder(render('ranked', held).html)) === JSON.stringify(ranked));
}

// ── SE-6 both renderers agree on the ticker-cell markup ─────────────────────
{
  const symCells = (html) => html.match(/<td class="sr-sym">.*?<\/td>/g).sort();
  const a = symCells(render('ranked', held).html);
  const b = symCells(render('review', held).html);
  check('SE-6 sr-sym cells identical in both renderers', a.length === 4 && JSON.stringify(a) === JSON.stringify(b));
  check('SE-6 control: a renderer missing the marker would differ',
    JSON.stringify(a) !== JSON.stringify(symCells(render('review', nullProto({})).html)));
}

// ── SE-RR Scan Results does not present Risk / Reward ───────────────────────
const RR_WORDS = /Risk\s*\/\s*Reward|sr-rr|LOW RISK|HIGH RISK|MODERATE|WATCH|LIMITED|>HIGH</;
for (const mode of ['ranked', 'review']) {
  check('SE-RR1 ' + mode + ': no Risk/Reward text or chip markup in rendered rows', !RR_WORDS.test(render(mode, held).html));
}
check('SE-RR1 control: the detector fires on chip markup', RR_WORDS.test('<span class="sr-rr-chip pos">LOW RISK</span>'));
{
  const tbodyAt = content.indexOf('id="srRows"');
  const theadStart = content.lastIndexOf('<thead>', tbodyAt);
  const thead = content.slice(theadStart, content.indexOf('</thead>', theadStart));
  check('SE-RR2 header has no Risk / Reward column and still 7 <th>', !/Risk\s*\/\s*Reward/i.test(thead) && (thead.match(/<th[ >]/g) || []).length === 7);
  check('SE-RR2 control: a header with the column fails', /Risk\s*\/\s*Reward/i.test(thead + '<th>Risk / Reward</th>'));
  const cells = (html) => (html.match(/<tr data-ticker[\s\S]*?<\/tr>/)[0].match(/<td/g) || []).length;
  check('SE-RR3 ranked row has 7 cells', cells(render('ranked', held).html) === 7);
  check('SE-RR3 review row has 6 cells', cells(render('review', held).html) === 6);
  check('SE-RR3 ranked empty colspan 7', render('ranked', held, []).html.includes('colspan="7"'));
  check('SE-RR3 review empty colspan 6', render('review', held, []).html.includes('colspan="6"'));
  check('SE-RR3 review group header colspan 6', render('review', held).html.includes('<tr class="sr-group-hdr"><td colspan="6">'));
}
const RR_CONSUME = /riskState|riskCls|rewardCls|\.reward\b|_ptScoreStates\s*\(/;
for (const f of ['_srRenderGrouped', 'openScanResultsOverlay', '_srHeldMap', '_srHeldHtml']) {
  check('SE-RR4 ' + f + ' does not consume risk/reward states', !RR_CONSUME.test(srcs[f]));
}
check('SE-RR4 control: a renderer reading riskState fails', RR_CONSUME.test(srcs._srRenderGrouped + 'riskState'));

// ── Score behaviour unchanged; Deep Dive Risk/Reward card untouched ─────────
check('score: Deep Dive Risk Level / Reward Potential rows still present',
  content.includes('<span class="rr-lbl">Risk Level</span>') && content.includes('<span class="rr-lbl">Reward Potential</span>'));
check('score: _ptScoreStates still returns risk/reward fields', /riskState:\s*s >= 65/.test(srcs._ptScoreStates));

// ── SE-8 density / SE-10 responsive: new CSS is inline-only, no layout edits ─
{
  const cssRules = content.match(/\.sr-held\s*\{[^}]*\}/g) || [];
  check('SE-8 exactly one .sr-held rule', cssRules.length === 1);
  const LAYOUT = /(display|position|width|min-width|flex-basis|padding|height|line-height)\s*:/;
  check('SE-8/10 .sr-held sets no display/position/width/min-width/flex-basis/padding/height/line-height', !LAYOUT.test(cssRules.join('')));
  check('SE-8 control: a min-width rule fails', LAYOUT.test('.sr-held{min-width:10px}'));
  check('SE-8 no <div> in held markup', !/<div/.test(srcs._srHeldHtml));
  const mediaBodies = [];
  for (let at = content.indexOf('@media'); at !== -1; at = content.indexOf('@media', at + 1)) {
    let depth = 0;
    let j = content.indexOf('{', at);
    for (; j < content.length; j += 1) {
      if (content[j] === '{') depth += 1;
      else if (content[j] === '}') { depth -= 1; if (!depth) break; }
    }
    mediaBodies.push(content.slice(at, j + 1));
  }
  check('SE-10 no @media rule targets sr- classes', mediaBodies.length > 0 && !mediaBodies.some(b => /\.sr-/.test(b)));
  check('SE-10 control: an @media body naming .sr-held is detected', /\.sr-/.test('@media(max-width:400px){.sr-held{display:none}}'));
}

// ── SE-9 no side effects ────────────────────────────────────────────────────
const SIDE = /localStorage\.setItem|saveHoldings|orchestrate|analyzeChunk|enforceScoreConsistency|inScan\s*=|\brsCls\b|\.rs\b/;
for (const f of ['_srRenderGrouped', 'openScanResultsOverlay', '_srHeldMap', '_srHeldHtml']) {
  check('SE-9 ' + f + ' has no writes/scoring calls', !SIDE.test(srcs[f]));
}
check('SE-9 control: a source with saveHoldings fails', SIDE.test(srcs._srHeldMap + 'saveHoldings()'));

if (failures) {
  console.log('scan_results_enrichment_offline: ' + failures + ' failure(s) of ' + asserts);
  process.exit(1);
}
console.log('scan_results_enrichment_offline: PASS (' + asserts + ' assertions)');
