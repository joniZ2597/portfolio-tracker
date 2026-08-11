'use strict';

/*
 * P-5 Research-on-Demand — Step 2 offline QA (context + packet + renderer).
 *
 * Pure Node, no network, no browser, no live services. Extracts the Step 2
 * functions plus their P-2B/P-3 dependency chain from index.html and runs
 * them in a sandbox with counterfeit localStorage (write-spy) and document
 * (tracked stub nodes; any surface beyond createElement throws). Covers the
 * 2026-08-11 owner rulings: A1 subtotal-extraction regression, A2 honest
 * market fields, A3 display-only baseline age, the truthful-synthesis
 * envelope, JSON-serializability of packets, renderer mount-scoping, and
 * read-only storage proof.
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
function approx(a, b, eps) {
  return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
}

function extractFunctionSource(content, name) {
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
  '_p5CollectLocalContext', '_p5PacketStatus', '_p5BuildPacket', '_p5RenderPacket'];
const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
// Auto-discover every PF_* constant the extracted sources reference
// (comment-stripped), so the sandbox can never silently miss one.
const strippedAll = FNS.map(function (n) { return src[n] || ''; }).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const VARS = Array.from(new Set(strippedAll.match(/\bPF_[A-Z0-9_]+\b/g) || [])).sort();
for (const n of VARS) { src[n] = extractVarSource(content, n); if (!src[n]) missingExtract.push('var ' + n); }
// loadHoldings assigns the module-global _pfRootCorrupted; give the sandbox
// its real declaration (value immaterial — loadHoldings reassigns it).
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

function buildApi(lsSeed, docBundle) {
  const body = VARS.map(n => src[n]).join('\n') + '\n' + FNS.map(n => src[n]).join('\n') +
    '\nreturn { ' + FNS.map(n => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'document', 'console', '"use strict";\n' + body);
  const ls = makeLs(lsSeed);
  const db = docBundle || makeDoc();
  const quietConsole = { log: function () {}, warn: function () {}, error: function () {} };
  return { api: factory(ls, db.doc, quietConsole), ls: ls, db: db };
}

const NOW_MS = Date.parse('2026-08-11T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }
function fxSeed(ageMs) {
  return JSON.stringify({
    rate: 3.0, effectiveAt: iso(NOW_MS - ageMs), source: 'boi',
    fetchedAt: iso(NOW_MS - ageMs), lastAttemptAt: iso(NOW_MS - ageMs), lastAttemptOk: true
  });
}
const HOLDINGS_SEED = JSON.stringify({
  AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
         manualPlPct: 11.1, baselineAt: iso(NOW_MS - 3 * DAY) },
  BBB: { symbol: 'BBB', positionSize: 2000, currency: 'ILS', costBasis: 1800,
         baselineAt: iso(NOW_MS - 10 * DAY) }
});
const CASH_SEED = JSON.stringify({ amountILS: 500, asOf: '2026-08-01' });
const EOD_SEED = JSON.stringify({
  AAA: { changePercent: 1.5 },
  BBB: { changePercent: -0.75, lastFailAt: iso(NOW_MS - DAY) }
});
const FULL_SEED = { pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(1 * DAY), pt_cash: CASH_SEED, pt_eod_cache: EOD_SEED };

// ── A1: subtotal extraction regression (old-loop equivalence) ────────────
(function () {
  const { api } = buildApi({});
  const holdings = {
    C1: { _corrupt: true },
    U1: { positionSize: 100, currency: 'USD' },
    U2: { positionSize: 250.5, currency: 'USD' },
    I1: { positionSize: 2000, currency: 'ILS' },
    X1: { positionSize: 50, currency: 'GBP' },
    Z1: { positionSize: 0, currency: 'USD' },
    Z2: { positionSize: -5, currency: 'ILS' },
    Z3: { positionSize: 'abc', currency: 'USD' }
  };
  // Hand-computed via the pre-extraction P-2B loop semantics:
  const out = api._pfComputeHoldingsSubtotals(holdings);
  check('A1 usdSubtotal', out.usdSubtotal === 350.5);
  check('A1 ilsSubtotal', out.ilsSubtotal === 2000);
  check('A1 unknownCurrencyCount', out.unknownCurrencyCount === 1);
  check('A1 hasCorrupt + corruptCount', out.hasCorrupt === true && out.corruptCount === 1);
  // Reporting fed by helper === reporting fed by manually-computed values
  const fxCache = JSON.parse(fxSeed(1 * DAY));
  const cash = { state: 'recorded', amountILS: 500, asOf: '2026-08-01' };
  const viaHelper = api._pfComputePortfolioReporting(out.usdSubtotal, out.ilsSubtotal,
    out.unknownCurrencyCount, out.hasCorrupt, out.corruptCount, cash, fxCache);
  const viaManual = api._pfComputePortfolioReporting(350.5, 2000, 1, true, 1, cash, fxCache);
  check('A1 reporting outputs identical via helper vs manual values',
    JSON.stringify(viaHelper) === JSON.stringify(viaManual));
  const empty = api._pfComputeHoldingsSubtotals({});
  check('A1 empty holdings -> zeros', empty.usdSubtotal === 0 && empty.ilsSubtotal === 0 &&
    empty.unknownCurrencyCount === 0 && empty.hasCorrupt === false && empty.corruptCount === 0);
})();

// ── CONTEXT: _p5CollectLocalContext ──────────────────────────────────────
(function () {
  const b = buildApi(FULL_SEED);
  const api = b.api, ls = b.ls;
  const before = ls._dump();
  check('cash fixture loads as recorded (fixture sanity)', api._pfCashLoad().state === 'recorded');

  const ctx = api._p5CollectLocalContext('aaa', NOW_MS);
  check('symbol normalized + found', ctx.symbol === 'AAA' && ctx.found === true && ctx.corrupt === false);
  check('holding fields carried, missing preserved', ctx.holding.positionSize === 1000 &&
    ctx.holding.currency === 'USD' && ctx.holding.costBasis === 900 && ctx.holding.costBasisILS === 2700);
  check('baselineAgeDays from injected clock (~3d)', approx(ctx.holding.baselineAgeDays, 3, 1e-6));
  check('pl is verbatim _pfHoldingPl output', ctx.pl !== null && typeof ctx.pl.eligibleForAggregation === 'boolean');
  check('market present, fresh, changePercent', ctx.market.present === true &&
    ctx.market.changePercent === 1.5 && ctx.market.eodStale === false);
  check('fx fresh at 1d with injected clock', ctx.fx.state === 'fresh' && ctx.fx.rate === 3.0);
  // Weight: total = 1000*3 + 2000 + 500 = 5500 ; AAA ILS value = 3000
  check('weight = 3000/5500 with null reason', approx(ctx.weight.pct, 3000 / 5500 * 100) && ctx.weight.unavailableReason === null);

  const ctxB = api._p5CollectLocalContext('BBB', NOW_MS);
  check('BBB eod stale via lastFailAt marker (clock-independent)', ctxB.market.eodStale === true);
  check('BBB baseline age ~10d', approx(ctxB.holding.baselineAgeDays, 10, 1e-6));
  check('BBB weight = 2000/5500', approx(ctxB.weight.pct, 2000 / 5500 * 100));

  const ctxMissing = api._p5CollectLocalContext('ZZZ', NOW_MS);
  check('not-found: found=false, holding/pl null', ctxMissing.found === false &&
    ctxMissing.holding === null && ctxMissing.pl === null);

  const ctxNoClock = api._p5CollectLocalContext('AAA');
  check('no injected clock -> baselineAgeDays null (display-only, never guessed)',
    ctxNoClock.holding.baselineAgeDays === null);

  // Consistency with loadHoldings' own corruption verdict (no normalizer guessing)
  const holdingsView = api.loadHoldings();
  check('found/corrupt consistent with loadHoldings', (('AAA' in holdingsView) === true) &&
    (ctx.corrupt === (holdingsView.AAA._corrupt === true)));

  check('read-only: zero storage writes', ls._writes.length === 0);
  check('read-only: pt_* byte-identical', ls._dump() === before);

  // FX tiers + weight unavailability
  const agedB = buildApi({ pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(4 * DAY), pt_cash: CASH_SEED, pt_eod_cache: EOD_SEED });
  check('fx aged-but-valid at 4d', agedB.api._p5CollectLocalContext('AAA', NOW_MS).fx.state === 'aged-but-valid');
  const staleB = buildApi({ pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(10 * DAY), pt_cash: CASH_SEED, pt_eod_cache: EOD_SEED });
  const staleCtx = staleB.api._p5CollectLocalContext('AAA', NOW_MS);
  check('fx stale-invalid at 10d', staleCtx.fx.state === 'stale-invalid');
  check('stale fx -> weight reporting-incomplete', staleCtx.weight.pct === null &&
    staleCtx.weight.unavailableReason === 'reporting-incomplete');
  const noFxB = buildApi({ pt_holdings: HOLDINGS_SEED, pt_cash: CASH_SEED, pt_eod_cache: EOD_SEED });
  check('fx missing when absent', noFxB.api._p5CollectLocalContext('AAA', NOW_MS).fx.state === 'missing');
  const noCashB = buildApi({ pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(1 * DAY), pt_eod_cache: EOD_SEED });
  const noCashCtx = noCashB.api._p5CollectLocalContext('AAA', NOW_MS);
  check('no cash -> weight reporting-incomplete', noCashCtx.weight.pct === null &&
    noCashCtx.weight.unavailableReason === 'reporting-incomplete');
  const noEodB = buildApi({ pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(1 * DAY), pt_cash: CASH_SEED });
  const noEodCtx = noEodB.api._p5CollectLocalContext('AAA', NOW_MS);
  check('absent eod entry -> present:false, nulls (A2: nothing inferred)',
    noEodCtx.market.present === false && noEodCtx.market.changePercent === null && noEodCtx.market.eodStale === null);
})();

// ── PACKET: _p5BuildPacket + _p5PacketStatus (truthful synthesis) ────────
(function () {
  const b = buildApi(FULL_SEED);
  const api = b.api;
  const ASOF = '2026-08-11T12:34:56.000Z';
  const ctx = api._p5CollectLocalContext('AAA', NOW_MS);

  const local = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: null, synthesis: null });
  check('asOf echoed verbatim', local.asOf === ASOF);
  check('step-2 packet news queued (ratified vocabulary)', local.sections.news.state === 'queued');
  check('step-2 packet synthesis pending', local.sections.synthesis.state === 'pending');
  check('step-2 packet status partial', local.status === 'partial');
  check('top-level keys explicit', 'asOf' in local && 'sections' in local && 'counts' in local && 'status' in local);

  const notFound = api._p5BuildPacket({ asOf: ASOF, context: api._p5CollectLocalContext('ZZZ', NOW_MS), news: null, synthesis: null });
  check('context not found -> status failed', notFound.status === 'failed');

  // Chained through the REAL Step 1 validator
  const searchResults = [{ title: 'Item A', url: 'https://ex.com/a', date: '2026-08-10' }];
  const validated = api._p5ValidateItems([{ sourceUrl: 'https://ex.com/a', summary: 'S.' }],
    api._p5IndexSearchResults(searchResults));
  const newsDone = { state: 'done', reason: null, accepted: validated.accepted, rejected: validated.rejected, counts: validated.counts };

  const complete = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: newsDone, synthesis: { text: '  Derived summary.  ' } });
  check('valid chain -> synthesis done + trimmed text + derived flag',
    complete.sections.synthesis.state === 'done' && complete.sections.synthesis.text === 'Derived summary.' &&
    complete.sections.synthesis.derivedFromAccepted === true);
  check('valid chain -> status complete', complete.status === 'complete');

  const newsFailed = { state: 'failed', reason: 'provider-error', accepted: [], rejected: [], counts: null };
  const failedNoSynth = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: newsFailed, synthesis: null });
  check('news failed + no synthesis -> suppressed news-failed (never pending)',
    failedNoSynth.sections.synthesis.state === 'suppressed' && failedNoSynth.sections.synthesis.reason === 'news-failed');
  check('news failed -> status partial', failedNoSynth.status === 'partial');
  const failedWithSynth = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: newsFailed, synthesis: { text: 'X' } });
  check('news failed + provided synthesis -> suppressed + discarded flag',
    failedWithSynth.sections.synthesis.state === 'suppressed' && failedWithSynth.discardedProvidedSynthesis === true);

  const zeroValidated = api._p5ValidateItems([{ sourceUrl: 'https://ex.com/nope', summary: 'S.' }],
    api._p5IndexSearchResults(searchResults));
  const newsZero = { state: 'done', reason: null, accepted: zeroValidated.accepted, rejected: zeroValidated.rejected, counts: zeroValidated.counts };
  const zeroPk = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: newsZero, synthesis: { text: 'X' } });
  check('news done + zero accepted -> suppressed zero-accepted-evidence + discarded',
    zeroPk.sections.synthesis.state === 'suppressed' && zeroPk.sections.synthesis.reason === 'zero-accepted-evidence' &&
    zeroPk.discardedProvidedSynthesis === true && zeroPk.status === 'partial');

  for (const badText of [null, '', '   ']) {
    const pk = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: newsDone, synthesis: { text: badText } });
    check('empty synthesis text (' + JSON.stringify(badText) + ') -> suppressed empty-synthesis-text, partial',
      pk.sections.synthesis.state === 'suppressed' && pk.sections.synthesis.reason === 'empty-synthesis-text' &&
      pk.discardedProvidedSynthesis === true && pk.status === 'partial');
  }

  const queuedWithSynth = api._p5BuildPacket({ asOf: ASOF, context: ctx, news: null, synthesis: { text: 'X' } });
  check('provided synthesis while news queued -> suppressed news-not-ok',
    queuedWithSynth.sections.synthesis.state === 'suppressed' && queuedWithSynth.sections.synthesis.reason === 'news-not-ok');

  // Status independently enforces usable text on a forged packet
  const forged = JSON.parse(JSON.stringify(complete));
  forged.sections.synthesis.text = '   ';
  check('forged done-state with empty text -> status partial', api._p5PacketStatus(forged) === 'partial');

  // No direction/thesis semantics anywhere
  function keyScan(obj, hits) {
    hits = hits || [];
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        // 'synthesis' is a legitimate ratified section name — the forbidden
        // semantic is a standalone 'thesis'/direction/verdict-style key.
        if (k.toLowerCase() === 'thesis' || /direction|buy|sell|score|rating|confidence/i.test(k)) hits.push(k);
        keyScan(obj[k], hits);
      }
    }
    return hits;
  }
  check('no direction/thesis/score keys in packets', keyScan(complete).length === 0 && keyScan(local).length === 0);
})();

// ── SERIAL: plain-data packet pin + determinism ──────────────────────────
(function () {
  const b = buildApi(FULL_SEED);
  const api = b.api;
  const ASOF = '2026-08-11T12:34:56.000Z';
  const mk = function () {
    return api._p5BuildPacket({ asOf: ASOF, context: api._p5CollectLocalContext('AAA', NOW_MS), news: null, synthesis: null });
  };
  const p1 = mk();
  const s1 = JSON.stringify(p1);
  const round = JSON.parse(s1);
  check('JSON round-trip stable', JSON.stringify(round) === s1);
  let fnCount = 0, domCount = 0;
  (function walk(o) {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'function') fnCount += 1;
        if (k === '_tag' || k === 'appendChild') domCount += 1;
        walk(o[k]);
      }
    }
  })(p1);
  check('zero function-typed values in packet', fnCount === 0);
  check('zero DOM/stub handles in packet', domCount === 0);
  check('triple serialization byte-identical', JSON.stringify(mk()) === s1 && JSON.stringify(mk()) === s1);
})();

// ── RENDERER: mount scoping + counterfeit document ───────────────────────
(function () {
  const db = makeDoc();
  const b = buildApi(FULL_SEED, db);
  const api = b.api;
  const packet = api._p5BuildPacket({ asOf: '2026-08-11T12:34:56.000Z', context: api._p5CollectLocalContext('AAA', NOW_MS), news: null, synthesis: null });
  const preCreated = db.created.length;
  const mount = db.mkNode('div');
  let threw = null;
  try { api._p5RenderPacket(packet, mount); } catch (e) { threw = e.message; }
  check('renderer ran without touching forbidden document surface', threw === null);
  const inTree = new Set();
  (function walk(n) { inTree.add(n); for (const c of n.children) walk(c); })(mount);
  const rendered = db.created.slice(preCreated + 1); // exclude the mount itself
  check('renderer created nodes', rendered.length > 0);
  check('every created node reachable from mountEl only', rendered.every(function (n) { return inTree.has(n); }));
  const texts = rendered.map(function (n) { return n.textContent; }).join('|');
  check('A2 honesty rendered: close/session-date explicitly unavailable',
    texts.indexOf('not available locally') !== -1);
  check('four sections present', rendered.some(function (n) { return n.className === 'p5-section-market'; }) &&
    rendered.some(function (n) { return n.className === 'p5-section-portfolio'; }) &&
    rendered.some(function (n) { return n.className === 'p5-section-news'; }) &&
    rendered.some(function (n) { return n.className === 'p5-section-synthesis'; }));
  // Re-render clears the mount (idempotent shell)
  api._p5RenderPacket(packet, mount);
  check('re-render leaves a single packet root under mount', mount.children.length === 1);
})();

// ── SCANS: forbidden tokens with positive controls ───────────────────────
(function () {
  function stripped(name) {
    return src[name].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }
  const pureSrc = [stripped('_p5BuildPacket'), stripped('_p5PacketStatus')].join('\n');
  const pureForbidden = [/\bfetch\s*\(/, /localStorage/, /document\./, /Date\.now/, /Math\.random/, /new Date\s*\(/];
  const control = 'fetch( localStorage document.x Date.now Math.random new Date(';
  for (const pat of pureForbidden) {
    check('positive control fires: ' + pat.source, pat.test(control));
    check('packet/status pure of ' + pat.source, !pat.test(pureSrc));
  }
  const rendererSrc = stripped('_p5RenderPacket');
  const rForbidden = [/innerHTML/, /getElementById/, /querySelector/, /\bfetch\s*\(/, /localStorage/, /Date\.now/];
  const rControl = 'innerHTML getElementById querySelector fetch( localStorage Date.now';
  for (const pat of rForbidden) {
    check('positive control fires (renderer): ' + pat.source, pat.test(rControl));
    check('renderer clean of ' + pat.source, !pat.test(rendererSrc));
  }
  const collectorSrc = stripped('_p5CollectLocalContext');
  const cForbidden = [/\bfetch\s*\(/, /Date\.now/, /Math\.random/, /setItem/, /removeItem/, /document\./];
  const cControl = 'fetch( Date.now Math.random setItem removeItem document.x';
  for (const pat of cForbidden) {
    check('positive control fires (collector): ' + pat.source, pat.test(cControl));
    check('collector clean of ' + pat.source, !pat.test(collectorSrc));
  }
})();

console.log(failures === 0
  ? 'P5 PACKET: PASS (' + asserts + ' asserts)'
  : 'P5 PACKET: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
