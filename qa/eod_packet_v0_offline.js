'use strict';

/*
 * WU-EOD-V0 / EODV0-IMPL — EOD-1 Portfolio Intelligence Packet v0 offline QA.
 *
 * Pure Node, no network, no browser, no live services. Extracts the EOD
 * aggregator/Markdown-projection functions plus their P5/P-2B/P-4A dependency
 * chain from index.html and runs them in a sandbox with counterfeit
 * localStorage (write-spy) and document, following the exact pattern
 * qa/p5_packet_offline.js already uses. Proves the seventeen acceptance
 * criteria of the ratified contract (.ai-reports/handoffs/2026-08-12_eod-1-
 * portfolio-intelligence-packet-v0.COWORK.md §9 — the section is numbered
 * 1-17; the frozen r4 plan's "sixteen" prose label is a clerical mismatch
 * against that source, not a narrower requirement set — all 17 are proven
 * here) against the real production implementation, never a second one.
 *
 * Violable-invariant classification (governs which criteria carry a
 * {mutation, oracle, expected failure} planted negative against the
 * EXTRACTED PRODUCTION SOURCE, per S11 — never a test-local reimplementation):
 *   AC3, AC6, AC7, AC9, AC10, AC15, AC16 — genuinely EOD-authored branches
 *   that could silently regress; each gets a mutation below.
 *   AC1, AC2, AC5, AC8, AC11, AC12, AC13, AC14, AC17 — either (a) directly
 *   read a real computed value with no separate branch that could silently
 *   diverge (AC1 identity check, AC5 presence, AC8/AC13/AC14 structural
 *   scans), or (b) exercise an EXISTING pinned function reused verbatim
 *   (AC2's P5 field names via _p5ValidateItems, AC12's _pfComputeReconciliation/
 *   _pfReconLoad, AC17's markdown-from-JSON purity) whose own regression
 *   protection already lives in qa/p5_packet_offline.js and this file's own
 *   structural scans — a second mutation harness on a function this suite
 *   does not author would not prove anything EOD-specific.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  '_pfReconLoad', '_pfComputeReconciliation', '_pfComputeNeedsAttention',
  '_p5NormalizeUrl', '_p5DomainFromUrl', '_p5UsableTitle', '_p5UsableDate',
  '_p5IndexSearchResults', '_p5ValidateItems', '_p5SynthesisPayload',
  '_p5PreloadContext', '_p5BuildLocalContext', '_p5CollectLocalContext', '_p5PacketStatus', '_p5BuildPacket',
  '_eodSnapshotPackets', '_eodReconciliationLimitationText', '_eodBuildPacket', '_eodPacketToMarkdown',
  '_eodPacketToBriefing'];
const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
// Auto-discover every PF_* constant the extracted sources reference
// (comment-stripped), so the sandbox can never silently miss one.
const strippedAll = FNS.map(function (n) { return src[n] || ''; }).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const VARS = Array.from(new Set(strippedAll.match(/\bPF_[A-Z0-9_]+\b/g) || [])).sort();
for (const n of VARS) { src[n] = extractVarSource(content, n); if (!src[n]) missingExtract.push('var ' + n); }
src._pfRootCorrupted = extractVarSource(content, '_pfRootCorrupted') || 'var _pfRootCorrupted = false;';
VARS.push('_pfRootCorrupted');
// _eodSnapshotPackets reads the session-scoped research globals directly —
// give the sandbox their real declarations; the fixtures below reassign them.
src._p5Displayed = extractVarSource(content, '_p5Displayed') || 'var _p5Displayed = {};';
src._p5LastRun = extractVarSource(content, '_p5LastRun') || 'var _p5LastRun = {};';
VARS.push('_p5Displayed', '_p5LastRun');
// NC-M1: the briefing projector's own wording table + frozen prompt constant.
src.NC_BRIEFING_VOCAB = extractVarSource(content, 'NC_BRIEFING_VOCAB');
if (!src.NC_BRIEFING_VOCAB) missingExtract.push('NC_BRIEFING_VOCAB');
src.NOTEBOOK_BRIEFING_PROMPT = extractVarSource(content, 'NOTEBOOK_BRIEFING_PROMPT');
if (!src.NOTEBOOK_BRIEFING_PROMPT) missingExtract.push('NOTEBOOK_BRIEFING_PROMPT');
VARS.push('NC_BRIEFING_VOCAB', 'NOTEBOOK_BRIEFING_PROMPT');
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
  function mkNode(tag) {
    return { _tag: tag, className: '', textContent: '', children: [],
      appendChild: function (c) { this.children.push(c); return c; } };
  }
  const raw = { createElement: function (t) { return mkNode(t); } };
  const doc = new Proxy(raw, {
    get: function (t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      throw new Error('document.' + String(k) + ' touched');
    }
  });
  return { doc: doc };
}

// Assembles the sandbox body from the extracted PRODUCTION sources. Accepts
// an optional `patchSrc: { fnName: (originalFnSource) => mutatedFnSource }`
// so a planted-negative mutation is applied to ONE NAMED function's own
// extracted source string, never to the whole concatenated body — several
// functions share identical statement text (e.g. both _p5BuildLocalContext
// and _eodBuildPacket declare `var holdings = preload.holdings;`), so a
// whole-body string replace can silently patch the wrong function. Scoping
// the mutation to the named function's source is what makes the failure
// path provably run through the intended production code (S11), not
// whichever function happens to contain a matching substring first.
function buildApi(lsSeed, opts) {
  opts = opts || {};
  const localSrc = Object.assign({}, src);
  if (opts.patchSrc) {
    for (const fnName of Object.keys(opts.patchSrc)) {
      localSrc[fnName] = opts.patchSrc[fnName](localSrc[fnName]);
    }
  }
  var body = VARS.map(n => localSrc[n]).join('\n') + '\n' + FNS.map(n => localSrc[n]).join('\n') +
    '\n_p5Displayed = ' + JSON.stringify(opts.displayed || {}) + ';' +
    '\n_p5LastRun = ' + JSON.stringify(opts.lastRun || {}) + ';' +
    '\nreturn { ' + FNS.map(n => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'document', 'console', '"use strict";\n' + body);
  const ls = makeLs(lsSeed);
  const db = makeDoc();
  const quietConsole = { log: function () {}, warn: function () {}, error: function () {} };
  return { api: factory(ls, db.doc, quietConsole), ls: ls };
}

const NOW_MS = Date.parse('2026-09-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }
function fxSeed(ageMs) {
  return JSON.stringify({ rate: 3.0, effectiveAt: iso(NOW_MS - ageMs), source: 'boi',
    fetchedAt: iso(NOW_MS - ageMs), lastAttemptAt: iso(NOW_MS - ageMs), lastAttemptOk: true });
}
const HOLDINGS_SEED_OBJ = {
  AAA: { symbol: 'AAA', positionSize: 1000, currency: 'USD', costBasis: 900, costBasisILS: 2700,
         manualPlPct: 11.1, baselineAt: iso(NOW_MS - 3 * DAY), updatedAt: iso(NOW_MS - 3 * DAY) },
  BBB: { symbol: 'BBB', positionSize: 2000, currency: 'ILS', costBasis: 1800,
         baselineAt: iso(NOW_MS - 10 * DAY) },
  CCC: { symbol: 'CCC', positionSize: 500, currency: 'USD', costBasis: 400,
         baselineAt: iso(NOW_MS - 1 * DAY) }
};
const HOLDINGS_SEED = JSON.stringify(HOLDINGS_SEED_OBJ);
const CASH_SEED = JSON.stringify({ amountILS: 500, asOf: '2026-09-01' });
const EOD_SEED = JSON.stringify({ AAA: { changePercent: 1.5 }, BBB: { changePercent: -0.75 } });
const FULL_SEED = { pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(1 * DAY), pt_cash: CASH_SEED, pt_eod_cache: EOD_SEED };

// Builds a real P5 packet via the production validator/builder chain — never
// a hand-authored one (S11). `items` are raw model-shaped {sourceUrl,summary}.
function buildRealPacket(api, symbol, nowMs, items, synthText) {
  const ctx = api._p5CollectLocalContext(symbol, nowMs);
  const searchResults = items.map(function (it, i) {
    return { title: it.title || ('Title ' + i), url: it.sourceUrl, date: it.date || '2026-09-10',
      publisher: it.publisher };
  });
  const validated = api._p5ValidateItems(items, api._p5IndexSearchResults(searchResults));
  const news = { state: 'done', reason: null, accepted: validated.accepted, rejected: validated.rejected, counts: validated.counts };
  return api._p5BuildPacket({ asOf: iso(nowMs), context: ctx, news: news,
    synthesis: synthText ? { text: synthText } : null });
}
function buildFailedPacket(api, symbol, nowMs) {
  const ctx = api._p5CollectLocalContext(symbol, nowMs);
  const news = { state: 'failed', reason: 'provider-error', accepted: [], rejected: [], counts: null };
  return api._p5BuildPacket({ asOf: iso(nowMs), context: ctx, news: news, synthesis: null });
}
function buildPacket(api) {
  const preload = api._p5PreloadContext(NOW_MS);
  const symbols = Object.keys(preload.holdings);
  return api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
    packetsBySymbol: api._eodSnapshotPackets(symbols), preload: preload, reconState: api._pfReconLoad() });
}

function forbiddenKeyScan(obj) {
  const FORBIDDEN = ['score', 'rating', 'ranking', 'tier', 'confidence', 'conviction',
    'recommendation', 'action', 'targetPrice', 'direction', 'buy', 'sell', 'thesis'];
  const hits = [];
  (function walk(o) {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (FORBIDDEN.indexOf(k) !== -1) hits.push(k);
        walk(o[k]);
      }
    }
  })(obj);
  return hits;
}

// ═══ Fixture: 3 holdings, mixed coverage ════════════════════════════════
// AAA — researched, one accepted item.
// BBB — researched, shares a normUrl with AAA under a differing title (source conflict).
// CCC — not researched (no _p5Displayed/_p5LastRun entry at all).
let AAA_PACKET, BBB_PACKET, MAIN_PACKET;
(function EOD_MAIN() {
  const seedApi = buildApi(FULL_SEED).api;
  const aaaPacket = buildRealPacket(seedApi, 'AAA', NOW_MS,
    [{ sourceUrl: 'https://ex.com/shared', summary: 'S1.', title: 'AAA Shared Title' },
     { sourceUrl: 'https://ex.com/only-aaa', summary: 'S2.' }],
    'AAA synthesis text.');
  // BBB's shared-URL item carries a DIFFERENT title than AAA's — the same
  // normUrl with genuinely conflicting metadata (§4), which is what makes
  // the dedup-conflict path (AC6) and the sort-mutation negative (AC6/AC7)
  // observable at all.
  const bbbPacket = buildRealPacket(seedApi, 'BBB', NOW_MS,
    [{ sourceUrl: 'https://ex.com/shared', summary: 'S3.', title: 'BBB Shared Title' }]);
  AAA_PACKET = aaaPacket; BBB_PACKET = bbbPacket;

  const b = buildApi(FULL_SEED, { displayed: { AAA: aaaPacket, BBB: bbbPacket } });
  const api = b.api, ls = b.ls;
  const before = ls._dump();

  const preload = api._p5PreloadContext(NOW_MS);
  const packetsBySymbol = api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']);
  // Reference identity (===) is not observable across the sandbox boundary —
  // fixtures are seeded into the sandbox via JSON.stringify (see buildApi),
  // so _p5Displayed inside the sandbox is a structurally-equal, not
  // reference-equal, copy of the outer aaaPacket/bbbPacket. Deep equality is
  // the correct — and sufficient — proof that the snapshot embeds the real
  // packet rather than rebuilding one.
  check('sanity: snapshot embeds the exact same packet (deep-equal, no clone/rebuild)',
    JSON.stringify(packetsBySymbol.AAA) === JSON.stringify(aaaPacket) &&
    JSON.stringify(packetsBySymbol.BBB) === JSON.stringify(bbbPacket) &&
    packetsBySymbol.CCC === null);

  const packet = api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: packetsBySymbol,
    preload: preload, reconState: api._pfReconLoad() });
  MAIN_PACKET = packet;

  // ── AC1: per-ticker brief is the P5 packet embedded unmodified ──────────
  const aaaOut = packet.holdings.find(function (h) { return h.symbol === 'AAA'; });
  check('AC1: embedded AAA packet byte-identical to source',
    JSON.stringify(aaaOut.research.packet) === JSON.stringify(aaaPacket));

  // ── AC2: accepted-item fields verbatim, no rename/add/omit ──────────────
  const acceptedKeys = ['inputIndex', 'url', 'normUrl', 'title', 'date', 'publisher', 'summary', 'summaryOrigin'];
  const item0 = aaaOut.research.packet.sections.news.accepted[0];
  check('AC2: accepted-item keys exactly the eight verbatim P5 names',
    JSON.stringify(Object.keys(item0).sort()) === JSON.stringify(acceptedKeys.slice().sort()));

  // ── AC3: eight counts present, each equal to the sum of the verbatim
  // per-ticker counts (structural — direct sum comparison for all 8 fields;
  // the load-bearing planted negative is in EOD_PLANTED_NEGATIVES below). ──
  const COUNT_FIELDS = ['returned', 'accepted', 'rejectedMalformed', 'rejectedUnmatched',
    'rejectedDuplicate', 'rejectedMissingDate', 'rejectedMissingTitle', 'searchResultsCount'];
  check('AC3: all eight count keys present', COUNT_FIELDS.every(function (k) { return typeof packet.counts[k] === 'number'; }));
  COUNT_FIELDS.forEach(function (field) {
    const expected = (aaaPacket.counts[field] || 0) + (bbbPacket.counts[field] || 0);
    check('AC3: counts.' + field + ' = sum of per-ticker ' + field + ' (' + expected + ')', packet.counts[field] === expected);
  });

  // ── AC4: direction appears nowhere (subsumed by the AC15 forbidden scan
  // below — direction is one of the 13 forbidden keys) ────────────────────
  check('AC4: no "direction" key at any depth', forbiddenKeyScan(packet).indexOf('direction') === -1);

  // ── AC5: uniqueSources / totalAttributions present, never conflated ─────
  check('AC5: uniqueSources < totalAttributions (shared source across 2 holdings)',
    packet.uniqueSources === 2 && packet.totalAttributions === 3 && packet.uniqueSources !== packet.totalAttributions);

  // ── AC6: dedup only on exact normUrl; conflict -> one entry + limitation ──
  const sharedSource = packet.sources.find(function (s) { return s.normUrl.indexOf('shared') !== -1; });
  check('AC6: exactly one sources[] entry for the shared normUrl', !!sharedSource);
  check('AC6: shared entry attributes to both AAA and BBB', JSON.stringify(sharedSource.tickerAttribution) === JSON.stringify(['AAA', 'BBB']));
  check('AC6: conflict recorded as a limitation naming the normUrl',
    packet.limitations.some(function (l) { return l.code.indexOf('source-conflict') === 0 && l.text.indexOf(sharedSource.normUrl) !== -1; }));

  // ── AC7: two runs over identical input -> identical winners + byte-identical Markdown ──
  const packet2 = api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: packetsBySymbol,
    preload: preload, reconState: api._pfReconLoad() });
  check('AC7: two builds over identical input -> byte-identical JSON', JSON.stringify(packet) === JSON.stringify(packet2));
  const md1 = api._eodPacketToMarkdown(packet), md2 = api._eodPacketToMarkdown(packet2);
  check('AC7: byte-identical Markdown', md1 === md2);

  // ── AC8: all freshness/staleness derive from the single injected clock ──
  check('AC8: fx.state derived from the injected nowMs (fresh at 1 day)', packet.portfolio.fx.state === 'fresh');
  check('AC8: no Date.now()/new Date() call inside the pure aggregator (structural)',
    !/Date\.now|new Date\s*\(/.test(src._eodBuildPacket.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));

  // ── AC10: every limitations[] entry renders as prose before per-ticker sections ──
  const md = md1;
  const limitHeaderIdx = md.indexOf('## Limitations');
  const holdingsHeaderIdx = md.indexOf('## Holdings');
  check('AC10: Limitations section precedes Holdings section', limitHeaderIdx !== -1 && holdingsHeaderIdx !== -1 && limitHeaderIdx < holdingsHeaderIdx);
  check('AC10: every limitation text appears in the Markdown before Holdings',
    packet.limitations.every(function (l) { const i = md.indexOf(l.text); return i !== -1 && i < holdingsHeaderIdx; }));

  // ── AC11: any holding unresearched/failed/zero-accepted => packet partial ──
  check('AC11: CCC not researched -> packet.status partial', packet.status === 'partial');
  const cccOut = packet.holdings.find(function (h) { return h.symbol === 'CCC'; });
  check('AC11: CCC coverage = not-researched, no embedded packet', cccOut.research.coverage === 'not-researched' && cccOut.research.packet === null);
  check('AC11: coverage limitation names CCC', packet.limitations.some(function (l) { return l.code === 'coverage' && l.text.indexOf('CCC') !== -1; }));

  // ── AC12: reconciliation rendered from runtime state; "not recorded" only when unset ──
  check('AC12: no pt_recon written -> reconciliation.status unset', packet.portfolio.reconciliation.status === 'unset');
  check('AC12: unset reconciliation renders "not recorded"',
    packet.limitations.some(function (l) { return l.code === 'reconciliation' && l.text.indexOf('not recorded') !== -1; }));

  // ── AC13: only the ratified projection + EOD-derived fields; no markers ──
  const HOLDING_PROJECTION_KEYS = ['symbol', 'positionSize', 'currency', 'costBasis', 'costBasisILS',
    'manualPlPct', 'baselineAt', 'updatedAt', 'eod', 'research'];
  check('AC13: holding output carries exactly the projection + eod/research keys, no more',
    packet.holdings.every(function (h) { return JSON.stringify(Object.keys(h).sort()) === JSON.stringify(HOLDING_PROJECTION_KEYS.slice().sort()); }));
  check('AC13: no "source" key on any holding', packet.holdings.every(function (h) { return !('source' in h); }));
  check('AC13: no internal marker anywhere in the artifact',
    JSON.stringify(packet).indexOf('_legacyFields') === -1 && JSON.stringify(packet).indexOf('_corrupt') === -1 &&
    JSON.stringify(packet).indexOf('_issues') === -1);

  // ── AC14: non-computable figures are null with a named reason. In THIS
  // fixture every holding's weight is genuinely computable (valid currency,
  // recorded cash, fresh FX) — CCC's "not researched" coverage is orthogonal
  // to weight availability, so it is the wrong holding to assert this on.
  // The real dedicated fixture is EOD_WEIGHT_UNAVAILABLE below, which forces
  // a genuine non-computable case through the real production path. ──────

  // ── AC15: no forbidden key at any depth in real production output; round-
  // trip stable; no functions/DOM. The load-bearing planted negative (a
  // mutation of the extracted production source, not a clone) is in
  // EOD_PLANTED_NEGATIVES below. ──────────────────────────────────────────
  check('AC15: real output has zero forbidden keys', forbiddenKeyScan(packet).length === 0);
  const roundTripped = JSON.parse(JSON.stringify(packet));
  check('AC15: JSON.parse(JSON.stringify(x)) unchanged', JSON.stringify(roundTripped) === JSON.stringify(packet));
  let fnCount = 0;
  (function walk(o) { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (typeof o[k] === 'function') fnCount += 1; walk(o[k]); } })(packet);
  check('AC15: zero function-typed values in packet', fnCount === 0);

  // ── AC16: no pt_* key created/written; existing bytes unchanged ─────────
  api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: packetsBySymbol, preload: preload, reconState: api._pfReconLoad() });
  api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: packetsBySymbol, preload: preload, reconState: api._pfReconLoad() });
  check('AC16: zero localStorage writes across 3 generations', ls._writes.length === 0);
  check('AC16: pt_* bytes byte-identical before/after', ls._dump() === before);

  // ── AC17: Markdown reproducible from the JSON alone, no additional input ──
  const mdFromJsonOnly = api._eodPacketToMarkdown(JSON.parse(JSON.stringify(packet)));
  check('AC17: Markdown built from a plain JSON round-trip matches the original', mdFromJsonOnly === md);
  check('AC17: _eodPacketToMarkdown source touches no storage/clock (structural)',
    !/localStorage|Date\.now|fetch\s*\(/.test(src._eodPacketToMarkdown.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
})();

// ═══ Failed / zero-accepted coverage classification ═════════════════════
(function EOD_COVERAGE_VARIANTS() {
  const seedApi = buildApi(FULL_SEED).api;
  const failedPacket = buildFailedPacket(seedApi, 'AAA', NOW_MS);
  // buildRealPacket derives searchResults FROM items (1:1), so it can never
  // produce a genuine unmatched item — searchResults must be authored
  // independently of items to exercise the real "no match" validator path.
  const bbbCtx = seedApi._p5CollectLocalContext('BBB', NOW_MS);
  const mismatchedSearchResults = [{ title: 'Unrelated Item', url: 'https://ex.com/completely-different', date: '2026-09-10' }];
  const zeroValidated = seedApi._p5ValidateItems(
    [{ sourceUrl: 'https://ex.com/no-match', summary: 'S.' }],
    seedApi._p5IndexSearchResults(mismatchedSearchResults));
  const zeroNews = { state: 'done', reason: null, accepted: zeroValidated.accepted, rejected: zeroValidated.rejected, counts: zeroValidated.counts };
  const zeroPacket = seedApi._p5BuildPacket({ asOf: iso(NOW_MS), context: bbbCtx, news: zeroNews, synthesis: null });
  // The validator rejects an item whose sourceUrl doesn't match any search
  // result, so `zeroPacket` genuinely has zero accepted items (done, 0 accepted).
  check('fixture sanity: zero-accepted packet really has 0 accepted', zeroPacket.counts.accepted === 0 && zeroPacket.sections.news.state === 'done');

  const b = buildApi(FULL_SEED, { lastRun: { AAA: failedPacket, BBB: zeroPacket } });
  const api = b.api;
  const preload = api._p5PreloadContext(NOW_MS);
  const packetsBySymbol = api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']);
  const packet = api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: packetsBySymbol,
    preload: preload, reconState: api._pfReconLoad() });

  const aaaOut = packet.holdings.find(function (h) { return h.symbol === 'AAA'; });
  const bbbOut = packet.holdings.find(function (h) { return h.symbol === 'BBB'; });
  check('coverage: failed news -> coverage "failed"', aaaOut.research.coverage === 'failed');
  check('coverage: news done, 0 accepted -> coverage "zero-accepted"', bbbOut.research.coverage === 'zero-accepted');
  check('a failed/zero-accepted attempt is still embedded verbatim (AC1 applies to _p5LastRun too)',
    JSON.stringify(aaaOut.research.packet) === JSON.stringify(failedPacket) &&
    JSON.stringify(bbbOut.research.packet) === JSON.stringify(zeroPacket));
  check('news-failed limitation names AAA', packet.limitations.some(function (l) { return l.code === 'news-failed' && l.text.indexOf('AAA') !== -1; }));
  check('zero-accepted limitation names BBB', packet.limitations.some(function (l) { return l.code === 'zero-accepted' && l.text.indexOf('BBB') !== -1; }));

  // Synthesis suppression reasons render by name, never collapsed (Amendment 1)
  check('synthesis limitation names the exact suppression reason for the failed packet',
    packet.limitations.some(function (l) { return l.code === 'synthesis:AAA' && l.text.indexOf('suppressed — news-failed') !== -1; }));
})();

// ═══ AC14: a genuinely non-computable weight, through the real production
// path — no test-local reimplementation of the weight/reporting logic. ════
// Cash is deliberately UNSET here (pt_cash omitted): _pfComputePortfolioReporting
// then returns completeness:false for every holding, so _p5BuildLocalContext's
// real "if (!reporting.completeness) ctx.weight.unavailableReason =
// 'reporting-incomplete'" branch fires — the exact production code path,
// not a QA-authored substitute.
(function EOD_WEIGHT_UNAVAILABLE() {
  const seed = { pt_holdings: HOLDINGS_SEED, pt_fx: fxSeed(1 * DAY) }; // no pt_cash
  const b = buildApi(seed, { displayed: {} });
  const api = b.api;
  const preload = api._p5PreloadContext(NOW_MS);
  check('fixture sanity: no cash recorded -> reporting genuinely incomplete',
    preload.reporting.completeness === false);
  const packet = api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
    packetsBySymbol: api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']), preload: preload, reconState: api._pfReconLoad() });
  const aaaOut = packet.holdings.find(function (h) { return h.symbol === 'AAA'; });
  check('AC14: weight.pct is exactly null (not 0, not "—", not omitted)',
    aaaOut.eod.weight.pct === null && aaaOut.eod.weight.pct !== 0 && aaaOut.eod.weight.pct !== '—' &&
    'pct' in aaaOut.eod.weight);
  check('AC14: unavailableReason is a present, non-empty, named reason',
    typeof aaaOut.eod.weight.unavailableReason === 'string' && aaaOut.eod.weight.unavailableReason.length > 0 &&
    aaaOut.eod.weight.unavailableReason === 'reporting-incomplete');
  check('AC14: same null/named-reason pattern holds for every holding, not just one',
    packet.holdings.every(function (h) { return h.eod.weight.pct === null && typeof h.eod.weight.unavailableReason === 'string' && h.eod.weight.unavailableReason.length > 0; }));
})();

// ═══ Reconciliation status variant (AC12 wiring, reused pinned functions) ═
(function EOD_RECONCILIATION() {
  // A dedicated holdings seed with every baselineAt close to `asOf` — BBB's
  // baselineAt in HOLDINGS_SEED is 10 days old, which exceeds
  // PF_RECON_STALE_MAX_DAYS (3) and would make the real _pfComputeReconciliation
  // correctly short-circuit to 'stale' before ever reaching the gap
  // comparison. That's genuine production behavior, not a bug — it just
  // means this fixture needs recent baselines to exercise the gap branch.
  const reconHoldings = JSON.stringify({
    AAA: Object.assign({}, HOLDINGS_SEED_OBJ.AAA, { baselineAt: iso(NOW_MS - 1 * DAY) }),
    BBB: Object.assign({}, HOLDINGS_SEED_OBJ.BBB, { baselineAt: iso(NOW_MS - 1 * DAY) }),
    CCC: Object.assign({}, HOLDINGS_SEED_OBJ.CCC, { baselineAt: iso(NOW_MS - 1 * DAY) })
  });
  const seed = Object.assign({}, FULL_SEED, { pt_holdings: reconHoldings,
    pt_recon: JSON.stringify({ brokerTotalILS: 999999, asOf: iso(NOW_MS), declaredExclusionsILS: 0, exclusionsNote: '' })
  });
  const b = buildApi(seed, { displayed: {} });
  const api = b.api;
  const preload = api._p5PreloadContext(NOW_MS);
  const packet = api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
    packetsBySymbol: api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']), preload: preload, reconState: api._pfReconLoad() });
  check('recorded recon vs. a huge broker total -> unexplained-gap (runtime state, not hardcoded)',
    packet.portfolio.reconciliation.status === 'unexplained-gap');
  check('unexplained-gap surfaces in Needs Attention (reused, not reimplemented)',
    packet.portfolio.needsAttention.some(function (a) { return a.id === 'recon:gap'; }));
})();

// ═══ Planted negatives against the EXTRACTED PRODUCTION SOURCE (S11) ═════
// Each mutates the actual extracted string of a real function, rebuilds the
// sandbox from the mutated text, and proves the corresponding assertion goes
// from PASS to FAIL — i.e. the assertion is load-bearing, not vacuous, and
// the failure path runs through production code end to end.
(function EOD_PLANTED_NEGATIVES() {
  const fixtureOpts = { displayed: { AAA: AAA_PACKET, BBB: BBB_PACKET } };

  // ── AC16: plant a pt_* write inside the extracted _eodBuildPacket source ──
  // index.html is CRLF-terminated end to end, so the extracted production
  // source carries \r\n, not \n — markers must match those literal bytes.
  (function () {
    const marker = '  var holdings = preload.holdings;\r\n';
    check('sanity: AC16 mutation anchor present in extracted source', src._eodBuildPacket.indexOf(marker) !== -1);
    const mutated = buildApi(FULL_SEED, Object.assign({}, fixtureOpts, {
      patchSrc: { _eodBuildPacket: function (fnSrc) { return fnSrc.replace(marker, marker + "  localStorage.setItem('pt_eod_last_export', asOf);\r\n"); } }
    }));
    buildPacket(mutated.api);
    check('planted negative (AC16): mutated build performs exactly one pt_* write', mutated.ls._writes.length === 1);
  })();

  // ── AC6/AC7: remove the symbol-ascending sort; the "first winner" flips
  // on a reverse-keyed seed. ────────────────────────────────────────────────
  (function () {
    const marker = 'var symbols = Object.keys(holdings).sort();';
    check('sanity: AC6/AC7 mutation anchor present in extracted source', src._eodBuildPacket.indexOf(marker) !== -1);
    const revSeed = Object.assign({}, FULL_SEED, {
      pt_holdings: JSON.stringify({ BBB: HOLDINGS_SEED_OBJ.BBB, AAA: HOLDINGS_SEED_OBJ.AAA, CCC: HOLDINGS_SEED_OBJ.CCC })
    });
    const sortedPacket = buildPacket(buildApi(revSeed, fixtureOpts).api);
    const winSorted = sortedPacket.sources.find(function (s) { return s.url === 'https://ex.com/shared'; }).title;
    check('sanity: sorted build -> AAA (alphabetically first) wins the shared source regardless of storage key order',
      winSorted === AAA_PACKET.sections.news.accepted.find(function (i) { return i.url === 'https://ex.com/shared'; }).title);
    const mutated = buildApi(revSeed, Object.assign({}, fixtureOpts, {
      patchSrc: { _eodBuildPacket: function (fnSrc) { return fnSrc.replace(marker, 'var symbols = Object.keys(holdings);'); } }
    }));
    const winUnsorted = buildPacket(mutated.api).sources.find(function (s) { return s.url === 'https://ex.com/shared'; }).title;
    check('planted negative (AC6/AC7): removing the symbol-ascending sort flips the dedup winner on reverse-keyed storage',
      winUnsorted !== winSorted);
  })();

  // ── AC9: revert the per-holding call from the pure builder back to the
  // storage-reading wrapper; the storage read count jumps from 1 to N. ─────
  (function () {
    const marker = 'var ctx = _p5BuildLocalContext(sym, nowMs, preload);';
    check('sanity: AC9 mutation anchor present in extracted source', src._eodBuildPacket.indexOf(marker) !== -1);
    function countReads(patchEodSrcFn) {
      const spyLs = makeLs(FULL_SEED);
      let n = 0;
      const real = spyLs.getItem.bind(spyLs);
      spyLs.getItem = function (k) { if (k === 'pt_holdings') n += 1; return real(k); };
      const localSrc = Object.assign({}, src);
      if (patchEodSrcFn) localSrc._eodBuildPacket = patchEodSrcFn(localSrc._eodBuildPacket);
      let body = VARS.map(v => localSrc[v]).join('\n') + '\n' + FNS.map(v => localSrc[v]).join('\n') +
        '\n_p5Displayed = ' + JSON.stringify({ AAA: AAA_PACKET, BBB: BBB_PACKET }) + ';\n_p5LastRun = {};' +
        '\nreturn { ' + FNS.map(v => v + ': ' + v).join(', ') + ' };';
      // eslint-disable-next-line no-new-func
      const api = new Function('localStorage', 'document', 'console', '"use strict";\n' + body)(spyLs, makeDoc().doc, { log(){}, warn(){}, error(){} });
      const preload = api._p5PreloadContext(NOW_MS);
      api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS, packetsBySymbol: api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']),
        preload: preload, reconState: api._pfReconLoad() });
      return n;
    }
    const baseline = countReads(null);
    const mutatedCount = countReads(function (fnSrc) { return fnSrc.replace(marker, 'var ctx = _p5CollectLocalContext(sym, nowMs);'); });
    check('planted negative (AC9): baseline reads pt_holdings exactly once (one preload)', baseline === 1);
    check('planted negative (AC9): reverting to the per-symbol wrapper multiplies the read count (one per holding)', mutatedCount === baseline + 3);
  })();

  // ── AC3: break the `returned` accumulation; the sum-equality check flips. ──
  (function () {
    const marker = 'aggCounts.returned += packet.counts.returned || 0;';
    check('sanity: AC3 mutation anchor present in extracted source', src._eodBuildPacket.indexOf(marker) !== -1);
    const baselinePacket = buildPacket(buildApi(FULL_SEED, fixtureOpts).api);
    const expectedReturned = AAA_PACKET.counts.returned + BBB_PACKET.counts.returned;
    check('sanity: baseline counts.returned = sum of per-ticker returned', baselinePacket.counts.returned === expectedReturned && expectedReturned > 0);
    const mutated = buildApi(FULL_SEED, Object.assign({}, fixtureOpts, {
      patchSrc: { _eodBuildPacket: function (fnSrc) { return fnSrc.replace(marker, '/* mutated: no-op */;'); } }
    }));
    const mutatedPacket = buildPacket(mutated.api);
    check('planted negative (AC3): breaking the returned-count accumulation desyncs it from the per-ticker sum',
      mutatedPacket.counts.returned !== expectedReturned && mutatedPacket.counts.returned === 0);
  })();

  // ── AC10: move the Limitations block to the end of _eodPacketToMarkdown;
  // the "before Holdings" ordering assertion flips. ────────────────────────
  (function () {
    const blockMarker = "  lines.push('## Limitations');\r\n  packet.limitations.forEach(function(l) { lines.push('- ' + l.text); });\r\n  lines.push('');\r\n";
    check('sanity: AC10 mutation anchor present in extracted source', src._eodPacketToMarkdown.indexOf(blockMarker) !== -1);
    const mutated = buildApi(FULL_SEED, Object.assign({}, fixtureOpts, {
      patchSrc: { _eodPacketToMarkdown: function (fnSrc) {
        return fnSrc.replace(blockMarker, '')
          .replace("lines.push('## Counts');", blockMarker + "  lines.push('## Counts');");
      } }
    }));
    const pk = buildPacket(mutated.api);
    const mdMutated = mutated.api._eodPacketToMarkdown(pk);
    const limitIdx = mdMutated.indexOf('## Limitations');
    const holdIdx = mdMutated.indexOf('## Holdings');
    check('planted negative (AC10): moving Limitations after Holdings flips the "before per-ticker sections" ordering', limitIdx > holdIdx);
  })();

  // ── AC15: introduce a forbidden key through the extracted production
  // source's holding-projection literal, then prove the SAME recursive
  // forbidden-key scan (run over the resulting real production output,
  // never a hand-forged clone) catches it. ─────────────────────────────────
  (function () {
    const marker = 'eod: { weight: ctx.weight, market: ctx.market, pl: ctx.pl },';
    check('sanity: AC15 mutation anchor present in extracted source', src._eodBuildPacket.indexOf(marker) !== -1);
    const mutated = buildApi(FULL_SEED, Object.assign({}, fixtureOpts, {
      patchSrc: { _eodBuildPacket: function (fnSrc) { return fnSrc.replace(marker, "eod: { weight: ctx.weight, market: ctx.market, pl: ctx.pl, direction: 'up' },"); } }
    }));
    const mutatedPacket = buildPacket(mutated.api);
    const hits = forbiddenKeyScan(mutatedPacket);
    check('planted negative (AC15): a forbidden key injected via mutated production source is present in real output', hits.indexOf('direction') !== -1);
    check('planted negative (AC15): the same scanner run over the UNMUTATED real output finds nothing (no false positive)',
      forbiddenKeyScan(MAIN_PACKET).length === 0);
  })();
})();

// ═══ SCANS: EOD functions clean of forbidden tokens (positive-controlled) ═
(function EOD_SCANS() {
  function stripped(name) { return src[name].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
  const pureSrc = [stripped('_eodBuildPacket'), stripped('_eodPacketToMarkdown'), stripped('_eodSnapshotPackets'),
    stripped('_eodPacketToBriefing')].join('\n');
  const forbiddenPatterns = [/\bfetch\s*\(/, /localStorage/, /document\./, /Date\.now/, /Math\.random/, /new Date\s*\(/];
  const controlString = 'fetch( localStorage document.x Date.now Math.random new Date(';
  const controlHits = forbiddenPatterns.filter(function (pat) { return pat.test(controlString); });
  check('positive control: all six forbidden patterns fire against the control string', controlHits.length === forbiddenPatterns.length);
  const realHits = forbiddenPatterns.filter(function (pat) { return pat.test(pureSrc); });
  check('EOD pure functions clean of every forbidden pattern', realHits.length === 0);

  check('_eodSnapshotPackets never assigns into _p5Displayed/_p5LastRun (read-only)',
    !/_p5Displayed\s*\[[^\]]*\]\s*=|_p5LastRun\s*\[[^\]]*\]\s*=/.test(stripped('_eodSnapshotPackets')));
  check('_eodBuildPacket never calls _p5RunResearch/_p5RequestItems/_p5RunSynthesis (no new research path)',
    !/_p5RunResearch|_p5RequestItems|_p5RunSynthesis/.test(stripped('_eodBuildPacket')));
  check('_eodBuildPacket never calls _p5PreloadContext internally (strictly pure, I/O happens in the handler)',
    !/_p5PreloadContext\s*\(/.test(stripped('_eodBuildPacket')));
})();

// ═══ NC-M1: Daily briefing projection ════════════════════════════════════
// Deterministic, offline projection of the existing EOD packet — never a
// second computation, never a Notebook/network call (brief §3, §6).
(function EOD_BRIEFING_PROJECTION() {
  function stripped(name) { return src[name].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
  const b = buildApi(FULL_SEED, { displayed: {} });
  const api = b.api;

  // ── NB-1: pure — two calls on the identical real packet are byte-identical.
  // (The structural "extracted source free of forbidden primitives" half of
  // NB-1/NB-8 is proven once, for real, in EOD_SCANS above — same source.) ──
  const briefing1 = api._eodPacketToBriefing(MAIN_PACKET);
  const briefing2 = api._eodPacketToBriefing(MAIN_PACKET);
  check('NB-1: _eodPacketToBriefing is pure — two calls on one packet are byte-identical', briefing1 === briefing2);

  // ── NB-2: every packet.limitations[] entry appears verbatim ─────────────
  check('NB-2: every limitations[] entry appears verbatim in the briefing text',
    MAIN_PACKET.limitations.length > 0 &&
    MAIN_PACKET.limitations.every(function (l) { return briefing1.indexOf(l.text) !== -1; }));

  // ── NB-3: every holding's research.coverage appears explicitly, WITHIN
  // that holding's own section — not merely somewhere in the document (two
  // holdings share the "researched" value in this fixture, so a whole-
  // document substring search would pass even if one holding's own line
  // were dropped). ──────────────────────────────────────────────────────
  function holdingSection(text, symbol) {
    const startMarker = '### ' + symbol + '\n';
    const start = text.indexOf(startMarker);
    if (start === -1) return null;
    const nextHeader = text.indexOf('\n### ', start + startMarker.length);
    return text.slice(start, nextHeader === -1 ? text.length : nextHeader);
  }
  check('NB-3: every holding coverage value appears explicitly inside that holding\'s own section',
    MAIN_PACKET.holdings.length > 0 &&
    MAIN_PACKET.holdings.every(function (h) {
      const section = holdingSection(briefing1, h.symbol);
      return !!section && section.indexOf('Coverage: ' + h.research.coverage) !== -1;
    }));
  (function () {
    // AAA and BBB both have coverage "researched" in this fixture — drop
    // AAA's own coverage line and prove: (a) a whole-document substring scan
    // (the rejected assertion shape) would wrongly still pass, because
    // BBB's identical line is still present elsewhere in the text; (b) the
    // per-holding scan above correctly requires AAA's own section to carry it.
    const aaaSection = holdingSection(briefing1, 'AAA');
    const aaaCoverageLine = 'Coverage: ' + MAIN_PACKET.holdings.find(function (h) { return h.symbol === 'AAA'; }).research.coverage;
    check('sanity (NB-3 planted negative): AAA and BBB share the same coverage value in this fixture',
      MAIN_PACKET.holdings.find(function (h) { return h.symbol === 'BBB'; }).research.coverage ===
      MAIN_PACKET.holdings.find(function (h) { return h.symbol === 'AAA'; }).research.coverage);
    const docWithAaaLineDropped = briefing1.replace('- ' + aaaCoverageLine + '\n', '');
    check('planted negative (NB-3): a whole-document substring scan would wrongly still pass with AAA\'s own coverage line dropped',
      docWithAaaLineDropped.indexOf(aaaCoverageLine) !== -1);
    check('planted negative (NB-3): the per-holding scan correctly fails once AAA\'s own section no longer carries the line',
      holdingSection(docWithAaaLineDropped, 'AAA').indexOf(aaaCoverageLine) === -1);
  })();

  // ── NB-4: _eodPacketToMarkdown's extracted source is byte-identical to a
  // pinned hash of its pre-task form — a real drift pin, not a same-call
  // tautology (calling the same in-memory function twice on the same input
  // is trivially identical regardless of whether the file was edited). ────
  // Normalized to \n before hashing — index.html is CRLF-terminated on this
  // checkout, but a checkout with core.autocrlf=false (e.g. Linux CI) would
  // otherwise hash the byte-identical LF blob to a different digest.
  const EOD_PACKET_TO_MARKDOWN_PRETASK_SHA256 = 'b7ea051d1b5c4d682424b5fdde6904cb012bf6577c48e9561b7a457682fc9c03';
  const mdSrcHash = crypto.createHash('sha256').update(src._eodPacketToMarkdown.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  check('NB-4: _eodPacketToMarkdown extracted source hash matches its pinned pre-task baseline (byte-unchanged)',
    mdSrcHash === EOD_PACKET_TO_MARKDOWN_PRETASK_SHA256);
  check('NB-4: _eodPacketToMarkdown extracted source carries no reference to the briefing projector',
    stripped('_eodPacketToMarkdown').indexOf('_eodPacketToBriefing') === -1 &&
    stripped('_eodPacketToMarkdown').indexOf('NC_BRIEFING_VOCAB') === -1);
  const mdBefore = api._eodPacketToMarkdown(MAIN_PACKET);
  api._eodPacketToBriefing(MAIN_PACKET);
  const mdAfter = api._eodPacketToMarkdown(MAIN_PACKET);
  check('sanity: _eodPacketToMarkdown output stable around a briefing call', mdBefore === mdAfter);

  // ── NB-5: NOTEBOOK_BRIEFING_PROMPT exists exactly once, version-tagged ──
  check('NB-5: NOTEBOOK_BRIEFING_PROMPT declared exactly once in index.html',
    (content.match(/var NOTEBOOK_BRIEFING_PROMPT\s*=/g) || []).length === 1);
  // eslint-disable-next-line no-new-func
  const promptObj = new Function(src.NOTEBOOK_BRIEFING_PROMPT + '\nreturn NOTEBOOK_BRIEFING_PROMPT;')();
  check('NB-5: NOTEBOOK_BRIEFING_PROMPT is version-tagged (non-empty string .version)',
    typeof promptObj.version === 'string' && promptObj.version.length > 0);
  check('NB-5: NOTEBOOK_BRIEFING_PROMPT carries non-empty prompt text',
    typeof promptObj.text === 'string' && promptObj.text.length > 0);
  check('NB-5: NOTEBOOK_BRIEFING_PROMPT is a static placeholder — no fetch/URL/API-shaped reference',
    !/fetch\s*\(|https?:\/\/|Authorization|apiKey/i.test(src.NOTEBOOK_BRIEFING_PROMPT));

  // ── NB-6: null weight.pct, for each of the three real unavailableReason
  // values, renders the reason in prose — never blank, 0%, or an em-dash.
  // Reason values are the closed, pinned set from _p5BuildLocalContext. ────
  const REASON_KEYWORDS = {
    'reporting-incomplete': 'portfolio totals are incomplete',
    'denominator-zero': 'no valid allocation base',
    'holding-ils-value-unavailable': 'could not be converted'
  };
  Object.keys(REASON_KEYWORDS).forEach(function (reason) {
    const fixturePacket = JSON.parse(JSON.stringify(MAIN_PACKET));
    fixturePacket.holdings[0].eod.weight = { pct: null, unavailableReason: reason };
    const sym = fixturePacket.holdings[0].symbol;
    const out = api._eodPacketToBriefing(fixturePacket);
    const weightLine = out.split('\n').find(function (l) { return l.indexOf('- Weight: ' + sym) === 0; });
    check('NB-6 (' + reason + '): a weight line exists for the holding', !!weightLine);
    check('NB-6 (' + reason + '): never blank, "0%", or an em-dash',
      !!weightLine && weightLine.indexOf('0%') === -1 && weightLine.indexOf('—') === -1 &&
      weightLine.trim() !== ('- Weight: ' + sym).trim());
    check('NB-6 (' + reason + '): renders the exact production reason as a full sentence',
      !!weightLine && weightLine.indexOf(REASON_KEYWORDS[reason]) !== -1 && /\.\s*$/.test(weightLine));
  });

  // ── NB-7: a packet with total-incomplete reconciliation AND a stale EOD
  // entry renders both states — built through the real production path
  // (no cash recorded -> completeness false -> total-incomplete; a
  // pt_eod_cache entry with lastFailAt -> _pfEodIsStale true), never a
  // hand-forged packet object (S11). ────────────────────────────────────────
  (function () {
    const seed = {
      pt_holdings: JSON.stringify({
        AAA: Object.assign({}, HOLDINGS_SEED_OBJ.AAA, { baselineAt: iso(NOW_MS - 1 * DAY) }),
        BBB: Object.assign({}, HOLDINGS_SEED_OBJ.BBB, { baselineAt: iso(NOW_MS - 1 * DAY) }),
        CCC: Object.assign({}, HOLDINGS_SEED_OBJ.CCC, { baselineAt: iso(NOW_MS - 1 * DAY) })
      }),
      pt_fx: fxSeed(1 * DAY),
      // no pt_cash -> reporting.completeness false -> reconciliation total-incomplete
      pt_recon: JSON.stringify({ brokerTotalILS: 1000, asOf: iso(NOW_MS), declaredExclusionsILS: 0, exclusionsNote: '' }),
      pt_eod_cache: JSON.stringify({ AAA: { changePercent: 1.2, lastFailAt: iso(NOW_MS - 1 * DAY) } })
    };
    const nb7 = buildApi(seed, { displayed: {} });
    const preload = nb7.api._p5PreloadContext(NOW_MS);
    check('sanity (NB-7): no cash recorded -> reporting genuinely incomplete', preload.reporting.completeness === false);
    const packet = nb7.api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
      packetsBySymbol: nb7.api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']), preload: preload, reconState: nb7.api._pfReconLoad() });
    check('sanity (NB-7): reconciliation genuinely total-incomplete', packet.portfolio.reconciliation.status === 'total-incomplete');
    check('sanity (NB-7): AAA market entry genuinely stale', packet.holdings.find(function (h) { return h.symbol === 'AAA'; }).eod.market.eodStale === true);
    const out = nb7.api._eodPacketToBriefing(packet);
    check('NB-7: total-incomplete reconciliation state renders (via the transported limitation)',
      out.indexOf('Portfolio Total is incomplete') !== -1);
    check('NB-7: the stale EOD entry renders explicitly for the affected holding',
      out.indexOf('market data for this holding is stale') !== -1 && out.indexOf('for AAA.') !== -1);
  })();

  // ── STOP-8 (needsAttention): portfolio.needsAttention entries are an
  // existing, already-authored degraded-state channel — _eodPacketToMarkdown
  // already renders them (index.html, "Needs Attention" block). The
  // briefing must transport them verbatim too, never silently drop them.
  // Built through the real production path (an unexplained reconciliation
  // gap -> _pfComputeNeedsAttention's real 'recon:gap' entry), reusing the
  // exact seed shape the existing EOD_RECONCILIATION fixture already proves
  // produces this entry — never a hand-forged needsAttention array. ────────
  (function () {
    const reconHoldings = JSON.stringify({
      AAA: Object.assign({}, HOLDINGS_SEED_OBJ.AAA, { baselineAt: iso(NOW_MS - 1 * DAY) }),
      BBB: Object.assign({}, HOLDINGS_SEED_OBJ.BBB, { baselineAt: iso(NOW_MS - 1 * DAY) }),
      CCC: Object.assign({}, HOLDINGS_SEED_OBJ.CCC, { baselineAt: iso(NOW_MS - 1 * DAY) })
    });
    const seed = Object.assign({}, FULL_SEED, { pt_holdings: reconHoldings,
      pt_recon: JSON.stringify({ brokerTotalILS: 999999, asOf: iso(NOW_MS), declaredExclusionsILS: 0, exclusionsNote: '' })
    });
    const na = buildApi(seed, { displayed: {} });
    const preload = na.api._p5PreloadContext(NOW_MS);
    const packet = na.api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
      packetsBySymbol: na.api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']), preload: preload, reconState: na.api._pfReconLoad() });
    check('sanity (STOP-8 needsAttention): a genuine unexplained-gap needsAttention entry exists',
      packet.portfolio.needsAttention.some(function (a) { return a.id === 'recon:gap'; }));
    const out = na.api._eodPacketToBriefing(packet);
    const entry = packet.portfolio.needsAttention.find(function (a) { return a.id === 'recon:gap'; });
    check('STOP-8: needsAttention entries render explicitly, never silently dropped',
      out.indexOf(entry.title) !== -1 && out.indexOf(entry.detail) !== -1 && out.indexOf('[' + entry.severity + ']') !== -1);
    const emptyFixture = JSON.parse(JSON.stringify(MAIN_PACKET));
    emptyFixture.portfolio.needsAttention = [];
    check('sanity: a packet with zero needsAttention entries renders no "## Needs Attention" heading (no invented section)',
      na.api._eodPacketToBriefing(emptyFixture).indexOf('## Needs Attention') === -1);
  })();

  // ── NB-8: negative — no network primitive in the projector's extracted
  // source (structural half already proven in EOD_SCANS; this asserts the
  // same on the isolated single-function source, so a future EOD_SCANS
  // refactor can never silently drop _eodPacketToBriefing from its list). ──
  const forbiddenPatterns = [/\bfetch\s*\(/, /localStorage/, /document\./, /Date\.now/, /Math\.random/, /new Date\s*\(/];
  check('NB-8: _eodPacketToBriefing extracted source clean of every forbidden pattern',
    forbiddenPatterns.every(function (pat) { return !pat.test(stripped('_eodPacketToBriefing')); }));

  // ── Export wiring: one additional _ptDownload call added to the existing
  // I/O handler, reusing _ptDownload; the existing two calls are untouched. ─
  const exportSrc = extractFunctionSource(content, '_eodExportPacket');
  const ptDownloadCalls = (exportSrc.match(/_ptDownload\s*\(/g) || []).length;
  check('export wiring: _eodExportPacket now performs exactly three _ptDownload calls (json, markdown, briefing)',
    ptDownloadCalls === 3);
  check('export wiring: _eodExportPacket calls _eodPacketToBriefing exactly once', (exportSrc.match(/_eodPacketToBriefing\s*\(/g) || []).length === 1);
  check('export wiring: the existing json/markdown _ptDownload calls are byte-unchanged',
    exportSrc.indexOf("_ptDownload(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }), 'eod_packet_' + ts + '.json');") !== -1 &&
    exportSrc.indexOf("_ptDownload(new Blob([md], { type: 'text/markdown' }), 'eod_packet_' + ts + '.md');") !== -1);

  // ── No storage write, no new pt_* key — reuse the AC16-style write-spy ──
  const spy = buildApi(FULL_SEED, { displayed: {} });
  const before = spy.ls._dump();
  spy.api._eodPacketToBriefing(MAIN_PACKET);
  spy.api._eodPacketToBriefing(MAIN_PACKET);
  check('no storage write: zero localStorage writes across 2 briefing calls', spy.ls._writes.length === 0);
  check('no storage write: pt_* bytes byte-identical before/after', spy.ls._dump() === before);

  // ── No scoring/ranking/persistence effect; no new state vocabulary outside
  // the single mapping table (brief STOP-9). The scan below actually reads
  // the authored prose OUT of NC_BRIEFING_VOCAB's own extracted source and
  // proves none of those literal phrases is ALSO hardcoded directly inside
  // _eodPacketToBriefing's own extracted source — a real duplicate-table
  // detector, not a reference-name tally that a hardcoded copy would still
  // pass (a mutation below proves the same scan catches that copy). ───────
  check('no scoring surface touched: _eodPacketToBriefing source has zero score/rank reference',
    !/_ptScore|enforceScoreConsistency|ranking|recommendation/i.test(stripped('_eodPacketToBriefing')));
  const vocabObj = new Function(src.NC_BRIEFING_VOCAB + '\nreturn NC_BRIEFING_VOCAB;')();
  const authoredStatePhrases = Object.keys(vocabObj.weightUnavailable).map(function (k) { return vocabObj.weightUnavailable[k]; })
    .concat([vocabObj.marketStale, vocabObj.marketUnavailable]);
  check('sanity: at least four distinct authored state phrases extracted from NC_BRIEFING_VOCAB', authoredStatePhrases.length === 5);
  const briefingSrcStripped = stripped('_eodPacketToBriefing');
  check('single mapping table: no authored state phrase is hardcoded a second time directly inside _eodPacketToBriefing (only referenced via NC_BRIEFING_VOCAB)',
    authoredStatePhrases.every(function (p) { return briefingSrcStripped.indexOf(p) === -1; }) &&
    briefingSrcStripped.indexOf('NC_BRIEFING_VOCAB.weightUnavailable[') !== -1 &&
    briefingSrcStripped.indexOf('NC_BRIEFING_VOCAB.marketStale') !== -1 &&
    briefingSrcStripped.indexOf('NC_BRIEFING_VOCAB.marketUnavailable') !== -1);
  check('planted negative (single mapping table): a hardcoded duplicate of vocab text, inlined instead of referenced, is caught by the same scan',
    authoredStatePhrases.some(function (p) {
      const mutated = briefingSrcStripped.replace('NC_BRIEFING_VOCAB.marketStale', "'" + vocabObj.marketStale + "'");
      return mutated.indexOf(p) !== -1;
    }));

  // ── STOP-8 (market-unavailable case): CCC in this fixture has no
  // pt_eod_cache entry at all (market.present === false) — a genuinely
  // unavailable, not merely stale, market state that must not render as
  // silence. ─────────────────────────────────────────────────────────────
  const cccOut = MAIN_PACKET.holdings.find(function (h) { return h.symbol === 'CCC'; });
  check('sanity: CCC genuinely has no market data in this fixture (present !== true)', cccOut.eod.market.present !== true);
  const cccSection = holdingSection(briefing1, 'CCC');
  check('STOP-8: the market-unavailable state for CCC renders explicitly, never silently dropped',
    !!cccSection && cccSection.indexOf('market data was not retrieved for this holding for CCC.') !== -1);
})();

console.log(failures === 0
  ? 'EOD PACKET V0: PASS (' + asserts + ' asserts)'
  : 'EOD PACKET V0: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
