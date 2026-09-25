'use strict';

/*
 * Entry 9 — UI hygiene bundle offline QA.
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

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');

// ── UH-1 dead control ────────────────────────────────────────────────────────
const uh1 = (c) => count(c, 'sb-wl-filter') === 0 && count(c, '⇅') === 0;
check('UH-1 no sb-wl-filter / ⇅ in index.html', uh1(content));
check('UH-1 control: fixture with the old button fails',
  !uh1('<button class="sb-wl-filter" title="Filter">⇅</button>'));

// ── UH-2 / UH-3 predicate field set vs disclosure ───────────────────────────
const PREDICATE_FNS = ['updateScanColToggle', 'toggleAllVisibleScanInclusion', 'renderWatchlistRows'];
const FIELD_TO_WORD = { symbol: 'ticker', name: 'company', exchange: 'exchange', sector: 'sector', sectorEtf: 'benchmark' };
const CONNECTIVE_WORDS = ['search', 'watchlist', 'matches', 'and', 'etf'];
const OTHER_FIELD_WORDS = ['industry', 'country', 'currency', 'price', 'description', 'market cap', 'analyst'];

// Field set of the `.filter(e => ... _filterQuery ...)` predicate inside one function.
function predicateFields(fnSrc) {
  if (!fnSrc) return null;
  const at = fnSrc.indexOf('.filter(e =>');
  if (at === -1) return null;
  const end = fnSrc.indexOf(');', at);
  const body = fnSrc.slice(at, end);
  const fields = [];
  const re = /\be\.([A-Za-z]+)/g;
  let m;
  while ((m = re.exec(body))) if (!fields.includes(m[1])) fields.push(m[1]);
  return fields.sort();
}
const EXPECTED_FIELDS = Object.keys(FIELD_TO_WORD).sort();
const sameSet = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

function uh3(c) {
  const sets = PREDICATE_FNS.map(fn => predicateFields(extractFunctionSource(c, fn)));
  return sets.every(s => sameSet(s, EXPECTED_FIELDS));
}
check('UH-3 all three predicates match exactly the 5 frozen fields', uh3(content));
check('UH-3 control: 4-field predicate fails',
  !sameSet(predicateFields('.filter(e => e.symbol.includes(q) || e.name || e.exchange || e.sector);'), EXPECTED_FIELDS));
check('UH-3 control: 6-field predicate fails',
  !sameSet(predicateFields('.filter(e => e.symbol.includes(q) || e.name || e.exchange || e.sector || e.sectorEtf || e.industry);'), EXPECTED_FIELDS));

function inputDisclosure(c) {
  const at = c.indexOf('id="tickerInput"');
  if (at === -1) return null;
  const tagStart = c.lastIndexOf('<input', at);
  const tagEnd = c.indexOf('/>', at);
  const tag = c.slice(tagStart, tagEnd);
  const ph = (tag.match(/placeholder="([^"]*)"/) || [, ''])[1];
  const ti = (tag.match(/\btitle="([^"]*)"/) || [, ''])[1];
  return (ph + ' ' + ti).toLowerCase();
}
function uh2(c) {
  const disclosed = inputDisclosure(c);
  if (disclosed === null) return false;
  const matched = predicateFields(extractFunctionSource(c, 'renderWatchlistRows')) || [];
  const wordIn = (w) => new RegExp('\\b' + w + '\\b').test(disclosed);
  const allMatchedDisclosed = matched.length > 0 && matched.every(f => FIELD_TO_WORD[f] && wordIn(FIELD_TO_WORD[f]));
  const noneExtra = OTHER_FIELD_WORDS.every(w => !disclosed.includes(w));
  // Nothing disclosed may be unmatched: after removing the field words and the
  // fixed connective vocabulary, no other word may remain.
  const leftover = disclosed
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !CONNECTIVE_WORDS.includes(w) && !Object.values(FIELD_TO_WORD).includes(w));
  return allMatchedDisclosed && noneExtra && leftover.length === 0;
}
check('UH-2 disclosure (placeholder ∪ title) equals the matched field set', uh2(content));
{
  const missing = content.replace('company, ', '');
  const extra = content.replace('and benchmark ETF', 'benchmark ETF and industry');
  check('UH-2 control: fixture omitting a field fails', missing !== content && !uh2(missing));
  check('UH-2 control: fixture disclosing an extra field fails', extra !== content && !uh2(extra));
  const region = content.replace('and benchmark ETF', 'benchmark ETF and region');
  check('UH-2 control: fixture disclosing an unlisted extra word fails', region !== content && !uh2(region));
}

// ── UH-4 Hebrew ──────────────────────────────────────────────────────────────
const uh4 = (c) => !/\p{Script=Hebrew}/u.test(c);
check('UH-4 zero Hebrew codepoints in index.html', uh4(content));
check('UH-4 control: one Hebrew character fails', !uh4(content + 'א'));

// ── UH-5 runAnalysis replacements ───────────────────────────────────────────
const runAnalysisSrc = extractFunctionSource(content, 'runAnalysis');
check('UH-5 runAnalysis extractable', !!runAnalysisSrc);
const UH5_STRINGS = [
  "'Initializing...'",
  '`Analyzing ${batch.join(\', \')}...`',
  "'Analysis complete!'",
  "'Error displaying results: '",
  "'Unknown error'"
];
const uh5Strings = (src) => !!src && UH5_STRINGS.every(s => count(src, s) === 1);
const uh5NoDdBtn = (c) => count(c, '[id^="dd-btn-"]') === 0 && !/["'`]dd-btn-/.test(c);
check('UH-5 each replacement string appears exactly once in runAnalysis', uh5Strings(runAnalysisSrc));
check('UH-5 control: a missing replacement string fails', !uh5Strings(runAnalysisSrc.replace("'Unknown error'", "'x'")));
check('UH-5 control: a duplicated replacement string fails', !uh5Strings(runAnalysisSrc + " 'Unknown error'"));
check('UH-5 no [id^="dd-btn-"] selector and no rendered dd-btn- id (deleted line was a no-op)', uh5NoDdBtn(content));
check('UH-5 control: the deleted selector line fails', !uh5NoDdBtn(content + '\ndocument.querySelectorAll(\'[id^="dd-btn-"]\')'));
check('UH-5 control: a rendered dd-btn- id fails', !uh5NoDdBtn(content + '\n<button id="dd-btn-X">'));

// ── UH-6 dead locals ─────────────────────────────────────────────────────────
const rmpSrc = extractFunctionSource(content, 'renderMainPanel');
const uh6 = (src) => !!src && !/\brsCls\b/.test(src) && !/\bconst rs\s/.test(src);
check('UH-6 renderMainPanel has no rsCls and no `const rs `', uh6(rmpSrc));
check('UH-6 control: fixture with the dead locals fails',
  !uh6((rmpSrc || '') + '\n  const rs        = _scoreSt.rs;\n  const rsCls     = _scoreSt.rsCls;\n'));
{
  const st = extractFunctionSource(content, '_ptScoreStates') || '';
  const KEYS = ['rs', 'rsCls', 'riskState', 'riskCls', 'reward', 'rewardCls', 'fillCls'];
  const returnObjects = (src) => {
    const out = [];
    let at = src.indexOf('return {');
    while (at !== -1) {
      const end = src.indexOf('};', at);
      out.push(src.slice(at, end));
      at = src.indexOf('return {', end);
    }
    return out;
  };
  const uh6Keys = (src) => {
    const objs = returnObjects(src);
    return objs.length === 2 && objs.every(o => KEYS.every(k => new RegExp('\\b' + k + ':').test(o)));
  };
  check('UH-6 both _ptScoreStates return objects still carry keys ' + KEYS.join(', '), uh6Keys(st));
  check('UH-6 control: dropping a key from the missing-score return fails',
    !uh6Keys(st.replace("rsCls: 'neutral-v', reward: '—'", "reward: '—'")));
}

// ── UH-7 nothing else moved ─────────────────────────────────────────────────
const CMP_END = '<!-- KEY LEVELS (Entry / Invalidation / Risk) — span 6 -->';
const uh7Anchor = (c) => count(c, CMP_END) === 1 && c.includes('pc-card-title">Key Levels');
const uh7Shape = (src) => !!src && src.includes('} catch (err) {') && src.includes('} finally {');
const uh7Writes = (ra, rm) => !!ra && !!rm && count(ra, 'localStorage.setItem') === 4 && count(rm, 'localStorage.setItem') === 0;
check('UH-7 CMP_END Key Levels comment occurs exactly once and Key Levels title present', uh7Anchor(content));
check('UH-7 control: a missing CMP_END comment fails', !uh7Anchor(content.replace(CMP_END, '')));
check('UH-7 control: a duplicated CMP_END comment fails', !uh7Anchor(content + CMP_END));
check('UH-7 runAnalysis keeps catch and finally shape', uh7Shape(runAnalysisSrc));
check('UH-7 control: a runAnalysis without finally fails', !uh7Shape(runAnalysisSrc.replace('} finally {', '} other {')));
check('UH-7 localStorage.setItem counts equal the e2bdfd2 baseline (runAnalysis 4, renderMainPanel 0)', uh7Writes(runAnalysisSrc, rmpSrc));
check('UH-7 control: an added setItem in renderMainPanel fails', !uh7Writes(runAnalysisSrc, rmpSrc + " localStorage.setItem('k','v');"));

if (failures) {
  console.log('UI HYGIENE OFFLINE: FAIL (' + failures + ')');
  process.exit(1);
}
console.log('UI HYGIENE OFFLINE: PASS');
