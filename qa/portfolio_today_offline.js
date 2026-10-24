#!/usr/bin/env node
'use strict';
/*
 * qa/portfolio_today_offline.js - portfolio-today-1 (Portfolio Today v1).
 *
 * The REAL functions are extracted from index.html and run in an isolated vm context with a fake DOM, a fake localStorage and spies.
 * Pure Node: no network, no browser, no real storage, no file writes. Every expected value below comes from the requirements and from
 * independent calendar facts (US / TASE sessions, holidays, early closes, DST, the TASE Mon-Fri change on 2026-01-04), never from the
 * code's own output. Planted negatives mutate an in-memory COPY of index.html and the named row must then FAIL.
 *
 *   PT-1  V1-1 switches off by default; strict string read at load; only the two existing gates are written
 *   PT-2  V1-1 setter: strict boolean write, persists 'true', removes the key on off, re-render / fetch hooks
 *   PT-3  V1-1 storage failures are tolerated (the gate is still set in memory)
 *   PT-4  V1-1 Labs markup: separate box, exactly two switches, sync on open; the existing #labsBox is untouched
 *   PT-5  V1-1 / W6 no other storage key is written
 *   PT-6  V1-2 strip content (SPY, QQQ: price, day %, freshness label, fetch time)
 *   PT-7  V1-2 unavailable is shown as such, never 0
 *   PT-8  V1-2 the strip symbols ride the same batch (auto / cooldown / manual), de-duplicated
 *   PT-9  V1-3 ordering uses current rows only (.TA included), worst / best first
 *   PT-10 V1-3 other rows follow grouped by state
 *   PT-11 V1-3 sort options in the panel; the invested-sort reset leaves the day modes alone
 *   PT-12 V1-4 Est. Daily Move is not rendered
 *   PT-13 V1-4 per-card estimate states its basis and date
 *   PT-14 V1-4 recorded value and allocation keep their "Recorded" wording
 *   PT-15 F  each freshness state, US
 *   PT-16 F  each freshness state, TASE
 *   PT-17 F  weekend / holiday / early close / DST
 *   PT-18 F  Aged is never today / last close and never current
 *   PT-19 F  coverage edge and fail-closed inputs -> Unknown date
 *   PT-20 F  Refresh failed / Not available
 *   PT-21 F  labels (exact text, date format, plural)
 *   PT-22 F  a card shows the label and the day % of the cached row
 *   PT-23 W6 the new helpers start no network call and write nothing but the two switch keys
 *   PT-24 W6 only the portfolio-live and boi-fx-proxy endpoints exist in the Portfolio code; the strip adds none
 *   PT-25 W6 the pinned / untouched functions are byte-identical to the base
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const core = require('./lib/index-pins-core');

const SRC = core.normalizeText(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
const countOf = (h, n) => (n ? h.split(n).length - 1 : 0);

// Digests at the task base (LF-normalised, pin-map method): functions this task must leave byte-identical (PT-25).
const BASE_DIGESTS = {
  _pfLiveNormalize: 'c9e3b362c10d3325df9417d99f9abb7f5aba1f7b4cb4dddc9954e4df1cc5b6f1',
  _pfSessionDateFor: '3f3954a128f39a99c781a4bb8a53a7394a3b2dbc18d092784a2d6f25c8747731',
  _pfLiveSingle: 'bf5619cea74b83ac3438441d99dca51de1d30c5e1f8ec8cebb86f68d51f55a57',
  _pfLiveBatch: '58567dc8bd5a39d4b950927edb8657ecee01262ef3318134f5992710c93fdc7e',
  _pfEodCacheSet: '014b1f59445036f7949a5f50d44350ac0a9d4867e008ce5092cc345b380db938',
  _pfEodApplyAttemptOutcome: 'd0fee6c486820c88367013ef1bde52037814308f93b53c1a3c3bd8ce0367f8e2',
  _pfEodIsStale: '251a554adacbe3049eda5e2ef0d5bf3003f9b13684bd95b46cc4f35a70f1d941',
  _pfEodLoadCache: 'dc8b0aa9339fb5fc58fd5f9a1eeeef5e969d12ba8c2d11b6ba18c0ad30013df7',
  _pfEodSaveCache: '159fa533041810ce29256dacdba23182281491f04f42680cf5af0bf51b1a9602',
  _pfFxAutoFetchIfDue: '304b27c0c9e1894b0b55ee9f7e3397ac7b96d39a3850ded0eb7c83e939c24483',
  _pfFxFetchOnce: '9e22f902062863450aaee393b6ae02007084428c81b5f580369f021f696ae7d3',
  _pfFxManualRefresh: '4e89bca679e936e0c4445a43f024acf23d2ba2f319cd80597571feb577a28bba',
  _pfFxState: 'e59989a2b68b42bbca26f52e282867edf808d973431368ebc5229feeedbfe0fc',
  _pfPortfolioDayEstimate: '4399611aad83cafce9e53823853885d5d249fbf3899efc047ae34a77a25a6a5e',
  _sortHoldingsEntries: '4f288225b858609facdb9677adf9b91fa5a6f9d34f54e8c3992c36e9690d9a02',
  _ts1AgeSessions: '7f5af77f2a7523a28eb8c9dc39d19992455daf5bb53991bde4e3a2a33668df51',
  _ts1ExchangeLocalParts: 'f38e324cb412a233add7493f6551064b596bbd8da328a52db54216745ad89f60',
  _ts1IsTradingSession: 'e955dd6cd8f27f5d1e771efdce6469e935f4c8be2fcfb81eac872980ae9292df',
  _ts1SessionCompleted: '790ce9afcaaf001e06cf657eb328fbe24fb59c12afa3f01fd205ab81e2c60790',
  analyzeChunk: 'e9303a0690a6fad433918ee02772dcc63e0ad9d65f431f4dd7ee007b3c9ea703',
  orchestrate: '490d522b4714fe08d4e7030eb05594b07734f6dd7dbb8d6750efd972d66263e2',
  renderMainPanel: 'bbaafdd6c7fee70cb4aee8f5d1ef35c8ae097f0d412daed4c490574fab0ca997',
  init: '588e95f019465d9c2a15fd1d5786121a5356ee947a16c32c56d032e759608828',
  renderApiTable: '6ab781fd896bb61a4120a7b6c3529e93e0adf16fb844fd7ba25e5c5d4b245c12',
  renderLabsToggles: '1c1eef23e6bd00d30cd8bda43f9246643deea275b157c32827e5f50d7c89d94d',
  setLabsFlag: 'f718cb9f0329a5b71ae15645dfed609044dcc32013980801e1cf78664efef2fd',
  _calcPortfolioAggregates: '8e480394b86711f35a77e0b4cd7e38864c0ef653bb1e4ab47ff148025c16914b',
  loadHoldings: 'db6994d683204073d16603cbbbd5336de5e39b8c5fe13d0aeaebca6c14e15671',
  saveHoldings: '166e948f30aa59deb09744b040aa235475cf3a39b095b864e90c8289cb46c104'
};

const FNS_ALL = core.extractFunctions(SRC);
function fnText(src, name) {
  const hit = core.extractFunctions(src).filter(f => f.name === name);
  if (hit.length !== 1) throw new Error(name + ' does not extract exactly once (' + hit.length + ')');
  return hit[0].text;
}
// `var NAME = <balanced braces or brackets>;` or a one-line `var NAME = ...;`
function varText(src, name) {
  const decl = 'var ' + name + ' = ';
  const st = src.indexOf(decl);
  if (st === -1 || src.indexOf(decl, st + 1) !== -1) throw new Error(decl + ' not found exactly once');
  const rest = src.slice(st + decl.length);
  const first = rest[0];
  if (first === '{' || first === '[') {
    const open = first; const close = first === '{' ? '}' : ']';
    let d = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === open) d++;
      else if (rest[i] === close) { d--; if (!d) return decl + rest.slice(0, i + 1) + ';'; }
    }
    throw new Error('unbalanced ' + decl);
  }
  return decl + rest.slice(0, rest.indexOf('\n')).replace(/\s*$/, '');
}

// ── fake DOM ──────────────────────────────────────────────────────────────────
function makeDom() {
  const byId = {};
  function el(tag) {
    return {
      tag, id: '', className: '', style: {}, children: [], _text: '', attrs: {}, onclick: null, disabled: false, checked: false, title: '',
      appendChild(c) { this.children.push(c); if (c && c.id) byId[c.id] = c; return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      get firstChild() { return this.children[0] || null; },
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children = []; }
    };
  }
  return { doc: { createElement: el, getElementById: id => byId[id] || null }, byId, el };
}
// the text of a fake element as a browser renders it: own text then children, concatenated with no separator (one array item, so
// `.join(...)` yields the same string); a label made of two spans ("Refresh failed" + " · showing Oct 22") reads as one label
function leaves(e) {
  return [e.textContent];
}
function classes(e, out) {
  out = out || [];
  if (e.className) out.push(e.className);
  for (const c of e.children) classes(c, out);
  return out;
}

// ── sandbox ───────────────────────────────────────────────────────────────────
const TS1_NAMES = ['_ts1ExchangeLocalParts', '_ts1RuleFor', '_ts1IsTradingSession', '_ts1SessionCloseMinutes', '_ts1SessionCompleted', '_ts1AgeSessions'];
const PT_NAMES = ['_pfDateLabel', '_pfFreshness', '_pfFreshLabel', '_pfIsCurrentFreshness', '_pfSortHoldingsByDay', '_pfWithStripSyms',
  '_pfBuildFreshEl', '_pfBuildMarketStrip', '_pfFmtFetchTime', '_pfRecordedAsOf', '_updatePortfolioCard',
  '_pfSetLiveGate', '_pfApplyStoredLiveSwitches', 'setPortfolioLiveSwitch', 'renderPortfolioLiveSwitches'];
const FETCH_NAMES = ['_pfEodAutoFetchIfDue', '_pfEodManualRefresh'];
function build(src, opts) {
  const o = opts || {};
  const dom = makeDom();
  const store = Object.assign({}, o.store || {});
  const writes = [];
  const removes = [];
  const reads = [];
  const localStorage = {
    getItem(k) { reads.push(k); if (o.storageThrows) throw new Error('getItem blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { if (o.storageThrows) throw new Error('setItem blocked'); writes.push([k, v]); store[k] = String(v); },
    removeItem(k) { if (o.storageThrows) throw new Error('removeItem blocked'); removes.push(k); delete store[k]; }
  };
  const calls = { render: 0, auto: [], fx: 0, batch: [], saveLast: [], fetch: 0 };
  const win = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: win, document: dom.doc, localStorage,
    fetch() { calls.fetch += 1; return Promise.reject(new Error('network is forbidden in this suite')); },
    Intl, Date, Math, Number, String, Object, Array, JSON, isNaN, isFinite, parseInt, parseFloat,
    loadHoldings: () => (o.holdings || {}),
    _pfIsPortfolioViewActive: () => o.viewActive === true,
    _pfLiveRunCanceller: o.liveRun || null,
    _renderPortfolioPanel: () => { calls.render += 1; },
    _pfFxAutoFetchIfDue: () => { calls.fx += 1; },
    _pfLiveFetching: false, _pfLiveTerminalReason: null,
    _pfEodAutoFetchIfDue: o.realFetch ? undefined : (syms => { calls.auto.push(Array.from(syms)); }),
    _pfEodLoadLastFetch: () => (o.lastFetch || { at: 0, ok: false }),
    _pfEodLoadCache: () => (o.cache || {}),
    // arrays made inside the vm context have another Array prototype: copy them into this realm before they are compared
    _pfLiveBatch: async (targets, all) => { calls.batch.push([Array.from(targets), Array.from(all)]); },
    _pfEodApplyAttemptOutcome: () => false,
    _pfEodSaveLastFetch: m => { calls.saveLast.push(m); },
    PF_EOD_AUTO_COOLDOWN_MS: 4 * 3600 * 1000, PF_EOD_FAIL_COOLDOWN_MS: 30 * 60 * 1000
  };
  vm.createContext(ctx);
  const code = [varText(src, 'TS1_POLICY_V1'), varText(src, 'PF_CURRENCY_SYMBOLS')];
  for (const v of ['PT_STRIP_SYMBOLS', 'PT_LIVE_SWITCHES']) code.push(varText(src, v));
  const names = TS1_NAMES.concat(PT_NAMES, o.realFetch ? FETCH_NAMES : []);
  for (const n of names) code.push(fnText(src, n));
  code.push('this.API = { ' + names.map(n => n + ': ' + n).join(', ') + ' };');
  vm.runInContext(code.join('\n'), ctx);
  // results that are arrays are copied into this realm (deepStrictEqual compares prototypes)
  const api = {};
  for (const k of Object.keys(ctx.API)) {
    const f = ctx.API[k];
    api[k] = (...a) => { const r = f(...a); return Array.isArray(r) ? Array.from(r) : r; };
  }
  return { api, ctx, dom, win, store, writes, removes, reads, calls };
}
// run a row body against the real source; `src` is replaced by a mutated copy for planted negatives
const ROWS = Object.create(null);
const ORDER = [];
const row = (id, fn) => { ROWS[id] = fn; ORDER.push(id); };

// ── calendar facts (independent of the code) ──────────────────────────────────
// 2026-10-22 Thu: US EDT (UTC-4) open 09:30-16:00; TASE (Asia/Jerusalem, summer time until Sun 2026-10-25, UTC+3) closes 17:30, Fri 13:50.
// 2026-11-26 Thanksgiving (US closed), 2026-11-27 early close 13:00 EST (UTC-5). TASE Mon-Fri from 2026-01-04 (Sun-Thu before).
const F = (api, market, sessionDate, nowIso, extra) => api._pfFreshness(Object.assign({ price: 10, changePercent: 1, market, sessionDate }, extra || {}), nowIso);
const S = (f) => f.state;

row('PT-15 F: US states', src => {
  const { api } = build(src);
  // [now, sessionDate, state, ageSessions]
  const T = [
    ['2026-10-22T18:00:00Z', '2026-10-22', 'today', null],        // 14:00 EDT, session open
    ['2026-10-22T19:59:00Z', '2026-10-22', 'today', null],        // 15:59 EDT
    ['2026-10-22T20:00:00Z', '2026-10-22', 'last-close', 0],       // 16:00 EDT exactly: completed
    ['2026-10-23T01:00:00Z', '2026-10-22', 'last-close', 0],       // UTC date rolled, exchange date still 10-22
    ['2026-10-23T14:00:00Z', '2026-10-22', 'last-close', 0],       // Fri 10:00 EDT: Friday not complete
    ['2026-10-23T21:00:00Z', '2026-10-22', 'aged', 1],             // Fri 17:00 EDT: Friday completed
    ['2026-10-23T21:00:00Z', '2026-10-23', 'last-close', 0],
    ['2026-10-26T13:00:00Z', '2026-10-23', 'last-close', 0],       // Mon 09:00 EDT, Monday not complete
    ['2026-10-27T15:00:00Z', '2026-10-23', 'aged', 1],             // Tue: Monday completed
    ['2026-10-30T21:00:00Z', '2026-10-23', 'aged', 5]              // Mon..Fri all completed
  ];
  for (const [now, sd, state, age] of T) {
    const f = F(api, 'US', sd, now);
    assert.strictEqual(S(f), state, 'US ' + sd + ' @ ' + now + ' -> ' + S(f));
    assert.strictEqual(f.ageSessions, age, 'age ' + sd + ' @ ' + now);
    assert.strictEqual(f.sessionDate, sd);
  }
});
row('PT-16 F: TASE states (own calendar, Mon-Fri from 2026-01-04)', src => {
  const { api } = build(src);
  const T = [
    ['2026-10-22T10:00:00Z', '2026-10-22', 'today', null],         // 13:00 IDT
    ['2026-10-22T14:00:00Z', '2026-10-22', 'last-close', 0],       // 17:00 IDT: still open (close 17:30)
    ['2026-10-22T14:30:00Z', '2026-10-22', 'last-close', 0]        // 17:30 IDT exactly: completed
  ];
  // the 14:00Z row is 17:00 IDT: the TASE session is still in progress, so it must be 'today', not 'last-close'
  T[1] = ['2026-10-22T14:00:00Z', '2026-10-22', 'today', null];
  T.push(['2026-10-23T10:30:00Z', '2026-10-23', 'today', null]);   // Fri 13:30 IDT, Friday close 13:50
  T.push(['2026-10-23T11:00:00Z', '2026-10-23', 'last-close', 0]); // Fri 14:00 IDT
  T.push(['2026-10-24T09:00:00Z', '2026-10-23', 'last-close', 0]); // Sat
  T.push(['2026-10-25T09:00:00Z', '2026-10-23', 'last-close', 0]); // Sun (DST ended 02:00 local, UTC+2)
  T.push(['2026-10-26T08:00:00Z', '2026-10-23', 'last-close', 0]); // Mon 10:00 IST, Monday not complete
  T.push(['2026-10-26T16:00:00Z', '2026-10-23', 'aged', 1]);       // Mon 18:00 IST: Monday completed
  T.push(['2026-01-06T12:00:00Z', '2026-01-01', 'aged', 1]);       // Fri 2026-01-02 and Sun 2026-01-04 are not sessions; Mon 01-05 is
  for (const [now, sd, state, age] of T) {
    const f = F(api, 'TASE', sd, now);
    assert.strictEqual(S(f), state, 'TASE ' + sd + ' @ ' + now + ' -> ' + S(f));
    assert.strictEqual(f.ageSessions, age, 'age ' + sd + ' @ ' + now);
  }
  // a Sunday session date after the week change is not a session; before it, it was
  assert.strictEqual(S(F(api, 'TASE', '2026-10-25', '2026-10-26T08:00:00Z')), 'unknown');
  assert.strictEqual(S(F(api, 'TASE', '2026-01-02', '2026-01-06T12:00:00Z')), 'unknown');
});
row('PT-17 F: weekend, holiday, early close, DST', src => {
  const { api } = build(src);
  // US weekend bars are phantom
  assert.strictEqual(S(F(api, 'US', '2026-10-24', '2026-10-26T15:00:00Z')), 'unknown');
  assert.strictEqual(S(F(api, 'US', '2026-10-25', '2026-10-26T15:00:00Z')), 'unknown');
  // Thanksgiving 2026-11-26: closed; the previous session is still the latest completed one
  const h = F(api, 'US', '2026-11-25', '2026-11-26T18:00:00Z');
  assert.strictEqual(S(h), 'last-close'); assert.strictEqual(h.ageSessions, 0);
  assert.strictEqual(S(F(api, 'US', '2026-11-26', '2026-11-26T18:00:00Z')), 'unknown', 'a bar on a holiday is not a session');
  // early close Fri 2026-11-27 13:00 EST (UTC-5)
  assert.strictEqual(S(F(api, 'US', '2026-11-27', '2026-11-27T17:30:00Z')), 'today', '12:30 EST');
  assert.strictEqual(S(F(api, 'US', '2026-11-27', '2026-11-27T18:30:00Z')), 'last-close', '13:30 EST: the early close has passed');
  const e = F(api, 'US', '2026-11-25', '2026-11-27T18:30:00Z');
  assert.strictEqual(S(e), 'aged'); assert.strictEqual(e.ageSessions, 1);
  // a normal day at the same wall-clock time is still in progress (the early close is not applied to other days)
  assert.strictEqual(S(F(api, 'US', '2026-11-24', '2026-11-24T18:30:00Z')), 'today', '13:30 EST on a normal day');
  // DST end Sun 2026-11-01: Mon 2026-11-02 09:00 EST
  assert.strictEqual(S(F(api, 'US', '2026-10-30', '2026-11-02T14:00:00Z')), 'last-close');
  // DST start 2026-03-08: Mon 2026-03-09 09:00 EDT = 13:00Z
  assert.strictEqual(S(F(api, 'US', '2026-03-06', '2026-03-09T13:00:00Z')), 'last-close');
  // TASE holiday 2026-04-02 is not a session
  assert.strictEqual(S(F(api, 'TASE', '2026-04-02', '2026-04-05T09:00:00Z')), 'unknown');
  // a future session date
  assert.strictEqual(S(F(api, 'US', '2026-10-23', '2026-10-22T18:00:00Z')), 'unknown');
});
row('PT-18 F: Aged is never today / last close and never current', src => {
  const { api } = build(src);
  const f = F(api, 'US', '2026-10-22', '2026-10-23T21:00:00Z');
  assert.strictEqual(S(f), 'aged');
  assert.strictEqual(api._pfIsCurrentFreshness(f), false);
  assert.ok(!/today|last close/i.test(api._pfFreshLabel(f, '2026-10-23T21:00:00Z')), api._pfFreshLabel(f, '2026-10-23T21:00:00Z'));
  assert.strictEqual(api._pfIsCurrentFreshness(F(api, 'US', '2026-10-22', '2026-10-22T18:00:00Z')), true);
  assert.strictEqual(api._pfIsCurrentFreshness(F(api, 'US', '2026-10-22', '2026-10-22T21:00:00Z')), true);
  for (const bad of [null, undefined, {}, { state: 'unknown' }, { state: 'failed' }, { state: 'missing' }, { state: 'aged' }]) assert.strictEqual(api._pfIsCurrentFreshness(bad), false);
  // exhaustive: every (hour, session date) pair in a week resolves to a state whose current-ness matches the independent rule
  // current <=> sessionDate is exchange-local today and the session is open, or no completed session exists after sessionDate
  let n = 0;
  for (let h = 0; h < 24 * 6; h += 1) {
    const now = new Date(Date.UTC(2026, 9, 19, 0, 0, 0) + h * 3600 * 1000).toISOString();
    for (const sd of ['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) {
      const g = F(api, 'US', sd, now);
      if (S(g) === 'aged') assert.ok(g.ageSessions >= 1, now + ' ' + sd);
      if (S(g) === 'last-close') assert.strictEqual(g.ageSessions, 0, now + ' ' + sd);
      n += 1;
    }
  }
  assert.ok(n > 600);
});
row('PT-19 F: coverage edge and fail-closed inputs -> Unknown date', src => {
  const { api } = build(src);
  assert.strictEqual(S(F(api, 'US', '2027-12-31', '2027-12-31T22:00:00Z')), 'last-close', 'last covered day, 17:00 EST');
  assert.strictEqual(S(F(api, 'US', '2027-12-31', '2028-01-03T18:00:00Z')), 'unknown', 'now is past coverage: the age cannot be established');
  assert.strictEqual(S(F(api, 'US', '2028-01-03', '2028-01-03T22:00:00Z')), 'unknown', 'session date outside coverage');
  assert.strictEqual(S(F(api, 'US', '2024-12-31', '2026-10-22T18:00:00Z')), 'unknown', 'before coverage');
  assert.strictEqual(S(F(api, 'TASE', '2025-12-28', '2025-12-30T12:00:00Z')), 'unknown', 'TASE close rule starts 2026-01-04: completion unknown');
  for (const m of [null, undefined, '', 'OTHER', 'us', 'NYSE', 5, {}]) assert.strictEqual(S(F(api, m, '2026-10-22', '2026-10-22T18:00:00Z')), 'unknown', 'market ' + String(m));
  for (const sd of [null, undefined, '', '2026-10-2', '2026-13-45', '22/10/2026', 20261022, {}, '2026-10-22T00:00:00Z']) assert.strictEqual(S(F(api, 'US', sd, '2026-10-22T18:00:00Z')), 'unknown', 'sessionDate ' + String(sd));
  for (const now of ['', 'garbage', null, undefined, NaN]) assert.strictEqual(S(F(api, 'US', '2026-10-22', now)), 'unknown', 'now ' + String(now));
  // a price with an unknown date is still a price: the state is unknown, not missing
  assert.notStrictEqual(S(F(api, null, null, '2026-10-22T18:00:00Z')), 'missing');
});
row('PT-20 F: Refresh failed and Not available', src => {
  const { api } = build(src);
  const NOW = '2026-10-22T21:00:00Z';
  const f = F(api, 'US', '2026-10-22', NOW, { lastFailAt: '2026-10-22T20:30:00.000Z' });
  assert.strictEqual(S(f), 'failed'); assert.strictEqual(f.sessionDate, '2026-10-22');
  assert.strictEqual(api._pfIsCurrentFreshness(f), false, 'a failed refresh is not current');
  assert.strictEqual(api._pfFreshLabel(f, NOW), 'Refresh failed · showing Oct 22');
  const g = F(api, null, null, NOW, { lastFailAt: '2026-10-22T20:30:00.000Z' });
  assert.strictEqual(S(g), 'failed'); assert.strictEqual(api._pfFreshLabel(g, NOW), 'Refresh failed · showing date unknown');
  for (const e of [null, undefined, {}, { price: null }, { price: 0 }, { price: -1 }, { price: NaN }, { price: '10' }, { price: Infinity }]) {
    const m = api._pfFreshness(e, NOW);
    assert.strictEqual(S(m), 'missing', JSON.stringify(e));
    assert.strictEqual(api._pfFreshLabel(m, NOW), 'Not available');
    assert.strictEqual(api._pfIsCurrentFreshness(m), false);
  }
  // a failure flag on a row with no price is still Not available (nothing to show)
  assert.strictEqual(S(api._pfFreshness({ lastFailAt: 'x' }, NOW)), 'missing');
});
row('PT-21 F: labels', src => {
  const { api } = build(src);
  const NOW = '2026-10-22T21:00:00Z';
  assert.strictEqual(api._pfFreshLabel(F(api, 'US', '2026-10-22', '2026-10-22T18:00:00Z'), '2026-10-22T18:00:00Z'), 'Today · in progress');
  assert.strictEqual(api._pfFreshLabel(F(api, 'US', '2026-10-22', NOW), NOW), 'Last close · Oct 22');
  assert.strictEqual(api._pfFreshLabel(F(api, 'US', '2026-10-22', '2026-10-23T21:00:00Z'), '2026-10-23T21:00:00Z'), 'Aged · Oct 22 · 1 session old');
  assert.strictEqual(api._pfFreshLabel(F(api, 'US', '2026-10-23', '2026-10-30T21:00:00Z'), '2026-10-30T21:00:00Z'), 'Aged · Oct 23 · 5 sessions old');
  assert.strictEqual(api._pfFreshLabel(F(api, null, null, NOW), NOW), 'Unknown date');
  assert.strictEqual(api._pfFreshLabel(api._pfFreshness(null, NOW), NOW), 'Not available');
  assert.strictEqual(api._pfDateLabel('2026-01-05', '2026-10-22T00:00:00Z'), 'Jan 5');
  assert.strictEqual(api._pfDateLabel('2025-12-28', '2026-01-06T12:00:00Z'), 'Dec 28, 2025', 'a different year is shown');
  for (const bad of [null, undefined, '', 'x', '2026-13-01', '2026-00-10', '2026-10-32', 5]) assert.strictEqual(api._pfDateLabel(bad, NOW), '', String(bad));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach((m, i) => assert.strictEqual(api._pfDateLabel('2026-' + String(i + 1).padStart(2, '0') + '-09', NOW), m + ' 9'));
});
row('PT-22 F: the card shows the freshness label next to the cached price and day %', src => {
  const { api, dom } = build(src, { holdings: {} });
  const mk = (sym) => { const e = dom.el('div'); e.id = 'pf-mkt-' + sym; dom.byId['pf-mkt-' + sym] = e; return e; };
  const NOW = '2026-10-22T21:00:00Z';
  const a = mk('AAA');
  api._updatePortfolioCard('AAA', { price: 12.5, change_percent: -1.25, currency: 'USD', sessionEpoch: Date.parse('2026-10-22T20:00:00Z') / 1000, market: 'US', sessionDate: '2026-10-22' }, NOW);
  const t = leaves(a).join(' ');
  assert.ok(t.includes('$12.50') && t.includes('-1.25%') && t.includes('Last close · Oct 22'), t);
  assert.ok(!/Not available|Unknown date|Aged/.test(t), t);
  const b = mk('BBB');
  api._updatePortfolioCard('BBB', { price: 5, change_percent: 2, currency: 'ILS', market: 'TASE', sessionDate: '2026-10-21', stale: false }, NOW);
  const tb = leaves(b).join(' ');
  assert.ok(tb.includes('₪5.00') && tb.includes('+2.00%') && tb.includes('Aged · Oct 21 · 1 session old'), tb);
  const c = mk('CCC');
  api._updatePortfolioCard('CCC', { price: 5, change_percent: 2, currency: 'USD', market: 'US', sessionDate: '2026-10-22', stale: true }, NOW);
  assert.ok(leaves(c).join(' ').includes('Refresh failed · showing Oct 22'));
  const d = mk('DDD');
  api._updatePortfolioCard('DDD', { price: 5, change_percent: 2, currency: 'USD' }, NOW);
  assert.ok(leaves(d).join(' ').includes('Unknown date'));
  const m = mk('MMM');
  api._updatePortfolioCard('MMM', null, NOW);
  const tm = leaves(m).join(' ');
  assert.ok(tm.includes('Not available') && !/[0-9]%/.test(tm), tm);
  // a missing element is a no-op
  api._updatePortfolioCard('ZZZ', null, NOW);
});

// ── V1-3 sorting ───────────────────────────────────────────────────────────────
const SORT_NOW = '2026-10-22T18:00:00Z'; // US open (today), TASE closed (last close)
const entry = (sym) => [sym, { symbol: sym, positionSize: 1000, currency: sym.endsWith('.TA') ? 'ILS' : 'USD' }];
const cacheRow = (market, sd, pct, extra) => Object.assign({ price: 10, changePercent: pct, currency: market === 'TASE' ? 'ILS' : 'USD', market, sessionDate: sd, fetchedAt: '2026-10-22T17:55:00.000Z' }, extra || {});
const SORT_CACHE = {
  AAA: cacheRow('US', '2026-10-22', -3.1),
  BBB: cacheRow('US', '2026-10-22', 2.4),
  'CCC.TA': cacheRow('TASE', '2026-10-22', -5.0),
  DDD: cacheRow('US', '2026-10-20', 9.9),            // aged: the 10-21 session has completed since (10-21 itself would be the latest close)
  EEE: cacheRow('US', null, 1),                       // unknown
  FFF: cacheRow('US', '2026-10-22', -8, { lastFailAt: '2026-10-22T17:00:00.000Z' }),  // failed
  // GGG: no cache entry -> missing
  'HHH.TA': cacheRow('TASE', '2026-10-21', 3.3),      // aged (TASE)
  III: cacheRow('US', '2026-10-22', 2.4),             // ties with BBB
  JJJ: cacheRow('US', null, -2)                       // unknown
};
const SORT_SYMS = ['AAA', 'BBB', 'CCC.TA', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH.TA', 'III', 'JJJ'];
row('PT-9 V1-3: ordering uses current rows only (.TA included)', src => {
  const { api } = build(src);
  const order = (mode) => api._pfSortHoldingsByDay(SORT_SYMS.map(entry), SORT_CACHE, mode, SORT_NOW).map(e => e[0]);
  const w = order('day-worst'); const b = order('day-best');
  assert.deepStrictEqual(w.slice(0, 4), ['CCC.TA', 'AAA', 'BBB', 'III'], w.join());
  assert.deepStrictEqual(b.slice(0, 4), ['BBB', 'III', 'AAA', 'CCC.TA'], b.join());
  assert.strictEqual(w.length, SORT_SYMS.length); assert.strictEqual(new Set(w).size, SORT_SYMS.length);
  // the aged +9.9 % and the failed -8 % never enter the current ordering
  assert.ok(w.indexOf('DDD') > 3 && w.indexOf('FFF') > 3 && b.indexOf('DDD') > 3 && b.indexOf('FFF') > 3);
  // direction: worst is ascending, best is descending, over the current rows only
  const pct = (list) => list.slice(0, 4).map(s => SORT_CACHE[s].changePercent);
  assert.deepStrictEqual(pct(w), pct(w).slice().sort((x, y) => x - y)); assert.deepStrictEqual(pct(b), pct(b).slice().sort((x, y) => y - x));
  // does not mutate its inputs
  const ents = SORT_SYMS.map(entry); const before = JSON.stringify(ents); const cb = JSON.stringify(SORT_CACHE);
  api._pfSortHoldingsByDay(ents, SORT_CACHE, 'day-worst', SORT_NOW);
  assert.strictEqual(JSON.stringify(ents), before); assert.strictEqual(JSON.stringify(SORT_CACHE), cb);
  // an unknown mode falls back to symbol order, never throws
  assert.deepStrictEqual(api._pfSortHoldingsByDay(SORT_SYMS.slice().reverse().map(entry), SORT_CACHE, 'nope', SORT_NOW).map(e => e[0]), SORT_SYMS.slice().sort());
});
row('PT-10 V1-3: other rows follow, grouped by state, each by symbol', src => {
  const { api } = build(src);
  for (const mode of ['day-worst', 'day-best']) {
    const l = api._pfSortHoldingsByDay(SORT_SYMS.map(entry), SORT_CACHE, mode, SORT_NOW).map(e => e[0]);
    assert.deepStrictEqual(l.slice(4), ['DDD', 'HHH.TA', 'EEE', 'JJJ', 'FFF', 'GGG'], mode + ' ' + l.join());
    // each trailing row carries a non-current label
    for (const s of l.slice(4)) assert.strictEqual(api._pfIsCurrentFreshness(api._pfFreshness(SORT_CACHE[s], SORT_NOW)), false, s);
  }
  // no current rows at all: everything is grouped
  const only = ['DDD', 'EEE', 'FFF', 'GGG'].map(entry);
  assert.deepStrictEqual(api._pfSortHoldingsByDay(only, SORT_CACHE, 'day-best', SORT_NOW).map(e => e[0]), ['DDD', 'EEE', 'FFF', 'GGG']);
  // an empty portfolio
  assert.deepStrictEqual(api._pfSortHoldingsByDay([], {}, 'day-worst', SORT_NOW), []);
  // every row current: no tail
  const cur = ['AAA', 'BBB'].map(entry);
  assert.deepStrictEqual(api._pfSortHoldingsByDay(cur, SORT_CACHE, 'day-worst', SORT_NOW).map(e => e[0]), ['AAA', 'BBB']);
});

// ── V1-1 switches ─────────────────────────────────────────────────────────────
const FLAG_LIVE = 'PT_ENABLE_PORTFOLIO_LIVE_PRICES';
const FLAG_FX = 'PT_ENABLE_PORTFOLIO_FX';
const KEY_LIVE = 'pt_enable_portfolio_live_prices';
const KEY_FX = 'pt_enable_portfolio_fx';
row('PT-1 V1-1: off by default; strict string read at load; only the two existing gates are written', src => {
  const a = build(src);
  a.api._pfApplyStoredLiveSwitches();
  assert.strictEqual(a.win[FLAG_LIVE], false); assert.strictEqual(a.win[FLAG_FX], false);
  assert.deepStrictEqual(Object.keys(a.win).sort(), [FLAG_FX, FLAG_LIVE]);
  assert.deepStrictEqual(a.reads.slice().sort(), [KEY_FX, KEY_LIVE], 'reads exactly the two keys');
  const b = build(src, { store: { [KEY_LIVE]: 'true' } });
  b.api._pfApplyStoredLiveSwitches();
  assert.strictEqual(b.win[FLAG_LIVE], true); assert.strictEqual(b.win[FLAG_FX], false);
  const c = build(src, { store: { [KEY_FX]: 'true', [KEY_LIVE]: 'true' } });
  c.api._pfApplyStoredLiveSwitches();
  assert.strictEqual(c.win[FLAG_LIVE], true); assert.strictEqual(c.win[FLAG_FX], true);
  for (const bad of ['TRUE', 'True', '1', 'yes', 'on', 'false', '', ' true', 'true ', 'null', 'undefined']) {
    const d = build(src, { store: { [KEY_LIVE]: bad, [KEY_FX]: bad } });
    d.api._pfApplyStoredLiveSwitches();
    assert.strictEqual(d.win[FLAG_LIVE], false, 'live ' + JSON.stringify(bad)); assert.strictEqual(d.win[FLAG_FX], false, 'fx ' + JSON.stringify(bad));
  }
  assert.strictEqual(a.writes.length + a.removes.length, 0, 'loading writes nothing');
});
row('PT-2 V1-1: setter - strict boolean write, persists "true", removes the key on off, hooks', src => {
  for (const [flag, key, other] of [[FLAG_LIVE, KEY_LIVE, FLAG_FX], [FLAG_FX, KEY_FX, FLAG_LIVE]]) {
    const s = build(src, { holdings: { AAA: {} }, viewActive: true });
    s.api.setPortfolioLiveSwitch(flag, true);
    assert.strictEqual(s.win[flag], true); assert.strictEqual(s.win[other], undefined, 'the other gate is not touched');
    assert.deepStrictEqual(s.writes, [[key, 'true']]); assert.strictEqual(s.store[key], 'true');
    s.api.setPortfolioLiveSwitch(flag, false);
    assert.strictEqual(s.win[flag], false); assert.deepStrictEqual(s.removes, [key]); assert.strictEqual(Object.prototype.hasOwnProperty.call(s.store, key), false);
    for (const v of ['true', 1, undefined, null, {}, 'on', [] ]) {
      const t = build(src);
      t.api.setPortfolioLiveSwitch(flag, true);
      t.api.setPortfolioLiveSwitch(flag, v);
      assert.strictEqual(t.win[flag], false, 'value ' + String(v));
      assert.strictEqual(Object.prototype.hasOwnProperty.call(t.store, key), false, 'key removed for ' + String(v));
    }
  }
  // unknown names change nothing
  const u = build(src, { viewActive: true });
  for (const other of ['PT_ENABLE_TECH_SCORE', 'PT_ENABLE_PORTFOLIO_RESEARCH', '__proto__', 'constructor', '', null, undefined]) u.api.setPortfolioLiveSwitch(other, true);
  assert.deepStrictEqual(Object.keys(u.win), []); assert.strictEqual(u.writes.length + u.removes.length, 0); assert.strictEqual(u.calls.render, 0);
  // redraw + fetch hooks: view active, no live run
  const a = build(src, { holdings: { AAA: {}, BBB: {} }, viewActive: true });
  a.api.setPortfolioLiveSwitch(FLAG_LIVE, true);
  assert.strictEqual(a.calls.render, 1); assert.deepStrictEqual(a.calls.auto, [['AAA', 'BBB']]); assert.strictEqual(a.calls.fx, 0);
  a.api.setPortfolioLiveSwitch(FLAG_FX, true);
  assert.strictEqual(a.calls.render, 2); assert.strictEqual(a.calls.fx, 1); assert.strictEqual(a.calls.auto.length, 1);
  a.api.setPortfolioLiveSwitch(FLAG_LIVE, false);
  assert.strictEqual(a.calls.render, 3); assert.strictEqual(a.calls.auto.length, 1, 'turning off fetches nothing');
  // no holdings: nothing to fetch for; view inactive or a live run in flight: no redraw and no fetch
  const b = build(src, { holdings: {}, viewActive: true });
  b.api.setPortfolioLiveSwitch(FLAG_LIVE, true);
  assert.strictEqual(b.calls.render, 1); assert.strictEqual(b.calls.auto.length, 0);
  const c = build(src, { holdings: { AAA: {} }, viewActive: false });
  c.api.setPortfolioLiveSwitch(FLAG_LIVE, true); c.api.setPortfolioLiveSwitch(FLAG_FX, true);
  assert.strictEqual(c.calls.render + c.calls.auto.length + c.calls.fx, 0);
  const d = build(src, { holdings: { AAA: {} }, viewActive: true, liveRun: {} });
  d.api.setPortfolioLiveSwitch(FLAG_LIVE, true);
  assert.strictEqual(d.calls.render + d.calls.auto.length + d.calls.fx, 0);
  assert.strictEqual(d.win[FLAG_LIVE], true, 'the gate is still set during a live run');
});
row('PT-3 V1-1: storage failures are tolerated (the gate is still set in memory)', src => {
  const s = build(src, { storageThrows: true, viewActive: true, holdings: { AAA: {} } });
  s.api._pfApplyStoredLiveSwitches();
  assert.strictEqual(s.win[FLAG_LIVE], false); assert.strictEqual(s.win[FLAG_FX], false);
  s.api.setPortfolioLiveSwitch(FLAG_LIVE, true);
  assert.strictEqual(s.win[FLAG_LIVE], true);
  s.api.setPortfolioLiveSwitch(FLAG_FX, true);
  assert.strictEqual(s.win[FLAG_FX], true);
  s.api.setPortfolioLiveSwitch(FLAG_LIVE, false);
  assert.strictEqual(s.win[FLAG_LIVE], false);
  assert.strictEqual(s.calls.render, 3);
});
function labsPortfolioBox(src) {
  const i = src.indexOf('id="labsBoxPortfolio"');
  if (i === -1) throw new Error('no #labsBoxPortfolio');
  const start = src.lastIndexOf('<div', i);
  return { i, start, box: src.slice(start, src.indexOf('\n    </div>\n', i) + 11) };
}
row('PT-4 V1-1: Labs markup - a separate box with exactly the two switches; the existing #labsBox is untouched; sync on open', src => {
  const { start, box } = labsPortfolioBox(src);
  assert.strictEqual(countOf(src, 'id="labsBoxPortfolio"'), 1);
  assert.strictEqual(countOf(box, 'type="checkbox"'), 2);
  assert.strictEqual(countOf(box, 'id="labs-pf-live"'), 1); assert.strictEqual(countOf(box, 'id="labs-pf-fx"'), 1);
  assert.ok(box.includes("onchange=\"setPortfolioLiveSwitch('PT_ENABLE_PORTFOLIO_LIVE_PRICES', this.checked)\""));
  assert.ok(box.includes("onchange=\"setPortfolioLiveSwitch('PT_ENABLE_PORTFOLIO_FX', this.checked)\""));
  assert.ok(box.includes('<b>Live prices</b>') && box.includes('<b>FX rate</b>'));
  assert.ok(/remembered/i.test(box), 'the box says the two switches are remembered in this browser');
  const labs = src.indexOf('<div class="labs-box" id="labsBox">');
  assert.ok(labs !== -1 && labs < start, 'the new box follows #labsBox');
  const old = src.slice(labs, src.indexOf('\n    </div>\n', labs) + 11);
  assert.strictEqual(countOf(old, 'type="checkbox"'), 2, '#labsBox keeps exactly two switches');
  assert.ok(!old.includes('labs-pf-'), '#labsBox holds none of the new switches');
  const t = fnText(src, 'toggleApiStatus');
  assert.ok(t.includes('if (!isOpen) { renderApiTable(); renderLabsToggles(); }'), 'the existing sync line is kept');
  assert.ok(t.includes('renderPortfolioLiveSwitches()'), 'the new switches are synced on open');
  // load wiring: applied once, before init()
  assert.strictEqual(countOf(src, '\n_pfApplyStoredLiveSwitches();\n'), 1);
  assert.ok(src.indexOf('\n_pfApplyStoredLiveSwitches();\n') < src.indexOf('\ninit();\n'), 'applied before init()');
  // the checkboxes reflect window[flag] === true only
  const s = build(src);
  const live = s.dom.el('input'); live.id = 'labs-pf-live'; s.dom.byId['labs-pf-live'] = live;
  const fx = s.dom.el('input'); fx.id = 'labs-pf-fx'; s.dom.byId['labs-pf-fx'] = fx;
  s.win[FLAG_LIVE] = true; s.win[FLAG_FX] = 'true';
  s.api.renderPortfolioLiveSwitches();
  assert.strictEqual(live.checked, true); assert.strictEqual(fx.checked, false, "'true' string is not on");
  delete s.win[FLAG_LIVE]; s.api.renderPortfolioLiveSwitches();
  assert.strictEqual(live.checked, false);
  // missing checkboxes are a no-op
  build(src).api.renderPortfolioLiveSwitches();
});
row('PT-5 V1-1 / W6: no other storage key is read or written by the switches', src => {
  const s = build(src, { holdings: { AAA: {} }, viewActive: true });
  s.api._pfApplyStoredLiveSwitches();
  for (const f of [FLAG_LIVE, FLAG_FX]) { s.api.setPortfolioLiveSwitch(f, true); s.api.setPortfolioLiveSwitch(f, false); s.api.setPortfolioLiveSwitch(f, true); }
  const keys = new Set(s.writes.map(w => w[0]).concat(s.removes, s.reads));
  assert.deepStrictEqual(Array.from(keys).sort(), [KEY_FX, KEY_LIVE]);
  for (const k of keys) assert.ok(!/holdings|results|eod|^pt_fx$|scan|ticker/.test(k), k);
});

// ── V1-2 market strip ──────────────────────────────────────────────────────────
const STRIP_NOW = '2026-10-22T21:00:00Z';
const stripCache = (extra) => Object.assign({
  SPY: { price: 512.34, changePercent: 0.42, currency: 'USD', market: 'US', sessionDate: '2026-10-22', fetchedAt: '2026-10-22T20:55:00.000Z' },
  QQQ: { price: 440.1, changePercent: -0.8, currency: 'USD', market: 'US', sessionDate: '2026-10-22', fetchedAt: '2026-10-22T20:55:30.000Z' }
}, extra || {});
row('PT-6 V1-2: strip - SPY and QQQ price, day %, freshness label, fetch time', src => {
  const { api } = build(src);
  const strip = api._pfBuildMarketStrip(stripCache(), STRIP_NOW);
  const t = leaves(strip).join(' | ');
  for (const need of ['SPY', '$512.34', '+0.42%', 'QQQ', '$440.10', '-0.80%']) assert.ok(t.includes(need), need + ' in ' + t);
  assert.strictEqual(countOf(t, 'Last close · Oct 22'), 2, t);
  assert.ok(/fetched \d{1,2}:\d{2}/.test(t), 'fetch time: ' + t);
  assert.ok(classes(strip).some(c => /pf-strip/.test(c)));
  assert.ok(t.indexOf('SPY') < t.indexOf('QQQ'), 'SPY first');
  // a zero day change is a real value
  const z = leaves(api._pfBuildMarketStrip(stripCache({ SPY: Object.assign({}, stripCache().SPY, { changePercent: 0 }) }), STRIP_NOW)).join(' | ');
  assert.ok(z.includes('0.00%'), z);
  // aged / failed / unknown rows keep their price but never claim today or last close
  const aged = leaves(api._pfBuildMarketStrip(stripCache({ SPY: Object.assign({}, stripCache().SPY, { sessionDate: '2026-10-20' }) }), STRIP_NOW)).join(' | ');
  assert.ok(aged.includes('Aged · Oct 20 · 2 sessions old') && aged.includes('$512.34'), aged);
  const failed = leaves(api._pfBuildMarketStrip(stripCache({ QQQ: Object.assign({}, stripCache().QQQ, { lastFailAt: '2026-10-22T20:59:00.000Z' }) }), STRIP_NOW)).join(' | ');
  assert.ok(failed.includes('Refresh failed · showing Oct 22') && failed.includes('$440.10'), failed);
  const open = leaves(api._pfBuildMarketStrip(stripCache(), '2026-10-22T18:00:00Z')).join(' | ');
  assert.strictEqual(countOf(open, 'Today · in progress'), 2, open);
  const unk = leaves(api._pfBuildMarketStrip(stripCache({ SPY: Object.assign({}, stripCache().SPY, { sessionDate: null }) }), STRIP_NOW)).join(' | ');
  assert.ok(unk.includes('Unknown date'), unk);
});
row('PT-7 V1-2: unavailable is shown as such, never 0', src => {
  const { api } = build(src);
  const none = leaves(api._pfBuildMarketStrip({}, STRIP_NOW)).join(' | ');
  assert.strictEqual(countOf(none, 'Not available'), 2, none);
  assert.ok(!/[0-9]%/.test(none) && !/\$0/.test(none) && !/0\.00/.test(none), none);
  const one = leaves(api._pfBuildMarketStrip({ SPY: stripCache().SPY }, STRIP_NOW)).join(' | ');
  assert.strictEqual(countOf(one, 'Not available'), 1, one); assert.ok(one.includes('+0.42%'));
  for (const bad of [{ price: null }, { price: 0 }, { price: NaN }, { price: '5' }, {}]) {
    const t = leaves(api._pfBuildMarketStrip({ SPY: bad, QQQ: stripCache().QQQ }, STRIP_NOW)).join(' | ');
    assert.strictEqual(countOf(t, 'Not available'), 1, JSON.stringify(bad) + ' ' + t);
  }
  assert.ok(!/fetched/.test(none), 'no fetch time without a fetch');
  assert.strictEqual(api._pfFmtFetchTime('garbage'), ''); assert.strictEqual(api._pfFmtFetchTime(null), '');
  assert.ok(/^\d{1,2}:\d{2}$/.test(api._pfFmtFetchTime('2026-10-22T20:55:00.000Z')));
});
row('PT-8 V1-2: the strip symbols ride the same batch (auto, cooldown, manual), de-duplicated, within the batch cap', src => {
  // the strip symbols come FIRST so the batch cap can only ever truncate holdings (as before), never the strip
  assert.deepStrictEqual(build(src).api._pfWithStripSyms(['AAA']), ['SPY', 'QQQ', 'AAA']);
  assert.deepStrictEqual(build(src).api._pfWithStripSyms(['SPY', 'AAA']), ['SPY', 'QQQ', 'AAA']);
  assert.deepStrictEqual(build(src).api._pfWithStripSyms(['QQQ', 'SPY']), ['SPY', 'QQQ']);
  assert.deepStrictEqual(build(src).api._pfWithStripSyms([]), ['SPY', 'QQQ']);
  assert.deepStrictEqual(build(src).api._pfWithStripSyms(null), []);
  const input = ['AAA']; build(src).api._pfWithStripSyms(input); assert.deepStrictEqual(input, ['AAA'], 'input not mutated');
  const batchMax = /const _PF_LIVE_BATCH_MAX\s*=\s*(\d+);/.exec(src);
  assert.ok(batchMax, '_PF_LIVE_BATCH_MAX');
  const cap = Number(batchMax[1]);
  const mk = (n) => Array.from({ length: n }, (_, i) => 'S' + String(i).padStart(2, '0'));
  // what _pfLiveBatch fetches is syms.slice(0, cap): the strip is always in it; the holdings are cut exactly as before (first 25 kept)
  for (const n of [1, 24, 25, 26, 27, 40]) {
    const fetched = build(src).api._pfWithStripSyms(mk(n)).slice(0, cap);
    assert.ok(fetched.indexOf('SPY') !== -1 && fetched.indexOf('QQQ') !== -1, n + ' holdings: the strip is kept in the batch');
    assert.deepStrictEqual(fetched.filter(s => s !== 'SPY' && s !== 'QQQ'), mk(Math.min(n, 25)), n + ' holdings: the first 25 holdings are fetched, as before');
  }
  assert.strictEqual(cap, 27, '25 holdings + 2 strip symbols');
  // auto trigger, no cooldown
  return (async () => {
    const a = build(src, { realFetch: true, lastFetch: { at: 0, ok: false }, cache: {} });
    await a.api._pfEodAutoFetchIfDue(['AAA', 'BBB']);
    assert.deepStrictEqual(a.calls.batch, [[['SPY', 'QQQ', 'AAA', 'BBB'], ['SPY', 'QQQ', 'AAA', 'BBB']]]);
    // cooldown active: only symbols with no cache entry (the strip included) are fetched
    const b = build(src, { realFetch: true, lastFetch: { at: Date.now(), ok: true }, cache: { AAA: {}, BBB: {} } });
    await b.api._pfEodAutoFetchIfDue(['AAA', 'BBB']);
    assert.deepStrictEqual(b.calls.batch, [[['SPY', 'QQQ'], ['SPY', 'QQQ', 'AAA', 'BBB']]]);
    const c = build(src, { realFetch: true, lastFetch: { at: Date.now(), ok: true }, cache: { AAA: {}, BBB: {}, SPY: {}, QQQ: {} } });
    await c.api._pfEodAutoFetchIfDue(['AAA', 'BBB']);
    assert.strictEqual(c.calls.batch.length, 0, 'cooldown with everything cached: no call');
    // manual refresh fetches everything, strip included
    const d = build(src, { realFetch: true });
    await d.api._pfEodManualRefresh(['AAA']);
    assert.deepStrictEqual(d.calls.batch, [[['SPY', 'QQQ', 'AAA'], ['SPY', 'QQQ', 'AAA']]]);
    // no holdings: nothing is fetched, the strip alone is never fetched
    const e = build(src, { realFetch: true });
    await e.api._pfEodAutoFetchIfDue([]); await e.api._pfEodManualRefresh([]);
    assert.strictEqual(e.calls.batch.length, 0);
    // a holding named SPY is not fetched twice
    const f = build(src, { realFetch: true });
    await f.api._pfEodManualRefresh(['SPY', 'AAA']);
    assert.deepStrictEqual(f.calls.batch[0][0], ['SPY', 'QQQ', 'AAA']);
  })();
});

// ── V1-3 / V1-4 panel source (the panel is too large to run; its text is checked, its helpers are run above) ──────────
const panelText = src => fnText(src, '_renderPortfolioPanel');
row('PT-11 V1-3: sort options "Day % — worst first" / "best first"; the invested-sort reset leaves the day modes alone', src => {
  const p = panelText(src);
  assert.strictEqual(countOf(p, "{ mode: 'day-worst', label: 'Day % — worst first' }"), 1);
  assert.strictEqual(countOf(p, "{ mode: 'day-best',  label: 'Day % — best first' }"), 1);
  assert.ok(p.includes('_pfSortHoldingsByDay(Object.entries(holdings), _pfEodLoadCache(), _portfolioSortMode'), 'the list uses the day sort for the day modes');
  assert.ok(p.includes("_portfolioSortMode === 'day-worst' || _portfolioSortMode === 'day-best'"), 'day modes are recognised');
  // the reset only touches the invested modes
  assert.ok(p.includes("if (investedSortDisabled && (_portfolioSortMode === 'invested-desc' || _portfolioSortMode === 'invested-asc')) _portfolioSortMode = 'symbol';"));
  assert.ok(!p.includes("if (investedSortDisabled && _portfolioSortMode !== 'symbol')"), 'the old catch-all reset is gone');
  // the day options exist only with live prices on; with it off a day mode falls back to symbol
  assert.ok(/PT_ENABLE_PORTFOLIO_LIVE_PRICES !== true[^\n]*_portfolioSortMode = 'symbol'|_portfolioSortMode = 'symbol'[^\n]*PT_ENABLE_PORTFOLIO_LIVE_PRICES !== true/.test(p), 'day modes fall back to symbol when live prices are off');
  assert.ok(p.includes('current rows first'), 'the sort says which rows are ordered');
  assert.ok(p.includes('_pfBuildMarketStrip('), 'the strip is built in the panel');
  assert.ok(p.indexOf('_pfBuildMarketStrip(') < p.indexOf("className = 'pf-sort-bar'"), 'the strip is above the sort bar (top of the panel)');
});
row('PT-12 V1-4: Est. Daily Move is not rendered', src => {
  const p = panelText(src);
  assert.strictEqual(countOf(p, 'Est. Daily Move'), 0);
  assert.strictEqual(countOf(p, '_pfPortfolioDayEstimate('), 0);
  assert.strictEqual(countOf(p, 'dayEst'), 0);
  // the pure function stays (run-offline phase 8 still tests it)
  assert.ok(countOf(src, 'function _pfPortfolioDayEstimate(') === 1);
});
row('PT-13 V1-4: the per-card estimate states its basis and date', src => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = new Date('2026-10-05T12:00:00.000Z');
  const label = months[when.getMonth()] + ' ' + when.getDate();
  const holdings = {
    AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', updatedAt: '2026-10-05T12:00:00.000Z' },
    BBB: { symbol: 'BBB', positionSize: 1000, currency: 'ILS', updatedAt: '2026-10-05T12:00:00.000Z' },
    CCC: { symbol: 'CCC', positionSize: 1000, currency: 'USD' },
    DDD: { symbol: 'DDD', positionSize: 1000, currency: 'EUR', updatedAt: '2026-10-05T12:00:00.000Z' },
    EEE: { symbol: 'EEE', positionSize: 1000, currency: 'USD', updatedAt: 'not a date' }
  };
  const { api, dom } = build(src, { holdings });
  const NOW = '2026-10-22T21:00:00Z';
  const card = (sym, pct) => {
    const e = dom.el('div'); e.id = 'pf-mkt-' + sym; dom.byId['pf-mkt-' + sym] = e;
    api._updatePortfolioCard(sym, { price: 10, change_percent: pct, currency: 'USD', market: 'US', sessionDate: '2026-10-22' }, NOW);
    return leaves(e).join(' ');
  };
  const a = card('AAA', 2);
  assert.ok(a.includes('≈ +$20.00 on recorded value (as of ' + label + ')'), a);
  assert.ok(!/ est\./.test(a) && !/≈ [^ ]+ est/.test(a), a);
  const b = card('BBB', -2.5);
  assert.ok(b.includes('≈ -₪25.00 on recorded value (as of ' + label + ')'), b);
  const c = card('CCC', 1);
  assert.ok(c.includes('≈ +$10.00 on recorded value (as of date unknown)'), c);
  const d = card('DDD', 1);
  assert.ok(!d.includes('≈'), 'unsupported currency: no estimate: ' + d);
  const e = card('EEE', 1);
  assert.ok(e.includes('(as of date unknown)'), e);
  assert.strictEqual(api._pfRecordedAsOf(holdings.AAA, NOW), label);
  for (const bad of [null, undefined, {}, { updatedAt: null }, { updatedAt: 5 }, { updatedAt: 'x' }]) assert.strictEqual(api._pfRecordedAsOf(bad, NOW), '');
  // the percentage and freshness label are shown beside it, and the money is not presented as a market move
  assert.ok(a.includes('+2.00%') && a.includes('Last close · Oct 22'), a);
});
row('PT-14 V1-4: recorded value and allocation keep their "Recorded" wording', src => {
  const p = panelText(src);
  for (const s of ["'Recorded value ↓'", "'Recorded value ↑'", "'USD Recorded Value'", "'ILS Recorded Value'", "' · Recorded position value'"]) assert.ok(p.includes(s), s);
  assert.strictEqual(countOf(p, 'Est. '), 0, 'no "Est." wording is left in the panel');
});

// ── W6 safety ─────────────────────────────────────────────────────────────────
const NEW_PURE = ['_pfDateLabel', '_pfFreshness', '_pfFreshLabel', '_pfIsCurrentFreshness', '_pfSortHoldingsByDay', '_pfWithStripSyms',
  '_pfBuildFreshEl', '_pfBuildMarketStrip', '_pfFmtFetchTime', '_pfRecordedAsOf', 'renderPortfolioLiveSwitches'];
row('PT-23 W6: the new helpers start no network call and touch no storage; the switch functions touch only their two keys', src => {
  for (const n of NEW_PURE) {
    const t = fnText(src, n);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'pt_holdings', 'pt_results', 'saveHoldings', 'orchestrate', 'analyzeChunk', 'setTimeout', 'setInterval', 'document.cookie']) {
      assert.strictEqual(countOf(t, bad), 0, n + ' contains ' + bad);
    }
  }
  for (const n of ['_pfApplyStoredLiveSwitches', 'setPortfolioLiveSwitch']) {
    const t = fnText(src, n);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'pt_holdings', 'pt_results', 'pt_eod', 'pt_fx', 'sessionStorage', 'indexedDB', 'saveHoldings', 'orchestrate', 'document.cookie', 'window[']) assert.strictEqual(countOf(t, bad), 0, n + ' contains ' + bad);
    const keys = (t.match(/['"]pt_[a-z_]+['"]/g) || []).map(s => s.slice(1, -1));
    for (const k of keys) assert.ok([KEY_LIVE, KEY_FX].indexOf(k) !== -1, n + ' names the key ' + k);
  }
  const sw = varText(src, 'PT_LIVE_SWITCHES');
  assert.ok(sw.includes("'" + KEY_LIVE + "'") && sw.includes("'" + KEY_FX + "'"));
  // strict writes only: exactly one assignment per gate in the page, in _pfSetLiveGate, each `(on === true)`
  const setter = fnText(src, 'setPortfolioLiveSwitch');
  const writer = fnText(src, '_pfSetLiveGate');
  for (const g of ['PT_ENABLE_PORTFOLIO_LIVE_PRICES', 'PT_ENABLE_PORTFOLIO_FX']) {
    assert.strictEqual((src.match(new RegExp('window\\.' + g + '\\s*=(?!=)', 'g')) || []).length, 1, g + ' has exactly one assignment in the page');
    assert.ok(writer.includes('window.' + g + ' = (on === true);'), g + ' is written strictly inside _pfSetLiveGate');
  }
  assert.strictEqual(countOf(setter, 'window.PT_ENABLE_PORTFOLIO'), 0, 'the setter delegates the gate write');
  assert.ok(setter.includes('var enabled = (on === true);') && setter.includes('_pfSetLiveGate(flag, enabled)'));
  const loader = fnText(src, '_pfApplyStoredLiveSwitches');
  assert.ok(loader.includes("=== 'true'"));
  assert.strictEqual(countOf(loader, 'catch'), 1);
  // no truthy / loose test of either gate anywhere in the page
  assert.strictEqual((src.match(/if\s*\(\s*window\.PT_ENABLE_PORTFOLIO_(?:LIVE_PRICES|FX)\s*\)/g) || []).length, 0);
  assert.strictEqual((src.match(/PT_ENABLE_PORTFOLIO_(?:LIVE_PRICES|FX)\s*==\s*[^=]/g) || []).length, 0);
});
row('PT-24 W6: only the portfolio-live and boi-fx-proxy endpoints exist in the Portfolio code', src => {
  const from = src.indexOf('// ── G-L Portfolio Live — V6.7 Slice A');
  const to = src.indexOf('// ─── EG-07 Slice 1: Portfolio Research Detail Panel');
  assert.ok(from !== -1 && to > from, 'region found');
  const eps = new Set((src.slice(from, to).match(/\.netlify\/functions\/[a-z0-9-]+/g) || []));
  assert.deepStrictEqual(Array.from(eps).sort(), ['.netlify/functions/boi-fx-proxy', '.netlify/functions/market-data']);
  assert.strictEqual(countOf(src.slice(from, to), '&purpose=portfolio-live&'), 1, 'one request URL carries the portfolio-live purpose');
  for (const n of ['_renderPortfolioPanel', '_updatePortfolioCard', '_pfBuildMarketStrip']) assert.strictEqual(countOf(fnText(src, n), '.netlify/functions'), 0, n);
  // the strip and the sort write nothing durable (the panel has pre-existing, unrelated writes - cash, reconciliation - and is not scanned here)
  for (const n of ['_pfBuildMarketStrip', '_pfSortHoldingsByDay']) {
    const t = fnText(src, n);
    assert.strictEqual(countOf(t, 'localStorage.setItem'), 0, n);
    assert.strictEqual(countOf(t, 'saveHoldings('), 0, n);
  }
});
row('PT-25 W6: scoring, scan, fetch normalisation, calendar and the other pinned functions are byte-identical to the base', src => {
  const fns = core.extractFunctions(src);
  for (const name of Object.keys(BASE_DIGESTS)) {
    const hit = fns.filter(f => f.name === name);
    assert.strictEqual(hit.length, 1, name);
    assert.strictEqual(core.sha256(hit[0].text), BASE_DIGESTS[name], name + ' changed since the base');
  }
});

// ── planted negatives: each mutates an in-memory COPY of index.html; the named row must then FAIL ───────────────────────
const sw = (a, b) => s => { assert.ok(countOf(s, a) === 1, 'mutation anchor not unique (' + countOf(s, a) + '): ' + a.slice(0, 70)); return s.replace(a, b); };
const NEG = [
  ['PT-N1 Aged counted as last close (age >= 0)', 'PT-15', sw('if (age === 0) { res.state = \'last-close\'; res.ageSessions = 0; }', 'if (age >= 0) { res.state = \'last-close\'; res.ageSessions = 0; }')],
  ['PT-N2 a future session date labelled today (exchange-date check dropped)', 'PT-17', sw("if (loc && loc.dateStr === sd) res.state = 'today';", "res.state = 'today';")],
  ['PT-N3 an unknown market falls back to the US calendar (fail-open)', 'PT-19', sw("TS1_POLICY_V1.calendar[entry.market] : null;\n  if (cal && sd &&", "TS1_POLICY_V1.calendar[entry.market] : TS1_POLICY_V1.calendar.US;\n  if (cal && sd &&")],
  ['PT-N4 non-sessions (weekend / holiday bars) accepted as sessions', 'PT-17', sw('if (cal && sd && _ts1IsTradingSession(sd, cal) === true) {', 'if (cal && sd) {')],
  ['PT-N5 a failed refresh no longer overrides the state', 'PT-20', sw("  if (entry.lastFailAt) res.state = 'failed';\n", '')],
  ['PT-N6 aged rows enter the current day-% ordering', 'PT-9', sw('if (_pfIsCurrentFreshness(f)) {\n      if (typeof row.changePercent', "if (f.state !== 'missing' && f.state !== 'failed' && f.state !== 'unknown') {\n      if (typeof row.changePercent")],
  ['PT-N7 the trailing groups are reordered (Unknown before Aged)', 'PT-10', sw('.concat(groups.aged.sort(bySymbol), groups.unknown.sort(bySymbol),', '.concat(groups.unknown.sort(bySymbol), groups.aged.sort(bySymbol),')],
  ['PT-N8 manual refresh does not add the strip symbols', 'PT-8', sw("if (!syms || !syms.length || _pfLiveFetching) return;\n  syms = _pfWithStripSyms(syms); // Portfolio Today: SPY / QQQ ride the same batch, cache and budget\n", "if (!syms || !syms.length || _pfLiveFetching) return;\n")],
  ['PT-N9 the switch writes the gate non-strictly (!!on)', 'PT-2', sw('var enabled = (on === true);', 'var enabled = !!on;')],
  ['PT-N10 the load read accepts anything but "false"', 'PT-1', sw("live = (localStorage.getItem('pt_enable_portfolio_live_prices') === 'true');", "live = (localStorage.getItem('pt_enable_portfolio_live_prices') !== 'false');")],
  ['PT-N11 Est. Daily Move rendered again', 'PT-12', sw('// of its own estimate instead.', "// of its own estimate instead.\n    summary.appendChild(_pfSummaryStat('Est. Daily Move', String(_pfPortfolioDayEstimate(holdings))));")],
  ['PT-N12 the per-card wording reverted to "est."', 'PT-13', sw("+ ' on recorded value (as of ' + (_pfRecordedAsOf(h, nowStr) || 'date unknown') + ')';", "+ ' est.';")],
  ['PT-N13 a new endpoint added to the Portfolio code', 'PT-24', sw("var PT_STRIP_SYMBOLS = ['SPY', 'QQQ'];", "var PT_STRIP_SYMBOLS = ['SPY', 'QQQ'];\nvar PT_QUOTES_URL = '/.netlify/functions/quotes';")],
  ['PT-N15 the strip symbols appended after the holdings (the batch cap can cut them)', 'PT-8', sw("return PT_STRIP_SYMBOLS.concat(syms.filter(function(s) { return PT_STRIP_SYMBOLS.indexOf(s) === -1; }));", "return syms.filter(function(s) { return PT_STRIP_SYMBOLS.indexOf(s) === -1; }).concat(PT_STRIP_SYMBOLS);")],
  ['PT-N14 a pinned fetch-normalisation function edited', 'PT-25', sw('return { symbol: sym, price: price, change_percent: change_percent, source: source,', 'return { symbol: sym, price: price, change_percent: change_percent, source: source, extra: 1,')]
];

// ── runner ────────────────────────────────────────────────────────────────────
(async () => {
  let pass = 0;
  const failures = [];
  for (const id of ORDER) {
    try { await ROWS[id](SRC); pass += 1; console.log('  PASS  ' + id); }
    catch (e) { failures.push(id); console.log('  FAIL  ' + id + ' — ' + String((e && e.message) || e).split('\n')[0].slice(0, 400)); }
  }
  for (const [label, rowPrefix, mutate] of NEG) {
    const full = ORDER.find(i => i.startsWith(rowPrefix + ' '));
    let mutated;
    try { mutated = mutate(SRC); } catch (e) { failures.push('negative anchor: ' + label); console.log('  FAIL  negative mutation did not apply: ' + label + ' — ' + String(e.message).split('\n')[0]); continue; }
    let caught = false;
    try { await ROWS[full](mutated); } catch (e) { caught = true; }
    if (caught) { pass += 1; console.log('  PASS  negative caught: ' + label); }
    else { failures.push('negative: ' + label); console.log('  FAIL  negative NOT caught: ' + label); }
  }
  if (failures.length) { console.log('\nportfolio-today: ' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\n' + pass + ' portfolio-today row(s) passed');
})();
