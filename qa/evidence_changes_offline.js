#!/usr/bin/env node
'use strict';
/*
 * qa/evidence_changes_offline.js - evidence-memory-1 S2: change engine v1 (Main Control D-19, D-20, D-21, D-23).
 *
 * Written from the brief's contract (section 2) and Risk & Test Design (section RT) BEFORE the module existed.
 * Snapshots are built with the real S1 module (services/evidence-memory.js), so every input is a valid S1 record
 * unless a row forges one on purpose. Pure Node: no network, no browser, no storage.
 *
 *   EC-1  no noise: diff(s, s) and re-ordered / re-dated / re-captured copies show nothing (incl. the 8 live captures)
 *   EC-2  D-20 price move: material from exactly 3 % (rounded to 6 decimals); missing price or other currency: nothing
 *   EC-3  D-20 target move: material from exactly 5 %, per firm (case-insensitive), within one item or across snapshots
 *   EC-4  ratings: upgrade / downgrade / initiation / cross-snapshot rating change material; reiteration suppressed
 *   EC-5  AI action label change material; a missing value on either side is no change
 *   EC-6  D-23 setup (group crossing only), sentiment (positive <-> negative only), direction (bullish <-> bearish only)
 *   EC-7  unknown is not a change: unavailable research, null fields, first snapshot
 *   EC-8  D-21 identity: one shown entry per event; analyst text in a catalyst list joins the analyst entry; dates
 *         masked, numbers kept; two different events stay two
 *   EC-9  cap 7 and class order (analyst -> AI action -> catalysts -> price -> other); overflow counted; deterministic
 *   EC-10 inputs: forged / invalid snapshots, wrong order, equal times, ticker mismatch, missing validator
 *   EC-11 privacy: every output string is an input value or a fixed label; group keys are hashes
 *   EC-12 never throws on hostile input
 *   EC-13 purity: no network, DOM, storage, clock, randomness, require or eval in the module
 *   EC-14 informational kinds (catalyst gone, new source domain, sub-threshold moves) are counted, never shown
 *   EC-15 order independence (rev 2): every list of both snapshots reversed, rotated and shuffled (seeded) gives a
 *         byte-identical result - same-event items with different targets, several earlier targets / ratings, duplicate
 *         catalyst lines in different wording, ties in magnitude, the EC-9 scenario
 *   EC-16 distinct analyst evidence (rev 2): same-event items with different targets are both kept (one shown entry);
 *         the nearest earlier target is the base; a re-reported event compares with its earlier report and does not
 *         repeat its rating change; a rating already among the firm's earlier ratings is not a change
 *   EC-17 unknown currency on both sides is the same series; unknown vs a known currency is not compared (advisory)
 *   EC-18 shown / groups carry one entry per event; changes is the full audit list (advisory)
 *   EC-19 collision-safe keys (rev 3): field values containing the old "|" separator never make distinct evidence or
 *         distinct events share a key (firm vs action, action vs date, rating fields), in either input order
 *   EC-N1..N22 planted negatives (each mutates the module source; its named rows must fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const S1_SRC = fs.readFileSync(path.join(ROOT, 'services', 'evidence-memory.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'services', 'evidence-changes.js'), 'utf8');
function load(src) { const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); return m.exports; }
const S1 = load(S1_SRC);

const T0 = Date.UTC(2026, 9, 16, 20, 0, 0);
const HOUR = 3600000, DAY = 86400000;
const iso = ms => new Date(ms).toISOString();

// ---- fixtures (S1 input shape; built and validated by S1) ----
function research(over) {
  return Object.assign({
    analystActions: [{ bank: 'UBS', action: 'raised', target: 125, ptFrom: 120, ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', raw: 'UBS raised PT to $125 from $120 (October 14)' }],
    ratingOnlyActions: [],
    bullishCatalysts: ['Cloud revenue grew 54% in Q3 (October 14)'],
    bearishCatalysts: ['Consensus targets include a low of $51'],
    macroDrivers: [],
    earnings: 'NONE', guidance: '', contracts: '', peerMove: '',
    revisionDirection: 'upgrading', revisionRecency: 'October 14', dataFreshness: 'today',
    sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 'UBS lifts target', date: '2026-10-14' }],
    _allNone: false
  }, over || {});
}
function input(over) {
  return Object.assign({
    ticker: 'FROG', capturedAt: iso(T0),
    research: research(),
    assessment: { action: 'hold', technicalSetup: 'healthy_uptrend', sentiment: 'positive', sentimentScore: 61, catalystDirection: 'bullish' },
    market: { price: 100, currency: 'USD' }
  }, over || {});
}
function snap(over) {
  const b = S1.buildSnapshot(input(over));
  if (!b.ok) throw new Error('fixture invalid: ' + b.reason);
  return b.snapshot;
}
const later = (over, hours) => snap(Object.assign({ capturedAt: iso(T0 + (hours || 24) * HOUR) }, over || {}));
const assess = o => Object.assign({ action: 'hold', technicalSetup: 'healthy_uptrend', sentiment: 'positive', sentimentScore: 61, catalystDirection: 'bullish' }, o);
const kinds = r => r.shown.map(c => c.kind);
const has = (r, kind) => r.changes.some(c => c.kind === kind && c.material);
const shownHas = (r, kind) => r.shown.some(c => c.kind === kind);
function allStrings(v, acc) {
  acc = acc || [];
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach(x => allStrings(x, acc));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => allStrings(v[k], acc));
  return acc;
}

async function rows(M, src, only) {
  const R = {};
  const want = id => !only || only.indexOf(id) !== -1;
  const ok = (id, cond, detail) => { if (!(id in R) || R[id] === true) R[id] = cond ? true : (detail || 'fail'); };
  const guard = (id, fn) => { try { fn(); } catch (e) { ok(id, false, 'threw: ' + (e && e.message)); } };
  const E = M.createChangeEngine(S1);
  const D = (a, b) => E.diffSnapshots(a, b);

  if (want('EC-1')) guard('EC-1', () => {
    const a = snap();
    const self = D(a, later());
    ok('EC-1', self.ok && self.shown.length === 0 && self.changes.every(c => !c.material), JSON.stringify(self.shown));
    // re-ordered lists, re-ordered sources, reworded dates in catalyst text, other title: nothing material
    const b = later({ research: research({
      bullishCatalysts: ['Cloud revenue grew 54% in Q3 (Oct 14)'],
      bearishCatalysts: ['Consensus targets include a low of $51.'],
      sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 'Another headline', date: '2026-10-14' }] }) });
    const r = D(a, b);
    ok('EC-1', r.ok && r.shown.length === 0, 'reworded: ' + JSON.stringify(r.shown));
    const c1 = snap({ research: research({ bullishCatalysts: ['A first item', 'B second item', 'C third item'] }) });
    const c2 = later({ research: research({ bullishCatalysts: ['C third item', 'A first item', 'B second item'] }) });
    ok('EC-1', D(c1, c2).shown.length === 0, 'order');
    // the 8 live captures, each against itself one day later
    const ix = path.join(ROOT, 'index.html'), fxp = path.join(ROOT, 'qa', 'fixtures', 'research-live-2026-10-15.json');
    if (fs.existsSync(ix) && fs.existsSync(fxp)) {
      const t = fs.readFileSync(ix, 'utf8').replace(/\r\n/g, '\n');
      const st = t.indexOf('function parsePerplexityContext('); const bi = t.indexOf('{', st); let d = 0, end = -1;
      for (let i = bi; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}') { d--; if (!d) { end = i + 1; break; } } }
      const ctx = { console: { log() {}, warn() {} } }; vm.createContext(ctx); vm.runInContext(t.slice(st, end) + ';this.P=parsePerplexityContext', ctx);
      const fx = JSON.parse(fs.readFileSync(fxp, 'utf8')); const caps = fx.captures || fx; let n = 0;
      for (const cap of caps) {
        const p = ctx.P(cap.raw, [])[cap.ticker];
        const mk = ms => S1.buildSnapshot({ ticker: cap.ticker, capturedAt: iso(ms), research: p, assessment: assess({}), market: { price: 50, currency: 'USD' } });
        const x = mk(T0), y = mk(T0 + DAY);
        if (!x.ok || !y.ok) continue;
        n++;
        const rr = D(x.snapshot, y.snapshot);
        if (!(rr.ok && rr.shown.length === 0)) ok('EC-1', false, cap.key + ': ' + JSON.stringify(rr.shown));
      }
      ok('EC-1', n >= 8, 'live captures ' + n);
    }
  });

  if (want('EC-2')) guard('EC-2', () => {
    const px = (a, b, ca, cb) => D(snap({ market: { price: a, currency: ca || 'USD' } }), later({ market: { price: b, currency: cb || 'USD' } }));
    const cases = [[100, 102.999, false], [100, 103, true], [100, 103.001, true], [100, 97, true], [100, 97.001, false],
      [70, 72.1, true], [33.33, 34.3299, true], [33.33, 34.3298, false], [250, 257.5, true], [250, 242.5, true], [1.5, 1.545, true]];
    const bad = cases.filter(([a, b, m]) => has(px(a, b), 'price_move') !== m).map(c => c.join('->'));
    ok('EC-2', bad.length === 0, JSON.stringify(bad));
    ok('EC-2', !px(100, 110, 'USD', 'ILS').changes.some(c => c.kind === 'price_move'), 'currency mismatch');
    const noPrice = D(snap({ market: { currency: 'USD' } }), later({ market: { price: 110, currency: 'USD' } }));
    ok('EC-2', !noPrice.changes.some(c => c.kind === 'price_move'), 'missing price');
    const m = px(100, 103).changes.find(c => c.kind === 'price_move');
    ok('EC-2', m && m.from === 100 && m.to === 103 && m.magnitude === 3, JSON.stringify(m));
  });

  if (want('EC-3')) guard('EC-3', () => {
    const act = (o) => Object.assign({ bank: 'UBS', action: 'raised', ratingAction: 'maintained', rating: 'Buy', ptAction: 'raised', raw: 'UBS (October 15)' }, o);
    const one = o => D(snap({ research: research({ analystActions: [] }) }), later({ research: research({ analystActions: [act(o)] }) }));
    const within = [[100, 105, true], [100, 104.99, false], [100, 95, true], [100, 95.01, false], [120, 126, true]];
    const bad = within.filter(([f, t, m]) => has(one({ ptFrom: f, target: t }), 'target_change') !== m).map(c => c.join('->'));
    ok('EC-3', bad.length === 0, 'within ' + JSON.stringify(bad));
    // across snapshots: same firm (case-insensitive), no targetFrom in the new item
    const prevS = snap({ research: research({ analystActions: [act({ target: 120, ptFrom: undefined, raw: 'UBS (October 14)' })] }) });
    const cross = t => D(prevS, later({ research: research({ analystActions: [act({ bank: 'ubs', target: t, ptFrom: undefined, raw: 'ubs (October 16)' })] }) }));
    ok('EC-3', has(cross(126), 'target_change') && !has(cross(125.9), 'target_change') && has(cross(114), 'target_change'), 'cross');
    // a different firm's target is not a change for UBS
    const other = D(prevS, later({ research: research({ analystActions: [act({ target: 120, ptFrom: undefined, raw: 'UBS (October 14)' }), act({ bank: 'Jefferies', target: 200, ptFrom: undefined, raw: 'Jefferies (October 16)' })] }) }));
    ok('EC-3', !has(other, 'target_change'), 'other firm');
  });

  if (want('EC-4')) guard('EC-4', () => {
    const ro = o => Object.assign({ bank: 'Wall Street Zen', raw: 'Wall Street Zen (October 15)' }, o);
    const add = list => D(snap({ research: research({ ratingOnlyActions: [] }) }), later({ research: research({ ratingOnlyActions: list }) }));
    ok('EC-4', has(add([ro({ action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy' })]), 'rating_change'), 'upgrade');
    ok('EC-4', has(add([ro({ action: 'downgraded', ratingAction: 'downgraded', rating: 'Hold' })]), 'rating_change'), 'downgrade');
    const ini = add([ro({ bank: 'Mizuho', action: 'initiated', ratingAction: 'initiated', rating: 'Outperform', raw: 'Mizuho (October 15)' })]);
    ok('EC-4', ini.shown.some(c => c.kind === 'analyst_new' && c.material), 'initiation ' + JSON.stringify(ini.shown));
    // the same firm with a different rating across snapshots, verb "maintained": a rating change
    const p = snap({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Buy', raw: 'Wall Street Zen (October 10)' })] }) });
    const n = later({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Hold' })] }) });
    ok('EC-4', has(D(p, n), 'rating_change'), 'cross-snapshot rating');
    // reiteration: same rating, no target -> suppressed and counted
    const rei = D(p, later({ research: research({ ratingOnlyActions: [ro({ action: 'maintained', rating: 'Buy', raw: 'Wall Street Zen (October 10)' }), ro({ action: 'reiterated', rating: 'Buy' })] }) }));
    ok('EC-4', rei.shown.length === 0 && (rei.suppressed.analyst_new || 0) >= 1, 'reiteration ' + JSON.stringify(rei));
  });

  if (want('EC-5')) guard('EC-5', () => {
    const a = (x, y) => D(snap({ assessment: assess({ action: x }) }), later({ assessment: assess({ action: y }) }));
    const r = a('hold', 'trim');
    const c = r.shown.find(k => k.kind === 'ai_action_change');
    ok('EC-5', c && c.from === 'hold' && c.to === 'trim' && c.material, JSON.stringify(r.shown));
    ok('EC-5', !a('hold', null).changes.some(k => k.kind === 'ai_action_change') && !a(null, 'trim').changes.some(k => k.kind === 'ai_action_change'), 'null side');
    ok('EC-5', a('hold', 'hold').shown.length === 0, 'same');
  });

  if (want('EC-6')) guard('EC-6', () => {
    const st = (x, y) => has(D(snap({ assessment: assess({ technicalSetup: x }) }), later({ assessment: assess({ technicalSetup: y }) })), 'setup_change');
    const setups = [['healthy_uptrend', 'breakdown_risk', true], ['extended_near_ath', 'below_key_mas', true], ['support_test', 'healthy_uptrend_near_ath', true],
      ['pullback_in_uptrend', 'support_test', true], ['healthy_uptrend', 'pullback_in_uptrend', false], ['support_test', 'below_key_mas', false],
      ['extended_near_ath', 'healthy_uptrend', false], ['unknown', 'breakdown_risk', false], ['healthy_uptrend', 'unknown', false]];
    const se = (x, y) => has(D(snap({ assessment: assess({ sentiment: x }) }), later({ assessment: assess({ sentiment: y }) })), 'sentiment_change');
    const sents = [['positive', 'negative', true], ['negative', 'positive', true], ['positive', 'neutral', false], ['neutral', 'negative', false]];
    const di = (x, y) => has(D(snap({ assessment: assess({ catalystDirection: x }) }), later({ assessment: assess({ catalystDirection: y }) })), 'direction_change');
    const dirs = [['bullish', 'bearish', true], ['bearish', 'bullish', true], ['bullish', 'mixed', false], ['mixed', 'bearish', false]];
    const bad = [].concat(setups.filter(([a, b, m]) => st(a, b) !== m).map(c => 'setup ' + c.join('->')),
      sents.filter(([a, b, m]) => se(a, b) !== m).map(c => 'sent ' + c.join('->')), dirs.filter(([a, b, m]) => di(a, b) !== m).map(c => 'dir ' + c.join('->')));
    ok('EC-6', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-7')) guard('EC-7', () => {
    const a = snap();
    const un = later({ research: research({ _unavailable: true, analystActions: [], bullishCatalysts: [], bearishCatalysts: [] }) });
    const r1 = D(a, un), r2 = D(un, later({}, 48));
    const resKinds = ['analyst_new', 'rating_change', 'target_change', 'catalyst_new', 'catalyst_gone', 'source_new'];
    ok('EC-7', r1.ok && r2.ok && !r1.changes.some(c => resKinds.includes(c.kind)) && !r2.changes.some(c => resKinds.includes(c.kind)), 'unavailable');
    const f = D(null, a);
    ok('EC-7', f.ok === true && f.reason === 'FIRST_SNAPSHOT' && f.shown.length === 0 && f.changes.length === 0, JSON.stringify(f));
    const nul = D(snap({ assessment: {} }), later({ assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }) }));
    ok('EC-7', !nul.changes.some(c => ['ai_action_change', 'setup_change', 'sentiment_change', 'direction_change'].includes(c.kind)), 'null assessment');
  });

  if (want('EC-8')) guard('EC-8', () => {
    // a reworded date only: same event
    const p = snap({ research: research({ bullishCatalysts: ['Signed a cloud contract with the Army (October 14)'] }) });
    const n = later({ research: research({ bullishCatalysts: ['Signed a cloud contract with the Army (Oct 14, 2026)'] }) });
    ok('EC-8', !has(D(p, n), 'catalyst_new'), 'date reworded');
    // numbers are kept: a different quarter / figure is a different event
    const q = D(snap({ research: research({ bullishCatalysts: ['Revenue grew 20% in Q3'] }) }), later({ research: research({ bullishCatalysts: ['Revenue grew 25% in Q4'] }) }));
    ok('EC-8', has(q, 'catalyst_new'), 'numbers kept');
    // the same analyst event as a structured action and as catalyst text: one shown entry
    const base = snap({ research: research({ analystActions: [], bullishCatalysts: [] }) });
    const both = later({ research: research({ analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Jefferies (October 15)' }],
      bullishCatalysts: ['Jefferies raised its price target to $230 (October 15)'] }) });
    const r = D(base, both);
    const groups = new Set(r.shown.map(c => c.groupKey));
    ok('EC-8', r.shown.length === 1 && groups.size === 1 && r.shown[0].kind === 'target_change' && r.groups === 1, 'merged ' + JSON.stringify(r.shown));
    // two different events from the same firm (different dates): two entries
    const two = later({ research: research({ ratingOnlyActions: [
      { bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 12)' },
      { bank: 'Mizuho', action: 'downgraded', ratingAction: 'downgraded', rating: 'Hold', raw: 'Mizuho (October 15)' }] }) });
    const r2 = D(base, two);
    const rc = r2.shown.filter(c => c.kind === 'rating_change');
    ok('EC-8', rc.length === 2 && new Set(rc.map(c => c.groupKey)).size === 2, 'two events ' + JSON.stringify(r2.shown));
    // the same item listed twice in one snapshot is one entry
    const dup = D(base, later({ research: research({ analystActions: [], bullishCatalysts: ['New AI chip launched (October 15)', 'New AI chip launched (Oct 15)'] }) }));
    ok('EC-8', dup.shown.filter(c => c.kind === 'catalyst_new').length === 1, 'duplicate line');
  });

  if (want('EC-9')) guard('EC-9', () => {
    const p = snap({ research: research({ analystActions: [], bullishCatalysts: [], bearishCatalysts: [] }), assessment: assess({}), market: { price: 100, currency: 'USD' } });
    const big = later({
      research: research({
        analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', raw: 'Jefferies (October 15)' }],
        ratingOnlyActions: [{ bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' },
          { bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' }],
        bullishCatalysts: ['Won a defense contract', 'Opened a new factory', 'Launched a new product line'],
        bearishCatalysts: ['Lost a major customer', 'Faces a patent lawsuit'] }),
      assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }),
      market: { price: 90, currency: 'USD' } });
    const r = D(p, big);
    const mat = r.changes.filter(c => c.material);
    const classOf = k => ({ analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 })[k] || 5;
    const cls = r.shown.map(c => classOf(c.kind));
    const sorted = cls.every((c, i) => i === 0 || cls[i - 1] <= c);
    ok('EC-9', r.shown.length === 7 && sorted && r.groups === mat.length && r.suppressed.overflow === r.groups - 7 && r.groups === 13, JSON.stringify({ n: r.shown.length, cls, groups: r.groups, over: r.suppressed.overflow }));
    ok('EC-9', JSON.stringify(D(p, big)) === JSON.stringify(r), 'deterministic');
    // permuting the input lists does not change the result
    const big2 = later({
      research: research({
        analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', raw: 'Jefferies (October 15)' }],
        ratingOnlyActions: [{ bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' },
          { bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' }],
        bullishCatalysts: ['Launched a new product line', 'Won a defense contract', 'Opened a new factory'],
        bearishCatalysts: ['Faces a patent lawsuit', 'Lost a major customer'] }),
      assessment: assess({ action: 'trim', technicalSetup: 'breakdown_risk', sentiment: 'negative', catalystDirection: 'bearish' }),
      market: { price: 90, currency: 'USD' } });
    ok('EC-9', JSON.stringify(D(p, big2).shown) === JSON.stringify(r.shown), 'permutation');
    // within the analyst class the larger magnitude comes first; a catalyst never precedes the AI action
    const ai = r.shown.findIndex(c => c.kind === 'ai_action_change'), cat = r.shown.findIndex(c => c.kind === 'catalyst_new');
    ok('EC-9', ai !== -1 && (cat === -1 || cat > ai), 'ai before catalysts');
  });

  if (want('EC-10')) guard('EC-10', () => {
    const a = snap(), b = later();
    const forged = JSON.parse(JSON.stringify(b)); forged.research.note = 'x';
    const r1 = D(a, forged), r2 = D(forged, b), r3 = D(b, a), r4 = D(a, JSON.parse(JSON.stringify(a)));
    const toad = S1.buildSnapshot(input({ ticker: 'TOAD', capturedAt: iso(T0 + DAY) })).snapshot;
    const r5 = D(a, toad);
    const noV = M.createChangeEngine({}).diffSnapshots(a, b);
    const nul = M.createChangeEngine(null).diffSnapshots(a, b);
    const empty = r => r.shown.length === 0 && r.changes.length === 0;
    ok('EC-10', !r1.ok && r1.reason === 'INVALID_NEXT' && empty(r1) && !r2.ok && r2.reason === 'INVALID_PREV' && !r3.ok && r3.reason === 'NOT_LATER' &&
      !r4.ok && r4.reason === 'NOT_LATER' && !r5.ok && r5.reason === 'TICKER_MISMATCH' && !noV.ok && noV.reason === 'NO_VALIDATOR' && !nul.ok && nul.reason === 'NO_VALIDATOR',
      JSON.stringify([r1.reason, r2.reason, r3.reason, r4.reason, r5.reason, noV.reason, nul.reason]));
    ok('EC-10', !D(undefined, b).ok && !D(a, undefined).ok && D(undefined, b).reason === 'INVALID_PREV', 'undefined');
  });

  if (want('EC-11')) guard('EC-11', () => {
    const p = snap({ research: research({ analystActions: [], bullishCatalysts: ['Kestrelquux item one'] }) });
    const n = later({ research: research({
      analystActions: [{ bank: 'Zorblat Capital', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Zorblat Capital (October 15)' }],
      bullishCatalysts: ['Plinkety canary event happened'], bearishCatalysts: ['Wobblefrost risk appeared'],
      sources: [{ url: 'https://news.quibbleton.com/a', title: 'Grommitz title', date: '2026-10-15' }] }),
      assessment: assess({ action: 'trim' }) });
    const r = D(p, n);
    const inputs = new Set(allStrings([p, n]));
    const fixed = new Set(['analyst_new', 'rating_change', 'target_change', 'catalyst_new', 'catalyst_gone', 'ai_action_change', 'setup_change',
      'sentiment_change', 'direction_change', 'price_move', 'source_new', 'FIRST_SNAPSHOT']);
    const strs = allStrings(r).filter(s => !/^(an|ra|ct|ai|px|su|se|di|so):[0-9a-f]{16}$/.test(s));
    const foreign = strs.filter(s => !inputs.has(s) && !fixed.has(s));
    const keysOk = r.changes.every(c => /^(an|ra|ct|ai|px|su|se|di|so):[0-9a-f]{16}$/.test(c.groupKey));
    ok('EC-11', foreign.length === 0 && keysOk, JSON.stringify({ foreign, keysOk }));
    const fields = r.changes.every(c => Object.keys(c).sort().join(',') === 'date,from,groupKey,kind,magnitude,material,to');
    ok('EC-11', fields, 'change fields ' + JSON.stringify(r.changes[0]));
  });

  if (want('EC-12')) guard('EC-12', () => {
    const boom = () => { throw new Error('hostile'); };
    const prox = new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom });
    const getter = (() => { const o = JSON.parse(JSON.stringify(snap())); Object.defineProperty(o, 'research', { get: boom, enumerable: true }); return o; })();
    const cyc = (() => { const o = JSON.parse(JSON.stringify(later())); o.self = o; return o; })();
    const a = snap();
    const bad = [];
    for (const [x, y, l] of [[prox, a, 'proxy prev'], [a, prox, 'proxy next'], [getter, a, 'getter'], [a, cyc, 'cycle'], [1, 'x', 'prims'], [[], {}, 'arrays']]) {
      try { const r = D(x, y); if (!r || r.ok !== false || !Array.isArray(r.shown)) bad.push(l + ' shape'); } catch (e) { bad.push(l + ' threw'); }
    }
    const throwingS1 = { validateSnapshot: boom };
    try { const r = M.createChangeEngine(throwingS1).diffSnapshots(a, later()); if (r.ok !== false) bad.push('validator throws'); } catch (e) { bad.push('validator threw out'); }
    try { M.createChangeEngine(prox); } catch (e) { bad.push('factory threw'); }
    // contained even when the injected validator lets hostile data through (defence in depth: the engine itself never throws)
    try { const r = M.createChangeEngine({ validateSnapshot: () => true }).diffSnapshots(prox, getter); if (r.ok !== false || r.reason !== 'INTERNAL') bad.push('permissive validator: ' + r.reason); } catch (e) { bad.push('permissive validator threw'); }
    ok('EC-12', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-13')) guard('EC-13', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bdocument\b/, /\bwindow\b/, /localStorage|sessionStorage|indexedDB/, /\brequire\s*\(/, /\beval\s*\(/,
      /new Function/, /Math\.random/, /Date\.now|new Date\s*\(/, /\bsetTimeout\b|\bsetInterval\b/, /process\./];
    const hits = banned.filter(re => re.test(code)).map(String);
    ok('EC-13', hits.length === 0 && /typeof module !== 'undefined' && module\.exports/.test(src), JSON.stringify(hits));
  });

  if (want('EC-14')) guard('EC-14', () => {
    const p = snap({ research: research({ bullishCatalysts: ['Old event that went away'] }) });
    const n = later({ research: research({ bullishCatalysts: [], sources: [{ url: 'https://www.reuters.com/markets/frog-ubs', title: 't', date: '2026-10-14' }, { url: 'https://www.ft.com/content/frog', title: 't2', date: '2026-10-15' }] }),
      market: { price: 101, currency: 'USD' } });
    const r = D(p, n);
    ok('EC-14', r.shown.length === 0 && r.suppressed.catalyst_gone === 1 && r.suppressed.source_new === 1 && r.suppressed.price_move === 1 &&
      r.changes.filter(c => c.kind === 'catalyst_gone' || c.kind === 'source_new').every(c => c.material === false), JSON.stringify(r));
  });

  // ---- rev 2 rows ----
  const aa = (bank, o) => Object.assign({ bank: bank, action: 'raised', ptAction: 'raised', rating: 'Buy', ratingAction: 'maintained', raw: bank + ' (October 15)' }, o);
  const withLists = (r, perm) => {
    const out = Object.assign({}, r);
    ['analystActions', 'ratingOnlyActions', 'bullishCatalysts', 'bearishCatalysts', 'macroDrivers', 'sources'].forEach(k => { if (Array.isArray(r[k])) out[k] = perm(r[k].slice()); });
    return out;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const PERMS = [a => a, a => a.reverse(), a => a.length ? a.slice(1).concat(a.slice(0, 1)) : a].concat(Array.from({ length: 8 }, () => a => shuffle(a)));
  // each scenario: [label, prev research over, next research over, prev assessment, next assessment, prev price, next price]
  const SCEN = [
    ['same event, two targets, equal |move|', { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' })] },
      { analystActions: [aa('UBS', { target: 126 }), aa('UBS', { target: 114 }), aa('Jefferies', { target: 230, ptFrom: 200 })] }],
    ['several earlier targets', { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' })] },
      { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' }), aa('UBS', { target: 133 })] }],
    ['several earlier ratings', { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Buy', raw: 'WSZ (October 1)' }, { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 5)' }] },
      { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }, { bank: 'Baird', action: 'upgraded', rating: 'Buy', raw: 'Baird (October 15)' }] }],
    ['duplicate catalyst lines, other wording', { bullishCatalysts: [] },
      { bullishCatalysts: ['New AI chip launched (Oct 15)', 'New AI chip launched (October 15)', 'Signed a deal'], bearishCatalysts: ['Signed a deal.'] }],
    ['EC-9 scenario', { analystActions: [], bullishCatalysts: [], bearishCatalysts: [] },
      { analystActions: [aa('Jefferies', { target: 230, ptFrom: 200 })],
        ratingOnlyActions: [{ bank: 'Mizuho', action: 'upgraded', ratingAction: 'upgraded', rating: 'Buy', raw: 'Mizuho (October 15)' }, { bank: 'Baird', action: 'downgraded', ratingAction: 'downgraded', rating: 'Neutral', raw: 'Baird (October 15)' }],
        bullishCatalysts: ['Won a defense contract', 'Opened a new factory', 'Launched a new product line'], bearishCatalysts: ['Lost a major customer', 'Faces a patent lawsuit'] }]
  ];

  if (want('EC-15')) guard('EC-15', () => {
    const bad = [];
    for (const [label, po, no] of SCEN) {
      let ref = null;
      for (let i = 0; i < PERMS.length; i++) for (let j = 0; j < PERMS.length; j += 3) {
        const p = snap({ research: research(withLists(Object.assign({ analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] }, po), PERMS[j])) });
        const n = later({ research: research(withLists(Object.assign({ analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] }, no), PERMS[i])) });
        const out = JSON.stringify(D(p, n));
        if (ref === null) ref = out; else if (out !== ref) { bad.push(label + ' perm ' + i + '/' + j); break; }
      }
    }
    ok('EC-15', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-16')) guard('EC-16', () => {
    const base = { analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] };
    const R = (po, no) => D(snap({ research: research(Object.assign({}, base, po)) }), later({ research: research(Object.assign({}, base, no)) }));
    const tc = r => r.changes.filter(c => c.kind === 'target_change');
    const bad = [];
    // same event, two different targets: both kept as evidence, one shown entry (the larger move)
    const r1 = R({ analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' })] }, { analystActions: [aa('UBS', { target: 126 }), aa('UBS', { target: 140 })] });
    if (!(tc(r1).length === 2 && tc(r1).every(c => c.material) && new Set(tc(r1).map(c => c.groupKey)).size === 1 && r1.groups === 1 && r1.shown.length === 1 && r1.shown[0].to === 140 && r1.shown[0].from === 120)) bad.push('two targets ' + JSON.stringify(r1.changes));
    // exact duplicates are one item
    const r1b = R({}, { analystActions: [aa('UBS', { target: 140, ptFrom: 120 }), aa('UBS', { target: 140, ptFrom: 120 })] });
    if (tc(r1b).length !== 1) bad.push('exact duplicate');
    // several earlier targets: the nearest one is the base
    const prev2 = { analystActions: [aa('UBS', { target: 120, raw: 'UBS (October 10)' }), aa('UBS', { target: 130, raw: 'UBS (October 12)' })] };
    const near = t => tc(R(prev2, { analystActions: prev2.analystActions.concat([aa('UBS', { target: t })]) }))[0];
    const n133 = near(133), n137 = near(137), n114 = near(114), n125 = near(125);
    if (!(n133 && n133.from === 130 && n133.material === false && n137 && n137.from === 130 && n137.material === true && n114 && n114.from === 120 && n114.material === true && n125 && n125.from === 120 && n125.magnitude === 4.166667))
      bad.push('nearest ' + JSON.stringify([n133, n137, n114, n125]));
    // a re-reported event (same firm, verb and date) with a corrected target compares with its earlier report
    const prev3 = { analystActions: [aa('UBS', { target: 125, ptFrom: 120, raw: 'UBS (October 14)' })] };
    const c132 = tc(R(prev3, { analystActions: [aa('UBS', { target: 132, ptFrom: 120, raw: 'UBS (October 14)' })] }))[0];
    const c130 = tc(R(prev3, { analystActions: [aa('UBS', { target: 130, ptFrom: 120, raw: 'UBS (October 14)' })] }))[0];
    if (!(c132 && c132.from === 125 && c132.to === 132 && c132.material === true && c130 && c130.from === 125 && c130.material === false)) bad.push('re-report ' + JSON.stringify([c132, c130]));
    // a re-reported upgrade is not shown again; a rating already among the earlier ratings is not a change
    const up = R({ analystActions: [aa('Jefferies', { action: 'upgraded', ratingAction: 'upgraded', target: 200, raw: 'Jefferies (October 14)' })] },
      { analystActions: [aa('Jefferies', { action: 'upgraded', ratingAction: 'upgraded', target: 205, raw: 'Jefferies (October 14)' })] });
    if (up.changes.some(c => c.kind === 'rating_change') || up.shown.length !== 0) bad.push('re-reported upgrade ' + JSON.stringify(up.shown));
    const two = { ratingOnlyActions: [{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Buy', raw: 'WSZ (October 1)' }, { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 5)' }] };
    const keepHold = R(two, { ratingOnlyActions: two.ratingOnlyActions.concat([{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }]) });
    const toSell = R(two, { ratingOnlyActions: two.ratingOnlyActions.concat([{ bank: 'Wall Street Zen', action: 'maintained', rating: 'Sell', raw: 'WSZ (October 15)' }]) });
    const rs = toSell.changes.find(c => c.kind === 'rating_change');
    if (keepHold.changes.some(c => c.kind === 'rating_change') || !(rs && rs.material && rs.from === null && rs.to === 'Sell')) bad.push('earlier ratings ' + JSON.stringify([keepHold.changes, rs]));
    const one = R({ ratingOnlyActions: [two.ratingOnlyActions[0]] }, { ratingOnlyActions: [two.ratingOnlyActions[0], { bank: 'Wall Street Zen', action: 'maintained', rating: 'Hold', raw: 'WSZ (October 15)' }] });
    const r1r = one.changes.find(c => c.kind === 'rating_change');
    if (!(r1r && r1r.from === 'Buy' && r1r.to === 'Hold')) bad.push('single earlier rating ' + JSON.stringify(r1r));
    ok('EC-16', bad.length === 0, JSON.stringify(bad));
  });

  if (want('EC-17')) guard('EC-17', () => {
    const px = (ca, cb) => D(snap({ market: ca === undefined ? { price: 100 } : { price: 100, currency: ca } }), later({ market: cb === undefined ? { price: 110 } : { price: 110, currency: cb } }));
    const both = px(undefined, undefined), mixed1 = px(undefined, 'USD'), mixed2 = px('USD', undefined);
    ok('EC-17', has(both, 'price_move') && !mixed1.changes.some(c => c.kind === 'price_move') && !mixed2.changes.some(c => c.kind === 'price_move'), 'currency');
  });

  if (want('EC-18')) guard('EC-18', () => {
    const base = snap({ research: research({ analystActions: [], bullishCatalysts: [] }) });
    const both = later({ research: research({ analystActions: [{ bank: 'Jefferies', action: 'raised', target: 230, ptFrom: 200, ptAction: 'raised', rating: 'Buy', raw: 'Jefferies (October 15)' }],
      bullishCatalysts: ['Jefferies raised its price target to $230 (October 15)'] }) });
    const r = D(base, both);
    const g = r.changes.filter(c => c.material).map(c => c.groupKey);
    ok('EC-18', r.changes.filter(c => c.material).length === 2 && new Set(g).size === 1 && r.groups === 1 && r.shown.length === 1, JSON.stringify(r.changes));
  });

  // EC-19 (rev 3; Codex implementation round 1, Class I): keys are collision-safe. S1 never admits "|" in a firm
  // (FIRM_RE) and its action / rating / date fields are closed vocabularies, so this is defence in depth: the engine
  // is built with a permissive validator and fed records whose fields carry "|".
  if (want('EC-19')) guard('EC-19', () => {
    const E2 = M.createChangeEngine({ validateSnapshot: () => true });
    const empty = { analystActions: [], ratingOnlyActions: [], bullishCatalysts: [], bearishCatalysts: [], macroDrivers: [] };
    const p = JSON.parse(JSON.stringify(snap({ research: research(empty) })));
    const nextWith = items => { const n = JSON.parse(JSON.stringify(later({ research: research(empty) }))); n.research.analystActions = items; return n; };
    const it = o => Object.assign({ firm: 'X', action: null, ratingAction: null, rating: null, date: null, target: null, targetFrom: null, targetAction: null }, o);
    const analystKinds = ['analyst_new', 'rating_change', 'target_change'];
    const cases = [
      // [label, item 1, item 2, distinct events?]
      // the firm is lower-cased by the identity, the action is not: 'A|b' + 'upgraded' vs 'A' + 'b|upgraded' collide under a '|' join
      ['firm vs action', it({ firm: 'A|b', action: 'upgraded', date: 'October 15' }), it({ firm: 'A', action: 'b|upgraded', date: 'October 15' }), true],
      ['action vs date', it({ firm: 'A', action: 'upgraded|x', date: 'y' }), it({ firm: 'A', action: 'upgraded', date: 'x|y' }), true],
      ['rating fields (same event)', it({ firm: 'A', action: 'maintained', ratingAction: 'up|Buy', rating: 'Hold', date: 'October 15' }),
        it({ firm: 'A', action: 'maintained', ratingAction: 'up', rating: 'Buy|Hold', date: 'October 15' }), false]
    ];
    const bad = [];
    for (const [label, a, b, distinctEvents] of cases) {
      const r1 = E2.diffSnapshots(p, nextWith([a, b])), r2 = E2.diffSnapshots(p, nextWith([b, a]));
      const ch = r1.changes.filter(c => analystKinds.indexOf(c.kind) !== -1);
      const groups = new Set(ch.map(c => c.groupKey)).size;
      if (!(r1.ok && ch.length === 2 && groups === (distinctEvents ? 2 : 1))) bad.push(label + ' ' + JSON.stringify({ n: ch.length, groups }));
      if (JSON.stringify(r1) !== JSON.stringify(r2)) bad.push(label + ' order-dependent');
    }
    // reachability note made executable: S1 itself refuses a firm containing "|"
    const s1 = S1.buildSnapshot(input({ research: research({ analystActions: [{ bank: 'A|B', action: 'upgraded', raw: 'A|B (October 15)' }] }) }));
    if (!(s1.ok && s1.snapshot.research.analystActions.length === 0)) bad.push('S1 admitted a "|" firm');
    ok('EC-19', bad.length === 0, JSON.stringify(bad));
  });
  return R;
}

// ---- planted negatives: each mutates services/evidence-changes.js; the named rows must fail ----
const rep = (a, b) => s => { if (s.split(a).length !== 2) throw new Error('anchor not found exactly once: ' + a.slice(0, 70)); return s.replace(a, b); };
const NEG = [
  ['EC-N1 price threshold lowered', rep('var PRICE_PCT = 3;', 'var PRICE_PCT = 2.5;'), ['EC-2']],
  ['EC-N2 percentage not rounded before the comparison', rep('function pct(a, b) { return round6((b - a) / a * 100); }', 'function pct(a, b) { return (b - a) / a * 100; }'), ['EC-2']],
  ['EC-N3 target threshold lowered', rep('var TARGET_PCT = 5;', 'var TARGET_PCT = 4;'), ['EC-3']],
  ['EC-N4 firm matched case-sensitively', rep("function firmKey(f) { return String(f).toLowerCase(); }", 'function firmKey(f) { return String(f); }'), ['EC-3']],
  ['EC-N5 a missing value counts as a change', rep('function known(v) { return v !== null && v !== undefined && v !== \'unknown\'; }', 'function known(v) { return true; }'), ['EC-5', 'EC-6', 'EC-7']],
  ['EC-N6 every setup change material', rep('material: SETUP_GROUP[a] !== SETUP_GROUP[b]', 'material: true'), ['EC-6']],
  ['EC-N7 dates not masked in the identity', rep("  t = t.replace(DATE_RE, ' ');\n", ''), ['EC-1', 'EC-8']],
  ['EC-N8 numbers masked in the identity', rep("  t = t.replace(DATE_RE, ' ');\n", "  t = t.replace(DATE_RE, ' ').replace(/[0-9]+/g, '#');\n"), ['EC-8']],
  ['EC-N9 analyst text in a catalyst list not joined to the analyst entry', rep('    var joined = analystGroupFor(text, analystFirms);\n', '    var joined = null;\n'), ['EC-8']],
  ['EC-N10 no display cap', rep('var MAX_SHOWN = 7;', 'var MAX_SHOWN = 99;'), ['EC-9']],
  ['EC-N11 class order changed', rep('var CLASS = { analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 };',
    'var CLASS = { analyst_new: 3, rating_change: 3, target_change: 3, ai_action_change: 2, catalyst_new: 1, price_move: 4 };'), ['EC-9']],
  ['EC-N12 inputs not validated', rep('    if (!safeValid(validate, prev)) return fail(\'INVALID_PREV\');\n    if (!safeValid(validate, next)) return fail(\'INVALID_NEXT\');\n', ''), ['EC-10']],
  ['EC-N13 not contained', rep('    try { return diff(validate, prev, next); } catch (e) { return fail(\'INTERNAL\'); }', '    return diff(validate, prev, next);'), ['EC-12']],
  ['EC-N14 catalyst gone shown as material', rep("add('catalyst_gone', g, x, null, null, false, null);", "add('catalyst_gone', g, x, null, null, true, null);"), ['EC-14']],
  ['EC-N15 earlier target = last in list order (rev 1)', rep('function nearest(list, x) {\n', 'function nearest(list, x) {\n  if (list.length) return list[list.length - 1];\n'), ['EC-15', 'EC-16']],
  ['EC-N16 evidence key without target / rating (rev 1)', rep('function evidenceKey(a) {\n', 'function evidenceKey(a) {\n  return analystIdentity(a);\n'), ['EC-15', 'EC-16']],
  ['EC-N17 duplicate catalyst line: first seen kept', rep('if (f && (!own(nextFp, f) || t < nextFp[f])) nextFp[f] = t;', 'if (f && !own(nextFp, f)) nextFp[f] = t;'), ['EC-15']],
  // two independent mechanisms make the output order-independent (evidence-key processing order and the total-order
  // tie-break); either alone suffices, so this negative removes both
  ['EC-N18 no ordering guarantee', s => rep('nextItems.slice().sort(function (a, b) { var x = evidenceKey(a), y = evidenceKey(b); return x < y ? -1 : (x > y ? 1 : 0); }).forEach(', 'nextItems.forEach(')(
    rep('  return tieKey(a) < tieKey(b) ? -1 : (tieKey(a) > tieKey(b) ? 1 : 0);\n', '  return 0;\n')(s)), ['EC-15']],
  ['EC-N19 re-reported upgrade shown again', rep('var verbRating = !eventKnown && (', 'var verbRating = ('), ['EC-16']],
  ['EC-N20 unknown currency on both sides not compared', rep('(pm.currency || null) === (nm.currency || null)', '!!pm.currency && pm.currency === nm.currency'), ['EC-17']],
  ['EC-N21 "|" join restored in the evidence key (rev 2)', rep("  return JSON.stringify([firmKey(a.firm), a.action, a.ratingAction, a.rating, a.date, a.target, a.targetFrom, a.targetAction]\n    .map(function (v) { return v === null || v === undefined ? '' : String(v); }));\n",
    "  return [firmKey(a.firm), a.action, a.ratingAction, a.rating, a.date, a.target, a.targetFrom, a.targetAction]\n    .map(function (v) { return v === null || v === undefined ? '' : String(v); }).join('|');\n"), ['EC-19']],
  ['EC-N22 "|" join restored in the event identity (rev 2)', rep("function analystIdentity(a) { return JSON.stringify([firmKey(a.firm), a.action || '', a.date || '']); }",
    "function analystIdentity(a) { return firmKey(a.firm) + '|' + (a.action || '') + '|' + (a.date || ''); }"), ['EC-19']],
];

(async () => {
  const main = await rows(load(SRC), SRC);
  let fails = 0;
  for (const [id, v] of Object.entries(main)) { if (v !== true) fails++; console.log((v === true ? '  PASS  ' : '  FAIL  ') + id + (v === true ? '' : '  ' + v)); }
  for (const [name, mutate, wantFail] of NEG) {
    let r;
    try { const ms = mutate(SRC); r = await rows(load(ms), ms, wantFail); } catch (e) { fails++; console.log('  FAIL  ' + name + ': ' + e.message); continue; }
    const caught = wantFail.every(w => r[w] !== true);
    if (!caught) fails++;
    console.log((caught ? '  PASS  ' : '  FAIL  ') + 'negative ' + name + ' -> ' + wantFail.join(', ') + ' fail' + (caught ? '' : '  (' + wantFail.map(w => w + '=' + (r[w] === true ? 'pass' : 'fail')).join(' ') + ')'));
  }
  console.log(fails ? 'EVIDENCE CHANGES OFFLINE: FAIL (' + fails + ')' : 'EVIDENCE CHANGES OFFLINE: PASS (' + Object.keys(main).length + ' rows, ' + NEG.length + ' negatives)');
  process.exitCode = fails ? 1 : 0;
})();
