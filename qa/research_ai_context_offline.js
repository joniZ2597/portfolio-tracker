'use strict';

/*
 * research-ai-context-1 — offline QA for the research context the AI receives.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL
 * parsePerplexityContext and formatNewsContext from index.html (brace matching,
 * as in qa/analyst_parser_offline.js) and runs them verbatim in a vm sandbox
 * with a silent console. Fixture: qa/fixtures/research-live-2026-10-15.json,
 * 8 live Perplexity captures (sha256 pinned, RC-0).
 *
 * Rows RC-0 .. RC-10 map to the brief's section 3 table. RC-10e is the accepted
 * advisory A-1 (exact DATE NOTE text, exactly once / absent). RC-N1 .. RC-N5 are
 * planted negatives: each mutates the production source (anchor exactly once)
 * and the named row must fail on the mutated copy.
 *
 * A-2 (call boundary): analyzeChunk / fetchAnthropicAnalysis are forbidden by the
 * brief and stay byte-identical; these rows test the exact formatNewsContext
 * output those calls consume.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'research-live-2026-10-15.json');
const FIXTURE_SHA = 'e6230373a999d09eb0d9507b3db3da17a0032adca389f08841e2c49b9cb887ca';

const NOTE = 'DATE NOTE: analyst dates marked "year unverified" are as reported by the source, without a year. The year is not verified; do not treat these actions as recent on that basis.';
const ALLNONE = sym => 'No catalyst, analyst, earnings, or revision data returned for ' + sym + '.';

let failures = 0;
let asserts = 0;
function check(name, cond, detail) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
  }
}

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const lf = s => s.replace(/\r\n/g, '\n');

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

// Parsed fields recorded from the base index.html (2673713) on the 8 captures.
const BASE = {"NVDA#1":{"analystActions":[],"ratingOnlyActions":[],"bullishCatalysts":["ASML’s strong AI-demand commentary supported semiconductor read-through (October 14)","Jensen Huang’s European investment announcements and NVIDIA’s long-term AI infrastructure outlook"],"bearishCatalysts":["Hotter-than-expected September CPI, 3.7% year over year versus 3.6% expected, pushed Treasury yields higher and pressured high-multiple semiconductor stocks (October 14)","Concerns over AI-spending sustainability, China competition, declining NVIDIA China AI-chip share, and Microsoft’s Maia 300 custom-chip plans"],"macroDrivers":["September CPI exceeded expectations and increased rate concerns, weighing on growth and AI stocks (October 14)","Higher Treasury yields"],"earnings":"NONE","revisionDirection":"stable — no verifiable analyst revision trend identified in the available data","revisionRecency":"unknown","dataFreshness":"today","_allNone":false},"MSFT#2":{"analystActions":[{"bank":"Barclays","action":"raised","target":600,"raw":"Barclays raised PT to $600 from $512 and maintained Buy (October 14)","ratingAction":"maintained","rating":"Buy","ptAction":"raised","ptFrom":512},{"bank":"Morgan Stanley","action":"maintained","target":600,"raw":"Morgan Stanley maintained Buy and $600 PT (October 14)","ratingAction":"maintained","rating":"Buy","ptAction":null,"ptFrom":null}],"ratingOnlyActions":[],"bullishCatalysts":["Barclays’ $600 target reflects confidence in Microsoft’s AI and earnings growth outlook (October 14)","Consensus targets remain bullish, with approximately $581.80–$588.56 average targets and no Sell ratings in one cited analyst set (October 14)"],"bearishCatalysts":["A reported FY2028 EPS estimate reduction indicates valuation or profitability concerns despite higher price targets (October 14)","No specific downside catalyst reported"],"macroDrivers":["AI-infrastructure capacity and investor focus on contracted capacity remain key sector drivers (October 12)"],"earnings":"NONE","revisionDirection":"upgrading — Barclays raised its target materially; major-bank coverage remains bullish","revisionRecency":"October 14","dataFreshness":"today","_allNone":false},"FROG#3":{"analystActions":[{"bank":"UBS","action":"raised","target":125,"raw":"UBS raised PT to $125 from $120 and maintained Buy (October 14)","ratingAction":"maintained","rating":"Buy","ptAction":"raised","ptFrom":120},{"bank":"RBC","action":"maintained","target":118,"raw":"RBC maintained $118 PT (October 13)","ratingAction":"maintained","rating":null,"ptAction":null,"ptFrom":null},{"bank":"Morgan Stanley","action":"raised","target":100,"raw":"Morgan Stanley raised PT to $100 and maintained Equalweight","ratingAction":"maintained","rating":null,"ptAction":"raised","ptFrom":null}],"ratingOnlyActions":[{"bank":"Truist","action":"maintained","ratingAction":"maintained","rating":"Buy","raw":"Truist maintained Buy at $110"}],"bullishCatalysts":["UBS cited expected Q3 cloud growth of 54%–55% or higher versus 53% in Q2 (October 14)","AI coding growth and binary monetization cited by Truist as additional drivers"],"bearishCatalysts":["Consensus targets include a low of $51, creating material downside dispersion"],"macroDrivers":[],"earnings":"NONE","revisionDirection":"upgrading — UBS and Morgan Stanley raised targets; recent Buy upgrade to $114 also reported","revisionRecency":"October 14","dataFreshness":"today","_allNone":false},"ENPH#4":{"analystActions":[{"bank":"Morgan Stanley","action":"cut","target":24,"raw":"Morgan Stanley cut PT $24 from $27 and maintained Underweight (October 14)","ratingAction":"maintained","rating":"Underweight","ptAction":"cut","ptFrom":null},{"bank":"Susquehanna","action":"cut","target":35,"raw":"Susquehanna cut PT $35 from $37 and maintained Neutral (October 14)","ratingAction":"maintained","rating":"Neutral","ptAction":"cut","ptFrom":null}],"ratingOnlyActions":[],"bullishCatalysts":["Revenue modestly exceeded consensus in the latest reported quarter ($291.85M vs. $289.76M) (July 28)","Consensus analyst target remains substantially above the current share price, at approximately $43.52"],"bearishCatalysts":["Morgan Stanley cut its target to $24 and retained Underweight; Susquehanna cut its target to $35 and retained Neutral (October 14)","Investors remain concerned about declining solar demand and the potential expiration of the 30% U.S. residential solar tax credit"],"macroDrivers":["Possible expiration of the 30% U.S. residential solar tax credit is driving concern over a post-incentive demand pullback (October 14)","Broader clean-energy-sector weakness is adding pressure"],"earnings":"Q2 2026 miss, EPS $0.46 vs. $0.47 consensus; revenue $291.85M vs. $289.76M consensus, down 19.6% YoY (July 28)","revisionDirection":"downgrading — two PT cuts in the past 30 days, with no cited upgrades","revisionRecency":"October 14","dataFreshness":"today","_allNone":false},"QQQ#5":{"analystActions":[],"ratingOnlyActions":[],"bullishCatalysts":["Continued AI enthusiasm and strength in selected large-cap technology and social-media stocks supported QQQ earlier in the window, with QQQ reaching $750.58 on October 9[5]","Meta rose 2.45% on October 13 after optimism around its Muse AI agent[4]"],"bearishCatalysts":["Hot September CPI pushed QQQ lower on October 14; headline CPI rose 0.6% month over month and 3.7% year over year, while core CPI rose 0.3% month over month and 2.6% year over year[1][2]","Semiconductor weakness intensified after China’s CXMT said it planned a more advanced chip release by year-end, pressuring Micron and other memory stocks[4]"],"macroDrivers":["Hotter inflation revived expectations for an October Federal Reserve rate increase, lifting pressure on long-duration technology valuations; rising oil prices and geopolitical risks added to the defensive tone[1][6][7]"],"earnings":"NONE","revisionDirection":"stable — no relevant QQQ-specific analyst revision identified in the past 30 days","revisionRecency":"unknown","dataFreshness":"today","_allNone":false},"NXSN.TA#6":{"analystActions":[],"ratingOnlyActions":[],"bullishCatalysts":["Record Q2 2026 results and EPS beat; $27.5 million in new orders[1][2]","2026 revenue target of approximately $315 million and 87% YoY growth[2]"],"bearishCatalysts":[],"macroDrivers":[],"earnings":"Q2 2026 — beat, EPS 169.32 ILA vs 130.37 ILA estimate; revenue detail not available in the retrieved data[1]","revisionDirection":"stable — no relevant analyst revision identified in the past 30 days","revisionRecency":"unknown","dataFreshness":"today","_allNone":false},"MGOR.TA#7":{"analystActions":[],"ratingOnlyActions":[],"bullishCatalysts":["October 9 — MGOR rose 2.96% to ILA 45,620 while the TA-35 fell 0.69%, showing relative strength[2]","October 13 — MGOR closed at ILA 47,840, up 3.84%[1]"],"bearishCatalysts":["October 6 — shares were reported at ILA 47,660, down 4.51%, indicating elevated volatility after a sharp pullback[4]","Valuation risk — P/E of 13.38 versus a sector average of 10.30[5]"],"macroDrivers":["October 9 — Israeli equities declined, with the TA-35 down 0.69% and banking, finance, and insurance sectors leading the weakness[2]","Israeli real-estate-sector earnings are forecast to grow 21.4% annually[3]"],"earnings":"Latest reported release, August 10 — EPS 6.69; revenue ILA 133.98 million; no consensus comparison available","revisionDirection":"stable — no analyst revision identified in the available past-30-day data","revisionRecency":"unknown","dataFreshness":"this week","_allNone":false},"NXSN.TA#8":{"analystActions":[],"ratingOnlyActions":[],"bullishCatalysts":["$3.5 million repeat order (October 5–9)","raised 2026 revenue target and strong Q2 profitability (August 2026)[1][5]"],"bearishCatalysts":["shares fell 24% over four sessions, wiping approximately ₪5.4 billion from market capitalization; the sharp reversal indicates heavy profit-taking and valuation risk (October 11)[8]","recent sector weakness, with Israeli technology stocks down 10% over seven days (October 14)[4]"],"macroDrivers":["Israeli technology-sector selloff and broader risk reduction pressured the shares despite company-specific growth catalysts (October 11–14)[4][8]"],"earnings":"Q2 2026 beat — revenue ₪88.15 million and earnings ₪53.65 million; reported EPS ₪1.67 versus ₪1.28 estimate, a 30.5% surprise (August 10)[1]","revisionDirection":"upgrading — latest identified action was a PT increase; no additional revision found in the past 30 days","revisionRecency":"January 16","dataFreshness":"today","_allNone":false}};

const fixtureBuf = fs.readFileSync(FIXTURE_PATH);
const CAPS = JSON.parse(fixtureBuf.toString('utf8')).captures;

function build(src) {
  const a = extractFunctionSource(src, 'parsePerplexityContext');
  const b = extractFunctionSource(src, 'formatNewsContext');
  if (!a || !b) return null;
  const ctx = { console: { log() {}, warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(a + '\n' + b + '\nthis.P = parsePerplexityContext; this.F = formatNewsContext;', ctx);
  return { P: ctx.P, F: ctx.F };
}

const field = (raw, label) => {
  const m = raw.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'));
  return m && !/^NONE\b/i.test(m[1].trim()) ? m[1].trim() : null;
};
const count = (hay, needle) => hay.split(needle).length - 1;
const PICK = ['analystActions', 'ratingOnlyActions', 'bullishCatalysts', 'bearishCatalysts', 'macroDrivers', 'earnings', 'revisionDirection', 'revisionRecency', 'dataFreshness', '_allNone'];

// Evaluate every row against one source text; returns { id: { ok, info } }.
function evaluateRows(src) {
  const rows = {};
  const row = (id, fn) => {
    try { const r = fn(); rows[id] = r === true ? { ok: true } : { ok: false, info: String(r) }; }
    catch (e) { rows[id] = { ok: false, info: 'threw: ' + e.message }; }
  };
  const fns = build(src);
  const ctxOf = key => {
    const cap = CAPS.find(c => c.key === key);
    const parsed = fns.P(cap.raw, []);
    const pd = {}; pd[cap.ticker] = parsed[cap.ticker];
    return { ctx: fns.F(pd, cap.ticker), p: parsed[cap.ticker], cap };
  };
  const mk = s => fns.F(fns.P('TICKER: ZZZ\nANALYST_ACTIONS: ' + s + '\nDATA_FRESHNESS: today', []), 'ZZZ');

  row('RC-1', () => {
    const miss = []; let n = 0;
    for (const cap of CAPS) {
      const { ctx } = ctxOf(cap.key);
      [['GUIDANCE', 'GUIDANCE: '], ['CONTRACTS', 'CONTRACTS: '], ['PEER_MOVE', 'PEER MOVE: ']].forEach(([l, lab]) => {
        const v = field(cap.raw, l);
        if (v) { n += 1; if (ctx.indexOf(lab + v.slice(0, 120)) === -1) miss.push(cap.key + ':' + l); }
      });
    }
    if (n !== 11) return 'expected 11 non-NONE fields in the fixture, found ' + n;
    return miss.length === 0 ? true : 'missing: ' + miss.join(' ');
  });
  row('RC-2', () => {
    const { ctx } = ctxOf('FROG#3');
    return /^(GUIDANCE|CONTRACTS|PEER MOVE):/m.test(ctx) ? 'FROG has a NONE-field line' : true;
  });
  row('RC-3', () => {
    const a = ctxOf('MSFT#2').ctx, e = ctxOf('ENPH#4').ctx, f = ctxOf('FROG#3').ctx;
    const need = [
      [a, 'Barclays: PT raised to $600 from $512; maintained Buy (October 14; year unverified)'],
      [e, 'Morgan Stanley: PT cut to $24; maintained Underweight (October 14; year unverified)'],
      [e, 'Susquehanna: PT cut to $35; maintained Neutral (October 14; year unverified)'],
      [f, 'RBC: PT maintained at $118 (October 13; year unverified)']
    ];
    const bad = need.filter(([h, s]) => !h.includes(s)).map(([, s]) => s);
    return bad.length === 0 ? true : 'missing: ' + bad.join(' || ');
  });
  row('RC-4', () => {
    const f = ctxOf('FROG#3').ctx;
    return /^RATING ACTIONS \(no PT\): Truist: maintained Buy$/m.test(f) ? true : 'no Truist rating-only line';
  });
  row('RC-5', () => {
    const bad = [];
    for (const cap of CAPS) {
      const { ctx } = ctxOf(cap.key);
      const line = (ctx.match(/^ANALYST ACTIONS:.*$/m) || [''])[0];
      const rawAA = field(cap.raw, 'ANALYST_ACTIONS') || '';
      (line.match(/\$[\d,.]+/g) || []).forEach(n => { if (!rawAA.includes(n)) bad.push(cap.key + ' ' + n); });
    }
    return bad.length === 0 ? true : 'invented: ' + bad.join(' ');
  });
  row('RC-6', () => {
    const diff = [];
    for (const cap of CAPS) {
      const p = fns.P(cap.raw, [])[cap.ticker];
      const got = {}; PICK.forEach(k => { got[k] = p[k]; });
      if (JSON.stringify(got) !== JSON.stringify(BASE[cap.key])) diff.push(cap.key);
    }
    return diff.length === 0 ? true : 'changed: ' + diff.join(' ');
  });
  row('RC-7a', () => {
    const p = fns.P('TICKER: ZZZ\nANALYST_ACTIONS: NONE\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nEARNINGS: NONE\nREVISION_DIRECTION: NONE\nGUIDANCE: NONE', []);
    const got = fns.F(p, 'ZZZ');
    return got === ALLNONE('ZZZ') ? true : JSON.stringify(got);
  });
  row('RC-7b', () => {
    const p = fns.P('TICKER: ZZZ\nANALYST_ACTIONS: NONE\nBULLISH: NONE\nBEARISH: NONE\nMACRO: NONE\nEARNINGS: NONE\nREVISION_DIRECTION: NONE\nGUIDANCE: cut FY revenue guide to $10B (Oct 1)', []);
    const got = fns.F(p, 'ZZZ');
    return got === ALLNONE('ZZZ') + '\nGUIDANCE: cut FY revenue guide to $10B (Oct 1)' ? true : JSON.stringify(got);
  });
  row('RC-8', () => {
    const bad = [];
    if (fns.F({ X: { _unavailable: true } }, 'X') !== 'No research data for X — upstream Perplexity unavailable.') bad.push('unavailable');
    if (fns.F({}, 'X') !== 'No research data for X.') bad.push('missing');
    const plain = 'Plain prose with no ticker headers and no analyst actions at all, long enough to pass the fifty character guard.';
    const pr = fns.P(plain, []);
    if (!pr.__raw__ || pr.__raw__._allNone !== true) bad.push('__raw__ not built / not allNone');
    else if (fns.F(pr, 'ZZZ') !== ALLNONE('ZZZ')) bad.push('__raw__ allNone sentence');
    const pr2 = fns.P('Barclays raised PT to $600 from $512 and maintained Buy (October 14). No ticker headers in this block of prose at all.', []);
    const o2 = fns.F(pr2, 'ZZZ');
    if (!pr2.__raw__ || o2.indexOf('RAW CONTEXT: ' + pr2.__raw__.rawText.slice(0, 400)) === -1) bad.push('__raw__ RAW CONTEXT');
    return bad.length === 0 ? true : 'changed: ' + bad.join(' ');
  });
  row('RC-9', () => {
    const p = fns.P('TICKER: ZZZ\nBULLISH: x\nGUIDANCE: ' + 'G'.repeat(500), []);
    const l = (fns.F(p, 'ZZZ').match(/^GUIDANCE:.*$/m) || [''])[0];
    return l.length === 'GUIDANCE: '.length + 300 && l.endsWith('…') ? true : 'len ' + l.length;
  });
  row('RC-10a', () => {
    const a = mk('Citi raised PT to $50 from $40 (Oct 2)');
    return a.includes('(Oct 2; year unverified)') && /^DATE NOTE: /m.test(a) ? true : JSON.stringify(a);
  });
  row('RC-10b', () => {
    const y = mk('Citi raised PT to $50 from $40 (Oct 2, 2025)');
    return y.includes('(Oct 2, 2025)') && !/year unverified/.test(y) && !/^DATE NOTE/m.test(y) ? true : JSON.stringify(y);
  });
  row('RC-10c', () => {
    const bad = [];
    for (const cap of CAPS) {
      const { ctx } = ctxOf(cap.key);
      ((ctx.match(/^(ANALYST ACTIONS|RATING ACTIONS).*$/gm) || []).join(' ').match(/\b(19|20)\d{2}\b/g) || []).forEach(yr => { if (!cap.raw.includes(yr)) bad.push(cap.key + ' ' + yr); });
    }
    return bad.length === 0 ? true : 'added: ' + bad.join(' ');
  });
  row('RC-10d', () => {
    const a = mk('Citi raised PT to $50 from $40 (Oct 2)');
    return a.includes('[research freshness: today]') && !a.includes('[data: ') ? true : JSON.stringify(a);
  });
  // A-1: the exact DATE NOTE text, exactly once where a year-less date renders, absent otherwise.
  row('RC-10e', () => {
    const bad = [];
    const dated = mk('Citi raised PT to $50 from $40 (Oct 2, 2025)');
    if (count(dated, 'DATE NOTE') !== 0) bad.push('dated: note present');
    const yearless = mk('Citi raised PT to $50 from $40 (Oct 2)');
    if (count(yearless, NOTE) !== 1 || count(yearless, 'DATE NOTE') !== 1) bad.push('yearless: note not exactly once');
    if (!yearless.split('\n').includes(NOTE)) bad.push('yearless: note is not a whole line');
    for (const cap of CAPS) {
      const { ctx, p } = ctxOf(cap.key);
      const lines = (ctx.match(/^(ANALYST ACTIONS|RATING ACTIONS).*$/gm) || []).join('\n');
      const want = lines.includes('year unverified') ? 1 : 0;
      if (count(ctx, NOTE) !== want || count(ctx, 'DATE NOTE') !== want) bad.push(cap.key + ': note count != ' + want);
      if (cap.key === 'QQQ#5' && (p.analystActions.length !== 0 || count(ctx, 'DATE NOTE') !== 0)) bad.push('QQQ: note with no analyst actions');
      if (['MSFT#2', 'FROG#3', 'ENPH#4'].includes(cap.key) && count(ctx, NOTE) !== 1) bad.push(cap.key + ': note not exactly once');
    }
    return bad.length === 0 ? true : bad.join(' | ');
  });
  return rows;
}

// RC-0: fixture integrity.
// Hash the LF-normalised bytes: core.autocrlf=true can check this fixture out with CRLF, and the pin is of the committed (LF) form.
const fixtureLfSha = sha256(Buffer.from(lf(fixtureBuf.toString('utf8')), 'utf8'));
check('RC-0 fixture sha256 pinned', fixtureLfSha === FIXTURE_SHA, fixtureLfSha);
check('RC-0 fixture holds 8 captures', CAPS.length === 8, 'got ' + CAPS.length);

const SRC = lf(fs.readFileSync(INDEX_PATH, 'utf8'));
const real = evaluateRows(SRC);
const ROW_IDS = ['RC-1', 'RC-2', 'RC-3', 'RC-4', 'RC-5', 'RC-6', 'RC-7a', 'RC-7b', 'RC-8', 'RC-9', 'RC-10a', 'RC-10b', 'RC-10c', 'RC-10d', 'RC-10e'];
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

// RC-N1: the three extra lines are no longer pushed -> RC-1.
expectFail('RC-N1', 'lines.push(..._extra);', '', ['RC-1']);
// RC-N2: ptFrom (from-target) removed from the analyst line -> RC-3.
expectFail('RC-N2a', 'if (a.ptFrom) s += ` from $${a.ptFrom}`;', '', ['RC-3']);
// RC-N2b: direction removed from the analyst line -> RC-3.
expectFail('RC-N2b', "(pv ? pv + (_MOVE.test(pv) ? ' to ' : ' at ') : '')", "''", ['RC-3']);
// RC-N3: the rating-only line removed -> RC-4.
expectFail('RC-N3', "lines.push('RATING ACTIONS (no PT): '", "void ('RATING ACTIONS (no PT): '", ['RC-4']);
// RC-N4: the year-less marker removed -> RC-10a.
expectFail('RC-N4', "return m[1] + '; year unverified';", 'return m[1];', ['RC-10a']);
// RC-N5 (A-1): the DATE NOTE push removed, and its text altered -> RC-10e.
expectFail('RC-N5a', "if (_yearless) lines.push(", 'if (false) lines.push(', ['RC-10e']);
expectFail('RC-N5b', 'The year is not verified; do not treat', 'The year is verified; do not treat', ['RC-10e']);

console.log(failures === 0
  ? 'RESEARCH AI CONTEXT OFFLINE: PASS (' + asserts + ' asserts)'
  : 'RESEARCH AI CONTEXT OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
