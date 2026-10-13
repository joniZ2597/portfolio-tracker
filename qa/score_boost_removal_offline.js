'use strict';

/*
 * SB — the research-keyword score boost is gone (score-boost-removal-1, DQ-1 = A, audit PA-04).
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL enforceScoreConsistency,
 * _isValidScanResult and mergeResultsByTicker from index.html (brace matching, as in
 * qa/no_synthetic_score_offline.js) and runs them verbatim in a sandbox.
 *
 * Rows SB-1..SB-6 map 1:1 to work/score-boost-removal-1/brief.md section 1 (S1).
 *   SB-1  no raise: scores 0/1/30/50/62.5/64/64.9 + bullish context -> same item reference, score and sentiment unchanged
 *   SB-2  keyword independence: bullish / negated / product-sense / dated / neutral contexts -> identical outputs
 *   SB-3  order preserved: 30 / 64 / 66 stay 30 / 64 / 66
 *   SB-4  guards unchanged: _aiUnavailable and invalid / missing scores pass through; _isValidScanResult rejects the invalid ones
 *   SB-5  returns a new array holding the same item references
 *   SB-6  static: no keyword list, no 72 literal, no write to sentiment_score / sentiment; orchestrate / analyzeChunk pinned
 *
 * Planted negatives (PN-1..PN-4) replace the function in an in-memory copy of the production source
 * (never the test) and the named group must then FAIL.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const IDX_CORE = require('./lib/index-pins-core.js');
const IDX_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'index-pins.json'), 'utf8'));

const norm = s => s.replace(/\r\n/g, '\n');
const quiet = { log() {}, warn() {}, error() {} };

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
function build(src) {
  const parts = ['enforceScoreConsistency', '_isValidScanResult', 'mergeResultsByTicker'].map(n => extractFn(src, n));
  if (parts.some(p => !p)) throw new Error('terminal chain not extractable');
  return new Function('console', parts.join('\n') + '\nreturn { enforceScoreConsistency, _isValidScanResult, mergeResultsByTicker };')(quiet);
}
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const SRC = norm(fs.readFileSync(INDEX_PATH, 'utf8'));
const FN_TEXT = extractFn(SRC, 'enforceScoreConsistency');

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────
const mk = (score, extra) => Object.assign({ ticker: 'TST', sentiment: 'neutral', sentiment_score: score, _changePct: 1, _verifiedChangePct: 1 }, extra || {});
const BULLISH = JSON.stringify({ TST: 'UBS raised PT to $120; upgrade to buy; earnings beat expectations' });
const CONTEXTS = {
  bullish: BULLISH,
  negated: JSON.stringify({ TST: 'no upgrade expected until an earnings beat is confirmed' }),
  productSense: JSON.stringify({ TST: 'iPhone upgrade cycle; last year revenue beat' }),
  dated: JSON.stringify({ TST: 'In 2019 the stock saw an upgrade and an earnings beat' }),
  neutral: JSON.stringify({ TST: 'company reported results' }),
  empty: ''
};
const SCORES = [0, 1, 30, 50, 62.5, 64, 64.9];

// ── Groups: each takes a chain {enforceScoreConsistency,_isValidScanResult} and returns a list of failures ──
function sb1(c) {
  const f = [];
  for (const s of SCORES) {
    const item = mk(s);
    const out = c.enforceScoreConsistency([item], BULLISH);
    if (out[0] !== item) f.push('score ' + s + ': not the same reference');
    if (item.sentiment_score !== s) f.push('score ' + s + ': item score changed to ' + item.sentiment_score);
    if (item.sentiment !== 'neutral') f.push('score ' + s + ': item sentiment changed');
    if (out[0].sentiment_score !== s || out[0].sentiment !== 'neutral') f.push('score ' + s + ': output changed');
  }
  return f;
}
function sb2(c) {
  const f = [];
  const outs = {};
  for (const k of Object.keys(CONTEXTS)) {
    const item = mk(30);
    const out = c.enforceScoreConsistency([item], CONTEXTS[k]);
    if (out[0] !== item) f.push(k + ': not the same reference');
    outs[k] = JSON.stringify(out);
  }
  if (new Set(Object.values(outs)).size !== 1) f.push('outputs differ across contexts');
  return f;
}
function sb3(c) {
  const f = [];
  const out = c.enforceScoreConsistency([mk(30), mk(64), mk(66)], BULLISH).map(i => i.sentiment_score);
  if (JSON.stringify(out) !== JSON.stringify([30, 64, 66])) f.push('scores became ' + JSON.stringify(out));
  return f;
}
function sb4(c) {
  const f = [];
  const failed = mk(null, { _aiUnavailable: true, sentiment: 'neutral' });
  if (c.enforceScoreConsistency([failed], BULLISH)[0] !== failed) f.push('_aiUnavailable item not passed through');
  for (const bad of [undefined, null, 'abc', NaN, 101, -1]) {
    const item = mk(bad);
    if (c.enforceScoreConsistency([item], BULLISH)[0] !== item) f.push('invalid score ' + String(bad) + ' not passed through');
    if (c._isValidScanResult(item) !== false) f.push('invalid score ' + String(bad) + ' not rejected by _isValidScanResult');
  }
  return f;
}
function sb5(c) {
  const f = [];
  const items = [mk(80), mk(90, { ticker: 'AAA' }), mk(70, { ticker: 'BBB' })];
  const out = c.enforceScoreConsistency(items, BULLISH);
  if (!Array.isArray(out) || out === items) f.push('not a new array');
  else if (out.length !== items.length || out.some((o, i) => o !== items[i])) f.push('elements are not the same references');
  return f;
}
function sb6(c, src) {
  const f = [];
  const fn = extractFn(src, 'enforceScoreConsistency');
  if (!fn) return ['function not extractable'];
  const body = stripComments(fn);
  if (/\.includes\(|toLowerCase|\bupgrade\b|raised pt|earnings beat|tierOne/i.test(body)) f.push('keyword list / matching present');
  if (/\b72\b/.test(body)) f.push('72 literal present');
  if (/\bsentiment_score\s*:|\bsentiment\s*:|\bsentiment_score\s*=[^=]|\bsentiment\s*=[^=]/.test(body)) f.push('writes sentiment / sentiment_score');
  const mism = IDX_CORE.entryMismatches(IDX_CORE.normalizeText(src), IDX_MAP, ['functions.orchestrate', 'functions.analyzeChunk']);
  if (mism.length) f.push('pin mismatch: ' + mism.join(','));
  if ((src.match(/function enforceScoreConsistency\(results, newsContext\) \{/g) || []).length !== 1) f.push('signature anchor not unique');
  if ((src.match(/return enforceScoreConsistency\(resultsWithPct, JSON\.stringify\(pplxData\)\);/g) || []).length !== 1) f.push('call anchor not unique');
  return f;
}
const GROUPS = { 'SB-1': sb1, 'SB-2': sb2, 'SB-3': sb3, 'SB-4': sb4, 'SB-5': sb5, 'SB-6': sb6 };

// ── Run against production ─────────────────────────────────────────────────────────────────────────
let failed = 0;
const prod = build(SRC);
for (const id of Object.keys(GROUPS)) {
  const f = GROUPS[id](prod, SRC);
  if (f.length) { failed += 1; console.log('  FAIL  ' + id + ': ' + f.slice(0, 4).join('; ')); } else console.log('  PASS  ' + id);
}

// ── Planted negatives: the named group must FAIL on the mutated source ──────────────────────────────
const HEAD = 'function enforceScoreConsistency(results, newsContext) {\n';
const MUTANTS = {
  'PN-1': { group: ['SB-1', 'SB-3'], fn: HEAD + "  return results.map(i => (i.sentiment_score < 65 && /upgrade/.test(String(newsContext)) ? Object.assign({}, i, { sentiment: 'positive', sentiment_score: 72 }) : i));\n}" },
  'PN-2': { group: ['SB-6'], fn: HEAD + "  const kw = ['upgrade'];\n  return results.slice();\n}" },
  'PN-3': { group: ['SB-6'], fn: HEAD + "  if (false) { results[0].sentiment_score = 1; }\n  return results.slice();\n}" },
  'PN-4': { group: ['SB-1'], fn: HEAD + '  return results.map(i => Object.assign({}, i));\n}' }
};
for (const id of Object.keys(MUTANTS)) {
  const m = MUTANTS[id];
  const mutSrc = SRC.replace(FN_TEXT, () => m.fn);
  if (mutSrc === SRC || !FN_TEXT) { failed += 1; console.log('  FAIL  ' + id + ': mutation did not apply'); continue; }
  const chain = build(mutSrc);
  const bites = m.group.every(g => GROUPS[g](chain, mutSrc).length > 0);
  if (bites) console.log('  PASS  ' + id + ' (planted negative bites ' + m.group.join('+') + ')'); else { failed += 1; console.log('  FAIL  ' + id + ': ' + m.group.join('+') + ' did not fail on the mutant'); }
}

console.log(failed ? 'SB: FAIL (' + failed + ')' : 'SB: PASS');
process.exit(failed ? 1 : 0);
