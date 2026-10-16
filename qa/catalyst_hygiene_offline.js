'use strict';

/*
 * catalyst-hygiene-2 — offline QA for the catalyst-row hygiene of parsePerplexityContext.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL parsePerplexityContext and
 * formatNewsContext from index.html (brace matching, as in qa/research_ai_context_offline.js) and
 * runs them verbatim in a vm sandbox with a silent console. Every consumer row (CH-9, CH-10, CH-15,
 * CH-16, CH-17) evaluates the REAL index.html source slice (each anchor asserted exactly once and
 * evaluated as written), never a re-implementation.
 *
 * Rows CH-1 .. CH-17 map to the brief's section 3 table. CH-N1 .. CH-N11 are planted negatives:
 * each mutates the production source (anchor exactly once) and the named rows must fail on the
 * mutated copy. Fixture: qa/fixtures/research-live-2026-10-15.json (8 live captures).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'research-live-2026-10-15.json');

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
const count = (hay, needle) => hay.split(needle).length - 1;
const h16 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
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

// Slice [startAnchor .. endAnchor] out of the source; both anchors must occur exactly once.
function slice(src, startAnchor, endAnchor) {
  if (count(src, startAnchor) !== 1) throw new Error('start anchor not exactly once: ' + startAnchor.slice(0, 60));
  const s = src.indexOf(startAnchor);
  const e = src.indexOf(endAnchor, s);
  if (e === -1 || count(src, endAnchor) < 1) throw new Error('end anchor missing: ' + endAnchor.slice(0, 60));
  return src.slice(s, e + endAnchor.length);
}

const CAPS = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).captures;
const capOf = key => CAPS.find(c => c.key === key);

// Canonical parse hashes recorded from the base index.html (2dc9c30) on the 6 captures this task must not change.
const CH6_SAME = {
  'NVDA#1': '7cfd036bfe01f582', 'FROG#3': '954ad147283de447', 'ENPH#4': '1fb48a32e3a760d8',
  'QQQ#5': '8609f9c8d3a277f5', 'NXSN.TA#6': 'e85b78b1064de608', 'NXSN.TA#8': '95c72854cb3cecf8'
};

const ONLY_RATING = 'TICKER: TST\nANALYST_ACTIONS: UBS upgraded to Buy from Neutral (Oct 2)\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n';
const ALL_NONE = 'TICKER: TST\nANALYST_ACTIONS: NONE\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n';
const PT_BLOCK = 'TICKER: TST\nANALYST_ACTIONS: UBS raised PT to $120 (Oct 2)\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n';
const NODATA = sym => 'No catalyst, analyst, earnings, or revision data returned for ' + sym + '.';

// CH-11 .. CH-14 phrase sets
const CH11_KEPT = [
  'October 13 — XYZ closed at $45, up 3.8% after the CEO resigned',
  'XYZ shares closed at $45 following news of a product recall',
  'October 13 — XYZ fell to $45, down 8% after its largest customer filed for bankruptcy',
  'XYZ closed at $45 after the board approved a sale',
  'XYZ closed at $45 following an SEC probe',
  'October 13 — XYZ closed at $52, up 6% after the company announced a takeover bid',
  'October 13 — XYZ closed at $45, up 6% after a $2.5B deal with Microsoft',
  'XYZ closed at $45 after the U.S. Commerce Department added export curbs',
  'October 13 — XYZ closed at $45, up 3.8% after a supply disruption',
  'October 13 — XYZ closed at $45, down 4% following the departure of two senior executives'
];
const CH11_FILTERED = [
  'October 6 — shares were reported at ILA 47,660, down 4.51%, indicating elevated volatility after a sharp pullback[4]',
  'XYZ closed at $40, down 5% after hours',
  'October 2 — XYZ fell 6% to $30 following a 3-day decline',
  'October 9 — XYZ rose 3% to $45 amid weakness',
  'October 13 — XYZ closed at $45 after a volatile session',
  'October 13 — XYZ up 3% to $45 amid investor concern',
  'October 13 — XYZ up 3% to $45 amid broad market weakness',
  'October 13 — XYZ up 3% to $45 amid optimism',
  'XYZ closed at $40 after a strong rally',
  'October 13 — XYZ closed at $45 after the index fell 2%',
  'XYZ closed at $45 after a quiet session. Separately, the CEO resigned',
  'XYZ closed at $45 after a quiet session; the CEO resigned later',
  'XYZ closed at $45 after lunch; the CEO resigned later',
  'October 9 — XYZ rose 3% to $45 amid choppy conditions',
  'October 9 — XYZ rose 3% to $45 amid continued downward pressure',
  'October 9 — XYZ rose 3% to $45 amid the current environment',
  'October 9 — XYZ rose 3% to $45 following the absence of any catalyst',
  'October 9 — XYZ rose 3% to $45 amid widespread caution'
];
const PFX12 = 'October 13 — XYZ closed at $45, down 6% ';
const CH12_EVENTS = [
  'after the company named a new CFO', 'following a Reuters report', 'after the FDA rejected its drug', 'after a short-seller report',
  'after a fire at its plant', 'after it was added to the S&P 500', 'after it missed estimates', 'amid a government shutdown',
  'after a hurricane hit its refinery', 'after Q3 sales fell', 'following a profit warning', 'after it failed a late-stage trial',
  'after a data breach', 'after the company said it was exploring a sale', 'after the board approved a sale', 'after a DOJ probe',
  'following a merger announcement', 'after it cut its dividend', 'after a union strike', 'after a product recall'
];
const CH12_VAGUE = [
  'amid heavy volume', 'after a gap up', 'after a short squeeze', 'after the opening bell', 'amid risk-off sentiment',
  'after a technical breakout', 'amid momentum buying', 'amid elevated volatility', 'after reaching a 52-week high', 'amid market jitters',
  'after a dead-cat bounce', "after yesterday's selloff", 'after hitting resistance', 'amid thin trading', 'after a volatile session',
  'amid investor concern', 'amid broad market weakness', 'amid optimism', 'after a strong rally', 'after the index fell 2%',
  'after hours', 'following a 3-day decline', 'amid profit-taking', 'amid a choppy week', 'amid a broader tech slump'
];
const CH13_EVENTS = [
  'after a product defect', 'after a data center fire', 'after losing a key client', 'after customer churn', 'after a supply disruption',
  'after a product failure', 'after the CEO resigned', 'after a failed drug trial', 'after a downgrade', 'after a Fed decision',
  'after it lost a major contract', 'after a stake sale'
];
const CH13_VAGUE = [
  'after a market report', 'amid strategic weakness', 'amid sales weakness', 'after a weak market report', 'after heavy trading volume reports',
  'amid thin holiday trading and low order flow', 'amid a broad sell-off', 'after a short squeeze', 'amid profit-taking', 'after a record high',
  'after the market close'
];
const PFX14 = 'October 15 — DEF dropped 7% to $12.05 ';
// [phrase, documented-miss] — the 3 documented conservative false negatives (R-7b) are asserted filtered.
const CH14_EVENTS = [
  ['after the lender called in its loans'], ['after a recall of 400,000 airbags'], ['following the abrupt cancellation of its flagship project'],
  ["after the miner's CEO was arrested"], ['after a breakup of the joint venture', true], ['after the company scrapped its buyback'],
  ['after the regulator blocked the tie-up'], ['following a downgrade by S&P Global', true], ['after the startup lost its main investor', true],
  ['after a court froze its assets'], ['after the agency opened a safety probe'], ['after the firm restated three years of results'],
  ['following the sudden death of its chief executive'], ['after an explosion shut its refinery'], ['after it agreed to sell its software unit'],
  ['after its biggest client switched suppliers'], ['after the merger partner walked away'], ['following a write-down of its goodwill'],
  ['after the patent office rejected its application'], ['after a ransomware attack crippled its systems'], ['after the government revoked its permit'],
  ['after the drug trial was halted early'], ['after a failed bond sale'], ['following the collapse of talks with its creditors'],
  ['after it slashed its payout'], ['after the founder stepped down as chair'], ['after customs officials seized its shipments'],
  ['after a bigger rival cut prices'], ['following a profit warning from its parent'], ['after the airline cancelled thousands of flights']
];
const CH14_VAGUE = [
  'amid an uptick in selling pressure', 'after a lackluster showing', 'following a disappointing session', 'amid widespread risk reduction',
  'after a sharp reversal off the highs', 'amid the persistence of the downtrend', 'after a muted response from buyers', 'following the breakdown below support',
  'amid a deterioration in sentiment', 'after a failed breakout attempt', 'amid a continuation of recent weakness', 'after a spike in volatility',
  'amid an exodus from small caps', 'following a quiet stretch of trading', 'after the completion of a head-and-shoulders top', 'amid broad-based liquidation',
  'after a pause near resistance', 'amid the absence of buyers', 'after struggling to find a floor', 'amid a reduction in exposure by funds',
  'following an extended run of losses for the stock', 'after a burst of late selling', 'amid shifting risk appetite', 'after a retest of the lows',
  'amid deteriorating breadth', 'after an inconclusive session', 'following the unwinding of crowded positions', 'amid a lack of conviction among buyers',
  'after the shares retreated from their peak', 'amid generally weak tape action'
];

// Build every function this suite needs from ONE source text (real or mutated).
function build(src) {
  const ctx = { console: { log() {}, warn() {} } };
  vm.createContext(ctx);
  const a = extractFunctionSource(src, 'parsePerplexityContext');
  const b = extractFunctionSource(src, 'formatNewsContext');
  if (!a || !b) return null;
  vm.runInContext(a + '\n' + b + '\nthis.P = parsePerplexityContext; this.F = formatNewsContext;', ctx);
  const out = { P: ctx.P, F: ctx.F, src };
  const run = (code, args) => {
    const c2 = { console: { log() {}, warn() {} } };
    vm.createContext(c2);
    return vm.runInContext('(function(' + args.join(',') + '){' + code + '})', c2);
  };
  // analyzeChunk: the unchanged retry heuristic (real source, as written)
  out.weak = () => {
    const none = slice(src, 'const _NONE_RE_7B3B3 = ', '\n') + slice(src, 'const _isNoneVal_7B3B3 = ', '\n');
    const det = slice(src, 'const _detectWeakPerplexity = (raw, p, parsedFrom) => {', '    return null;\n  };');
    return run(none + det + '\nreturn _detectWeakPerplexity;', [])();
  };
  // orchestrate: the exact _catalystDataMissing line, the direction block and the key-risk guard
  out.orch = () => {
    const missing = slice(src, 'item._catalystDataMissing = !!(', '\n');
    const dir = slice(src, 'const _bullPplx       = ', "item._catalystDirection = 'mixed';\n    }");
    const guard = slice(src, 'if (item._hasStructuredCatalysts &&', 'item.key_risk = _krFallback;\n    }');
    return { missing, dir, guard, fn: (item, p) => run(missing + '\n' + dir + '\n' + guard + '\nreturn item;', ['item', '_pplx6a', 'sym'])(item, p, 'TST') };
  };
  out.audit = () => {
    const frag = slice(src, "_pplx6a?._unavailable\n                             ? 'perplexity-proxy / unavailable'", "                               : 'perplexity-proxy / sonar-pro'");
    return run('return ' + frag + ';', ['_pplx6a']);
  };
  out.fallback = () => {
    const frag = slice(src, 'item._catalystDataMissing\n            ? `<div class="cat-row"><div class="cat-dot warn"></div><span class="cat-lbl">No catalyst data returned', 'MONITORING</span></div>`');
    return run('return ' + frag + ';', ['item']);
  };
  out.confidence = () => {
    const fn = extractFunctionSource(src, 'deriveDataConfidence');
    if (!fn) throw new Error('deriveDataConfidence not found');
    return run(fn + '\nreturn deriveDataConfidence;', [])();
  };
  return out;
}

// Evaluate every row against one source text; returns { id: { ok, info } }.
function evaluateRows(src) {
  const rows = {};
  const row = (id, fn) => {
    try { const r = fn(); rows[id] = r === true ? { ok: true } : { ok: false, info: String(r) }; }
    catch (e) { rows[id] = { ok: false, info: 'threw: ' + e.message }; }
  };
  const fns = build(src);
  if (!fns) { return rows; }
  const parseBlock = (block) => fns.P(block, []).TST;
  const list = (label, text) => parseBlock('TICKER: TST\n' + label + ': ' + text + '\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n');
  const bear = text => (list('BEARISH', text) || {}).bearishCatalysts || [];
  const bull = text => (list('BULLISH', text) || {}).bullishCatalysts || [];
  const keptSet = (rowsIn) => rowsIn.map(t => bear(t).length === 1);
  const eq = (got, want) => JSON.stringify(got) === JSON.stringify(want) ? true : 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want);
  const wrongKept = (rowsIn, wantKept) => rowsIn.filter(t => (bear(t).length === 1) !== wantKept);

  row('CH-1', () => {
    const a = bear('Real risk A (Oct 1) | No specific downside catalyst reported | No significant news. | None reported | no newer analyst action found');
    const b = bear('No Sell ratings in one cited analyst set (October 14) | No new contracts announced, a negative for growth | No dividend increase this year');
    const r1 = eq(a, ['Real risk A (Oct 1)']);
    if (r1 !== true) return 'first ' + r1;
    return b.length === 3 ? true : 'second kept ' + b.length + ': ' + JSON.stringify(b);
  });
  row('CH-2', () => {
    const a = bull('October 13 — MGOR closed at ILA 47,840, up 3.84%[1] | Shares closed at ₪47.80 | October 9 — MGOR rose 2.96% to ILA 45,620 while the TA-35 fell 0.69%, showing relative strength[2] | Oct 2: XYZ rose 3.1% to $45.10');
    const b = bull('October 9 — Israeli equities declined, with the TA-35 down 0.69% and banking, finance, and insurance sectors leading the weakness[2] | October 14 — Q3 revenue ₪88M, up 12% on record orders | Record Q2 2026 results and EPS beat; $27.5 million in new orders[1][2]');
    if (a.length !== 0) return 'first kept ' + JSON.stringify(a);
    return b.length === 3 ? true : 'second kept ' + b.length + ': ' + JSON.stringify(b);
  });
  row('CH-3', () => {
    const kept = bear('FROG fell 7.37% to $91.96 on October 14 after a guidance cut, near the 52-week high');
    const live = capOf('FROG#3').raw.split('\n').find(l => /heavy profit-taking/.test(l)).replace(/^BEARISH:\s*/, '').split(/\s*\|\s*/)[0];
    const inferred = bear(live);
    if (kept.length !== 1) return 'stated-catalyst row not kept';
    return inferred.length === 0 ? true : 'inferred-cause row kept: ' + JSON.stringify(inferred);
  });
  row('CH-4', () => {
    const a = bear('A (Oct 1) | − | B (Oct 2)');
    const b = bear('−5% guidance cut (Oct 3)');
    const r = eq(a, ['A (Oct 1)', 'B (Oct 2)']);
    if (r !== true) return r;
    return eq(b, ['−5% guidance cut (Oct 3)']);
  });
  row('CH-5', () => {
    const bad = [];
    const only = parseBlock(ONLY_RATING);
    if (only._allNone !== false) bad.push('rating-only block _allNone ' + only._allNone);
    const ctx = fns.F({ TST: only }, 'TST');
    if (!ctx.includes('RATING ACTIONS (no PT): UBS: upgraded Buy')) bad.push('no RATING ACTIONS line');
    if (ctx.includes(NODATA('TST'))) bad.push('no-data sentence present');
    const raw = fns.P('General commentary line that carries no analyst content at all.\nUBS upgraded to Buy from Neutral (Oct 2)\n', []).__raw__;
    if (!raw || raw._allNone !== false) bad.push('__raw__ rating-only _allNone ' + (raw && raw._allNone));
    else {
      const rctx = fns.F({ __raw__: raw }, 'TST');
      if (rctx.includes(NODATA('TST'))) bad.push('__raw__ no-data sentence present');
    }
    const none = parseBlock(ALL_NONE);
    if (none._allNone !== true || fns.F({ TST: none }, 'TST') !== NODATA('TST')) bad.push('all-NONE block changed');
    if (parseBlock(PT_BLOCK)._allNone !== false) bad.push('PT block _allNone not false');
    return bad.length === 0 ? true : bad.join(' | ');
  });
  row('CH-6', () => {
    const bad = [];
    for (const cap of CAPS) {
      const p = fns.P(cap.raw, [])[cap.ticker];
      if (CH6_SAME[cap.key]) { if (h16(canon(p)) !== CH6_SAME[cap.key]) bad.push(cap.key + ' parse changed'); }
    }
    const msft = fns.P(capOf('MSFT#2').raw, [])['MSFT'] || fns.P(capOf('MSFT#2').raw, [])[capOf('MSFT#2').ticker];
    if (JSON.stringify(msft.bearishCatalysts) !== JSON.stringify(['A reported FY2028 EPS estimate reduction indicates valuation or profitability concerns despite higher price targets (October 14)'])) bad.push('MSFT#2 bearishCatalysts ' + JSON.stringify(msft.bearishCatalysts));
    const mg = fns.P(capOf('MGOR.TA#7').raw, [])[capOf('MGOR.TA#7').ticker];
    if (mg.bullishCatalysts.length !== 0) bad.push('MGOR.TA#7 bullishCatalysts ' + JSON.stringify(mg.bullishCatalysts));
    if (JSON.stringify(mg.bearishCatalysts) !== JSON.stringify(['Valuation risk — P/E of 13.38 versus a sector average of 10.30[5]'])) bad.push('MGOR.TA#7 bearishCatalysts ' + JSON.stringify(mg.bearishCatalysts));
    return bad.length === 0 ? true : bad.join(' | ');
  });
  row('CH-7', () => count(src, "const NONE_RE = /^(?:(?:NONE|N\\/?A)\\b|unknown\\.?$|[-—–]+\\.?$)/i;") === 1 ? true : 'NONE_RE line changed');
  row('CH-8', () => count(src, 'const _NONE_RE_7B3B3 = /^(NONE|N\\/?A|-|—|unknown)\\b/i;') === 1 ? true : '_NONE_RE_7B3B3 line changed');
  row('CH-9', () => {
    const D = fns.weak();
    const p = parseBlock(ONLY_RATING);
    const shortRaw = ONLY_RATING;
    const longRaw = ONLY_RATING + 'Filler commentary sentence that adds length without any catalyst content. '.repeat(10);
    if (shortRaw.length >= 500 || longRaw.length < 500) return 'fixture lengths wrong';
    const s = D(shortRaw, p, 'parsed');
    const l = D(longRaw, p, 'parsed');
    return s === 'short-raw' && l === null ? true : 'short ' + s + ' long ' + l;
  });
  row('CH-10', () => {
    const o = fns.orch();
    const D = fns.confidence();
    const fb = fns.fallback();
    const au = fns.audit();
    const bad = [];
    const evalOne = (block) => {
      const p = parseBlock(block);
      const item = o.fn({ news: [], news_bias: 'neutral', key_risk: 'x', technical_setup: 'healthy_uptrend' }, p);
      item._catalysts = { bullish: p.bullishCatalysts, bearish: p.bearishCatalysts, analystActions: p.analystActions };
      item._auditTrail = { sourceTrace: {} };
      return { badge: D(item).level, row: fb(item), label: au(p) };
    };
    const r = evalOne(ONLY_RATING);
    if (r.badge !== 'MODERATE') bad.push('rating-only badge ' + r.badge);
    if (!(r.row.includes('No verified catalysts') && r.row.includes('MONITORING'))) bad.push('rating-only fallback row');
    if (r.label !== 'perplexity-proxy / sonar-pro') bad.push('rating-only label ' + r.label);
    const n = evalOne(ALL_NONE);
    if (n.badge !== 'LIMITED') bad.push('all-NONE badge ' + n.badge);
    if (!(n.row.includes('No catalyst data returned') && n.row.includes('PERPLEXITY NONE'))) bad.push('all-NONE fallback row');
    if (n.label !== 'perplexity-proxy / no catalyst data') bad.push('all-NONE label ' + n.label);
    return bad.length === 0 ? true : bad.join(' | ');
  });
  row('CH-11', () => {
    const k = wrongKept(CH11_KEPT, true), f = wrongKept(CH11_FILTERED, false);
    if (CH11_KEPT.length !== 10 || CH11_FILTERED.length !== 18) return 'row set size changed';
    return k.length === 0 && f.length === 0 ? true : 'not kept: ' + JSON.stringify(k) + ' | not filtered: ' + JSON.stringify(f);
  });
  row('CH-12', () => {
    const k = wrongKept(CH12_EVENTS.map(p => PFX12 + p), true), f = wrongKept(CH12_VAGUE.map(p => PFX12 + p), false);
    if (CH12_EVENTS.length !== 20 || CH12_VAGUE.length !== 25) return 'row set size changed';
    return k.length === 0 && f.length === 0 ? true : 'not kept: ' + JSON.stringify(k) + ' | not filtered: ' + JSON.stringify(f);
  });
  row('CH-13', () => {
    const k = wrongKept(CH13_EVENTS.map(p => PFX12 + p), true), f = wrongKept(CH13_VAGUE.map(p => PFX12 + p), false);
    if (CH13_EVENTS.length !== 12 || CH13_VAGUE.length !== 11) return 'row set size changed';
    return k.length === 0 && f.length === 0 ? true : 'not kept: ' + JSON.stringify(k) + ' | not filtered: ' + JSON.stringify(f);
  });
  row('CH-14', () => {
    if (CH14_EVENTS.length !== 30 || CH14_VAGUE.length !== 30 || CH14_EVENTS.filter(e => e[1]).length !== 3) return 'row set size changed';
    const kept = CH14_EVENTS.filter(e => !e[1]).map(e => PFX14 + e[0]);
    const miss = CH14_EVENTS.filter(e => e[1]).map(e => PFX14 + e[0]);
    const k = wrongKept(kept, true), m = wrongKept(miss, false), f = wrongKept(CH14_VAGUE.map(p => PFX14 + p), false);
    return k.length === 0 && m.length === 0 && f.length === 0 ? true : 'not kept: ' + JSON.stringify(k) + ' | miss kept: ' + JSON.stringify(m) + ' | vague kept: ' + JSON.stringify(f);
  });
  row('CH-15', () => {
    const D = fns.weak();
    const priceFiller = 'TICKER: TST\nBULLISH: October 13 — MGOR closed at ILA 47,840, up 3.84%\nBEARISH: No specific downside catalyst reported\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: stable — no analyst revision identified\nEARNINGS: NONE\n';
    const real = 'TICKER: TST\nBULLISH: Record earnings beat lifted guidance (Oct 2)\nBEARISH: NONE\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: stable — no analyst revision identified\nEARNINGS: NONE\n';
    if (priceFiller.length >= 500 || real.length >= 500) return 'fixture lengths wrong';
    const a = D(priceFiller, parseBlock(priceFiller), 'parsed');
    const b = D(real, parseBlock(real), 'parsed');
    return a === 'short-raw' && b === null ? true : 'price+filler ' + a + ' real ' + b;
  });
  row('CH-16', () => {
    const o = fns.orch();
    const bad = [];
    const KR = 'No verified catalyst supports the move.';
    const run = (raw, ticker) => {
      const p = ticker ? fns.P(raw, [])[ticker] : parseBlock(raw);
      return o.fn({ news: [], news_bias: 'neutral', key_risk: KR, technical_setup: 'healthy_uptrend' }, p);
    };
    const mg = run(capOf('MGOR.TA#7').raw, capOf('MGOR.TA#7').ticker);
    if (!(mg._hasStructuredCatalysts === true && mg._catalystDirection === 'bearish')) bad.push('MGOR ' + mg._hasStructuredCatalysts + '/' + mg._catalystDirection);
    const priceOnly = run('TICKER: TST\nBULLISH: October 13 — MGOR closed at ILA 47,840, up 3.84%\nBEARISH: October 9 — MGOR rose 2.96% to ILA 45,620, up 3%\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n');
    if (!(priceOnly._hasStructuredCatalysts === false && priceOnly._catalystDirection === null)) bad.push('price-only ' + priceOnly._hasStructuredCatalysts + '/' + priceOnly._catalystDirection);
    const ilaOnly = run('TICKER: TST\nBULLISH: October 13 — MGOR closed at ILA 47,840, up 3.84%\nBEARISH: NONE\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: stable — no analyst revision identified\nEARNINGS: NONE\n');
    if (ilaOnly.key_risk !== KR) bad.push('ILA price-only key_risk replaced: ' + ilaOnly.key_risk);
    const real = run('TICKER: TST\nBULLISH: Record earnings beat lifted guidance (Oct 2)\nBEARISH: NONE\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: stable — no analyst revision identified\nEARNINGS: NONE\n');
    if (!(real._catalystDirection === 'bullish' && real.key_risk === 'Follow-through risk despite confirmed catalysts.')) bad.push('real catalyst ' + real._catalystDirection + ' / ' + real.key_risk);
    return bad.length === 0 ? true : bad.join(' | ');
  });
  row('CH-17', () => {
    const o = fns.orch();
    const D = fns.confidence();
    const levelOf = (block) => {
      const p = parseBlock(block);
      const item = o.fn({ news: [], news_bias: 'neutral', key_risk: 'x', technical_setup: 'healthy_uptrend' }, p);
      item._catalysts = { bullish: p.bullishCatalysts, bearish: p.bearishCatalysts, analystActions: p.analystActions };
      item._auditTrail = { sourceTrace: {} };
      return D(item).level;
    };
    const withRev = levelOf('TICKER: TST\nBULLISH: October 13 — MGOR closed at ILA 47,840, up 3.84%\nBEARISH: NONE\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: stable — no analyst revision identified\nEARNINGS: NONE\n');
    const nothing = levelOf('TICKER: TST\nBULLISH: October 13 — MGOR closed at ILA 47,840, up 3.84%\nBEARISH: NONE\nMACRO: NONE\nANALYST_ACTIONS: NONE\nREVISION_DIRECTION: NONE\nEARNINGS: NONE\n');
    return withRev === 'MODERATE' && nothing === 'LIMITED' ? true : 'with revision ' + withRev + ', nothing else ' + nothing;
  });
  return rows;
}

const SRC = lf(fs.readFileSync(INDEX_PATH, 'utf8'));
check('CH-0 fixture holds 8 captures', CAPS.length === 8, 'got ' + CAPS.length);
const real = evaluateRows(SRC);
const ROW_IDS = ['CH-1', 'CH-2', 'CH-3', 'CH-4', 'CH-5', 'CH-6', 'CH-7', 'CH-8', 'CH-9', 'CH-10', 'CH-11', 'CH-12', 'CH-13', 'CH-14', 'CH-15', 'CH-16', 'CH-17'];
ROW_IDS.forEach(id => check(id, real[id] && real[id].ok === true, real[id] && real[id].info));

// Planted negatives: mutate the production source (anchor exactly once); the named rows must fail.
function expectFail(label, anchor, replacement, ids) {
  const n = count(SRC, anchor);
  check(label + ' anchor occurs exactly once', n === 1, 'occurs ' + n + ' times');
  if (n !== 1) return;
  const mutated = SRC.split(anchor).join(replacement);
  const rows = evaluateRows(mutated);
  ids.forEach(id => check(label + ' makes ' + id + ' fail', rows[id] && rows[id].ok === false, 'row still passes on the mutated source'));
}

// CH-N1: the _FILLER_RE none check removed -> CH-1 (filler) and CH-4 (bare minus).
expectFail('CH-N1', '|| _FILLER_RE.test(s)) return false;', ') return false;', ['CH-1', 'CH-4']);
// CH-N2: the dated price-move alternative removed -> CH-2.
expectFail('CH-N2', '      _isDatedPriceMove(t);\n', '      false;\n', ['CH-2']);
// CH-N3: E-5 reverted (rating-only no longer prevents all-none) -> CH-5, CH-9, CH-10.
expectFail('CH-N3', '      ratingOnlyActions.length === 0 &&\n      _isNoneVal(revDir)\n', '      _isNoneVal(revDir)\n', ['CH-5', 'CH-9', 'CH-10']);
// CH-N4: the catalyst-term keep removed -> CH-2.
expectFail('CH-N4', 'return !(hasCatalyst || _statedEventCause(t));', 'return !_statedEventCause(t);', ['CH-2']);
// CH-N5: the stated-event keep removed -> CH-11 .. CH-14.
expectFail('CH-N5', 'return !(hasCatalyst || _statedEventCause(t));', 'return !hasCatalyst;', ['CH-11', 'CH-12', 'CH-13', 'CH-14']);
// CH-N6: the market veto removed from the noun phrase -> CH-13.
expectFail('CH-N6', 'if (!np.length || np.some(x => _E7_MKT.test(x))) return false;', 'if (!np.length) return false;', ['CH-13']);
// CH-N7: the market-participant subject veto removed -> CH-14.
expectFail('CH-N7', 'if (subj.some(x => _E7_MKT.test(x))) return false;', '', ['CH-14']);
// CH-N8: derived-noun anchoring removed -> CH-11.
expectFail('CH-N8', 'if (mods.some(x => _E7_HEAD.test(x) || _E7_ACTOR.test(x) || _E7_SUFFIX.test(x) || !_E7_ADJ.test(x))) return true;', 'return true;', ['CH-11']);
// CH-N9: the clause boundary removed -> CH-11.
expectFail('CH-N9', 'const end = rest.search(_E7_END);', 'const end = -1;', ['CH-11']);
// CH-N10: any word after a cue counts as an event -> CH-11 .. CH-14.
expectFail('CH-N10', 'if (_e7IsEvent(_e7Words(end === -1 ? rest : rest.slice(0, end)), 0)) return true;', 'if (_e7Words(end === -1 ? rest : rest.slice(0, end)).length) return true;', ['CH-11', 'CH-12', 'CH-13', 'CH-14']);
// CH-N11: "widespread" removed from the adjective class -> CH-11.
expectFail('CH-N11', '|surprise|unexpected|widespread)$/', '|surprise|unexpected)$/', ['CH-11']);

console.log(failures === 0
  ? 'CATALYST HYGIENE OFFLINE: PASS (' + asserts + ' asserts)'
  : 'CATALYST HYGIENE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
