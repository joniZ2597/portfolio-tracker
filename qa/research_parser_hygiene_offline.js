'use strict';

/*
 * research-parser-hygiene-1 — offline QA for parsePerplexityContext hygiene (CB-1b).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL parsePerplexityContext
 * from index.html (brace matching, as qa/analyst_parser_offline.js does) and runs it in a
 * sandbox with a silent console.
 *
 *   PA-S06 / PA-17: a catalyst that merely STARTS with "-" or "Unknown" is a real catalyst;
 *                   only NONE / N/A at the start, or "unknown" / dashes as the WHOLE value, mean none.
 *   PA-S07:         "PT $X to $Y" (no "from") reads target Y, from-target X; "by $10 to $300"
 *                   (a change amount) stays target 300 with no from-target.
 *
 * Planted negatives (RP-N1..N3) mutate a copy of the production source (each anchor exactly
 * once) and must make the named rows fail.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
let asserts = 0;
function check(name, cond, detail) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
  }
}

const lf = s => s.replace(/\r\n/g, '\n');

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

const quiet = { log: function () {}, warn: function () {}, error: function () {} };
function buildParser(fnSource) {
  // eslint-disable-next-line no-new-func
  return new Function('console', fnSource + '\nreturn parsePerplexityContext;')(quiet);
}

const content = lf(fs.readFileSync(INDEX_PATH, 'utf8'));
const fnSource = extractFunctionSource(content, 'parsePerplexityContext');
if (!fnSource) {
  console.log('  FAIL  could not extract parsePerplexityContext from index.html');
  console.log('RESEARCH PARSER HYGIENE OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}

// Non-ASCII dashes are written as escapes so the suite file stays pure ASCII.
const EM = '—';
const EN = '–';

// A ticker block where every field except the one under test is NONE.
const block = (field, value) => {
  const f = { BULLISH: 'NONE', BEARISH: 'NONE', MACRO: 'NONE', ANALYST_ACTIONS: 'NONE', EARNINGS: 'NONE', REVISION_DIRECTION: 'NONE' };
  f[field] = value;
  return 'TICKER: TST\n' + Object.keys(f).map(k => k + ': ' + f[k]).join('\n') + '\n';
};
const parseField = (parse, field, value) => parse(block(field, value)).TST;
const actionsOf = (parse, text) => (parseField(parse, 'ANALYST_ACTIONS', text).analystActions) || [];

const CATALYST_FIELDS = [['BULLISH', 'bullishCatalysts'], ['BEARISH', 'bearishCatalysts'], ['MACRO', 'macroDrivers']];
const BARE_DASHES = ['-', EM, EN + ' ', '--', '-.'];
const NONE_VALUES = ['NONE', 'None reported', 'N/A', 'NA', 'Unknown', 'unknown.'];

// Each row returns { ok, detail }. Run against any parser (real or mutated).
function evaluateRows(parse) {
  const rows = {};
  const row = (id, ok, detail) => { rows[id] = { ok: !!ok, detail: detail || '' }; };

  // RP-1: a catalyst that starts with "-5%" is kept; _allNone is false.
  {
    const r = parseField(parse, 'BEARISH', '-5% guidance cut for Q4');
    row('RP-1', r.bearishCatalysts.length === 1 && r.bearishCatalysts[0] === '-5% guidance cut for Q4' && r._allNone === false,
      JSON.stringify({ b: r.bearishCatalysts, allNone: r._allNone }));
  }

  // RP-2: "Unknown impact ..." is a macro driver.
  {
    const r = parseField(parse, 'MACRO', 'Unknown impact of new tariffs on margins');
    row('RP-2', r.macroDrivers.length === 1 && r.macroDrivers[0] === 'Unknown impact of new tariffs on margins' && r._allNone === false,
      JSON.stringify({ m: r.macroDrivers, allNone: r._allNone }));
  }

  // RP-3: a bare dash is none, in every catalyst field; _allNone true when everything else is NONE.
  {
    const bad = [];
    CATALYST_FIELDS.forEach(([label, key]) => BARE_DASHES.forEach(d => {
      const r = parseField(parse, label, d);
      if (r[key].length !== 0 || r._allNone !== true) bad.push(label + '=' + JSON.stringify(d) + ' -> ' + JSON.stringify(r[key]) + ' allNone=' + r._allNone);
    }));
    // A bare dash inside a list is dropped; the real item next to it is kept.
    const mixed = parseField(parse, 'BULLISH', '- | Customer win at a hyperscaler');
    if (mixed.bullishCatalysts.length !== 1 || mixed.bullishCatalysts[0] !== 'Customer win at a hyperscaler') bad.push('mixed -> ' + JSON.stringify(mixed.bullishCatalysts));
    row('RP-3', bad.length === 0, bad.join(' ; '));
  }

  // RP-4: NONE / N/A / Unknown family still mean none (unchanged behaviour).
  {
    const bad = [];
    CATALYST_FIELDS.forEach(([label, key]) => NONE_VALUES.forEach(v => {
      const r = parseField(parse, label, v);
      if (r[key].length !== 0 || r._allNone !== true) bad.push(label + '=' + JSON.stringify(v) + ' -> ' + JSON.stringify(r[key]) + ' allNone=' + r._allNone);
    }));
    row('RP-4', bad.length === 0, bad.join(' ; '));
  }

  // RP-5: "PT $X to $Y" with no "from" -> target Y, from-target X.
  {
    const a = actionsOf(parse, 'Goldman raised PT $180 to $200 (Oct 2)');
    row('RP-5', a.length === 1 && a[0].bank === 'Goldman' && a[0].target === 200 && a[0].ptFrom === 180 && a[0].ptAction === 'raised',
      JSON.stringify(a.map(x => ({ bank: x.bank, target: x.target, ptFrom: x.ptFrom, ptAction: x.ptAction }))));
  }

  // RP-6: the existing from/to and to/from shapes are unchanged.
  {
    const a = actionsOf(parse, 'Goldman raised PT from $180 to $200');
    const b = actionsOf(parse, 'Goldman raised PT to $200, from $180');
    const ok = a.length === 1 && a[0].target === 200 && a[0].ptFrom === 180 && b.length === 1 && b[0].target === 200 && b[0].ptFrom === 180;
    row('RP-6', ok, JSON.stringify({ a: a.map(x => [x.target, x.ptFrom]), b: b.map(x => [x.target, x.ptFrom]) }));
  }

  // RP-7: a change amount ("by $10 to $300") stays target 300 with no from-target.
  {
    const a = actionsOf(parse, 'Goldman raised PT by $10 to $300');
    row('RP-7', a.length === 1 && a[0].target === 300 && a[0].ptFrom === null,
      JSON.stringify(a.map(x => ({ target: x.target, ptFrom: x.ptFrom }))));
  }

  // RP-8: an amount range with no target word is not a target (neither size-suffixed nor plain).
  {
    const a = actionsOf(parse, 'Goldman raised outlook $1.2B to $1.5B revenue');
    const b = actionsOf(parse, 'Goldman raised estimates $12 to $15 per share');
    row('RP-8', a.length === 0 && b.length === 0, JSON.stringify({ a: a.map(x => x.target), b: b.map(x => x.target) }));
  }

  return rows;
}

const ROW_IDS = ['RP-1', 'RP-2', 'RP-3', 'RP-4', 'RP-5', 'RP-6', 'RP-7', 'RP-8'];
const REAL = evaluateRows(buildParser(fnSource));
ROW_IDS.forEach(id => check(id + ' (real source)', REAL[id].ok, REAL[id].detail));

// -- Planted negatives: mutate the production source copy; each anchor must occur exactly once --
const occurrences = (hay, needle) => hay.split(needle).length - 1;
function mutate(label, from, to) {
  const n = occurrences(fnSource, from);
  check(label + ' anchor occurs exactly once in parsePerplexityContext', n === 1, 'found ' + n);
  return n === 1 ? fnSource.replace(from, () => to) : null;
}
function expectFail(label, mutated, ids) {
  if (mutated === null) { check(label + ' mutation applied', false); return; }
  const rows = evaluateRows(buildParser(mutated));
  ids.forEach(id => check(label + ' makes ' + id + ' fail', rows[id].ok === false, 'row still passes on the mutated source'));
}

const E1_NEW = String.raw`const NONE_RE = /^(?:(?:NONE|N\/?A)\b|unknown\.?$|[-—–]+\.?$)/i;`.replace(/\\u2014/g, EM).replace(/\\u2013/g, EN);
const E1_OLD = String.raw`const NONE_RE = /^(NONE|N\/?A|-|—|unknown)\b/i;`.replace(/\\u2014/g, EM);
// RP-N1: E-1 reverted (old NONE_RE) -> RP-1 / RP-2 (real catalyst dropped) and RP-3 (bare dash kept) fail.
expectFail('RP-N1 E-1 reverted', mutate('RP-N1', E1_NEW, E1_OLD), ['RP-1', 'RP-2', 'RP-3']);

// RP-N2: E-3 removed (the _AA_RULE_A2 branch) -> RP-5 fails.
const E3 = "else if (hasTW && (m = _AA_RULE_A2.exec(item))) { target = _aaNum(m[2]); ptFrom = _aaNum(m[1]); }";
expectFail('RP-N2 E-3 removed', mutate('RP-N2', E3, ''), ['RP-5']);

// RP-N2b: E-2 emptied (rule never matches) -> RP-5 fails.
const E2_START = "const _AA_RULE_A2 = new RegExp('(?<!\\\\bby\\\\s{0,3})' + _AA_AMT + '\\\\s+to\\\\s+' + _AA_AMT, 'i');";
expectFail('RP-N2b E-2 neutralised', mutate('RP-N2b', E2_START, "const _AA_RULE_A2 = /(?!)/;"), ['RP-5']);

// RP-N3: the "by" look-behind dropped -> RP-7 fails.
expectFail('RP-N3 look-behind dropped', mutate('RP-N3', "'(?<!\\\\bby\\\\s{0,3})' + _AA_AMT", "_AA_AMT"), ['RP-7']);

console.log(failures === 0
  ? 'RESEARCH PARSER HYGIENE OFFLINE: PASS (' + asserts + ' asserts)'
  : 'RESEARCH PARSER HYGIENE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
