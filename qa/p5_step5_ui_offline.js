'use strict';

/*
 * P-5 Research-on-Demand — Step 5 offline QA (holding-card UI trigger).
 *
 * Pure Node, no network (fetch is a counterfeit spy), no browser, no live
 * services. Extracts the Step 1-4 engine chain, the new Step 5 UI-wiring
 * functions, AND the literal holding-card wiring snippet (button creation +
 * DOM attachment) from index.html, and runs them with counterfeit
 * localStorage (write-spy), document (tracked stub nodes + getElementById
 * registry), and a sequential/deferrable fetch fixture. A single sandbox
 * drives a multi-run saga (success -> failed/zero-accepted re-run -> retained
 * success -> real Retry click -> fresh success) through the SAME live
 * module-level _p5Displayed/_p5LastRun/_p5Pending state a real page would
 * use, and Retry is exercised via the actual onclick the production code
 * wires (not a direct re-call). A separate runtime check executes the exact
 * card-wiring bytes to prove the real Research button is created, appended
 * onto the real holding card, and its real onclick invokes
 * _p5RunResearchCard(sym).
 *
 * Proves the nine P5S5-IMPL offline criteria: one-click start (via the real
 * button wiring) with complete context, local-before-network rendering
 * (live-subtree visible), retention on re-run, failed-news Retry (full
 * re-run, Call-1-only counted), promotion only on done+accepted>=1,
 * non-replacement + dual-asOf on zero accepted (live-subtree visible), no
 * clearing on any failure path, byte-identical packet/section vocabulary
 * against the frozen engine at 36bf497, and zero pt_* writes.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const REPO_ROOT = path.resolve(__dirname, '..');
const ENGINE_PIN_REF = '36bf497';

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
function extractLiteralBlock(content, startMarker, endMarker) {
  const s = content.indexOf(startMarker);
  if (s === -1) return null;
  const e = content.indexOf(endMarker, s);
  if (e === -1) return null;
  return content.slice(s, e + endMarker.length);
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');

const ENGINE_FNS = ['_pfIsFiniteNum', '_pfFxRateValid', '_pfFxState', '_pfNormalizeHoldingEntry',
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
// Frozen surface that must remain byte-identical to the pinned engine commit.
const VOCAB_PINNED_FNS = ['_p5PacketStatus', '_p5BuildPacket', '_p5RenderPacket',
  '_p5RunResearch', '_p5RunSynthesis', '_p5RequestSynthesis'];
const UI_FNS = ['_p5ShouldPromote', '_p5RenderDisplayedBox', '_p5RenderCard', '_p5RunResearchCard'];
const FNS = ENGINE_FNS.concat(UI_FNS);

const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
const strippedAll = FNS.map(function (n) { return src[n] || ''; }).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const VARS = Array.from(new Set(strippedAll.match(/\b(?:PF|P5)_[A-Z0-9_]+\b/g) || [])).sort();
for (const n of VARS) { src[n] = extractVarSource(content, n); if (!src[n]) missingExtract.push('var ' + n); }
src._pfRootCorrupted = extractVarSource(content, '_pfRootCorrupted') || 'var _pfRootCorrupted = false;';
VARS.push('_pfRootCorrupted');
const UI_VARS = ['_p5Displayed', '_p5LastRun', '_p5Pending'];
for (const n of UI_VARS) { src[n] = extractVarSource(content, n); if (!src[n]) missingExtract.push('var ' + n); }
VARS.push.apply(VARS, UI_VARS);
if (missingExtract.length > 0) {
  console.log('  FAIL  could not extract: ' + missingExtract.join(', '));
  process.exit(1);
}

// The literal holding-card wiring snippet (Research button creation +
// attachment onto cardActions/card/list) — executed verbatim below, never
// reimplemented, so the test proves the real production bytes.
const CARD_WIRING_START = '// P5S5: research trigger';
const CARD_WIRING_END = 'list.appendChild(card);';
const cardWiringSrc = extractLiteralBlock(content, CARD_WIRING_START, CARD_WIRING_END);
if (!cardWiringSrc) {
  console.log('  FAIL  could not extract the holding-card P5S5 wiring snippet');
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
    _get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }
  };
}
function makeDoc() {
  const created = [];
  const registry = {};
  function mkNode(tag) {
    let _id = '';
    const n = {
      _tag: tag, className: '', textContent: '', children: [],
      appendChild: function (c) { this.children.push(c); return c; },
      removeChild: function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
      setAttribute: function (k, v) { this._attrs = this._attrs || {}; this._attrs[k] = v; }
    };
    Object.defineProperty(n, 'firstChild', { get: function () { return this.children[0] || null; } });
    Object.defineProperty(n, 'id', {
      get: function () { return _id; },
      set: function (v) { if (_id && registry[_id] === n) delete registry[_id]; _id = v; registry[v] = n; }
    });
    created.push(n);
    return n;
  }
  const raw = {
    createElement: function (t) { return mkNode(t); },
    getElementById: function (id) { return registry[id] || null; }
  };
  const doc = new Proxy(raw, {
    get: function (t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      throw new Error('document.' + String(k) + ' touched');
    }
  });
  return { doc: doc, created: created, mkNode: mkNode, registry: registry };
}
// Reads text only from the CURRENTLY ATTACHED subtree under root — never from
// db.created, which retains detached/stale nodes and could make a
// "visible"/"rendered" assertion pass on stale content.
function liveText(root) {
  const parts = [];
  (function walk(n) {
    if (n.textContent) parts.push(n.textContent);
    for (const c of n.children) walk(c);
  })(root);
  return parts.join(' | ');
}
function findAllByClass(root, cls) {
  const out = [];
  (function walk(n) {
    if (n.className === cls) out.push(n);
    for (const c of n.children) walk(c);
  })(root);
  return out;
}

// Sequential fetch fixture: news (perplexity) scenarios are consumed in call
// order, one per _p5RunResearchCard invocation; a scenario marked `deferred`
// holds its response until `_releaseNext()` is called, so a test can inspect
// mid-flight DOM state. Anthropic (call-2 synthesis) always answers
// immediately with a fixed valid reply, matching the call1/call2 offline
// suites' existing convention. `_pplx()` isolates the Call-1 leg for counting
// — total `_calls` mixes both legs and must never be used for a Call-1 count.
function makeSequentialFetch(newsScenarios) {
  const calls = [];
  let idx = 0;
  const gates = [];
  function respond(scenario) {
    if (scenario.throwName) {
      const e = new Error('stub');
      e.name = scenario.throwName;
      return Promise.reject(e);
    }
    const status = scenario.status || 200;
    return Promise.resolve({
      ok: status < 400, status: status,
      json: function () {
        if (scenario.badJson) return Promise.reject(new Error('bad json'));
        return Promise.resolve(scenario.body);
      }
    });
  }
  const fn = function (url, opts) {
    calls.push({ url: String(url), opts: opts });
    if (String(url).indexOf('anthropic') !== -1) {
      return Promise.resolve({
        ok: true, status: 200,
        json: function () { return Promise.resolve({ content: [{ type: 'text', text: '{"synthesis":"S [1]."}' }] }); }
      });
    }
    const scenario = newsScenarios[idx];
    idx += 1;
    if (!scenario) return Promise.reject(new Error('sequential fetch: no scenario queued for call ' + idx));
    if (scenario.deferred) {
      return new Promise(function (resolve, reject) {
        gates.push(function () { respond(scenario).then(resolve, reject); });
      });
    }
    return respond(scenario);
  };
  fn._calls = calls;
  fn._pplx = function () { return calls.filter(function (c) { return c.url.indexOf('anthropic') === -1; }); };
  fn._releaseNext = function () {
    const g = gates.shift();
    if (!g) throw new Error('sequential fetch: no deferred gate to release');
    g();
  };
  return fn;
}

function waitUntilIdle(api, sym, timeoutMs) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 2000;
  const start = Date.now();
  return new Promise(function (resolve, reject) {
    (function poll() {
      if (!api._p5Pending[sym]) return resolve();
      if (Date.now() - start > limit) return reject(new Error('waitUntilIdle timed out after ' + limit + 'ms for ' + sym));
      setImmediate(poll);
    })();
  });
}

function buildApi(lsSeed, fetchStub, docBundle, windowStub) {
  const body = VARS.map(n => src[n]).join('\n') + '\n' + FNS.map(n => src[n]).join('\n') +
    '\nreturn { ' + FNS.map(n => n + ': ' + n).join(', ') + ', _p5Displayed: _p5Displayed, ' +
    '_p5LastRun: _p5LastRun, _p5Pending: _p5Pending };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'document', 'console', 'fetch', 'AbortSignal', 'window', '"use strict";\n' + body);
  const ls = makeLs(lsSeed);
  const db = docBundle || makeDoc();
  const quiet = { log: function () {}, warn: function () {}, error: function () {} };
  const win = windowStub || {};
  return { api: factory(ls, db.doc, quiet, fetchStub, AbortSignal, win), ls: ls, db: db };
}

// Runs the literal card-wiring snippet extracted from index.html, with mock
// cardActions/card/list/editBtn/delBtn nodes and a spy substituted for
// _p5RunResearchCard (via the Function's own parameter of that name) — proves
// the REAL production expression `_p5RunResearchCard(sym)` fires on click,
// not a re-implementation of it.
function runCardWiringSnippet(sym) {
  const db = makeDoc();
  const editBtn = db.mkNode('button');
  const delBtn = db.mkNode('button');
  const cardActions = db.mkNode('div');
  const card = db.mkNode('div');
  const list = db.mkNode('div');
  const calls = [];
  const spyRunCard = function (s) { calls.push(s); };
  // eslint-disable-next-line no-new-func
  const runner = new Function('sym', 'document', 'cardActions', 'card', 'list', 'editBtn', 'delBtn', '_p5RunResearchCard',
    '"use strict";\n' + cardWiringSrc);
  runner(sym, db.doc, cardActions, card, list, editBtn, delBtn, spyRunCard);
  return { cardActions: cardActions, card: card, list: list, calls: calls };
}

const NOW_MS = Date.parse('2026-09-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }
const SIX_KEYS = ['pt_holdings', 'pt_cash', 'pt_recon', 'pt_results', 'pt_fx', 'pt_tickers'];
const HOLDINGS_SEED = JSON.stringify({
  AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
         manualPlPct: 11.1, baselineAt: iso(NOW_MS - 3 * DAY) }
});
function fullSeed() {
  return {
    pt_holdings: HOLDINGS_SEED,
    pt_fx: JSON.stringify({ rate: 3.0, effectiveAt: iso(NOW_MS - DAY), source: 'boi',
      fetchedAt: iso(NOW_MS - DAY), lastAttemptAt: iso(NOW_MS - DAY), lastAttemptOk: true }),
    pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-09-01' }),
    pt_recon: JSON.stringify({ brokerTotalILS: 6000, asOf: '2026-09-01', declaredExclusionsILS: 0, exclusionsNote: '' }),
    pt_results: JSON.stringify([]),
    pt_tickers: JSON.stringify([{ symbol: 'AAA', inScan: true }]),
    pt_eod_cache: JSON.stringify({ AAA: { changePercent: 1.5 } })
  };
}
const SR_ONE = [{ title: 'Item A', url: 'https://ex.com/a', date: '2026-09-09', last_updated: '2026-09-09', snippet: 's' }];
const CONTENT_MATCH = JSON.stringify([{ sourceUrl: 'https://ex.com/a', summary: 'S1.' }]);
const CONTENT_NOMATCH = JSON.stringify([{ sourceUrl: 'https://ex.com/nope', summary: 'S1.' }]);
function okBody(contentStr, sr) { return { choices: [{ message: { content: contentStr } }], search_results: sr }; }
function mkMountRegistered(db, sym) {
  const mount = db.mkNode('div');
  mount.id = 'pf-p5-mount-' + sym;
  return mount;
}

(async function main() {

  // ── MOUNT RESOLUTION — real getElementById round-trip ────────────────────
  (function () {
    const db = makeDoc();
    const mount = mkMountRegistered(db, 'AAA');
    check('mount registered under its real id is resolvable via document.getElementById',
      db.doc.getElementById('pf-p5-mount-AAA') === mount);
    check('an unregistered id resolves to null (registry is not a pass-through)',
      db.doc.getElementById('pf-p5-mount-ZZZ') === null);
  })();

  // ── REAL BUTTON WIRING — executes the literal card-wiring bytes ──────────
  // Proves: holding card -> Research button -> onclick -> _p5RunResearchCard,
  // using the actual snippet extracted from index.html, not a re-implementation.
  (function () {
    const { cardActions, card, list, calls } = runCardWiringSnippet('AAA');
    const resBtn = cardActions.children.filter(function (c) { return c.className === 'btn-pf-research'; })[0];
    check('Research button created with the real production className/text',
      !!resBtn && resBtn.textContent === 'Research');
    check('Research button appended into cardActions (the real per-card control row)',
      cardActions.children.indexOf(resBtn) !== -1);
    check('cardActions is appended onto the card', card.children.indexOf(cardActions) !== -1);
    const mountChild = card.children.filter(function (c) { return c.className === 'p5-card-mount'; })[0];
    check('the p5 mount is appended onto the SAME card', !!mountChild && mountChild.id === 'pf-p5-mount-AAA');
    check('the card reaches the rendered holding list', list.children.indexOf(card) !== -1);
    check('sanity: no call before the click', calls.length === 0);
    resBtn.onclick();
    check('the REAL production onclick invokes _p5RunResearchCard with the real symbol',
      calls.length === 1 && calls[0] === 'AAA');
  })();

  // ── SAGA: one sandbox, one live _p5Displayed/_p5LastRun/_p5Pending state ──
  // Covers criteria 1 (context/promotion), 3, 4, 5, 6, 7 end-to-end in order:
  //   run 1  success                       -> promote, complete-context proof
  //   run 2  zero-accepted (deferred)       -> pending-first, retained, dual asOf
  //   run 3  network error                  -> retained, reason + Retry rendered
  //   retry  (real onclick, not a direct call) success -> fresh full re-run
  await (async function () {
    const db = makeDoc();
    const mount = mkMountRegistered(db, 'AAA');
    const fetchStub = makeSequentialFetch([
      { body: okBody(CONTENT_MATCH, SR_ONE) },                     // run 1
      { body: okBody(CONTENT_NOMATCH, SR_ONE), deferred: true },   // run 2
      { throwName: 'FetchError' },                                 // run 3
      { body: okBody(CONTENT_MATCH, SR_ONE) }                      // retry
    ]);
    const { api } = buildApi(fullSeed(), fetchStub, db);

    // Run 1 — one click, complete context, promotion.
    await api._p5RunResearchCard('AAA');
    check('run 1: reached Call-1 exactly once', fetchStub._pplx().length === 1);
    const req1 = JSON.parse(fetchStub._pplx()[0].opts.body);
    check('run 1: request carried the REAL symbol in its actual payload (not just a URL hit)',
      req1.messages[0].content.indexOf('"AAA"') !== -1);
    const firstDisplayed = api._p5Displayed.AAA;
    check('run 1: promoted (accepted>=1)', !!firstDisplayed && firstDisplayed.sections.news.state === 'done' &&
      firstDisplayed.counts.accepted >= 1);
    check('run 1: promoted packet carries the REAL local context (complete, not partial)',
      firstDisplayed.sections.portfolio.found === true &&
      firstDisplayed.sections.portfolio.holding.positionSize === 1000 &&
      firstDisplayed.sections.portfolio.holding.currency === 'USD');

    // Run 2 — re-run, deferred: pending renders first, displayed retained.
    const run2 = api._p5RunResearchCard('AAA');
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    check('run 2: pending mount is FIRST during a re-run',
      mount.children.length >= 1 && mount.children[0].className === 'p5-pending-mount');
    check('run 2: prior displayed packet still present beneath the pending run',
      mount.children.some(function (c) { return c.className === 'p5-displayed'; }));
    fetchStub._releaseNext();
    await run2;
    check('run 2: zero-accepted result does NOT replace the prior success',
      api._p5Displayed.AAA === firstDisplayed);
    check('run 2: recorded as the last attempt, not promoted',
      api._p5LastRun.AAA.sections.news.state === 'done' && api._p5LastRun.AAA.counts.accepted === 0);
    const liveAfterRun2 = liveText(mount);
    check('run 2: BOTH asOf values visible in the LIVE mount subtree (prior success + latest non-promoting attempt)',
      liveAfterRun2.indexOf(firstDisplayed.asOf) !== -1 && liveAfterRun2.indexOf(api._p5LastRun.AAA.asOf) !== -1);

    // Run 3 — network error: no clearing, reason + Retry rendered.
    await api._p5RunResearchCard('AAA');
    check('run 3: failed, not promoted', api._p5LastRun.AAA.sections.news.state === 'failed');
    check('run 3: displayed packet NOT cleared by the failure', api._p5Displayed.AAA === firstDisplayed);
    check('run 3: failure reason visible in the LIVE mount subtree', liveText(mount).indexOf('fetch-failed') !== -1);
    const retryBtns = findAllByClass(mount, 'btn-pf-p5-retry');
    check('run 3: exactly one live Retry control rendered', retryBtns.length === 1);

    // Retry — click the REAL onclick the production code wired, not a direct call.
    const pplxBeforeRetry = fetchStub._pplx().length;
    check('sanity: Retry onclick is a function', typeof retryBtns[0].onclick === 'function');
    retryBtns[0].onclick();
    try {
      await waitUntilIdle(api, 'AAA', 2000);
    } catch (e) {
      check('retry settled within the bounded timeout: ' + e.message, false);
    }
    check('retry: performed exactly one FULL new Call-1 (not a partial retry)',
      fetchStub._pplx().length === pplxBeforeRetry + 1);
    check('retry: fresh success promoted', api._p5Displayed.AAA.sections.news.state === 'done' &&
      api._p5Displayed.AAA.counts.accepted >= 1 && api._p5Displayed.AAA !== firstDisplayed);
  })();

  // ── LOCAL-BEFORE-NETWORK (criterion 2) ────────────────────────────────────
  await (async function () {
    const db = makeDoc();
    const mount = mkMountRegistered(db, 'AAA');
    const fetchStub = makeSequentialFetch([{ body: okBody(CONTENT_MATCH, SR_ONE), deferred: true }]);
    const { api } = buildApi(fullSeed(), fetchStub, db);
    const runPromise = api._p5RunResearchCard('AAA');
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    const midLive = liveText(mount);
    check('local sections visible in the LIVE mount subtree before the network call resolved',
      midLive.indexOf('Market snapshot') !== -1 && midLive.indexOf('Portfolio context') !== -1);
    fetchStub._releaseNext();
    await runPromise;
    check('run completed after the network gate was released', !!api._p5Displayed.AAA);
  })();

  // ── VOCABULARY PIN (criterion 8) — exact literal-vocabulary equality ─────
  // GATING proof operates on the CURRENT WORKING TREE (what this task's diff
  // actually produced), never HEAD (which predates this task and would only
  // prove the pre-task baseline, not preservation by this implementation).
  // Primary comparison is of the exact vocabulary LITERALS — single-line
  // regex captures, immune to CRLF/LF — extracted independently from the
  // working tree and from 36bf497:index.html, across all three frozen
  // categories: section/news/synthesis states, suppression reasons, and
  // packet.status. This is exact literal-vocabulary equality, NOT a
  // whole-file byte-identical claim.
  (function () {
    let pinnedContent = null;
    try {
      pinnedContent = execFileSync('git', ['show', ENGINE_PIN_REF + ':index.html'],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      check('able to read the pinned engine commit ' + ENGINE_PIN_REF + ' (git show failed: ' + e.message + ')', false);
      return;
    }

    const EXPECTED_STATES = ['collecting', 'done', 'failed', 'pending', 'queued', 'suppressed'];
    const EXPECTED_SUPPRESSION_REASONS = ['empty-synthesis-text', 'news-failed', 'news-not-ok', 'zero-accepted-evidence'];
    const EXPECTED_PACKET_STATUS = ['complete', 'failed', 'partial'];
    const STATE_RE = /\bstate:\s*'([a-z]+)'/g;
    const REASON_RE = /\breason:\s*'([a-z][a-z-]*)'/g;
    const STATUS_RE = /\breturn\s*'([a-z]+)'/g;
    function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
    function literalSet(sourceStr, regex) {
      const out = new Set();
      let m;
      regex.lastIndex = 0;
      while ((m = regex.exec(sourceStr)) !== null) out.add(m[1]);
      return Array.from(out).sort();
    }
    // Reasons are scoped to _p5BuildPacket ONLY — the sole place the four
    // suppression reasons are literal-assigned; _p5RunResearch/
    // _p5RunSynthesis/_p5RequestSynthesis also use hyphenated string
    // literals (e.g. 'search-results-missing', 'model-output-unparseable')
    // but those are OPEN failure reasons propagated verbatim from lower
    // layers, never suppression reasons, and are deliberately excluded here.
    // Packet-status literals are scoped to _p5PacketStatus ONLY, its sole
    // producer.
    function extractVocab(contentStr) {
      const fnSrc = {};
      for (const n of VOCAB_PINNED_FNS) fnSrc[n] = extractFunctionSource(contentStr, n) || '';
      const statesScope = stripComments(VOCAB_PINNED_FNS.map(function (n) { return fnSrc[n]; }).join('\n'));
      const reasonsScope = stripComments(fnSrc._p5BuildPacket);
      const statusScope = stripComments(fnSrc._p5PacketStatus);
      return {
        states: literalSet(statesScope, STATE_RE),
        reasons: literalSet(reasonsScope, REASON_RE),
        status: literalSet(statusScope, STATUS_RE),
        fnSrc: fnSrc
      };
    }

    const wtVocab = extractVocab(content);      // CURRENT WORKING TREE (already read at top of file)
    const pinnedVocab = extractVocab(pinnedContent);

    check('working tree exposes the expected packet/section state vocabulary, exactly',
      JSON.stringify(wtVocab.states) === JSON.stringify(EXPECTED_STATES));
    check('working tree exposes the expected suppression-reason vocabulary, exactly',
      JSON.stringify(wtVocab.reasons) === JSON.stringify(EXPECTED_SUPPRESSION_REASONS));
    check('working tree exposes the expected packet.status vocabulary, exactly',
      JSON.stringify(wtVocab.status) === JSON.stringify(EXPECTED_PACKET_STATUS));
    check('working-tree state-vocabulary literals == 36bf497 state-vocabulary literals (exact set, EOL-immune)',
      JSON.stringify(wtVocab.states) === JSON.stringify(pinnedVocab.states));
    check('working-tree suppression-reason literals == 36bf497 suppression-reason literals (exact set, EOL-immune)',
      JSON.stringify(wtVocab.reasons) === JSON.stringify(pinnedVocab.reasons));
    check('working-tree packet.status literals == 36bf497 packet.status literals (exact set, EOL-immune)',
      JSON.stringify(wtVocab.status) === JSON.stringify(pinnedVocab.status));

    // Secondary source-integrity check: whole-function source identity
    // MODULO CHECKOUT EOL (autocrlf) — explicitly NOT a byte-identical claim,
    // since the working tree's on-disk EOL is a checkout artifact, not code.
    // Catches any non-vocabulary logic drift the literal-set checks above
    // would miss.
    function eolNorm(s) { return s.replace(/\r\n/g, '\n'); }
    for (const n of VOCAB_PINNED_FNS) {
      check(n + ' source identical to the engine at ' + ENGINE_PIN_REF + ' modulo checkout EOL (not byte-identical)',
        eolNorm(wtVocab.fnSrc[n]) === eolNorm(pinnedVocab.fnSrc[n]));
    }
  })();

  // ── SIX pt_ KEYS BYTE-IDENTICAL + ZERO WRITES (criterion 9) ───────────────
  await (async function () {
    const seed = fullSeed();
    const before = {};
    for (const k of SIX_KEYS) before[k] = seed[k] === undefined ? null : seed[k];
    const db = makeDoc();
    mkMountRegistered(db, 'AAA');
    const fetchStub = makeSequentialFetch([{ body: okBody(CONTENT_MATCH, SR_ONE) }]);
    const built = buildApi(seed, fetchStub, db);
    await built.api._p5RunResearchCard('AAA');
    check('zero storage writes for a full click-to-terminal run', built.ls._writes.length === 0);
    for (const k of SIX_KEYS) check('pt_ key byte-identical after run: ' + k, built.ls._get(k) === before[k]);
  })();

  console.log(failures === 0
    ? 'P5 STEP5 UI: PASS (' + asserts + ' asserts)'
    : 'P5 STEP5 UI: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
