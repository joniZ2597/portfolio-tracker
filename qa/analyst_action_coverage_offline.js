'use strict';

/*
 * analyst-action-coverage-1 — offline QA for the analyst actions the parser missed or misread.
 *
 * Pure Node, no network, no browser, no storage. Extracts the REAL parsePerplexityContext from
 * index.html (brace matching, as in qa/analyst_parser_offline.js) and runs it verbatim in a vm
 * sandbox with a silent console. Rows AC-1 .. AC-25 map to the brief's section 3 table; AC-N*
 * are planted negatives: each mutates the production source (anchor exactly once) and the named
 * row must fail on the mutated copy.
 *
 * AC-8 / AC-9 compare against parse results recorded from the base index.html (05e9fac): a
 * truncated sha256 of the canonical JSON for every result that must stay identical, explicit
 * expectations for every result that is meant to change.
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

function build(src) {
  const a = extractFunctionSource(src, 'parsePerplexityContext');
  if (!a) return null;
  const ctx = { console: { log() {}, warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(a + '\nthis.P = parsePerplexityContext;', ctx);
  return ctx.P;
}

const CAPS = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).captures;

// Parsed-field hashes recorded from the base index.html (05e9fac) on the 8 live captures.
const LIVE_BASE = {
  'NVDA#1': { rest: '4015e2b9de12b234', aa: '9dfa537c934447b2' },
  'MSFT#2': { rest: '90ffd3b019658ca6' },
  'FROG#3': { rest: '149d3dd5c2cfb3bd' },
  'ENPH#4': { rest: '4effb9eacb212354' },
  'QQQ#5': { rest: 'f588becd308c8de0', aa: '9dfa537c934447b2' },
  'NXSN.TA#6': { rest: '4581ae6c68e46d2b', aa: '9dfa537c934447b2' },
  'MGOR.TA#7': { rest: '0cb937910c80e671', aa: '9dfa537c934447b2' },
  'NXSN.TA#8': { rest: '497916daf9dc4c93', aa: '9dfa537c934447b2' }
};

// The 21 real stored items (evidence/stored-items.txt), with the base result hash of {analystActions, ratingOnlyActions}.
// An empty hash means the result is meant to change (explicit expectation in AC-9).
const STORED = [
  ['FROG', 'Wall Street Zen upgraded FROG from Hold to Buy, consensus PT $109.48 (October 10)', ''],
  ['ROK', 'Morgan Stanley raised PT to $545 from $525 and maintained Overweight (September 30)', 'a7e118a62ef1c617'],
  ['ROK', 'Goldman Sachs cut PT to $485 from $510 and maintained Neutral (September 30)', '4a98970e150904a4'],
  ['CRWD', 'StoneX maintained Buy and raised PT $325 (October 6) from $250', ''],
  ['CRWD', 'TD Cowen maintained Buy and raised PT $280 from $250 (October 2)', ''],
  ['NVDA', 'UBS reiterated PT $300 (Oct 9)', 'be3c06a898b92e73'],
  ['MRNA', 'Bank of America raised PT to $200 from $170 and maintained Neutral (October 9)', 'e62fecd6029a5be9'],
  ['MRNA', 'Morgan Stanley raised PT to $95 from $89 and maintained Equal Weight (October 7)', '8c8714e102cd403d'],
  ['MRNA', 'Citi downgraded to Sell from Neutral and raised PT to $80 from $60 (September 30)', '82254cab37d022d8'],
  ['NXSN.TA', 'Freedom Broker raised PT to $9.49', '56eb6b625b7232bf'],
  ['CIEN', 'Needham reiterated Buy PT $600', 'e8971a5f0ebcb03e'],
  ['ENPH', 'Energy stock saw a 12-month price target cut to $46.51', ''],
  ['COP', 'Truist Securities initiated Buy → Hold PT $100', '032d3d3fe8e38cfc'],
  ['CBOE', 'TD Cowen upgraded to Buy from Hold and raised PT to $334 from $315 (October 5)', 'c40a6afe462a7431'],
  ['CBOE', 'Goldman Sachs upgraded to Neutral from Sell and cut PT to $300 from $304 (October 2)', 'c635138713d5ce7b'],
  ['CBOE', 'Barclays maintained Overweight and trimmed PT to $343 from $354 (October 7)', '2c363f06db105d07'],
  ['MSFT', 'Wells Fargo raised PT $725 from $700 (October 8) and added MSFT to its Tactical Ideas list', ''],
  ['MSFT', 'Melius Research upgraded to Buy and set PT $665', '1259409f6ab65824'],
  ['MSFT', 'Scotiabank raised PT to $615', '46ce7af0b738b09d'],
  ['MSFT', 'Piper Sandler raised PT to $610', 'e640dd73c90bf4b1'],
  ['MSFT', 'Barclays raised PT to $600 from $512', '5600ad8a3028de3b']
];

const without = (o, ...ks) => { const c = Object.assign({}, o); ks.forEach(k => delete c[k]); return c; };

// Evaluate every row against one source text; returns { id: { ok, info } }.
function evaluateRows(src) {
  const rows = {};
  const row = (id, fn) => {
    try { const r = fn(); rows[id] = r === true ? { ok: true } : { ok: false, info: String(r) }; }
    catch (e) { rows[id] = { ok: false, info: 'threw: ' + e.message }; }
  };
  const P = build(src);
  const parse = input => P('TICKER: TST\nANALYST_ACTIONS: ' + input + '\nEARNINGS: NONE\n', []).TST;
  const aa = input => parse(input).analystActions;
  const ro = input => parse(input).ratingOnlyActions;
  const slim = a => a.map(x => without(x, 'raw'));
  const eq = (got, want) => canon(got) === canon(want) ? true : 'got ' + canon(got) + ' want ' + canon(want);
  // one PT action: bank / target / ptFrom (and optionally rating, ratingAction)
  const one = (input, want) => {
    const a = aa(input);
    if (a.length !== 1) return 'expected 1 PT action, got ' + a.length + ': ' + canon(slim(a));
    const bad = Object.keys(want).filter(k => a[0][k] !== want[k]);
    return bad.length === 0 ? true : bad.map(k => k + ' got ' + a[0][k] + ' want ' + want[k]).join('; ');
  };
  const none = input => { const p = parse(input); return p.analystActions.length === 0 && p.ratingOnlyActions.length === 0 ? true : 'expected nothing, got ' + canon(slim(p.analystActions)) + ' / ' + canon(slim(p.ratingOnlyActions)); };
  const roOnly = (input, want) => {
    const p = parse(input);
    if (p.analystActions.length !== 0) return 'expected no PT action, got ' + canon(slim(p.analystActions));
    return eq(slim(p.ratingOnlyActions).map(r => ({ bank: r.bank, action: r.action, rating: r.rating })), want);
  };

  row('AC-1', () => one('J.P. Morgan reaffirmed Buy and $625 PT (October 13)', { bank: 'J.P. Morgan', ratingAction: 'reaffirmed', target: 625, rating: 'Buy' }));
  row('AC-2', () => {
    const r = one('Truist maintained Buy at $110', { bank: 'Truist', ratingAction: 'maintained', target: 110, rating: 'Buy' });
    if (r !== true) return r;
    return ro('Truist maintained Buy at $110').length === 0 ? true : 'unexpected rating-only entry';
  });
  row('AC-3', () => one('Morgan Stanley raised PT to $100 and maintained Equalweight', { bank: 'Morgan Stanley', target: 100, rating: 'Equal Weight' }));
  row('AC-4', () => one('Morgan Stanley cut PT $24 from $27 and maintained Underweight (October 14)', { bank: 'Morgan Stanley', target: 24, ptFrom: 27 }));
  row('AC-5', () => one('Goldman raised PT $180 → $200 (Oct 2)', { bank: 'Goldman', target: 200, ptFrom: 180 }));
  row('AC-6', () => roOnly('Wall Street Zen upgraded FROG from Hold to Buy, consensus PT $109.48', [{ bank: 'Wall Street Zen', action: 'upgraded', rating: 'Buy' }]));
  row('AC-7', () => none('Energy stock saw a 12-month price target cut to $46.51'));

  row('AC-U1', () => one('UBS raised PT $180 to $200', { bank: 'UBS', target: 200, ptFrom: 180 }));
  row('AC-U2', () => one('Goldman raised PT by $10 to $300', { bank: 'Goldman', target: 300, ptFrom: null }));
  row('AC-U3', () => one('Barclays raised PT to $600 from $512', { bank: 'Barclays', target: 600, ptFrom: 512 }));
  row('AC-U4', () => one('Citi initiated Equal-Weight with a $301 PT', { bank: 'Citi', target: 301, rating: 'Equal Weight' }));
  row('AC-U5', () => none('Analysts average PT $150'));

  row('AC-8', () => {
    const bad = [];
    const WANT = {
      'MSFT#2': [
        { bank: 'Barclays', action: 'raised', target: 600, ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', ptFrom: 512 },
        { bank: 'Morgan Stanley', action: 'maintained', target: 600, ratingAction: 'maintained', rating: 'Buy', ptAction: null, ptFrom: null },
        { bank: 'J.P. Morgan', action: 'reaffirmed', target: 625, ratingAction: 'reaffirmed', rating: 'Buy', ptAction: null, ptFrom: null }
      ],
      'FROG#3': [
        { bank: 'UBS', action: 'raised', target: 125, ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', ptFrom: 120 },
        { bank: 'RBC', action: 'maintained', target: 118, ratingAction: 'maintained', rating: null, ptAction: null, ptFrom: null },
        { bank: 'Morgan Stanley', action: 'raised', target: 100, ratingAction: 'maintained', rating: 'Equal Weight', ptAction: 'raised', ptFrom: null },
        { bank: 'Truist', action: 'maintained', target: 110, ratingAction: 'maintained', rating: 'Buy', ptAction: null, ptFrom: null }
      ],
      'ENPH#4': [
        { bank: 'Morgan Stanley', action: 'cut', target: 24, ratingAction: 'maintained', rating: 'Underweight', ptAction: 'cut', ptFrom: 27 },
        { bank: 'Susquehanna', action: 'cut', target: 35, ratingAction: 'maintained', rating: 'Neutral', ptAction: 'cut', ptFrom: 37 }
      ]
    };
    for (const cap of CAPS) {
      const p = P(cap.raw, [])[cap.ticker];
      const base = LIVE_BASE[cap.key];
      if (!base) { bad.push(cap.key + ' unknown'); continue; }
      const rest = without(p, 'analystActions', 'ratingOnlyActions');
      if (h16(canon(rest)) !== base.rest) bad.push(cap.key + ' non-analyst fields changed');
      if (WANT[cap.key]) {
        if (canon(slim(p.analystActions)) !== canon(WANT[cap.key])) bad.push(cap.key + ' analystActions ' + canon(slim(p.analystActions)));
        if (p.ratingOnlyActions.length !== 0) bad.push(cap.key + ' ratingOnlyActions not empty');
      } else if (h16(canon({ analystActions: p.analystActions, ratingOnlyActions: p.ratingOnlyActions })) !== base.aa) bad.push(cap.key + ' analyst arrays changed');
    }
    return bad.length === 0 ? true : bad.join(' | ');
  });

  row('AC-9', () => {
    const bad = [];
    let same = 0, changed = 0;
    STORED.forEach(([sym, text, hash], i) => {
      const p = parse(text);
      const got = h16(canon({ a: p.analystActions, r: p.ratingOnlyActions }));
      if (hash) { if (got === hash) same += 1; else bad.push('#' + i + ' ' + sym + ' changed'); return; }
      changed += 1;
      const a = p.analystActions, r = p.ratingOnlyActions;
      const pick = (x, ks) => ks.map(k => x[k]).join('/');
      if (i === 0) { if (!(a.length === 0 && r.length === 1 && pick(r[0], ['bank', 'ratingAction', 'rating']) === 'Wall Street Zen/upgraded/Buy')) bad.push('#0 FROG ' + canon(slim(a)) + canon(slim(r))); }
      else if (i === 3) { if (!(a.length === 1 && pick(a[0], ['bank', 'target', 'ptFrom']) === 'StoneX/325/250')) bad.push('#3 StoneX ' + canon(slim(a))); }
      else if (i === 4) { if (!(a.length === 1 && pick(a[0], ['bank', 'target', 'ptFrom']) === 'TD Cowen/280/250')) bad.push('#4 TD Cowen ' + canon(slim(a))); }
      else if (i === 11) { if (!(a.length === 0 && r.length === 0)) bad.push('#11 ENPH ' + canon(slim(a))); }
      else if (i === 16) { if (!(a.length === 1 && pick(a[0], ['bank', 'target', 'ptFrom']) === 'Wells Fargo/725/700')) bad.push('#16 Wells Fargo ' + canon(slim(a))); }
      else bad.push('#' + i + ' no expectation');
    });
    if (STORED.length !== 21) bad.push('expected 21 stored items, found ' + STORED.length);
    if (same !== 16 || changed !== 5) bad.push('expected 16 identical + 5 changed, got ' + same + ' + ' + changed);
    return bad.length === 0 ? true : bad.join(' | ');
  });

  row('AC-10a', () => one('Susquehanna maintained Buy and cut PT to $1,270 (October 14) from $1,300', { bank: 'Susquehanna', target: 1270, ptFrom: 1300 }));
  row('AC-10b', () => one('JPMorgan maintained Overweight and cut PT to $1,150 (October 9) from $1,330', { bank: 'JPMorgan', target: 1150, ptFrom: 1330 }));
  row('AC-10c', () => one('StoneX maintained Buy and raised PT $325 (October 6) from $250', { bank: 'StoneX', target: 325, ptFrom: 250 }));

  row('AC-11', () => roOnly('KeyBanc, Mizuho, and UBS reiterated bullish stances; consensus PT approximately $322–$334',
    [{ bank: 'KeyBanc', action: 'reiterated', rating: null }, { bank: 'Mizuho', action: 'reiterated', rating: null }, { bank: 'UBS', action: 'reiterated', rating: null }]));
  row('AC-12', () => {
    const a = aa('Goldman Sachs and Morgan Stanley raised PT to $500 (Oct 2)');
    return eq(a.map(x => x.bank + '/' + x.target), ['Goldman Sachs/500', 'Morgan Stanley/500']);
  });
  row('AC-13', () => eq(aa('Oppenheimer reiterated Buy at $1,450 and RBC maintained Buy at $1,225').map(x => x.bank + '/' + x.target + '/' + x.rating), ['Oppenheimer/1450/Buy', 'RBC/1225/Buy']));
  row('AC-U6', () => one('Keefe, Bruyette & Woods raised PT to $60', { bank: 'Keefe, Bruyette & Woods', target: 60 }));
  row('AC-U7', () => eq(aa('Goldman raised PT to $500 and Morgan Stanley cut PT to $400').map(x => x.bank + '/' + x.target), ['Goldman/500', 'Morgan Stanley/400']));

  row('AC-14', () => one('Citi maintained Buy and raised PT to $120 as the stock jumped to $95 (October 2) from $88', { bank: 'Citi', target: 120, ptFrom: null }));
  row('AC-15', () => one('Citi cut PT to $100 (estimate $90) from $80', { bank: 'Citi', target: 100, ptFrom: null }));
  row('AC-16', () => one('Citi raised PT to $120 as shares moved $90 → $95', { bank: 'Citi', target: 120, ptFrom: null }));
  row('AC-17', () => roOnly('Truist maintained Buy at $110 per share', [{ bank: 'Truist', action: 'maintained', rating: 'Buy' }]));
  row('AC-18', () => roOnly('Truist maintained Buy at $110 a share', [{ bank: 'Truist', action: 'maintained', rating: 'Buy' }]));
  row('AC-19', () => one('Johnson Rice and Company raised PT to $60', { bank: 'Johnson Rice and Company', target: 60 }));
  row('AC-20', () => one('Stifel, Nicolaus and Company cut PT to $45', { bank: 'Stifel, Nicolaus and Company', target: 45 }));
  row('AC-21', () => eq(aa('KeyBanc, Mizuho, and UBS raised PT to $300 | Jefferies cut PT to $250 | Citi raised PT to $320 | BofA raised PT to $310').map(x => x.bank),
    ['KeyBanc', 'Mizuho', 'UBS', 'Jefferies', 'Citi']));
  row('AC-22', () => one('Argus upgraded to Strongbuy and set PT $200', { bank: 'Argus', target: 200, rating: 'Strong Buy' }));
  row('AC-23', () => {
    const p = parse('Evercore reiterated its view; results inline with estimates');
    const all = p.analystActions.concat(p.ratingOnlyActions);
    return all.some(x => x.rating === 'In Line') ? 'prose "inline" read as a rating' : true;
  });
  row('AC-24', () => roOnly('Wall Street Zen upgraded to Buy, consensus PT $322–$334', [{ bank: 'Wall Street Zen', action: 'upgraded', rating: 'Buy' }]));
  row('AC-25', () => one('Citi raised PT to $350, above consensus PT of $330', { bank: 'Citi', target: 350 }));
  return rows;
}

const SRC = lf(fs.readFileSync(INDEX_PATH, 'utf8'));
check('AC-0 parsePerplexityContext extracts', build(SRC) !== null);
check('AC-0 fixture holds 8 captures', CAPS.length === 8, 'got ' + CAPS.length);

const real = evaluateRows(SRC);
const ROW_IDS = ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-7', 'AC-U1', 'AC-U2', 'AC-U3', 'AC-U4', 'AC-U5', 'AC-8', 'AC-9',
  'AC-10a', 'AC-10b', 'AC-10c', 'AC-11', 'AC-12', 'AC-13', 'AC-U6', 'AC-U7', 'AC-14', 'AC-15', 'AC-16', 'AC-17', 'AC-18', 'AC-19', 'AC-20',
  'AC-21', 'AC-22', 'AC-23', 'AC-24', 'AC-25'];
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

// AC-N1 (E-1): the reaffirmed forms no longer recognised -> AC-1.
expectFail('AC-N1', "reaffirmed: ['reaffirmed', 'reaffirms', 'reaffirm', 'reaffirming']", "reaffirmed: ['xreaffirmed', 'xreaffirms', 'xreaffirm', 'xreaffirming']", ['AC-1']);
// AC-N2 (E-2): rating names need a separator again -> AC-3.
expectFail('AC-N2', "r.replace(/ /g, '[\\\\s-]*')", "r.replace(/ /g, '[\\\\s-]+')", ['AC-3']);
// AC-N3 (B2): "from" cannot match -> AC-4.
expectFail('AC-N3', "',?\\\\s+from\\\\s+' + _AA_AMT, 'i');\n  const _AA_RULE_B3", "',?\\\\s+fromX\\\\s+' + _AA_AMT, 'i');\n  const _AA_RULE_B3", ['AC-4']);
// AC-N4 (A3): the arrow cannot match -> AC-5; the PT anchor removed -> AC-16.
expectFail('AC-N4a', "(?:\\u2192|->)", "(?:\\u2192X|->X)", ['AC-5']);
expectFail('AC-N4b', "const _AA_RULE_A3 = new RegExp(_AA_TW + '\\\\s+(?:to\\\\s+)?' + _AA_AMT", "const _AA_RULE_A3 = new RegExp(_AA_AMT", ['AC-16']);
// AC-N5 (E2): the rule branch removed -> AC-2; the per-share lookahead removed -> AC-17 / AC-18.
expectFail('AC-N5a', "else if ((m = _AA_RULE_E2.exec(item))) target = _aaNum(m[1]);", '', ['AC-2', 'AC-13']);
expectFail('AC-N5b', "(?!\\\\s*(?:per\\\\s+share|a\\\\s+share|\\\\/\\\\s*share|share\\\\b))", '', ['AC-17', 'AC-18']);
// AC-N6 (consensus guard): removed -> AC-6 and AC-24.
expectFail('AC-N6', "if (target !== null && (m = _AA_CONSENSUS.exec(item)) && _aaNum(m[1]) === target) target = null; // AC-6", '', ['AC-6', 'AC-24']);
// AC-N7 (firm filter): removed -> AC-7.
expectFail('AC-N7', "if (/\\b(?:stocks?|shares|saw|price\\s+targets?|targets?)\\b/i.test(firm)) return null; // AC-7", '', ['AC-7']);
// AC-N8 (B3): the branch removed -> AC-10a; the PT anchor removed -> AC-14; the no-$ rule removed -> AC-15.
expectFail('AC-N8a', "else if (hasTW && (m = _AA_RULE_B3.exec(item))) { target = _aaNum(m[1]); ptFrom = _aaNum(m[2]); }", '', ['AC-10a', 'AC-10c']);
expectFail('AC-N8b', "const _AA_RULE_B3 = new RegExp(_AA_TW + '\\\\s+(?:to\\\\s+)?' + _AA_AMT", "const _AA_RULE_B3 = new RegExp('\\\\bto\\\\s+' + _AA_AMT", ['AC-14']);
expectFail('AC-N8c', "\\\\([^()$]{1,40}\\\\)", "\\\\([^()]{1,40}\\\\)", ['AC-15']);
// AC-N9 (list-split guard): removed -> AC-11.
expectFail('AC-N9', " && _aaVerbs(it.slice(start, m.index)).length) {", ") {", ['AC-11']);
// AC-N10 (multi-firm emit): never split -> AC-11 and AC-12.
expectFail('AC-N10', "const _fp = /\\sand\\s/i.test(r0.bank) ?", "const _fp = false ?", ['AC-11', 'AC-12']);
// AC-N11 (corporate-suffix guard): removed -> AC-19 and AC-20.
expectFail('AC-N11', "? [r0.bank] : _fp;", "? _fp : _fp;", ['AC-19', 'AC-20']);

console.log(failures === 0
  ? 'ANALYST ACTION COVERAGE OFFLINE: PASS (' + asserts + ' asserts)'
  : 'ANALYST ACTION COVERAGE OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
