'use strict';

/*
 * analyst-parser-r4a — offline QA for the item-by-item analyst-action parser.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL
 * parsePerplexityContext from index.html (brace matching, as in
 * qa/deep_dive_v0_offline.js) and runs it verbatim in a sandbox with a silent
 * console and no fetch / document / window / localStorage in scope.
 *
 * Fixture: qa/fixtures/analyst-parser/cases.json — 42 cases, each with the exact
 * expected analystActions / ratingOnlyActions (without raw). Copied, never edited.
 *
 * Rows AP-1 .. AP-14 map 1:1 to the brief's section 5 table.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'analyst-parser', 'cases.json');

let failures = 0;
let asserts = 0;
function check(name, cond, detail) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
  }
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const lf = s => s.replace(/\r\n/g, '\n');

function extractFunctionSource(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const ASYNC = 'async ';
  const realStart = (start >= ASYNC.length && content.slice(start - ASYNC.length, start) === ASYNC)
    ? start - ASYNC.length : start;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start: realStart, end: i + 1, source: content.slice(realStart, i + 1) };
    }
  }
  return null;
}

// Canonical JSON: sorted keys, so key order never matters to a deep-equal.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const stripRaw = rows => (rows || []).map(r => { const c = Object.assign({}, r); delete c.raw; return c; });
const bat = rows => (rows || []).map(r => ({ bank: r.bank, action: r.action, target: r.target }));

// -- Pins captured at Step 0 from the baseline index.html (dd51188), LF-normalised --
const PIN_MASKED_FILE = '23d5cb6ea9e6ce07f1f88f7675efc32c1500309529dd1f0e869aa7143b97f399';
const PIN_ALLNONE_EXPR = '998a9fc01dfa6386913a75e3757349ecf5234b84eb0cc99e922dbb09f004f3e8';
const PIN_FETCH_PPLX = '08c0d05765e5f07c138559978312bf6806dae72d5a16194cec2fbc93cb1b8e0d';
const PIN_FIXTURE = 'f01adf53c416547b4e68e63df36a1b701a588225b866cfe1c5daa043b13bf268';

// -- AP-11 literals: baseline-parser bank/action/target for the 25 cases whose legacy output is correct --
const LEGACY_25 = {"1a":[{"bank":"Morgan Stanley","action":"raised","target":545}],"2a":[{"bank":"Goldman Sachs","action":"cut","target":485}],"3a":[{"bank":"JPMorgan","action":"upgraded","target":250}],"3b":[{"bank":"JPMorgan","action":"upgraded","target":250}],"4a":[{"bank":"Bank of America","action":"downgraded","target":120}],"4b":[],"5a":[{"bank":"Wells Fargo","action":"initiated","target":426}],"5b":[{"bank":"Piper Sandler","action":"initiated","target":300}],"7a":[{"bank":"Goldman Sachs","action":"cut","target":485},{"bank":"Deutsche Bank","action":"raised","target":500}],"7b":[{"bank":"Goldman Sachs","action":"cut","target":485},{"bank":"Deutsche Bank","action":"raised","target":500}],"8e":[{"bank":"jefferies","action":"raised","target":90}],"8g":[{"bank":"BofA","action":"raised","target":260},{"bank":"RBC Capital Markets","action":"cut","target":240}],"8i":[{"bank":"Barclays","action":"lowered","target":95}],"8j":[{"bank":"Goldman Sachs","action":"cut","target":485}],"8k":[{"bank":"UBS","action":"raised","target":120},{"bank":"UBS","action":"cut","target":100}],"8l":[{"bank":"Daiwa","action":"cut","target":245}],"9a":[{"bank":"Mizuho","action":"raised","target":210}],"9b":[{"bank":"Needham","action":"boosted","target":95}],"10a":[],"11c":[{"bank":"Truist","action":"set","target":50}],"11d":[{"bank":"Goldman Sachs","action":"cut","target":485},{"bank":"Deutsche Bank","action":"raised","target":500}],"11g":[{"bank":"A1 Bank","action":"raised","target":10},{"bank":"B2 Bank","action":"raised","target":11},{"bank":"C3 Bank","action":"raised","target":12},{"bank":"D4 Bank","action":"raised","target":13},{"bank":"E5 Bank","action":"raised","target":14}],"11h":[],"X1":[],"X2":[]};

const rawIndex = fs.readFileSync(INDEX_PATH, 'utf8');
const content = lf(rawIndex);
const ext = extractFunctionSource(content, 'parsePerplexityContext');
if (!ext) {
  console.log('  FAIL  could not extract parsePerplexityContext from index.html');
  console.log('ANALYST PARSER OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}
const fixtureText = fs.readFileSync(FIXTURE_PATH, 'utf8');
const cases = JSON.parse(fixtureText);

const quiet = { log: function () {}, warn: function () {}, error: function () {} };
// eslint-disable-next-line no-new-func
const parsePerplexityContext = new Function('console', ext.source + '\nreturn parsePerplexityContext;')(quiet);

function parseCase(input) {
  return parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: ' + input + '\nEARNINGS: NONE\n').TST;
}
const got = {};
for (const c of cases) got[c.id] = parseCase(c.input);
const roOf = res => (res && res.ratingOnlyActions) || [];
const A = id => got[id].analystActions || [];
const R = id => got[id].ratingOnlyActions || [];

// -- FX-1 fixture integrity (brief section 5: exact copy, 42 cases) --
check('FX-1 fixture is the exact held copy (sha256, LF-normalised)', sha256(lf(fixtureText)) === PIN_FIXTURE);
check('FX-1 fixture holds 42 cases', Array.isArray(cases) && cases.length === 42);

// -- AP-1: all 42 cases deep-equal the fixture (ignoring raw); raw is a string <= 100 chars --
{
  const bad = [];
  const btaBad = [];
  const structMissing = [];
  const roMissing = [];
  for (const c of cases) {
    const a = got[c.id];
    const okA = canon(stripRaw(a.analystActions)) === canon(c.expected.analystActions);
    const okR = canon(stripRaw(a.ratingOnlyActions)) === canon(c.expected.ratingOnlyActions);
    if (!okA || !okR) bad.push(c.id);
    if (canon(bat(a.analystActions)) !== canon(bat(c.expected.analystActions))) btaBad.push(c.id);
    if (c.expected.analystActions.length &&
        !(a.analystActions || []).every(r => 'ratingAction' in r && 'rating' in r && 'ptAction' in r && 'ptFrom' in r)) structMissing.push(c.id);
    if (c.expected.ratingOnlyActions.length > (a.ratingOnlyActions || []).length) roMissing.push(c.id);
  }
  check('AP-1 all 42 cases deep-equal the fixture (analystActions + ratingOnlyActions, raw ignored)', bad.length === 0,
    bad.length + ' case(s) differ: ' + bad.join(' ') +
    '\n        legacy bank/action/target mismatches (' + btaBad.length + '): ' + btaBad.join(' ') +
    '\n        cases with missing structured fields (' + structMissing.length + ')' +
    '\n        missing rating-only events (' + roMissing.length + '): ' + roMissing.join(' '));
  const rawBad = [];
  for (const c of cases) {
    for (const r of (got[c.id].analystActions || []).concat(got[c.id].ratingOnlyActions || [])) {
      if (typeof r.raw !== 'string' || r.raw.length > 100) rawBad.push(c.id);
    }
  }
  check('AP-1 every row raw is a string of at most 100 characters', rawBad.length === 0, rawBad.join(' '));
}

// -- AP-2: regression ROK (8a) --
{
  const rows = stripRaw(A('8a'));
  const want = [
    ['Goldman Sachs', 'cut', 485, 'maintained', 'Neutral'],
    ['Deutsche Bank', 'raised', 500, 'maintained', 'Equal Weight'],
    ['UBS', 'initiated', 475, 'initiated', 'Hold'],
    ['Wells Fargo', 'initiated', 426, 'initiated', 'Equal Weight']
  ];
  check('AP-2 ROK: exactly 4 rows', rows.length === 4);
  want.forEach((w, i) => {
    const r = rows[i] || {};
    check('AP-2 ROK row ' + (i + 1) + ' ' + w[0] + ' ' + w[1] + ' ' + w[2] + ' (' + w[3] + ', ' + w[4] + ')',
      r.bank === w[0] && r.action === w[1] && r.target === w[2] && r.ratingAction === w[3] && r.rating === w[4]);
  });
  check('AP-2 ROK: no row has bank "and"', rows.every(r => String(r.bank).toLowerCase() !== 'and'));
}

// -- AP-3: regression CBOE (8b) --
{
  const g = A('8b').find(r => r.bank === 'Goldman Sachs') || {};
  check('AP-3 CBOE Goldman Sachs: action cut, ratingAction upgraded, rating Neutral, ptAction cut, target 300',
    g.action === 'cut' && g.ratingAction === 'upgraded' && g.rating === 'Neutral' && g.ptAction === 'cut' && g.target === 300);
  const p = A('8b').find(r => r.bank === 'Piper Sandler') || {};
  check('AP-3 CBOE Piper Sandler: action maintained, ptAction null, target 320',
    p.action === 'maintained' && p.ptAction === null && p.target === 320);
}

// -- AP-4: regression MRNA (8c) --
{
  const c = A('8c')[0] || {};
  check('AP-4 MRNA Citigroup: action raised, ratingAction downgraded, rating Sell, ptAction raised, target 80',
    A('8c').length === 1 && c.bank === 'Citigroup' && c.action === 'raised' && c.ratingAction === 'downgraded' &&
    c.rating === 'Sell' && c.ptAction === 'raised' && c.target === 80);
}

// -- AP-5: from/to --
{
  const ft = (id, to, from) => { const r = A(id)[0] || {}; return r.target === to && r.ptFrom === from; };
  check('AP-5 6a target 315 ptFrom 300', ft('6a', 315, 300));
  check('AP-5 6b target 315 ptFrom 300', ft('6b', 315, 300));
  check('AP-5 11e target 545 ptFrom 480', ft('11e', 545, 480));
  check('AP-5 8d (to $Y, from $X) target 485 ptFrom 520', ft('8d', 485, 520));
  check('AP-5 8i (to $Y from $X) target 95 ptFrom 110', ft('8i', 95, 110));
  check('AP-5 11b "by $10 to $300" target 300 ptFrom null', ft('11b', 300, null));
}

// -- AP-6: unrelated amounts are never targets --
for (const id of ['10b', '10c']) {
  check('AP-6 ' + id + ': no analystActions row and one rating-only row', A(id).length === 0 && R(id).length === 1);
}

// AP-6 (P1 amounts): an amount followed by B / M / K / bn / mn / billion / million / thousand is never a target,
// even next to a target word.
for (const s of ['Citi raised its revenue target to $2.3B', 'Citi raised its PT to $2.3 billion', 'Citi raised PT to $300M', 'Citi raised PT to $5k']) {
  const r = parseCase(s);
  check('AP-6 suffixed amount is not a target: ' + s, r.analystActions.length === 0);
}
// P1 verb vocabulary: "Reduce" as a rating must not become the target verb.
{
  const r = parseCase('UBS downgraded to Reduce and cut PT to $50').analystActions[0] || {};
  check('AP-1 "downgraded to Reduce and cut PT to $50" gives ptAction cut, rating Reduce',
    r.ptAction === 'cut' && r.action === 'cut' && r.rating === 'Reduce' && r.ratingAction === 'downgraded' && r.target === 50);
}
// P2: the whole ANALYST_ACTIONS field is read, up to the next template label; labels are found as _readField finds them.
{
  const bank = res => res.TST.analystActions.map(a => a.bank).join(',');
  check('AP-1 P2 bulleted lowercase label and a following bulleted template label',
    bank(parsePerplexityContext('TICKER: TST\n- analyst_actions: Goldman cut PT to $5\n- Deutsche raised PT to $6\n- BULLISH: UBS raised PT to $9\nEARNINGS: NONE\n')) === 'Goldman,Deutsche');
  check('AP-1 P2 empty first value reads the following lines',
    bank(parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS:\n- Goldman cut PT to $5\n- Deutsche raised PT to $6\nBULLISH: NONE\n')) === 'Goldman,Deutsche');
  check('AP-1 P2 a first value of NONE yields no rows',
    parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: NONE\nUBS raised PT to $9\n').TST.analystActions.length === 0);
}

// -- AP-7: rating-only preserved --
for (const id of ['4b', '10a', '10b', '10c', 'X1']) {
  check('AP-7 ' + id + ': exactly one ratingOnlyActions row with no target key',
    R(id).length === 1 && !('target' in R(id)[0]));
}

// -- AP-8: no ceiling --
check('AP-8 11a target 5600', A('11a').length === 1 && A('11a')[0].target === 5600);

// -- AP-9: firm names --
{
  const CONNECTOR_START = /^(and|while|whereas|but|also|meanwhile|plus|with)\b/i;
  const offenders = [];
  for (const c of cases) {
    for (const r of (got[c.id].analystActions || []).concat(got[c.id].ratingOnlyActions || [])) {
      if (CONNECTOR_START.test(r.bank)) offenders.push(c.id + ':' + r.bank);
    }
  }
  check('AP-9 no bank starts with a connector word', offenders.length === 0, offenders.join(' '));
  const b8f = A('8f').map(r => r.bank);
  check('AP-9 8f keeps "Stifel, Nicolaus & Co." and "Keefe, Bruyette & Woods"',
    b8f.length === 2 && b8f[0] === 'Stifel, Nicolaus & Co.' && b8f[1] === 'Keefe, Bruyette & Woods');
  check('AP-9 8e keeps "jefferies"', A('8e').length === 1 && A('8e')[0].bank === 'jefferies');
}

// -- AP-10: row shapes --
{
  const KA = canon(['bank', 'action', 'target', 'raw', 'ratingAction', 'rating', 'ptAction', 'ptFrom'].sort());
  const KR = canon(['bank', 'action', 'ratingAction', 'rating', 'raw'].sort());
  const badA = [];
  const badR = [];
  for (const c of cases) {
    for (const r of got[c.id].analystActions || []) {
      if (canon(Object.keys(r).sort()) !== KA || !(typeof r.target === 'number' && isFinite(r.target) && r.target > 0)) badA.push(c.id);
    }
    for (const r of got[c.id].ratingOnlyActions || []) {
      if (canon(Object.keys(r).sort()) !== KR) badR.push(c.id);
    }
  }
  check('AP-10 every analystActions row has exactly the 8 keys and a finite target > 0', badA.length === 0, badA.join(' '));
  check('AP-10 every ratingOnlyActions row has exactly the 5 keys', badR.length === 0, badR.join(' '));
  check('AP-10 the ratingOnlyActions array exists on every parsed ticker', cases.every(c => Array.isArray(got[c.id].ratingOnlyActions)));
}

// -- AP-11: legacy compatibility for the 25 currently-correct cases --
{
  const ids = Object.keys(LEGACY_25);
  check('AP-11 literal set covers 25 cases', ids.length === 25);
  const changed = ids.filter(id => canon(bat(A(id))) !== canon(LEGACY_25[id]));
  check('AP-11 bank / action / target unchanged for all 25 legacy-correct cases', changed.length === 0, changed.join(' '));
}

// -- AP-12: determinism, de-duplication, cap --
{
  const diff = cases.filter(c => JSON.stringify(parseCase(c.input)) !== JSON.stringify(parseCase(c.input))).map(c => c.id);
  check('AP-12 two parses of every case are identical', diff.length === 0, diff.join(' '));
  check('AP-12 8j duplicate collapses to one row', A('8j').length === 1);
  check('AP-12 8k two targets kept in input order', A('8k').length === 2 && A('8k')[0].target === 120 && A('8k')[1].target === 100);
  check('AP-12 11g capped at 5', A('11g').length === 5);
  const ro = roOf(parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: UBS upgraded to Buy from Neutral | UBS upgraded to Buy from Hold | UBS upgraded to Sell from Neutral\nEARNINGS: NONE\n').TST);
  check('AP-12 ratingOnlyActions de-duplicated by bank|ratingAction|rating (first wins)',
    ro.length === 2 && ro[0].rating === 'Buy' && ro[1].rating === 'Sell');
  const ro6 = [1, 2, 3, 4, 5, 6].map(i => 'Firm' + String.fromCharCode(64 + i) + ' upgraded to Buy').join(' | ');
  check('AP-12 ratingOnlyActions capped at 5',
    roOf(parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: ' + ro6 + '\nEARNINGS: NONE\n').TST).length === 5);
}

// -- AP-13: _allNone unchanged --
{
  const only = parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: UBS upgraded to Buy from Neutral (Oct 2)\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n').TST;
  check('AP-13 a block whose only analyst content is rating-only has _allNone === true',
    only._allNone === true && only.analystActions.length === 0 && roOf(only).length === 1);
  const withTarget = parsePerplexityContext('TICKER: TST\nANALYST_ACTIONS: UBS raised PT to $120 (Oct 2)\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n').TST;
  check('AP-13 a block with a target row has _allNone === false', withTarget._allNone === false);
  const startAll = ext.source.indexOf('result[currentTicker]._allNone = (');
  const endAll = startAll === -1 ? -1 : ext.source.indexOf(');', startAll);
  const expr = startAll === -1 || endAll === -1 ? '' : ext.source.slice(startAll, endAll + 2);
  check('AP-13 the _allNone expression is byte-equal to the baseline (sha256 pin)', sha256(expr) === PIN_ALLNONE_EXPR);
  const filler = 'General commentary line that carries no analyst content at all.\n';
  const rawRo = parsePerplexityContext(filler + 'UBS upgraded to Buy from Neutral (Oct 2)\n').__raw__;
  check('AP-13 __raw__ fallback: rating-only row present, analystActions empty, _allNone true',
    !!rawRo && rawRo.analystActions.length === 0 && Array.isArray(rawRo.ratingOnlyActions) &&
    roOf(rawRo).length === 1 && rawRo._allNone === true);
  const rawT = parsePerplexityContext(filler + 'Goldman Sachs cut PT to $485 and maintained Neutral (Sep 30)\n').__raw__;
  check('AP-13 __raw__ fallback: target row extracted, _allNone false',
    !!rawT && rawT.analystActions.length === 1 && rawT.analystActions[0].target === 485 && rawT._allNone === false);
}

// -- AP-14: static isolation --
{
  const masked = content.slice(0, ext.start) + '/*MASKED*/' + content.slice(ext.end);
  check('AP-14 every function other than parsePerplexityContext is byte-equal to the baseline (masked-file sha256 pin)',
    sha256(masked) === PIN_MASKED_FILE);
  const fp = extractFunctionSource(content, 'fetchPerplexityContext');
  check('AP-14 fetchPerplexityContext (query literal) is byte-equal to the baseline', !!fp && sha256(fp.source) === PIN_FETCH_PPLX);
  const hits = ext.source.match(/\b(localStorage|sessionStorage|fetch|document|window)\b/g);
  check('AP-14 parsePerplexityContext contains no localStorage / fetch / document / window', !hits, hits ? hits.join(',') : '');
}

console.log(failures === 0
  ? 'ANALYST PARSER OFFLINE: PASS (' + asserts + ' asserts)'
  : 'ANALYST PARSER OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
