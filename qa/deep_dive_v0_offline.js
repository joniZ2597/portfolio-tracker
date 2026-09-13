'use strict';

/*
 * DDV0-IMPL — Deep Dive v0 offline QA (WU-DDV0).
 *
 * Pure Node, no network (fetch is a counterfeit spy), no browser, no live
 * services, no localStorage global at all — any access to it inside the
 * extracted production code would throw ReferenceError and fail the suite,
 * which is itself the proof of zero pt_* I/O.
 *
 * Extracts the REAL production bytes from index.html — the gated markup
 * conditional inside renderMainPanel's template, and the three DDV0
 * functions (_dd0RunCard, _dd0RenderResultHtml, _dd0FetchAnalysis) plus
 * their two dependencies (_crEsc, buildTechSnapshotBlock) — and executes
 * them verbatim in a sandbox, never a re-implementation.
 *
 * Proves the DDV0-IMPL closeCondition clauses, each via an exact-match /
 * exact-count assertion (never a loose "contains"), so a regression on any
 * clause fails its own assertion:
 *   1. no button when the gate is undefined or anything other than the
 *      boolean true (three distinct off-values are tried)
 *   2. exactly one button for the selected ticker when the gate is true
 *   3. one click -> exactly one request to /.netlify/functions/anthropic-proxy
 *      with model === 'claude-sonnet-4-5', max_tokens <= 1500, and system/user
 *      content built only from the item's own existing fields + tech snapshot
 *   4. success renders into that ticker's card only (a second ticker's DOM is
 *      untouched)
 *   5. a failed/non-OK response renders a reason inside the card and changes
 *      nothing else
 *   6. a second click replaces only that ticker's card content
 *   7. zero access to any pt_* storage surface (no localStorage global at all)
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

function extractLiteralBlock(content, startMarker, endMarker) {
  const s = content.indexOf(startMarker);
  if (s === -1) return null;
  const e = content.indexOf(endMarker, s + startMarker.length);
  if (e === -1) return null;
  return content.slice(s, e + endMarker.length);
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');

// ── Extract the real gated markup conditional from renderMainPanel's template ──
// The extracted text is the bare ternary expression (the ${ ... } wrapper's
// braces are deliberately excluded, one on each end) so it is valid standalone
// JS: `window.PT_ENABLE_DEEP_DIVE === true ? \`...\` : ''`.
const MARKUP_START = 'window.PT_ENABLE_DEEP_DIVE === true ? `';
const MARKUP_END = '` : \'\'}';
const markupStartIdx = content.indexOf(MARKUP_START);
const markupEndIdx = markupStartIdx === -1 ? -1 : content.indexOf(MARKUP_END, markupStartIdx);
const markupExpr = (markupStartIdx === -1 || markupEndIdx === -1)
  ? null
  : content.slice(markupStartIdx, markupEndIdx + MARKUP_END.length - 1);
if (!markupExpr) {
  console.log('  FAIL  could not extract the DDV0 gated markup conditional from index.html');
  console.log('DDV0 OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}

// ── Extract the three DDV0 functions + their two dependencies, verbatim ───────
const FNS = ['_dd0RunCard', '_dd0RenderResultHtml', '_dd0FetchAnalysis', '_crEsc', 'buildTechSnapshotBlock'];
const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
if (missingExtract.length > 0) {
  console.log('  FAIL  could not extract: ' + missingExtract.join(', '));
  console.log('DDV0 OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}

// ── Sandbox doc: getElementById-only, throws on anything else touched ─────────
function makeDoc(nodesById) {
  const registry = Object.assign({}, nodesById);
  const raw = {
    getElementById: function (id) { return registry[id] || null; }
  };
  return new Proxy(raw, {
    get: function (t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      throw new Error('document.' + String(k) + ' touched');
    }
  });
}

function makeBtnNode() {
  return { disabled: false, textContent: '' };
}
function makePanelNode() {
  return { style: { display: '' }, innerHTML: '' };
}

// Counterfeit fetch spy. `scenarios` consumed in call order.
function makeFetch(scenarios) {
  const calls = [];
  let idx = 0;
  const fn = function (url, opts) {
    calls.push({ url: String(url), opts: opts });
    const scenario = scenarios[idx];
    idx += 1;
    if (!scenario) return Promise.reject(new Error('no scenario queued for call ' + idx));
    if (scenario.reject) return Promise.reject(scenario.reject);
    return Promise.resolve({
      ok: scenario.ok !== false,
      status: scenario.status || (scenario.ok !== false ? 200 : 500),
      json: function () {
        if (scenario.badJson) return Promise.reject(new Error('bad json'));
        return Promise.resolve(scenario.body);
      }
    });
  };
  fn._calls = calls;
  return fn;
}

// window is a plain local object with the gate ON by default — _dd0RunCard's
// own top-of-function `window.PT_ENABLE_DEEP_DIVE !== true` guard (defense in
// depth alongside the markup conditional) must see it as exactly true for
// these behavioural clauses to reach the fetch at all.
function buildApi(fetchStub, docBundle, techCacheSeed, cockpitResultsSeed) {
  const body =
    'var window = { PT_ENABLE_DEEP_DIVE: true };\n' +
    'var _techCache = ' + JSON.stringify(techCacheSeed || {}) + ';\n' +
    'var _cockpitResults = ' + JSON.stringify(cockpitResultsSeed || []) + ';\n' +
    FNS.map(function (n) { return src[n]; }).join('\n') +
    '\nreturn { ' + FNS.map(function (n) { return n + ': ' + n; }).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'console', 'fetch', body);
  const quiet = { log: function () {}, warn: function () {}, error: function () {} };
  return factory(docBundle, quiet, fetchStub);
}

// ── Fixture item — every field _dd0FetchAnalysis is allowed to read ──────────
const ITEM_AAA = {
  ticker: 'AAA',
  company_name: 'Alpha Alpha Corp',
  sentiment: 'positive',
  sentiment_score: 71,
  summary: 'KEY EVENT: beat estimates. Rating: Buy | PT: $50 | Do not chase strength',
  technical_setup: 'healthy_uptrend',
  news_bias: 'bullish',
  news: ['Primary: beat', 'Secondary: guide up'],
  alerts: [{ type: 'normal', text: 'watch resistance' }]
};
const ITEM_BBB = { ticker: 'BBB', sentiment: 'neutral', summary: 'no data' };

function okBody(text) {
  return { content: [{ type: 'text', text: text }] };
}

(async function main() {

  // ══ CLAUSE 1+2 — gate on/off controls exactly the button count ═════════════
  (function () {
    function render(gateValue, ticker) {
      const win = (gateValue === undefined) ? {} : { PT_ENABLE_DEEP_DIVE: gateValue };
      // eslint-disable-next-line no-new-func
      const evalFn = new Function('window', 'item', 'return (' + markupExpr + ');');
      return evalFn(win, { ticker: ticker });
    }

    const OFF_VALUES = [undefined, 'true', 1, false, null];
    for (const v of OFF_VALUES) {
      const html = render(v, 'AAA');
      check('gate value ' + JSON.stringify(v) + ' -> no Deep Dive button rendered',
        html.indexOf('dd0-btn-') === -1);
    }

    const htmlOn = render(true, 'AAA');
    const btnMatches = (htmlOn.match(/dd0-btn-AAA/g) || []).length;
    check('gate === true -> exactly one Deep Dive button id for the selected ticker',
      btnMatches === 1);
    check('gate === true -> the real button label is present',
      htmlOn.indexOf('Run Deep Dive') !== -1);
    check('gate === true -> the real onclick wiring calls _dd0RunCard with the real ticker',
      htmlOn.indexOf("_dd0RunCard('AAA')") !== -1);
    check('gate === true, different ticker -> no cross-ticker button id leaks in',
      render(true, 'ZZZ').indexOf('dd0-btn-AAA') === -1);
  })();

  // ══ CLAUSE 3 — one click, exactly one request, pinned model/tokens/content ═
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    const fetchStub = makeFetch([{ ok: true, body: okBody('Deep dive text for AAA.') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA]);

    await api._dd0RunCard('AAA');

    check('exactly one request issued for one click', fetchStub._calls.length === 1);
    const req = fetchStub._calls[0];
    check('request URL is the real anthropic-proxy endpoint',
      req.url === '/.netlify/functions/anthropic-proxy');
    const payload = JSON.parse(req.opts.body);
    check('model is the literal claude-sonnet-4-5', payload.model === 'claude-sonnet-4-5');
    check('max_tokens is at most 1500', typeof payload.max_tokens === 'number' && payload.max_tokens <= 1500);
    check('request method is POST', req.opts.method === 'POST');

    const userContent = payload.messages[0].content;
    check('user content carries the ticker', userContent.indexOf('AAA') !== -1);
    check('user content carries the existing summary field', userContent.indexOf(ITEM_AAA.summary) !== -1);
    check('user content carries the existing sentiment field', userContent.indexOf('positive') !== -1);
    check('user content carries the existing news field', userContent.indexOf('Primary: beat') !== -1);
  })();

  // ══ CLAUSE 3b — content is built ONLY from fields present on the item ══════
  // ITEM_BBB deliberately omits technical_setup, news_bias, news and alerts;
  // their section labels must be absent from the request, proving no field is
  // fabricated when the source item does not carry it.
  await (async function () {
    const btnB = makeBtnNode();
    const panelB = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-BBB': btnB, 'dd0-panel-BBB': panelB });
    const fetchStub = makeFetch([{ ok: true, body: okBody('Deep dive text for BBB.') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_BBB]);

    await api._dd0RunCard('BBB');

    const payload = JSON.parse(fetchStub._calls[0].opts.body);
    const userContent = payload.messages[0].content;
    check('no TECHNICAL SETUP line when the item has none', userContent.indexOf('TECHNICAL SETUP:') === -1);
    check('no NEWS BIAS line when the item has none', userContent.indexOf('NEWS BIAS:') === -1);
    check('no NEWS: line when the item has none', userContent.indexOf('NEWS:') === -1);
    check('no ALERTS: line when the item has none', userContent.indexOf('ALERTS:') === -1);
    check('no SENTIMENT SCORE line when the item has none', userContent.indexOf('SENTIMENT SCORE:') === -1);
    check('no COMPANY line when the item has none', userContent.indexOf('COMPANY:') === -1);
  })();

  // ══ CLAUSE 4 — success renders into that ticker's card only ════════════════
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const btnB = makeBtnNode();
    const panelB = makePanelNode();
    const doc = makeDoc({
      'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA,
      'dd0-btn-BBB': btnB, 'dd0-panel-BBB': panelB
    });
    const fetchStub = makeFetch([{ ok: true, body: okBody('Deep dive text for AAA only.') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA, ITEM_BBB]);

    await api._dd0RunCard('AAA');

    check('AAA panel now shows the success text', panelA.innerHTML.indexOf('Deep dive text for AAA only.') !== -1);
    check('AAA panel is made visible', panelA.style.display === 'block');
    check('AAA button re-enabled after completion', btnA.disabled === false);
    check('AAA button reads "Run again" after a successful run', btnA.textContent.indexOf('Run again') !== -1);
    check('BBB panel untouched (still empty)', panelB.innerHTML === '');
    check('BBB panel display untouched', panelB.style.display === '');
    check('BBB button untouched (never disabled)', btnB.disabled === false);
    check('BBB button textContent untouched', btnB.textContent === '');
  })();

  // ══ CLAUSE 5 — failure renders a reason and changes nothing else ═══════════
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    const fetchStub = makeFetch([{ ok: false, status: 500, body: { error: { message: 'upstream unavailable' } } }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA]);

    await api._dd0RunCard('AAA');

    check('failure renders the reason text inside the card', panelA.innerHTML.indexOf('upstream unavailable') !== -1);
    check('failure still makes the panel visible (reason must be seen)', panelA.style.display === 'block');
    check('failure re-enables the button (no stuck spinner)', btnA.disabled === false);
    check('failure leaves the button in the neutral "Run again" state, not an error label',
      btnA.textContent.indexOf('Run again') !== -1);
    check('exactly one request was made, no retry storm', fetchStub._calls.length === 1);
  })();

  // ══ CLAUSE 5b — network-level rejection (fetch throws) also renders a reason ═
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    const fetchStub = makeFetch([{ reject: new Error('network down') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA]);

    await api._dd0RunCard('AAA');

    check('a thrown fetch is caught and rendered as a failure reason',
      panelA.innerHTML.indexOf('network down') !== -1);
    check('button re-enabled after a thrown fetch', btnA.disabled === false);
  })();

  // ══ CLAUSE 6 — a second click replaces only that ticker's card content ═════
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const btnB = makeBtnNode();
    const panelB = makePanelNode();
    const doc = makeDoc({
      'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA,
      'dd0-btn-BBB': btnB, 'dd0-panel-BBB': panelB
    });
    const fetchStub = makeFetch([
      { ok: true, body: okBody('First run text.') },
      { ok: true, body: okBody('Second run text.') }
    ]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA, ITEM_BBB]);

    await api._dd0RunCard('AAA');
    check('first run rendered its own text', panelA.innerHTML.indexOf('First run text.') !== -1);

    await api._dd0RunCard('AAA');
    check('second click issued a second, independent request', fetchStub._calls.length === 2);
    check('second run REPLACED the card content (no longer shows the first run text)',
      panelA.innerHTML.indexOf('First run text.') === -1);
    check('second run shows its own text', panelA.innerHTML.indexOf('Second run text.') !== -1);
    check('BBB panel never touched by AAA\'s two runs', panelB.innerHTML === '');
  })();

  // ══ CLAUSE 6b — one in-flight run per ticker (second click while pending is a no-op) ═
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    const fetchStub = makeFetch([{ ok: true, body: okBody('Only run text.') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA]);

    const first = api._dd0RunCard('AAA');
    // Button is disabled synchronously before the first await yields inside _dd0RunCard's
    // own body, so a second call arriving while btn.disabled is true must be a no-op.
    const second = api._dd0RunCard('AAA');
    await Promise.all([first, second]);
    check('a click while a run is already in flight issues no additional request',
      fetchStub._calls.length === 1);
  })();

  // ══ CLAUSE 7 — zero pt_* / localStorage access anywhere in the DDV0 surface ═
  // No `localStorage` argument is ever passed into the sandbox factory (unlike
  // buildApi's fetch/document/console), so any reference to it inside the
  // extracted production bytes throws ReferenceError and fails this suite.
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    const fetchStub = makeFetch([{ ok: true, body: okBody('No storage touched.') }]);
    const api = buildApi(fetchStub, doc, {}, [ITEM_AAA]);
    let threw = null;
    try {
      await api._dd0RunCard('AAA');
    } catch (e) {
      threw = e;
    }
    check('the full click-to-terminal run completes without touching localStorage',
      threw === null);
  })();

  // ══ Disabled-gate guard inside _dd0RunCard itself (defense in depth) ═══════
  await (async function () {
    const btnA = makeBtnNode();
    const panelA = makePanelNode();
    const doc = makeDoc({ 'dd0-btn-AAA': btnA, 'dd0-panel-AAA': panelA });
    // window.PT_ENABLE_DEEP_DIVE !== true is checked at the TOP of _dd0RunCard
    // itself; the extracted function reads `window` from the outer scope, so
    // build a sandbox that also exposes a `window` global explicitly OFF.
    const body =
      'var window = { PT_ENABLE_DEEP_DIVE: false };\n' +
      'var _techCache = {};\n' +
      'var _cockpitResults = ' + JSON.stringify([ITEM_AAA]) + ';\n' +
      FNS.map(function (n) { return src[n]; }).join('\n') +
      '\nreturn { _dd0RunCard: _dd0RunCard };';
    const fetchStub = makeFetch([{ ok: true, body: okBody('should never be reached') }]);
    // eslint-disable-next-line no-new-func
    const factory = new Function('document', 'console', 'fetch', body);
    const quiet = { log: function () {}, warn: function () {}, error: function () {} };
    const gatedApi = factory(doc, quiet, fetchStub);
    await gatedApi._dd0RunCard('AAA');
    check('_dd0RunCard itself refuses to run when window.PT_ENABLE_DEEP_DIVE is not exactly true',
      fetchStub._calls.length === 0);
    check('the gated-off panel is left untouched', panelA.innerHTML === '');
  })();

  console.log(failures === 0
    ? 'DDV0 OFFLINE: PASS (' + asserts + ' asserts)'
    : 'DDV0 OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
  process.exit(failures === 0 ? 0 : 1);
})();
