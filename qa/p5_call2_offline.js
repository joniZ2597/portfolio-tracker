'use strict';

/*
 * P-5 Research-on-Demand — Step 4 offline QA (call-2 synthesis).
 *
 * SCOPE LIMIT — READ FIRST. These fixtures prove OUR code: the portfolio-context
 * projection, the prompt serializer, the response parser, the attribution and
 * prohibited-semantics validators, the packet builder and the renderer. They do
 * NOT prove that a live model obeys the timing, attribution or prohibition
 * instructions in the system prompt. Live compliance is verified only by the
 * Step 4 live sample.
 *
 * Pure Node, no network (fetch is a counterfeit router/spy), no browser, no
 * live services. Covers owner rulings J1-J8 plus Correction 1 (portfolio
 * context), Correction 2 (auditable attribution) and the QA correction: the
 * forbidden-token scan is NEVER pointed at _p5Call2System — that string
 * legitimately contains buy/sell/rating/sentiment AS PROHIBITIONS and a scanner
 * aimed at it would always self-fail. Required clauses are asserted PRESENT
 * there; forbidden-semantics checks run against model OUTPUT instead.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

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
      if (depth === 0) return content.slice(realStart, i + 1);
    }
  }
  return null;
}
function extractVarSource(content, name) {
  const sig = 'var ' + name;
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const semi = content.indexOf(';', start);
  if (semi === -1) return null;
  return content.slice(start, semi + 1);
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');
const FNS = ['_pfIsFiniteNum', '_pfFxRateValid', '_pfFxState', '_pfNormalizeHoldingEntry',
  '_normalizePosition', 'loadHoldings', '_pfCashLoad', '_pfFxLoadCache', '_pfEodLoadCache',
  '_pfEodIsStale', '_pfEffectiveCostIls', '_pfHoldingPl', '_pfHoldingIlsValue',
  '_pfComputePortfolioReporting', '_pfComputeHoldingsSubtotals',
  '_p5NormalizeUrl', '_p5DomainFromUrl', '_p5UsableTitle', '_p5UsableDate',
  '_p5IndexSearchResults', '_p5ValidateItems', '_p5SynthesisPayload',
  '_p5CollectLocalContext', '_p5PacketStatus', '_p5BuildPacket', '_p5RenderPacket',
  '_p5Call1Prompt', '_p5ParseModelItems', '_p5RequestItems',
  '_p5PortfolioContext', '_p5Call2System', '_p5Call2User', '_p5ParseSynthesis',
  '_p5ValidateAttribution', '_p5ProhibitedSemantics', '_p5RequestSynthesis',
  '_p5RunSynthesis', '_p5RunResearch'];
const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
const strippedAll = FNS.map(function (n) { return src[n] || ''; }).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const VARS = Array.from(new Set(strippedAll.match(/\b(?:PF|P5)_[A-Z0-9_]+\b/g) || [])).sort();
for (const n of VARS) { src[n] = extractVarSource(content, n); if (!src[n]) missingExtract.push('var ' + n); }
src._pfRootCorrupted = extractVarSource(content, '_pfRootCorrupted') || 'var _pfRootCorrupted = false;';
VARS.push('_pfRootCorrupted');
if (missingExtract.length > 0) {
  console.log('  FAIL  could not extract: ' + missingExtract.join(', '));
  process.exit(1);
}

function makeLs(seed) {
  const store = {};
  for (const k of Object.keys(seed || {})) store[k] = seed[k];
  const writes = [];
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { writes.push(['set', k]); store[k] = String(v); },
    removeItem: function (k) { writes.push(['rm', k]); delete store[k]; },
    _writes: writes,
    _dump: function () { return JSON.stringify(store); }
  };
}
function makeDoc() {
  const created = [];
  function mkNode(tag) {
    const n = {
      _tag: tag, className: '', textContent: '', children: [],
      appendChild: function (c) { this.children.push(c); return c; },
      removeChild: function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
    };
    Object.defineProperty(n, 'firstChild', { get: function () { return this.children[0] || null; } });
    created.push(n);
    return n;
  }
  const raw = { createElement: function (t) { return mkNode(t); } };
  const doc = new Proxy(raw, {
    get: function (t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      throw new Error('document.' + String(k) + ' touched');
    }
  });
  return { doc: doc, created: created, mkNode: mkNode };
}

// Counterfeit router: distinguishes the two proxies so per-endpoint call counts
// are provable, and records the exact outbound body for prompt assertions.
function routerFetch(routes) {
  const calls = [];
  const fn = function (url, opts) {
    const which = String(url).indexOf('anthropic') !== -1 ? 'anthropic' : 'perplexity';
    calls.push({ which: which, url: url, opts: opts });
    const s = routes[which] || {};
    if (s.throwName) { const e = new Error('stub'); e.name = s.throwName; return Promise.reject(e); }
    const status = s.status || 200;
    return Promise.resolve({
      ok: status < 400,
      status: status,
      json: function () {
        if (s.badJson) return Promise.reject(new Error('bad json'));
        return Promise.resolve(s.body);
      }
    });
  };
  fn._calls = calls;
  fn._count = function (which) { return calls.filter(function (c) { return c.which === which; }).length; };
  return fn;
}

function buildApi(lsSeed, fetchStub, docBundle) {
  const body = VARS.map(n => src[n]).join('\n') + '\n' + FNS.map(n => src[n]).join('\n') +
    '\nreturn { ' + FNS.map(n => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'document', 'console', 'fetch', 'AbortSignal', '"use strict";\n' + body);
  const ls = makeLs(lsSeed);
  const db = docBundle || makeDoc();
  const quiet = { log: function () {}, warn: function () {}, error: function () {} };
  return { api: factory(ls, db.doc, quiet, fetchStub || routerFetch({}), AbortSignal), ls: ls, db: db };
}

const NOW_MS = Date.parse('2026-08-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }

const FULL_SEED = {
  pt_holdings: JSON.stringify({
    AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
           baselineAt: iso(NOW_MS - 3 * DAY) }
  }),
  pt_fx: JSON.stringify({ rate: 3.0, effectiveAt: iso(NOW_MS - DAY), source: 'boi',
    fetchedAt: iso(NOW_MS - DAY), lastAttemptAt: iso(NOW_MS - DAY), lastAttemptOk: true }),
  pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-08-01' }),
  pt_eod_cache: JSON.stringify({ AAA: { changePercent: 1.5 } })
};

const ACCEPTED2 = [
  { inputIndex: 0, url: 'https://ex.com/a', normUrl: 'https://ex.com/a', title: 'Item A',
    date: '2026-08-10', publisher: 'ex.com', summary: 'S1.', summaryOrigin: 'model' },
  { inputIndex: 1, url: 'https://ex.com/b', normUrl: 'https://ex.com/b', title: 'Item B',
    date: '2023-03-12', publisher: 'ex.com', summary: 'S2.', summaryOrigin: 'model' }
];

// The approved Step 4 synthesis-failure vocabulary. Nothing outside this set
// (plus the http-<status> pattern) may ever reach a packet.
const APPROVED_REASONS = ['timeout', 'fetch-failed', 'bad-json', 'empty-content',
  'model-output-unparseable', 'attribution-out-of-range', 'attribution-missing',
  'prohibited-semantics'];
function approvedReason(r) {
  return APPROVED_REASONS.indexOf(r) !== -1 || /^http-\d{3}$/.test(String(r));
}

function anthropicBody(text) { return { content: [{ type: 'text', text: text }] }; }
function synthJson(s) { return JSON.stringify({ synthesis: s }); }

function mkCtx(over) {
  const base = {
    symbol: 'AAA', found: true, corrupt: false,
    holding: { positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
               manualPlPct: null, baselineAt: iso(NOW_MS - 3 * DAY), baselineAgeDays: 3 },
    pl: { currencyKnown: true, costBasisValid: true, nativeAvailable: true, plNative: 100,
          plPctNativePct: 11.11, driftFlag: false, ratioFlag: false, costIlsAvailable: true,
          ilsAvailable: true, fxUsable: true, eligibleForAggregation: true },
    fx: { state: 'fresh', rate: 3, effectiveAt: iso(NOW_MS - DAY) },
    weight: { pct: 22.2, unavailableReason: null },
    market: { present: false, changePercent: null, eodStale: null }
  };
  return Object.assign(base, over || {});
}
function trailTexts(db) { return db.created.map(function (n) { return n.textContent; }); }
function anyText(db, needle) {
  return trailTexts(db).some(function (t) { return t.indexOf(needle) !== -1; });
}

(async function main() {

  // ── CORRECTION 1: portfolioContext derivation ────────────────────────────
  await (async function () {
    const api = buildApi({}).api;
    const PC = api._p5PortfolioContext;

    const full = PC(mkCtx());
    check('pc symbol carried', full.symbol === 'AAA');
    check('pc positionValue amount+currency', full.positionValue.amount === 1000 && full.positionValue.currency === 'USD');
    check('pc costBasis emitted when valid', full.costBasis.amount === 900 && full.costBasis.currency === 'USD');
    check('pc plPct emitted when valid', Math.abs(full.plPct - 11.11) < 1e-9 && full.plUnavailableReason === null);
    check('pc weightPct emitted when available', Math.abs(full.weightPct - 22.2) < 1e-9 && full.weightUnavailableReason === null);

    const notFound = PC(mkCtx({ found: false }));
    check('pc not-found => all null with reasons', notFound.positionValue === null && notFound.costBasis === null &&
      notFound.plPct === null && notFound.weightPct === null);
    const corrupt = PC(mkCtx({ corrupt: true }));
    check('pc corrupt => all null', corrupt.positionValue === null && corrupt.plPct === null);

    const noCur = PC(mkCtx({ holding: { positionSize: 1000, currency: null, costBasis: 900 },
      pl: { currencyKnown: false, costBasisValid: true, nativeAvailable: false } }));
    check('pc currency-not-recorded', noCur.plUnavailableReason === 'currency-not-recorded' && noCur.plPct === null);
    check('pc positionValue null when currency missing', noCur.positionValue === null);

    const noCb = PC(mkCtx({ holding: { positionSize: 1000, currency: 'USD', costBasis: null },
      pl: { currencyKnown: true, costBasisValid: false, nativeAvailable: false } }));
    check('pc cost-basis-not-recorded', noCb.plUnavailableReason === 'cost-basis-not-recorded' && noCb.costBasis === null);

    const drift = PC(mkCtx({ pl: { currencyKnown: true, costBasisValid: true, nativeAvailable: true,
      plPctNativePct: 11.11, driftFlag: true, ratioFlag: false } }));
    check('pc driftFlag => recorded-values-disagree', drift.plUnavailableReason === 'recorded-values-disagree' && drift.plPct === null);
    const ratio = PC(mkCtx({ pl: { currencyKnown: true, costBasisValid: true, nativeAvailable: true,
      plPctNativePct: 11.11, driftFlag: false, ratioFlag: true } }));
    check('pc ratioFlag => recorded-values-disagree', ratio.plUnavailableReason === 'recorded-values-disagree' && ratio.plPct === null);

    for (const r of ['reporting-incomplete', 'denominator-zero', 'holding-ils-value-unavailable']) {
      const w = PC(mkCtx({ weight: { pct: null, unavailableReason: r } }));
      check('pc weight reason passthrough ' + r, w.weightPct === null && w.weightUnavailableReason === r);
    }

    // Unavailable never becomes zero.
    const keys = Object.keys(notFound);
    check('pc never converts missing to zero', keys.every(function (k) { return notFound[k] !== 0; }));
    check('pc shape is exactly the ratified 7 keys',
      JSON.stringify(Object.keys(full).sort()) === JSON.stringify(['costBasis', 'plPct', 'plUnavailableReason',
        'positionValue', 'symbol', 'weightPct', 'weightUnavailableReason']));

    // ── Ruling A: closed vocabulary + the invariant that makes it safe ─────
    // The removed fourth value is unreachable, and that is proven UPSTREAM
    // rather than handled at runtime: _pfNormalizeHoldingEntry marks any entry
    // without a positive finite positionSize as _corrupt, and _p5PortfolioContext
    // returns early on corrupt/not-found. Hence positionSizeValid is always true
    // here, so nativeAvailable === (currencyKnown && costBasisValid) — which the
    // two guards above already cover exhaustively.
    check('invariant: positionSize 0 is _corrupt upstream',
      api._pfNormalizeHoldingEntry('AAA', { positionSize: 0, currency: 'USD' })._corrupt === true);
    check('invariant: negative positionSize is _corrupt upstream',
      api._pfNormalizeHoldingEntry('AAA', { positionSize: -5, currency: 'USD' })._corrupt === true);
    check('invariant: non-numeric positionSize is _corrupt upstream',
      api._pfNormalizeHoldingEntry('AAA', { positionSize: 'x', currency: 'USD' })._corrupt === true);
    check('invariant: missing positionSize is _corrupt upstream',
      api._pfNormalizeHoldingEntry('AAA', { currency: 'USD' })._corrupt === true);
    const liveEntry = api._pfNormalizeHoldingEntry('AAA', { positionSize: 1000, currency: 'USD', costBasis: 900 });
    check('invariant: a live holding always has positive finite positionSize',
      liveEntry._corrupt === undefined && liveEntry.positionSize > 0);

    // Structural guard: the enum must stay CLOSED at exactly the three approved
    // values. Fails loudly if a fourth is ever reintroduced.
    const pcSrc = (src._p5PortfolioContext || '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const literals = Array.from(new Set((pcSrc.match(/plUnavailableReason\s*=\s*'([^']+)'/g) || [])
      .map(function (m) { return m.replace(/^.*'([^']+)'$/, '$1'); }))).sort();
    check('closed enum: exactly the 3 approved plUnavailableReason values',
      JSON.stringify(literals) === JSON.stringify(['cost-basis-not-recorded', 'currency-not-recorded', 'recorded-values-disagree']));
    check('closed enum: position-value-not-recorded is GONE',
      pcSrc.indexOf('position-value-not-recorded') === -1);

    // The null/null signature must never appear in a reachable state, so it is
    // usable as the data-integrity marker for review.
    const reachable = [full, notFound, corrupt, noCur, noCb, drift, ratio,
      PC(mkCtx({ weight: { pct: null, unavailableReason: 'denominator-zero' } }))];
    check('reachable states never yield the null/null invariant signature',
      reachable.every(function (r) { return !(r.plPct === null && r.plUnavailableReason === null); }));
    const impossible = PC(mkCtx({ pl: { currencyKnown: true, costBasisValid: true,
      nativeAvailable: false, driftFlag: false, ratioFlag: false } }));
    check('impossible state yields the null/null marker, not a wrong reason',
      impossible.plPct === null && impossible.plUnavailableReason === null);
    check('impossible state is not mislabelled with an approved reason',
      ['currency-not-recorded', 'cost-basis-not-recorded', 'recorded-values-disagree']
        .indexOf(impossible.plUnavailableReason) === -1);
    check('impossible state keeps the 7-key shape (plPct survives JSON)',
      Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(impossible)), 'plPct'));

    // Excluded-by-construction fields must never appear.
    const flat = JSON.stringify(full);
    for (const forbidden of ['plIls', 'costIls', 'valueIls', 'impliedPurchaseFx', 'fxEffect', 'rate',
      'effectiveAt', 'baselineAgeDays', 'changePercent', 'driftFlag', 'ratioFlag', 'eligibleForAggregation']) {
      check('pc excludes ' + forbidden, flat.indexOf(forbidden) === -1);
    }
  })();

  // ── QA CORRECTION: system prompt asserted by REQUIRED CLAUSES, not scanned ─
  await (async function () {
    const api = buildApi({}).api;
    const sys = api._p5Call2System();
    const required = [
      'sourceMetadataDate',
      'It is NOT the date of the event described',
      'Never infer when something happened from sourceMetadataDate',
      'timing is unclear',
      'Never state or imply that these are all the available news items',
      'never treat them as zero',
      'You must NOT produce',
      'must reference its item as [N]',
      '{"synthesis":"..."}',
      'Use ONLY the evidence items and portfolio context'
    ];
    for (const clause of required) {
      check('system prompt contains clause: ' + clause.slice(0, 46), sys.indexOf(clause) !== -1);
    }
    check('system prompt is a non-empty string', typeof sys === 'string' && sys.length > 400);
    check('system prompt deterministic', api._p5Call2System() === sys);
    // Sanity: the prohibitions ARE present as text — which is precisely why a
    // forbidden-token scan must never be pointed at this function.
    check('prohibition words present as prohibitions (scan-target rationale)',
      /buy, sell or hold advice/.test(sys) && /price targets/.test(sys) && /sentiment scores/.test(sys));
  })();

  // ── User serializer: ids, labels, not-recorded reasons, no leakage ────────
  await (async function () {
    const api = buildApi({}).api;
    const payload = api._p5SynthesisPayload(ACCEPTED2);
    const pc = api._p5PortfolioContext(mkCtx());
    const user = api._p5Call2User('AAA', payload, pc);
    check('user has 1-based id [1]', user.indexOf('[1] title: Item A') !== -1);
    check('user has 1-based id [2]', user.indexOf('[2] title: Item B') !== -1);
    check('user has no [0]', user.indexOf('[0]') === -1);
    check('user labels sourceMetadataDate', (user.match(/sourceMetadataDate:/g) || []).length === 2);
    check('user carries the NOT-event-date disclaimer per item',
      (user.match(/NOT the event date/g) || []).length === 2);
    check('user marks summary provenance', user.indexOf('written by the search model, not the publisher') !== -1);
    check('user carries portfolio context block', user.indexOf('PORTFOLIO CONTEXT (recorded facts only):') !== -1);
    check('user carries recorded position value', user.indexOf('recorded position value: 1000 USD') !== -1);
    check('user carries weight', user.indexOf('portfolio weight: 22.2%') !== -1);

    // J3: no counts, totals or denominators may reach the model.
    const counts = { returned: 8, accepted: 2, rejectedMalformed: 0, rejectedUnmatched: 1,
      rejectedDuplicate: 0, rejectedMissingDate: 0, rejectedMissingTitle: 0, searchResultsCount: 20 };
    for (const k of Object.keys(counts)) {
      check('user prompt withholds counts key ' + k, user.indexOf(k) === -1);
    }
    check('user prompt withholds search_results wording', user.indexOf('search result') === -1);

    // Unavailable renders with its reason, never omitted, never zeroed.
    const pcMissing = api._p5PortfolioContext(mkCtx({ found: false }));
    const user2 = api._p5Call2User('AAA', payload, pcMissing);
    check('missing pl renders reason', user2.indexOf('not recorded (cost-basis-not-recorded)') !== -1);
    check('missing weight renders reason', user2.indexOf('not recorded (reporting-incomplete)') !== -1);
    check('missing position value renders not recorded', user2.indexOf('recorded position value: not recorded') !== -1);
    check('missing values never rendered as 0', !/recorded position value: 0\b/.test(user2));

    // Adversarial all-stale fixture — proves OUR serializer labelling only.
    const stale = api._p5SynthesisPayload([
      { url: 'https://ex.com/x', title: 'T1', date: '2023-01-02', summary: 'Announced a 2026 order.' },
      { url: 'https://ex.com/y', title: 'T2', date: '2023-10-05', summary: 'Reported 2026 revenue.' }
    ]);
    const userStale = api._p5Call2User('AAA', stale, pc);
    check('all-stale fixture: every date labelled source metadata',
      (userStale.match(/sourceMetadataDate:/g) || []).length === 2 &&
      (userStale.match(/NOT the event date/g) || []).length === 2);
    check('all-stale fixture: serializer makes no recency claim',
      !/\brecent\b/i.test(userStale) && !/\bstale\b/i.test(userStale));
  })();

  // ── Parse acceptance (mirrors G1 discipline) ─────────────────────────────
  await (async function () {
    const P = buildApi({}).api._p5ParseSynthesis;
    check('bare object accepted', P(synthJson('hello [1]')).ok === true && P(synthJson('hello [1]')).text === 'hello [1]');
    check('empty string value accepted', P(synthJson('')).ok === true && P(synthJson('')).text === '');
    check('fenced json accepted', P('```json\n' + synthJson('x [1]') + '\n```').ok === true);
    check('fenced plain accepted', P('```\n' + synthJson('x [1]') + '\n```').ok === true);
    check('fence with prose prefix REJECTED', P('Sure:\n```json\n' + synthJson('x') + '\n```').ok === false);
    check('JSON substring in prose REJECTED', P('Result: ' + synthJson('x') + ' done').ok === false);
    check('array REJECTED', P('[{"synthesis":"x"}]').ok === false);
    check('extra root key REJECTED', P(JSON.stringify({ synthesis: 'x', note: 'y' })).ok === false);
    check('wrong root key REJECTED', P(JSON.stringify({ text: 'x' })).ok === false);
    check('non-string value REJECTED', P(JSON.stringify({ synthesis: 42 })).ok === false);
    check('null value REJECTED', P(JSON.stringify({ synthesis: null })).ok === false);
    check('nested object value REJECTED', P(JSON.stringify({ synthesis: { a: 1 } })).ok === false);
    check('bare string REJECTED', P('"hello"').ok === false);
    check('empty content REJECTED', P('').ok === false && P('   ').ok === false && P(undefined).ok === false);
    check('unparseable reason pinned', P('not json').reason === 'model-output-unparseable');
    const once = JSON.stringify(P(synthJson('a [1]')));
    check('parse deterministic', once === JSON.stringify(P(synthJson('a [1]'))));
  })();

  // ── CORRECTION 2: attribution validation ─────────────────────────────────
  await (async function () {
    const V = buildApi({}).api._p5ValidateAttribution;
    check('in-range single ref ok', V('Claim [1].', 2).ok === true);
    check('in-range multiple refs ok', V('A [1] and B [2].', 2).ok === true);
    check('partial coverage allowed', V('Only A [1].', 3).ok === true);
    check('[0] rejected', V('Bad [0].', 2).ok === false && V('Bad [0].', 2).reason === 'attribution-out-of-range');
    check('over-count rejected', V('Bad [3].', 2).reason === 'attribution-out-of-range');
    check('far over-count rejected', V('Bad [99].', 2).reason === 'attribution-out-of-range');
    check('mixed valid+invalid rejected', V('A [1] then [7].', 2).reason === 'attribution-out-of-range');
    check('zero refs on non-empty text rejected', V('A narrative with no markers.', 2).reason === 'attribution-missing');
    check('empty text is NOT an attribution failure', V('', 2).ok === true && V('   ', 2).ok === true);
    check('itemCount 0 with a ref rejected', V('A [1].', 0).reason === 'attribution-out-of-range');
    check('non-string text tolerated', V(null, 2).ok === true);
    check('validator never rewrites text', typeof V('A [1].', 2).text === 'undefined');
  })();

  // ── Prohibited-semantics backstop + positive controls ────────────────────
  await (async function () {
    const S = buildApi({}).api._p5ProhibitedSemantics;
    check('positive control: Rating:', S('Rating: Buy') === true);
    check('positive control: price target', S('The price target is 100') === true);
    check('positive control: PT: $', S('PT: $120') === true);
    check('positive control: Buy/Neutral/Sell', S('Buy/Neutral/Sell') === true);
    check('case-insensitive', S('rating: hold') === true && S('PRICE TARGET') === true);
    check('benign prose with the word buy does NOT fire',
      S('The company agreed to buy a supplier [1].') === false);
    check('benign prose with sell does NOT fire', S('It will sell its stake [1].') === false);
    check('clean text passes', S('Revenue rose [1]. Timing is unclear [2].') === false);
    check('non-string safe', S(null) === false && S(undefined) === false);
    check('repeat calls stable (no regex lastIndex leak)',
      S('Rating: Buy') === true && S('Rating: Buy') === true && S('clean [1]') === false);
  })();

  // ── Transport envelope + single-shot ─────────────────────────────────────
  await (async function () {
    const payloadOf = function (api) { return api._p5SynthesisPayload(ACCEPTED2); };

    const cases = [
      ['timeout', { anthropic: { throwName: 'TimeoutError' } }, 'timeout'],
      ['abort', { anthropic: { throwName: 'AbortError' } }, 'timeout'],
      ['network', { anthropic: { throwName: 'TypeError' } }, 'fetch-failed'],
      ['http 500', { anthropic: { status: 500 } }, 'http-500'],
      ['http 429', { anthropic: { status: 429 } }, 'http-429'],
      ['bad json', { anthropic: { badJson: true } }, 'bad-json'],
      ['no content array', { anthropic: { body: {} } }, 'empty-content'],
      ['empty content blocks', { anthropic: { body: { content: [] } } }, 'empty-content'],
      ['whitespace text', { anthropic: { body: anthropicBody('   ') } }, 'empty-content']
    ];
    for (const c of cases) {
      const f = routerFetch(c[1]);
      const b = buildApi({}, f);
      const r = await b.api._p5RequestSynthesis('AAA', payloadOf(b.api), b.api._p5PortfolioContext(mkCtx()));
      check('adapter ' + c[0] + ' => ' + c[2], r.ok === false && r.reason === c[2]);
      check('adapter ' + c[0] + ' single-shot (1 anthropic call)', f._count('anthropic') === 1);
      check('adapter ' + c[0] + ' no perplexity call', f._count('perplexity') === 0);
    }

    const fOk = routerFetch({ anthropic: { body: anthropicBody(synthJson('Fine [1].')) } });
    const bOk = buildApi({}, fOk);
    const rOk = await bOk.api._p5RequestSynthesis('AAA', payloadOf(bOk.api), bOk.api._p5PortfolioContext(mkCtx()));
    check('adapter ok returns content', rOk.ok === true && rOk.content === synthJson('Fine [1].'));
    check('adapter concatenates text blocks only', (await (async function () {
      const f2 = routerFetch({ anthropic: { body: { content: [
        { type: 'text', text: '{"synth' }, { type: 'thinking', text: 'IGNORED' }, { type: 'text', text: 'esis":"A [1]."}' }
      ] } } });
      const b2 = buildApi({}, f2);
      const r2 = await b2.api._p5RequestSynthesis('AAA', payloadOf(b2.api), b2.api._p5PortfolioContext(mkCtx()));
      return r2.ok === true && r2.content === '{"synthesis":"A [1]."}';
    })()));

    // J1/J8 outbound contract.
    const sent = JSON.parse(fOk._calls[0].opts.body);
    check('J1 model pinned explicitly', sent.model === 'claude-sonnet-4-5');
    check('J8 max_tokens 700', sent.max_tokens === 700);
    check('system prompt sent', typeof sent.system === 'string' && sent.system.length > 400);
    check('exactly one user message', Array.isArray(sent.messages) && sent.messages.length === 1 &&
      sent.messages[0].role === 'user');
    check('NO assistant prefill (departure from L4856 pattern)',
      !sent.messages.some(function (m) { return m.role === 'assistant'; }));
    check('outbound body has no extra keys',
      JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(['max_tokens', 'messages', 'model', 'system']));
    check('endpoint is anthropic-proxy', String(fOk._calls[0].url).indexOf('/.netlify/functions/anthropic-proxy') !== -1);
  })();

  // ── _p5RunSynthesis: gating, vocabulary, off-vocabulary control ──────────
  await (async function () {
    const fNone = routerFetch({});
    const bNone = buildApi({}, fNone);
    check('zero accepted => null section, ZERO fetch',
      (await bNone.api._p5RunSynthesis(mkCtx(), [])) === null && fNone._calls.length === 0);
    const fNone2 = routerFetch({});
    const bNone2 = buildApi({}, fNone2);
    check('non-array accepted => null section, ZERO fetch',
      (await bNone2.api._p5RunSynthesis(mkCtx(), null)) === null && fNone2._calls.length === 0);

    const failCases = [
      ['timeout', { anthropic: { throwName: 'TimeoutError' } }],
      ['fetch-failed', { anthropic: { throwName: 'TypeError' } }],
      ['http-500', { anthropic: { status: 500 } }],
      ['bad-json', { anthropic: { badJson: true } }],
      ['empty-content', { anthropic: { body: { content: [] } } }],
      ['model-output-unparseable', { anthropic: { body: anthropicBody('not json at all') } }],
      ['model-output-unparseable extra key', { anthropic: { body: anthropicBody(JSON.stringify({ synthesis: 'a [1]', x: 1 })) } }],
      ['attribution-out-of-range', { anthropic: { body: anthropicBody(synthJson('Claim [9].')) } }],
      ['attribution-missing', { anthropic: { body: anthropicBody(synthJson('A narrative with no markers.')) } }],
      ['prohibited-semantics', { anthropic: { body: anthropicBody(synthJson('Rating: Buy [1].')) } }]
    ];
    for (const c of failCases) {
      const f = routerFetch(c[1]);
      const b = buildApi({}, f);
      const s = await b.api._p5RunSynthesis(mkCtx(), ACCEPTED2);
      check('runSynthesis ' + c[0] + ' => state failed', s !== null && s.state === 'failed');
      check('runSynthesis ' + c[0] + ' reason in APPROVED vocabulary', approvedReason(s.reason));
      check('runSynthesis ' + c[0] + ' text null / not derived', s.text === null && s.derivedFromAccepted === false);
      check('runSynthesis ' + c[0] + ' single-shot, no retry', f._count('anthropic') === 1);
    }
    // Off-vocabulary positive control: the matcher must reject an invented value.
    check('POSITIVE CONTROL: off-vocabulary reason rejected', approvedReason('synthesis-failed') === false);
    check('POSITIVE CONTROL: empty reason rejected', approvedReason('') === false);
    check('POSITIVE CONTROL: http- without status rejected', approvedReason('http-') === false);
    check('POSITIVE CONTROL: matcher accepts a real member', approvedReason('timeout') === true &&
      approvedReason('http-502') === true);

    const fGood = routerFetch({ anthropic: { body: anthropicBody(synthJson('Revenue rose [1]. Timing unclear [2].')) } });
    const bGood = buildApi({}, fGood);
    const sGood = await bGood.api._p5RunSynthesis(mkCtx(), ACCEPTED2);
    check('runSynthesis success => done + derived', sGood.state === 'done' && sGood.reason === null &&
      sGood.derivedFromAccepted === true && sGood.text === 'Revenue rose [1]. Timing unclear [2].');
    check('runSynthesis returns text verbatim (no repair)', sGood.text.indexOf('[1]') !== -1);

    const fEmpty = routerFetch({ anthropic: { body: anthropicBody(synthJson('')) } });
    const bEmpty = buildApi({}, fEmpty);
    const sEmpty = await bEmpty.api._p5RunSynthesis(mkCtx(), ACCEPTED2);
    check('runSynthesis empty-but-valid flows on as done with empty text',
      sEmpty.state === 'done' && sEmpty.text === '');
  })();

  // ── _p5BuildPacket: new failed branch + malformed + FULL regression ──────
  await (async function () {
    const api = buildApi({}).api;
    const B = api._p5BuildPacket;
    const ctx = mkCtx();
    const newsDone = { state: 'done', reason: null, accepted: ACCEPTED2, rejected: [],
      counts: { returned: 2, accepted: 2, rejectedMalformed: 0, rejectedUnmatched: 0, rejectedDuplicate: 0,
                rejectedMissingDate: 0, rejectedMissingTitle: 0, searchResultsCount: 5 } };
    const newsZero = { state: 'done', reason: null, accepted: [], rejected: [],
      counts: { returned: 0, accepted: 0, rejectedMalformed: 0, rejectedUnmatched: 0, rejectedDuplicate: 0,
                rejectedMissingDate: 0, rejectedMissingTitle: 0, searchResultsCount: 5 } };
    const newsFailed = { state: 'failed', reason: 'http-502', accepted: [], rejected: [], counts: null };
    const newsCollecting = { state: 'collecting', reason: null, accepted: [], rejected: [], counts: null };

    // NEW branch: verbatim propagation, no minted reason, no discard marker.
    for (const r of APPROVED_REASONS.concat(['http-500', 'http-429'])) {
      const p = B({ asOf: 'T', context: ctx, news: newsDone, synthesis: { state: 'failed', reason: r, text: null, derivedFromAccepted: false } });
      check('buildPacket propagates failed reason verbatim: ' + r,
        p.sections.synthesis.state === 'failed' && p.sections.synthesis.reason === r);
      check('buildPacket failed sets no discard marker: ' + r, p.discardedProvidedSynthesis === undefined);
      check('buildPacket failed => status partial: ' + r, p.status === 'partial');
      check('buildPacket failed text null: ' + r,
        p.sections.synthesis.text === null && p.sections.synthesis.derivedFromAccepted === false);
    }

    // Malformed failed envelopes fall through to the EXISTING discard path and
    // never mint a vocabulary value.
    const malformed = [
      ['no reason', { state: 'failed', text: null }],
      ['empty reason', { state: 'failed', reason: '', text: null }],
      ['null reason', { state: 'failed', reason: null, text: null }],
      ['numeric reason', { state: 'failed', reason: 42, text: null }]
    ];
    for (const m of malformed) {
      const p = B({ asOf: 'T', context: ctx, news: newsDone, synthesis: m[1] });
      check('malformed failed (' + m[0] + ') => suppressed/empty-synthesis-text',
        p.sections.synthesis.state === 'suppressed' && p.sections.synthesis.reason === 'empty-synthesis-text');
      check('malformed failed (' + m[0] + ') sets discard marker', p.discardedProvidedSynthesis === true);
      check('malformed failed (' + m[0] + ') mints no new reason',
        p.sections.synthesis.reason !== 'synthesis-failed' && approvedReason(p.sections.synthesis.reason) === false);
    }

    // REGRESSION: every pre-existing branch resolves identically.
    const rDone = B({ asOf: 'T', context: ctx, news: newsDone, synthesis: { state: 'done', reason: null, text: ' Text [1]. ', derivedFromAccepted: true } });
    check('regression done trims + derived', rDone.sections.synthesis.state === 'done' &&
      rDone.sections.synthesis.text === 'Text [1].' && rDone.sections.synthesis.derivedFromAccepted === true);
    check('regression done => status complete', rDone.status === 'complete');

    const rEmpty = B({ asOf: 'T', context: ctx, news: newsDone, synthesis: { state: 'done', reason: null, text: '   ', derivedFromAccepted: true } });
    check('regression empty-synthesis-text', rEmpty.sections.synthesis.state === 'suppressed' &&
      rEmpty.sections.synthesis.reason === 'empty-synthesis-text' && rEmpty.discardedProvidedSynthesis === true);

    const rNewsFailed = B({ asOf: 'T', context: ctx, news: newsFailed, synthesis: { state: 'done', reason: null, text: 'x [1]', derivedFromAccepted: true } });
    check('regression news-failed', rNewsFailed.sections.synthesis.state === 'suppressed' &&
      rNewsFailed.sections.synthesis.reason === 'news-failed' && rNewsFailed.discardedProvidedSynthesis === true);

    const rZero = B({ asOf: 'T', context: ctx, news: newsZero, synthesis: { state: 'done', reason: null, text: 'x [1]', derivedFromAccepted: true } });
    check('regression zero-accepted-evidence', rZero.sections.synthesis.state === 'suppressed' &&
      rZero.sections.synthesis.reason === 'zero-accepted-evidence');

    const rNotOk = B({ asOf: 'T', context: ctx, news: newsCollecting, synthesis: { state: 'done', reason: null, text: 'x [1]', derivedFromAccepted: true } });
    check('regression news-not-ok', rNotOk.sections.synthesis.state === 'suppressed' &&
      rNotOk.sections.synthesis.reason === 'news-not-ok' && rNotOk.discardedProvidedSynthesis === true);

    const rPending = B({ asOf: 'T', context: ctx, news: newsCollecting, synthesis: null });
    check('regression pending preserved', rPending.sections.synthesis.state === 'pending' &&
      rPending.sections.synthesis.reason === null);

    // A failed envelope must ALSO lose to the higher-precedence news guards.
    const rFailedButNewsFailed = B({ asOf: 'T', context: ctx, news: newsFailed, synthesis: { state: 'failed', reason: 'timeout', text: null, derivedFromAccepted: false } });
    check('news-failed outranks synthesis-failed', rFailedButNewsFailed.sections.synthesis.reason === 'news-failed');
    const rFailedButZero = B({ asOf: 'T', context: ctx, news: newsZero, synthesis: { state: 'failed', reason: 'timeout', text: null, derivedFromAccepted: false } });
    check('zero-accepted outranks synthesis-failed', rFailedButZero.sections.synthesis.reason === 'zero-accepted-evidence');

    check('packet stays JSON round-trippable',
      JSON.stringify(JSON.parse(JSON.stringify(rDone))) === JSON.stringify(rDone));
  })();

  // ── End-to-end via _p5RunResearch: fetch counts + state trail ────────────
  await (async function () {
    const SR = [{ title: 'Item A', url: 'https://ex.com/a', date: '2026-08-10' },
                { title: 'Item B', url: 'https://ex.com/b', date: '2023-03-12' }];
    const pplxOk = { body: { choices: [{ message: { content: JSON.stringify([
      { sourceUrl: 'https://ex.com/a', summary: 'S1.' }, { sourceUrl: 'https://ex.com/b', summary: 'S2.' }
    ]) } }], search_results: SR, citations: SR.map(function (s) { return s.url; }) } };

    // Happy path: exactly one call-1 and one call-2.
    const f1 = routerFetch({ perplexity: pplxOk,
      anthropic: { body: anthropicBody(synthJson('Revenue rose [1]. Timing unclear [2].')) } });
    const b1 = buildApi(FULL_SEED, f1);
    const mount1 = b1.db.mkNode('div');
    const p1 = await b1.api._p5RunResearch('AAA', mount1, NOW_MS);
    check('e2e exactly 1 perplexity call', f1._count('perplexity') === 1);
    check('e2e exactly 1 anthropic call', f1._count('anthropic') === 1);
    check('e2e total fetch count 2', f1._calls.length === 2);
    check('e2e synthesis done', p1.sections.synthesis.state === 'done' &&
      p1.sections.synthesis.text === 'Revenue rose [1]. Timing unclear [2].');
    check('e2e status complete', p1.status === 'complete');
    check('e2e ZERO localStorage writes', b1.ls._writes.length === 0);
    check('e2e renders synthesis text', anyText(b1.db, 'Revenue rose [1].'));
    check('e2e renders app-authored limitation line',
      anyText(b1.db, 'Synthesis covers the 2 accepted items only.') &&
      anyText(b1.db, 'Dates are source metadata dates, not event dates.'));
    check('J4 renderer relabels item date',
      anyText(b1.db, '[1] source metadata date 2026-08-10') &&
      anyText(b1.db, '[2] source metadata date 2023-03-12'));
    check('e2e state trail reaches pending before done', (function () {
      const t = trailTexts(b1.db);
      const iPending = t.findIndex(function (x) { return x.indexOf('Synthesis: pending') !== -1; });
      const iDone = t.findIndex(function (x) { return x.indexOf('Synthesis: done') !== -1; });
      return iPending !== -1 && iDone !== -1 && iPending < iDone;
    })());

    // Zero accepted: call-1 fires, call-2 must NOT.
    const f2 = routerFetch({ perplexity: { body: { choices: [{ message: { content: '[]' } }], search_results: SR, citations: [] } },
      anthropic: { body: anthropicBody(synthJson('never [1]')) } });
    const b2 = buildApi(FULL_SEED, f2);
    const p2 = await b2.api._p5RunResearch('AAA', b2.db.mkNode('div'), NOW_MS);
    check('zero accepted: 1 perplexity call', f2._count('perplexity') === 1);
    check('zero accepted: ZERO anthropic calls', f2._count('anthropic') === 0);
    check('zero accepted: suppressed zero-accepted-evidence',
      p2.sections.synthesis.state === 'suppressed' && p2.sections.synthesis.reason === 'zero-accepted-evidence');

    // News failed: call-2 must NOT fire.
    const f3 = routerFetch({ perplexity: { status: 502 }, anthropic: { body: anthropicBody(synthJson('never [1]')) } });
    const b3 = buildApi(FULL_SEED, f3);
    const p3 = await b3.api._p5RunResearch('AAA', b3.db.mkNode('div'), NOW_MS);
    check('news failed: ZERO anthropic calls', f3._count('anthropic') === 0);
    check('news failed: suppressed news-failed', p3.sections.synthesis.reason === 'news-failed');

    // Local precondition failure: ZERO fetches of any kind.
    const f4 = routerFetch({ perplexity: pplxOk, anthropic: { body: anthropicBody(synthJson('never [1]')) } });
    const b4 = buildApi(FULL_SEED, f4);
    const p4 = await b4.api._p5RunResearch('NOPE', b4.db.mkNode('div'), NOW_MS);
    check('holding-not-found: ZERO fetches total', f4._calls.length === 0);
    check('holding-not-found: terminal failed packet', p4.sections.news.reason === 'holding-not-found');

    // Call-2 failure surfaces as failed, not as a false "no text".
    const f5 = routerFetch({ perplexity: pplxOk, anthropic: { status: 504 } });
    const b5 = buildApi(FULL_SEED, f5);
    const p5r = await b5.api._p5RunResearch('AAA', b5.db.mkNode('div'), NOW_MS);
    check('call-2 failure => synthesis failed with transport reason',
      p5r.sections.synthesis.state === 'failed' && p5r.sections.synthesis.reason === 'http-504');
    check('call-2 failure is NOT mislabelled empty-synthesis-text',
      p5r.sections.synthesis.reason !== 'empty-synthesis-text');
    check('call-2 failure => status partial', p5r.status === 'partial');
    check('call-2 failure renders reason', anyText(b5.db, 'Synthesis: failed — http-504'));
    check('call-2 failure renders NO limitation line', !anyText(b5.db, 'Synthesis covers the'));
    check('call-2 failure: still exactly 1 anthropic call (no retry)', f5._count('anthropic') === 1);
    check('call-2 failure: ZERO localStorage writes', b5.ls._writes.length === 0);
  })();

  // ── Purity / isolation scans on the new surface ──────────────────────────
  await (async function () {
    function stripped(n) {
      return (src[n] || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    }
    const control = 'localStorage.setItem("x",1); localStorage.removeItem("x"); document.getElementById("y");' +
      ' document.querySelector("z"); Math.random(); el.innerHTML = "h"; fetch("/x");';
    const pureForbidden = [/localStorage/, /document\./, /Math\.random/, /setItem/, /removeItem/, /innerHTML/,
      /getElementById|querySelector/, /\bfetch\s*\(/];
    for (const pat of pureForbidden) {
      check('positive control fires: ' + pat.source, pat.test(control));
      for (const fn of ['_p5PortfolioContext', '_p5Call2System', '_p5Call2User', '_p5ParseSynthesis',
        '_p5ValidateAttribution', '_p5ProhibitedSemantics']) {
        check(fn + ' clean of ' + pat.source, !pat.test(stripped(fn)));
      }
    }
    const adapterForbidden = [/localStorage/, /document\./, /Math\.random/, /setItem/, /removeItem/];
    for (const pat of adapterForbidden) {
      check('_p5RequestSynthesis clean of ' + pat.source, !pat.test(stripped('_p5RequestSynthesis')));
      check('_p5RunSynthesis clean of ' + pat.source, !pat.test(stripped('_p5RunSynthesis')));
    }
    check('_p5RunSynthesis performs no direct fetch (adapter only)',
      !/\bfetch\s*\(/.test(stripped('_p5RunSynthesis')));
    check('_p5RunResearch still performs no direct fetch',
      !/\bfetch\s*\(/.test(stripped('_p5RunResearch')));
    check('_p5SynthesisPayload UNCHANGED by step 4 (J2): still 4 presented fields',
      /title:\s*a\.title/.test(stripped('_p5SynthesisPayload')) &&
      /date:\s*a\.date/.test(stripped('_p5SynthesisPayload')) &&
      /url:\s*a\.url/.test(stripped('_p5SynthesisPayload')) &&
      /summary:\s*a\.summary/.test(stripped('_p5SynthesisPayload')) &&
      stripped('_p5SynthesisPayload').indexOf('sourceMetadataDate') === -1);
    check('builder mints no reason string of its own',
      stripped('_p5BuildPacket').indexOf('synthesis-failed') === -1);
  })();

  console.log(failures === 0
    ? 'P5 CALL2: PASS (' + asserts + ' asserts)'
    : 'P5 CALL2: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
