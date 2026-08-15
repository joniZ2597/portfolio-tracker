'use strict';

/*
 * P-5 Research-on-Demand — Step 3 offline QA (call-1 wiring).
 *
 * Pure Node, no network (fetch is a counterfeit spy), no browser, no live
 * services. Extracts the Step 1-3 functions + dependency chain from
 * index.html and runs them in a sandbox with counterfeit localStorage
 * (write-spy), document (tracked stub nodes), and fetch (call-counting).
 * Covers the 2026-08-12/13 owner rulings: G1 exact parse acceptance, G2
 * absent-vs-empty search_results, G3 single-shot sonar-pro/1200, G4
 * console-only, local precondition terminal packets (holding-not-found /
 * holding-corrupt, zero fetch), ratified state vocabulary, citations
 * counted-only, validator as sole acceptance authority.
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
  // Step 4 dependency chain — _p5RunResearch now calls _p5RunSynthesis after a
  // successful call-1. Extracted so this sandbox resolves; call-2 behaviour
  // itself is covered by qa/p5_call2_offline.js, not here.
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
function stubFetch(scenario) {
  const calls = [];
  const fn = function (url, opts) {
    calls.push({ url: url, opts: opts });
    // Step 4: call-2 now runs after a successful call-1. This suite is about
    // call-1, so the anthropic leg gets a fixed valid reply and is excluded
    // from the call-1 single-shot counters via _pplx().
    if (String(url).indexOf('anthropic') !== -1) {
      return Promise.resolve({
        ok: true, status: 200,
        json: function () {
          return Promise.resolve({ content: [{ type: 'text', text: '{"synthesis":"S [1]."}' }] });
        }
      });
    }
    if (scenario.throwName) {
      const e = new Error('stub');
      e.name = scenario.throwName;
      return Promise.reject(e);
    }
    const status = scenario.status || 200;
    return Promise.resolve({
      ok: status < 400,
      status: status,
      json: function () {
        if (scenario.badJson) return Promise.reject(new Error('bad json'));
        return Promise.resolve(scenario.body);
      }
    });
  };
  fn._calls = calls;
  fn._pplx = function () {
    return calls.filter(function (c) { return String(c.url).indexOf('anthropic') === -1; });
  };
  return fn;
}

function buildApi(lsSeed, fetchStub, docBundle, windowStub) {
  const body = VARS.map(n => src[n]).join('\n') + '\n' + FNS.map(n => src[n]).join('\n') +
    '\nreturn { ' + FNS.map(n => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'document', 'console', 'fetch', 'AbortSignal', 'window', '"use strict";\n' + body);
  const ls = makeLs(lsSeed);
  const db = docBundle || makeDoc();
  const quiet = { log: function () {}, warn: function () {}, error: function () {} };
  // window stub: gates are memory-only globals. Default {} means every client gate
  // reads undefined === OFF, which is the required default-off posture.
  const win = windowStub || {};
  return {
    api: factory(ls, db.doc, quiet, fetchStub || stubFetch({ body: {} }), AbortSignal, win),
    ls: ls, db: db, window: win
  };
}

const NOW_MS = Date.parse('2026-08-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }
const HOLDINGS_SEED = JSON.stringify({
  AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
         manualPlPct: 11.1, baselineAt: iso(NOW_MS - 3 * DAY) },
  CC1: 42
});
const FULL_SEED = {
  pt_holdings: HOLDINGS_SEED,
  pt_fx: JSON.stringify({ rate: 3.0, effectiveAt: iso(NOW_MS - DAY), source: 'boi',
    fetchedAt: iso(NOW_MS - DAY), lastAttemptAt: iso(NOW_MS - DAY), lastAttemptOk: true }),
  pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-08-01' }),
  pt_eod_cache: JSON.stringify({ AAA: { changePercent: 1.5 } })
};
const SR_FIX = [
  { title: 'Item A', url: 'https://ex.com/a', date: '2026-08-10', last_updated: '2026-08-11', snippet: 's' },
  { title: 'Item B', url: 'https://ex.com/b', date: '2026-08-09' }
];
const CONTENT_OK = JSON.stringify([
  { sourceUrl: 'https://ex.com/a', summary: 'S1.' },
  { sourceUrl: 'https://ex.com/x', summary: 'S2.' }
]);
function okBody(contentStr, sr, citations) {
  const b = { choices: [{ message: { content: contentStr } }] };
  if (sr !== undefined) b.search_results = sr;
  if (citations !== undefined) b.citations = citations;
  return b;
}
function trailTexts(db) { return db.created.map(function (n) { return n.textContent; }); }
function firstIndexContaining(texts, needle) {
  for (let i = 0; i < texts.length; i++) { if (texts[i].indexOf(needle) !== -1) return i; }
  return -1;
}

(async function main() {

  // ── PARSE: G1 exact acceptance ───────────────────────────────────────────
  await (async function () {
    const api = buildApi({}).api;
    const P = api._p5ParseModelItems;
    const arr = [{ sourceUrl: 'https://x.com/a', summary: 's', direction: 'bullish' }];
    const bare = P(JSON.stringify(arr));
    check('bare array accepted', bare.ok === true && bare.items.length === 1);
    check('items verbatim — no field surgery (direction survives parse)', bare.items[0].direction === 'bullish');
    check('exact items wrapper accepted', P(JSON.stringify({ items: arr })).ok === true);
    check('items wrapper with extra root key REJECTED', P(JSON.stringify({ items: arr, extra: 1 })).ok === false);
    check('items wrapper with note key REJECTED', P(JSON.stringify({ items: arr, note: 'x' })).ok === false);
    check('items non-array REJECTED', P(JSON.stringify({ items: 'x' })).ok === false);
    check('fenced json accepted', P('```json\n' + JSON.stringify(arr) + '\n```').ok === true);
    check('fenced plain accepted', P('```\n' + JSON.stringify({ items: arr }) + '\n```').ok === true);
    check('fence with prose prefix REJECTED', P('Here you go:\n```json\n' + JSON.stringify(arr) + '\n```').ok === false);
    check('JSON substring in prose REJECTED', P('The items are ' + JSON.stringify(arr) + ' as requested.').ok === false);
    check('bare string REJECTED', P(JSON.stringify('hello')).ok === false);
    check('number REJECTED', P('42').ok === false);
    check('null REJECTED', P('null').ok === false);
    check('empty content REJECTED', P('').ok === false && P('   ').ok === false && P(undefined).ok === false);
    check('empty array accepted (valid nothing-found reply)', P('[]').ok === true && P('[]').items.length === 0);
    const t1 = JSON.stringify(P(CONTENT_OK));
    check('parse deterministic', t1 === JSON.stringify(P(CONTENT_OK)) && t1 === JSON.stringify(P(CONTENT_OK)));
  })();

  // ── ADAPTER: envelope, failures, G2, single-shot ─────────────────────────
  await (async function () {
    const okStub = stubFetch({ body: okBody(CONTENT_OK, SR_FIX, ['https://ex.com/a', 'https://ex.com/c']) });
    const b1 = buildApi(FULL_SEED, okStub);
    const r1 = await b1.api._p5RequestItems('AAA');
    check('adapter ok', r1.ok === true);
    check('content retained verbatim', r1.content === CONTENT_OK);
    check('search_results retained verbatim', JSON.stringify(r1.searchResults) === JSON.stringify(SR_FIX));
    check('searchResultsCount', r1.searchResultsCount === 2);
    check('citations counted only', r1.citationsCount === 2);
    check('single call', okStub._calls.length === 1);
    const call = okStub._calls[0];
    check('endpoint is perplexity-proxy', call.url === '/.netlify/functions/perplexity-proxy');
    check('POST with abort signal', call.opts.method === 'POST' && call.opts.signal !== undefined);
    const sent = JSON.parse(call.opts.body);
    check('model sonar-pro (G3)', sent.model === 'sonar-pro');
    check('max_tokens 1200 (G3)', sent.max_tokens === 1200);
    check('one user message containing the symbol', sent.messages.length === 1 &&
      sent.messages[0].role === 'user' && sent.messages[0].content.indexOf('"AAA"') !== -1);

    for (const [scenario, reason] of [
      [{ status: 502, body: {} }, 'http-502'],
      [{ status: 429, body: {} }, 'http-429'],
      [{ badJson: true }, 'bad-json'],
      [{ body: {} }, 'empty-choices'],
      [{ body: okBody('', SR_FIX) }, 'empty-choices'],
      [{ throwName: 'TimeoutError' }, 'timeout'],
      [{ throwName: 'AbortError' }, 'timeout'],
      [{ throwName: 'TypeError' }, 'fetch-failed']
    ]) {
      const st = stubFetch(scenario);
      const r = await buildApi(FULL_SEED, st).api._p5RequestItems('AAA');
      check('adapter reason ' + reason, r.ok === false && r.reason === reason);
      check('single call on ' + reason + ' (no retry)', st._calls.length === 1);
    }
    const absent = await buildApi(FULL_SEED, stubFetch({ body: okBody(CONTENT_OK) })).api._p5RequestItems('AAA');
    check('G2: search_results absent -> null + count 0', absent.ok === true && absent.searchResults === null && absent.searchResultsCount === 0);
    const nonArr = await buildApi(FULL_SEED, stubFetch({ body: okBody(CONTENT_OK, 'nope') })).api._p5RequestItems('AAA');
    check('G2: search_results non-array -> null', nonArr.ok === true && nonArr.searchResults === null);
    const emptyArr = await buildApi(FULL_SEED, stubFetch({ body: okBody(CONTENT_OK, []) })).api._p5RequestItems('AAA');
    check('G2: search_results [] stays [] (valid response)', emptyArr.ok === true &&
      Array.isArray(emptyArr.searchResults) && emptyArr.searchResults.length === 0);
  })();

  // ── ORCH-STATES: ratified sequence + envelope outcomes ───────────────────
  await (async function () {
    // Success path: 1 accepted, 1 unmatched
    const okStub = stubFetch({ body: okBody(CONTENT_OK, SR_FIX, []) });
    const b = buildApi(FULL_SEED, okStub);
    const mount = b.db.mkNode('div');
    const pk = await b.api._p5RunResearch('AAA', mount, NOW_MS);
    check('success: news done', pk.sections.news.state === 'done');
    check('success: 1 accepted 1 unmatched', pk.counts.accepted === 1 && pk.counts.rejectedUnmatched === 1);
    check('success: asOf from injected clock', pk.asOf === iso(NOW_MS));
    // Step 4: call-2 IS wired now, so the success path completes. Call-2's own
    // contract lives in qa/p5_call2_offline.js; asserted here only far enough
    // to prove call-1 hands off correctly.
    check('success: synthesis done (call-2 wired)', pk.sections.synthesis.state === 'done');
    check('success: packet complete', pk.status === 'complete');
    const texts = trailTexts(b.db);
    const iq = firstIndexContaining(texts, 'News: queued');
    const ic = firstIndexContaining(texts, 'News: collecting');
    const id = firstIndexContaining(texts, 'News: done');
    check('state sequence queued -> collecting -> done', iq !== -1 && ic !== -1 && id !== -1 && iq < ic && ic < id);
    const linkNode = b.db.created.find(function (n) { return n._tag === 'a' && n.href === 'https://ex.com/a'; });
    check('accepted item rendered as link to matched search URL', !!linkNode && linkNode.rel === 'noopener');
    check('counts footer rendered', firstIndexContaining(texts, '1 of 2 items accepted') !== -1);
    check('single call-1 fetch on success (no retry)', okStub._pplx().length === 1);
    check('success: exactly one call-2 fetch follows', okStub._calls.length === 2);

    // Zero accepted (all unmatched)
    const zStub = stubFetch({ body: okBody(JSON.stringify([{ sourceUrl: 'https://ex.com/nope', summary: 's' }]), SR_FIX) });
    const zb = buildApi(FULL_SEED, zStub);
    const zpk = await zb.api._p5RunResearch('AAA', zb.db.mkNode('div'), NOW_MS);
    check('zero accepted: news done + suppressed synthesis', zpk.sections.news.state === 'done' &&
      zpk.counts.accepted === 0 && zpk.sections.synthesis.state === 'suppressed' &&
      zpk.sections.synthesis.reason === 'zero-accepted-evidence' && zpk.status === 'partial');

    // G2: empty [] search_results is a VALID zero-evidence path, not missing
    const eStub = stubFetch({ body: okBody('[]', []) });
    const eb = buildApi(FULL_SEED, eStub);
    const epk = await eb.api._p5RunResearch('AAA', eb.db.mkNode('div'), NOW_MS);
    check('empty search_results []: news done, zero accepted, partial', epk.sections.news.state === 'done' &&
      epk.counts.accepted === 0 && epk.counts.searchResultsCount === 0 && epk.status === 'partial');

    // G2: absent search_results fails closed
    const aStub = stubFetch({ body: okBody(CONTENT_OK) });
    const ab = buildApi(FULL_SEED, aStub);
    const apk = await ab.api._p5RunResearch('AAA', ab.db.mkNode('div'), NOW_MS);
    check('absent search_results: failed search-results-missing', apk.sections.news.state === 'failed' &&
      apk.sections.news.reason === 'search-results-missing');
    check('absent search_results: synthesis suppressed news-failed', apk.sections.synthesis.state === 'suppressed' &&
      apk.sections.synthesis.reason === 'news-failed');

    // Unparseable content: failed with searchResultsCount surfaced
    const uStub = stubFetch({ body: okBody('Here are the items you asked for.', SR_FIX) });
    const ub = buildApi(FULL_SEED, uStub);
    const upk = await ub.api._p5RunResearch('AAA', ub.db.mkNode('div'), NOW_MS);
    check('unparseable: failed model-output-unparseable', upk.sections.news.state === 'failed' &&
      upk.sections.news.reason === 'model-output-unparseable');
    check('unparseable: searchResultsCount survives', upk.sections.news.counts.searchResultsCount === 2);

    // Provider HTTP failure propagates
    const hStub = stubFetch({ status: 502, body: {} });
    const hb = buildApi(FULL_SEED, hStub);
    const hpk = await hb.api._p5RunResearch('AAA', hb.db.mkNode('div'), NOW_MS);
    check('http failure: failed http-502 + single fetch', hpk.sections.news.state === 'failed' &&
      hpk.sections.news.reason === 'http-502' && hStub._calls.length === 1);
  })();

  // ── ORCH-PRECONDITIONS: terminal local failures, zero fetch ──────────────
  await (async function () {
    const nfStub = stubFetch({ body: {} });
    const nb = buildApi(FULL_SEED, nfStub);
    const nm = nb.db.mkNode('div');
    const npk = await nb.api._p5RunResearch('ZZZ', nm, NOW_MS);
    check('not-found: news failed holding-not-found', npk.sections.news.state === 'failed' &&
      npk.sections.news.reason === 'holding-not-found');
    check('not-found: packet status failed', npk.status === 'failed');
    check('not-found: synthesis suppressed news-failed', npk.sections.synthesis.state === 'suppressed' &&
      npk.sections.synthesis.reason === 'news-failed');
    check('not-found: ZERO fetch calls', nfStub._calls.length === 0);
    const nTexts = trailTexts(nb.db);
    check('not-found: never queued/pending rendered',
      firstIndexContaining(nTexts, 'News: queued') === -1 && firstIndexContaining(nTexts, 'Synthesis: pending') === -1);

    // Corrupt: discover the corrupt symbol via loadHoldings' own verdict
    const cStub = stubFetch({ body: {} });
    const cb = buildApi(FULL_SEED, cStub);
    const hv = cb.api.loadHoldings();
    const corruptSym = Object.keys(hv).find(function (k) { return hv[k] && hv[k]._corrupt === true; });
    check('corrupt fixture achievable (loadHoldings flags one)', typeof corruptSym === 'string');
    if (typeof corruptSym === 'string') {
      const cm = cb.db.mkNode('div');
      const cpk = await cb.api._p5RunResearch(corruptSym, cm, NOW_MS);
      check('corrupt: news failed holding-corrupt', cpk.sections.news.state === 'failed' &&
        cpk.sections.news.reason === 'holding-corrupt');
      check('corrupt: synthesis suppressed', cpk.sections.synthesis.state === 'suppressed');
      check('corrupt: ZERO fetch calls', cStub._calls.length === 0);
      const cTexts = trailTexts(cb.db);
      check('corrupt: never queued/pending rendered',
        firstIndexContaining(cTexts, 'News: queued') === -1 && firstIndexContaining(cTexts, 'Synthesis: pending') === -1);
    }
  })();

  // ── ISOLATION: storage, scans, no-retry aggregate ────────────────────────
  await (async function () {
    const st = stubFetch({ body: okBody(CONTENT_OK, SR_FIX) });
    const b = buildApi(FULL_SEED, st);
    const before = b.ls._dump();
    await b.api._p5RunResearch('AAA', b.db.mkNode('div'), NOW_MS);
    await b.api._p5RunResearch('ZZZ', b.db.mkNode('div'), NOW_MS);
    check('zero storage writes across runs', b.ls._writes.length === 0);
    check('pt_* byte-identical across runs', b.ls._dump() === before);

    function stripped(name) {
      return src[name].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    }
    const pureForbidden = [/\bfetch\s*\(/, /localStorage/, /document\./, /Date\.now/, /Math\.random/];
    const control = 'fetch( localStorage document.x Date.now Math.random';
    for (const pat of pureForbidden) {
      check('positive control fires: ' + pat.source, pat.test(control));
      check('_p5ParseModelItems clean of ' + pat.source, !pat.test(stripped('_p5ParseModelItems')));
      check('_p5Call1Prompt clean of ' + pat.source, !pat.test(stripped('_p5Call1Prompt')));
    }
    const adapterForbidden = [/localStorage/, /document\./, /Math\.random/, /setItem/, /removeItem/];
    for (const pat of adapterForbidden) {
      check('_p5RequestItems clean of ' + pat.source, !pat.test(stripped('_p5RequestItems')));
    }
    const orchForbidden = [/localStorage/, /setItem/, /removeItem/, /Math\.random/, /innerHTML/, /getElementById|querySelector/];
    for (const pat of orchForbidden) {
      check('_p5RunResearch clean of ' + pat.source, !pat.test(stripped('_p5RunResearch')));
    }
    check('_p5RunResearch performs no direct fetch (adapter only)',
      !/\bfetch\s*\(/.test(stripped('_p5RunResearch')));
  })();

  console.log(failures === 0
    ? 'P5 CALL1: PASS (' + asserts + ' asserts)'
    : 'P5 CALL1: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
