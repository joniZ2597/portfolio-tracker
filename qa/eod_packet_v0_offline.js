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
  '_eodPacketToBriefing',
  // DH-M1: readiness computation, shared display mapping, TS1 calendar authority
  // (reused, never re-implemented) and the fetch-boundary functions.
  '_dhLabel', '_eodComputeReadiness', '_eodReadinessLines',
  '_ts1ExchangeLocalParts', '_ts1RuleFor', '_ts1IsTradingSession', '_ts1SessionCloseMinutes',
  '_ts1SessionCompleted', '_ts1AgeSessions', '_ts1ResolveMarket',
  '_pfSessionDateFor', '_pfLiveNormalize', '_pfEodCacheSet', '_pfEodSaveCache'];
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
// DH-M1: the shared display table and the TS1 calendar policy (single authority).
src.DH_DISPLAY = extractVarSource(content, 'DH_DISPLAY');
if (!src.DH_DISPLAY) missingExtract.push('DH_DISPLAY');
src.TS1_POLICY_V1 = extractVarSource(content, 'TS1_POLICY_V1');
if (!src.TS1_POLICY_V1) missingExtract.push('TS1_POLICY_V1');
src._PF_LIVE_PROVIDERS = "var _PF_LIVE_PROVIDERS = ['yahoo', 'polygon'];";
VARS.push('DH_DISPLAY', 'TS1_POLICY_V1', '_PF_LIVE_PROVIDERS');
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
  // DH-M1 DELIBERATE RE-PIN: DH-M1 adds the `## Readiness` section to
  // _eodPacketToMarkdown on purpose (the only change: one heading, one
  // _eodReadinessLines call, one blank line, ahead of `## Limitations`; see
  // work/dh-readiness-block/review.md for the extracted-source diff). The
  // NC-M1 pre-task hash is kept as the documented base, and the pin is now the
  // post-DH-M1 form — still a real drift pin, not a same-call tautology.
  const EOD_PACKET_TO_MARKDOWN_PRETASK_SHA256 = 'b7ea051d1b5c4d682424b5fdde6904cb012bf6577c48e9561b7a457682fc9c03';
  const EOD_PACKET_TO_MARKDOWN_DH_M1_SHA256 = '366f51e36c1fb5c174187ccfd76534e1e7ef4a370a0d92f71c4e16813ccd108b';
  const mdSrcHash = crypto.createHash('sha256').update(src._eodPacketToMarkdown.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  check('NB-4: _eodPacketToMarkdown extracted source hash matches its pinned DH-M1 baseline (deliberately re-pinned)',
    mdSrcHash === EOD_PACKET_TO_MARKDOWN_DH_M1_SHA256);
  check('NB-4: the DH-M1 pin is genuinely a re-pin — it differs from the NC-M1 pre-task hash',
    EOD_PACKET_TO_MARKDOWN_DH_M1_SHA256 !== EOD_PACKET_TO_MARKDOWN_PRETASK_SHA256);
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
      out.indexOf('the last refresh of market data failed') !== -1 && out.indexOf('for AAA.') !== -1 &&
      out.indexOf('market data for this holding is stale') === -1);
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


// ═══ DH-M1: EOD readiness block + shared display wording ═════════════════
// Amendment 2 AC1-AC15 (numbered RD-ACn here — the EOD-v0 AC1-AC17 above are a
// different namespace), planted negatives N1-N5 (EODFRESH plan §4), R-J7,
// R-U1, R-D3, fetch-boundary and projection checks. AC16/AC17 are browser QA
// (DH-M3 / EODFRESH-2) and are NOT asserted here.
(function EOD_READINESS_DH_M1() {
  function stripped(name) { return src[name].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
  const VERDICTS = ['current', 'degraded', 'not-representative'];
  const FORBIDDEN_ACTION = ['advice', 'shouldRefresh', 'doNotTrade', 'safe', 'unsafe'];

  // ── Control fixture: every holding researched through the real P5 chain, US
  // cache entries on the last completed NY session, fresh FX, cash set after
  // the oldest baseline, all baselines under the existing advisory window.
  // NOW_MS = 2026-09-16T12:00Z = 08:00 ET Wed: 09-16 is not complete, 09-15 is
  // the last completed session (ageSessions 0); 09-14 → 1; 09-11 → 2. ─────────
  const CTL_HOLD = {
    AAA: Object.assign({}, HOLDINGS_SEED_OBJ.AAA, { baselineAt: iso(NOW_MS - 3 * DAY), updatedAt: iso(NOW_MS - 3 * DAY) }),
    BBB: Object.assign({}, HOLDINGS_SEED_OBJ.BBB, { baselineAt: iso(NOW_MS - 2 * DAY) }),
    CCC: Object.assign({}, HOLDINGS_SEED_OBJ.CCC, { baselineAt: iso(NOW_MS - 1 * DAY) })
  };
  function usEntry(sessionDate) {
    return { price: 10, changePercent: 1, currency: 'USD', sessionEpoch: 1789000000, fetchedAt: iso(NOW_MS),
      market: 'US', marketBasis: 'provider-meta', sessionDate: sessionDate };
  }
  const CTL_EOD = { AAA: usEntry('2026-09-15'), BBB: usEntry('2026-09-14'), CCC: usEntry('2026-09-15') };
  function ctlSeed(over) {
    return Object.assign({
      pt_holdings: JSON.stringify(CTL_HOLD), pt_fx: fxSeed(1 * DAY),
      pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-09-15' }), pt_eod_cache: JSON.stringify(CTL_EOD)
    }, over || {});
  }
  const seedApi = buildApi(FULL_SEED).api;
  const CTL_PACKETS = {};
  ['AAA', 'BBB', 'CCC'].forEach(function (s) {
    CTL_PACKETS[s] = buildRealPacket(seedApi, s, NOW_MS, [{ sourceUrl: 'https://ex.com/' + s.toLowerCase(), summary: 'S.' }]);
  });
  const ALL_PACKETS = [];
  function build(seed, opts) {
    opts = opts || {};
    const b = buildApi(seed, { displayed: opts.displayed === undefined ? CTL_PACKETS : opts.displayed, patchSrc: opts.patchSrc });
    const preload = b.api._p5PreloadContext(NOW_MS);
    const packet = b.api._eodBuildPacket({ asOf: iso(NOW_MS), nowMs: NOW_MS,
      packetsBySymbol: b.api._eodSnapshotPackets(['AAA', 'BBB', 'CCC']), preload: preload, reconState: b.api._pfReconLoad() });
    // Source-mutated builds are planted negatives, not production fixtures.
    if (!opts.patchSrc) ALL_PACKETS.push(packet);
    return { packet: packet, api: b.api, ls: b.ls };
  }
  function classes(p) { return p.readiness.reasons.map(function (r) { return r.class; }); }
  function reasonFor(p, cls) { return p.readiness.reasons.find(function (r) { return r.class === cls; }); }

  const CTL = build(ctlSeed());
  ALL_PACKETS.push(MAIN_PACKET);
  check('control: the fixture is genuinely current (a valid base for every planted negative)',
    CTL.packet.readiness.verdict === 'current' &&
    JSON.stringify(classes(CTL.packet)) === JSON.stringify(['all-dimensions-within-band']));
  check('control: market dimension reads current for all three holdings with recorded basis',
    CTL.packet.readiness.dimensions.market.symbols.length === 3 &&
    CTL.packet.readiness.dimensions.market.symbols.every(function (r) { return r.state === 'current' && r.marketBasis === 'provider-meta'; }));
  check('control: ageSessions 0 (09-15) and 1 (09-14) are both current — the ruled band',
    CTL.packet.readiness.dimensions.market.symbols[0].ageSessions === 0 && CTL.packet.readiness.dimensions.market.symbols[1].ageSessions === 1);

  // ── N1: age a cached sessionDate by two completed sessions ─────────────────
  const n1 = build(ctlSeed({ pt_eod_cache: JSON.stringify(Object.assign({}, CTL_EOD, { AAA: usEntry('2026-09-11') })) }));
  check('N1 (RD-AC15/AC4): two completed sessions of lag → market aged, verdict lowers, symbol named',
    n1.packet.readiness.verdict === 'degraded' && reasonFor(n1.packet, 'market-aged') &&
    JSON.stringify(reasonFor(n1.packet, 'market-aged').symbols) === JSON.stringify(['AAA']) &&
    n1.packet.readiness.dimensions.market.symbols[0].ageSessions === 2);
  // ── N2: strip market/marketBasis → unknown, fails closed ────────────────────
  const n2Entry = usEntry('2026-09-15'); delete n2Entry.market; delete n2Entry.marketBasis;
  const n2 = build(ctlSeed({ pt_eod_cache: JSON.stringify(Object.assign({}, CTL_EOD, { AAA: n2Entry })) }));
  check('N2 (RD-AC6/AC15): market stripped → unknown, verdict lowers, symbol named',
    n2.packet.readiness.verdict === 'degraded' && reasonFor(n2.packet, 'market-unknown') &&
    JSON.stringify(reasonFor(n2.packet, 'market-unknown').symbols) === JSON.stringify(['AAA']));
  // ── N3: FX past valid window with USD holdings ─────────────────────────────
  const n3 = build(ctlSeed({ pt_fx: fxSeed(7 * DAY) }));
  check('N3 (RD-AC15): FX stale-invalid with USD holdings → not-representative',
    n3.packet.readiness.verdict === 'not-representative' && !!reasonFor(n3.packet, 'fx-stale-invalid') &&
    n3.packet.readiness.dimensions.fx.state === 'stale-invalid');
  // ── N4: a baselineAt past 7 d → needs-confirmation ONLY (the discriminating case) ──
  const n4Hold = JSON.stringify(Object.assign({}, CTL_HOLD, { BBB: Object.assign({}, CTL_HOLD.BBB, { baselineAt: iso(NOW_MS - 40 * DAY) }) }));
  const n4 = build(ctlSeed({ pt_holdings: n4Hold }));
  check('N4 (RD-AC10/AC15): position 40 d old → verdict exactly degraded, on needs-confirmation alone',
    n4.packet.readiness.verdict === 'degraded' && JSON.stringify(classes(n4.packet)) === JSON.stringify(['positions-needs-confirmation']) &&
    JSON.stringify(reasonFor(n4.packet, 'positions-needs-confirmation').symbols) === JSON.stringify(['BBB']) &&
    JSON.stringify(n4.packet.readiness.dimensions.positions.needsConfirmation) === JSON.stringify(['BBB']));
  check('RD-AC10: position age never excludes a holding from any total (portfolio total identical to control)',
    n4.packet.portfolio.total === CTL.packet.portfolio.total && n4.packet.holdings.length === 3);
  // ── N5: cash not recorded → missing/invalid, distinct from any staleness class ──
  const n5Seed = ctlSeed(); delete n5Seed.pt_cash;
  const n5 = build(n5Seed);
  check('N5 (RD-AC15/AC3): cash not recorded → missing/invalid, named separately from any staleness class',
    n5.packet.readiness.dimensions.cash.condition === 'missing/invalid' && !!reasonFor(n5.packet, 'cash-missing-or-invalid') &&
    n5.packet.readiness.verdict === 'not-representative' && classes(n5.packet).every(function (c) { return c.indexOf('aged') === -1; }));
  // coverage flips the verdict too (AC15's fifth dimension)
  const covCase = build(ctlSeed(), { displayed: { AAA: CTL_PACKETS.AAA, BBB: CTL_PACKETS.BBB } });
  check('RD-AC15: research coverage gap (CCC not researched) → degraded, symbol named, status stays research-coverage',
    covCase.packet.readiness.verdict === 'degraded' && !!reasonFor(covCase.packet, 'research-coverage') &&
    JSON.stringify(reasonFor(covCase.packet, 'research-coverage').symbols) === JSON.stringify(['CCC']) &&
    covCase.packet.status === 'partial');

  // ── RD-AC1 / RD-AC2 / RD-AC13 across every packet built by this suite ─────────
  check('RD-AC1: readiness.verdict is in the closed three-value set on every fixture (a fourth value fails)',
    ALL_PACKETS.length >= 8 && ALL_PACKETS.every(function (p) { return VERDICTS.indexOf(p.readiness.verdict) !== -1; }));
  check('RD-AC2: no verdict without at least one named reason, on every fixture',
    ALL_PACKETS.every(function (p) { return p.readiness.reasons.length >= 1 && p.readiness.reasons.every(function (r) { return typeof r.class === 'string' && r.class.length > 0; }); }));
  check('RD-AC13: status is still research coverage ({partial, complete}) on every fixture; no readiness value in it',
    ALL_PACKETS.every(function (p) { return p.status === 'partial' || p.status === 'complete'; }) &&
    CTL.packet.status === 'complete' && MAIN_PACKET.status === 'partial');
  check('RD-AC1/AC12 (no action vocabulary): no forbidden key and no action vocabulary key anywhere in readiness',
    ALL_PACKETS.every(function (p) { return forbiddenKeyScan(p.readiness).length === 0; }) &&
    (function () {
      const hits = [];
      (function walk(o) { if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { if (FORBIDDEN_ACTION.indexOf(k) !== -1) hits.push(k); walk(o[k]); }); })(CTL.packet.readiness);
      return hits.length === 0;
    })());
  check('RD-AC1 (every reason class has a display label — no unmapped class can render as a raw code)',
    ALL_PACKETS.every(function (p) { return p.readiness.reasons.every(function (r) { return typeof CTL.api._dhLabel('reason', r.class) === 'string' && CTL.api._dhLabel('reason', r.class) !== r.class; }); }));

  // ── RD-AC3: absent market + aged FX both appear, separately named; missing is never a verdict ──
  const ac3Eod = JSON.parse(JSON.stringify(CTL_EOD)); delete ac3Eod.AAA;
  const ac3 = build(ctlSeed({ pt_eod_cache: JSON.stringify(ac3Eod), pt_fx: fxSeed(4 * DAY) }));
  check('RD-AC3: market-missing and fx-aged are both present as separate reason classes; "missing" is never the verdict',
    !!reasonFor(ac3.packet, 'market-missing') && !!reasonFor(ac3.packet, 'fx-aged') && ac3.packet.readiness.verdict !== 'missing' &&
    VERDICTS.indexOf(ac3.packet.readiness.verdict) !== -1 && ac3.packet.readiness.dimensions.fx.state === 'aged-but-valid');

  // ── RD-AC5: marketBasis value set; a third token is not accepted ─────────────
  const ac5Eod = JSON.parse(JSON.stringify(CTL_EOD));
  ac5Eod.AAA = Object.assign(usEntry('2026-09-15'), { market: 'TASE', marketBasis: 'symbol-suffix-fallback' });
  ac5Eod.BBB = Object.assign(usEntry('2026-09-15'), { marketBasis: 'guess' });
  const ac5 = build(ctlSeed({ pt_eod_cache: JSON.stringify(ac5Eod) }));
  const ac5Rows = ac5.packet.readiness.dimensions.market.symbols;
  check('RD-AC5: every recorded marketBasis ∈ {provider-meta, symbol-suffix-fallback}; TASE fallback row accepted',
    ac5Rows.every(function (r) { return r.marketBasis === null || r.marketBasis === 'provider-meta' || r.marketBasis === 'symbol-suffix-fallback'; }) &&
    ac5Rows[0].state === 'current' && ac5Rows[0].market === 'TASE' && ac5Rows[0].marketBasis === 'symbol-suffix-fallback');
  check('RD-AC5: a third basis token ("guess") is rejected → unknown, never accepted',
    ac5Rows[1].state === 'unknown' && ac5Rows[1].marketBasis === null);

  // ── RD-AC7: session date is NEVER inferred from sessionEpoch / fetchedAt ─────
  const ac7Eod = JSON.parse(JSON.stringify(CTL_EOD));
  ac7Eod.AAA = { price: 10, changePercent: 1, currency: 'USD', sessionEpoch: Date.parse('2026-09-15T20:00:00Z') / 1000,
    fetchedAt: iso(NOW_MS), market: 'US', marketBasis: 'provider-meta' };
  const ac7 = build(ctlSeed({ pt_eod_cache: JSON.stringify(ac7Eod) }));
  check('RD-AC7 (planted negative): sessionEpoch + fetchedAt but NO sessionDate → unknown, sessionDate null — not a derived date',
    ac7.packet.readiness.dimensions.market.symbols[0].state === 'unknown' && ac7.packet.readiness.dimensions.market.symbols[0].sessionDate === null &&
    !!reasonFor(ac7.packet, 'market-unknown'));
  // ── RD-AC8: legacy pre-change entry shape reads unknown (not missing); all-legacy lowers ──
  const legacy = { price: 10, changePercent: 1, currency: 'USD', sessionEpoch: 1789000000, fetchedAt: iso(NOW_MS) };
  const ac8 = build(ctlSeed({ pt_eod_cache: JSON.stringify({ AAA: legacy, BBB: legacy, CCC: legacy }) }));
  check('RD-AC8: legacy-shape entries read unknown (not missing) — the expected first post-landing export',
    ac8.packet.readiness.dimensions.market.symbols.every(function (r) { return r.state === 'unknown'; }) &&
    !reasonFor(ac8.packet, 'market-missing'));
  check('RD-AC8: every holding unknown → verdict lowered to not-representative (§12.8 "across the holdings")',
    ac8.packet.readiness.verdict === 'not-representative' && JSON.stringify(reasonFor(ac8.packet, 'market-unknown').symbols) === JSON.stringify(['AAA', 'BBB', 'CCC']));
  check('RD-AC8: MAIN_PACKET (entries without the three fields) reads unknown/missing and is not current',
    MAIN_PACKET.readiness.verdict !== 'current' && MAIN_PACKET.readiness.dimensions.market.symbols.every(function (r) { return r.state === 'unknown' || r.state === 'missing'; }));

  // ── RD-AC4 / AC11 / AC-U3: no threshold, no day math, no J7 literal in the readiness path ──
  const authored = ['_eodComputeReadiness', '_eodReadinessLines', '_dhLabel', '_pfSessionDateFor', '_ts1ResolveMarket'];
  const authoredSrc = authored.map(stripped).join('\n');
  check('RD-AC4: no *_DAYS / *_MAX_* constant, no day-in-ms literal, no arithmetic on fetchedAt in the readiness path',
    !/_DAYS\b|_MAX_|86400000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|fetchedAt|effectiveAt/.test(authoredSrc));
  check('RD-AC4 (control): the same scan does fire on the reused TS1 date-step helper (proves the scan can fail)',
    /86400000/.test(stripped('_ts1AgeSessions')));
  check('RD-AC-U3: no 7 / 30 / agingAfterDays / staleAfterDays literal in the readiness path; none anywhere in index.html',
    !/\b7\b|\b30\b|agingAfterDays|staleAfterDays/.test(authoredSrc) && !/agingAfterDays|staleAfterDays/.test(content));
  const PF_DECLARED_BASE = ['PF_ATTENTION_STALE_MAX_DAYS', 'PF_CASH_KEY', 'PF_CURRENCY_CODES', 'PF_CURRENCY_SYMBOLS',
    'PF_EOD_AUTO_COOLDOWN_MS', 'PF_EOD_CACHE_KEY', 'PF_EOD_FAIL_COOLDOWN_MS', 'PF_EOD_LAST_FETCH_KEY', 'PF_FX_AUTO_COOLDOWN_MS',
    'PF_FX_CACHE_KEY', 'PF_FX_FAIL_COOLDOWN_MS', 'PF_FX_FRESH_MAX_AGE_DAYS', 'PF_FX_VALID_MAX_AGE_DAYS', 'PF_HOLDING_WRAPPER_MARKER',
    'PF_KNOWN_HOLDING_FIELDS', 'PF_RECON_KEY', 'PF_RECON_STALE_MAX_DAYS', 'PF_RESERVED_MARKER_KEYS'];
  const PF_DECLARED_NOW = (content.match(/^(?:var|const) PF_[A-Z0-9_]+/gm) || []).map(function (s) { return s.replace(/^(?:var|const) /, ''); }).sort();
  check('RD-AC11: the declared PF_* constant set is exactly the pinned base set — no new threshold beside the existing ones',
    JSON.stringify(PF_DECLARED_NOW) === JSON.stringify(PF_DECLARED_BASE.slice().sort()));
  check('RD-AC8 (structural): no Date.now()/new Date() in the readiness functions or projection helpers',
    !/Date\.now|new Date\s*\(/.test(stripped('_eodComputeReadiness') + stripped('_eodReadinessLines') + stripped('_dhLabel')));

  // ── RD-AC9 / R-D3: _pfEodIsStale byte-unchanged; relabel only ───────────────
  const IS_STALE_BASE_SHA256 = '251a554adacbe3049eda5e2ef0d5bf3003f9b13684bd95b46cc4f35a70f1d941';
  check('RD-AC9/R-D3: _pfEodIsStale extracted source is byte-identical to its pinned base',
    crypto.createHash('sha256').update(src._pfEodIsStale.replace(/\r\n/g, '\n'), 'utf8').digest('hex') === IS_STALE_BASE_SHA256);
  check('RD-AC9: _pfEodIsStale call sites unchanged (4 occurrences of the call/definition text, as at base)',
    (content.match(/_pfEodIsStale\(/g) || []).length === 4);
  const dhTable = new Function(src.DH_DISPLAY + '\nreturn DH_DISPLAY;')();
  check('R-D3: no " (stale)" / "Stale" text remains on a fetch-failure display; both now read the table\'s refresh-failed wording',
    content.indexOf("' (stale)'") === -1 && content.indexOf("staleTag.textContent = 'Stale'") === -1 &&
    content.indexOf("(m.eodStale ? ' (refresh failed)' : '')") !== -1 &&
    content.indexOf("staleTag.textContent = '" + dhTable.refreshFailed + "'") !== -1 &&
    dhTable.refreshFailed === 'Refresh failed');
  check('R-D3 (control): the pre-change literals would be caught by the same scan (proves it can fail)',
    (function () { const mutated = content.replace("(m.eodStale ? ' (refresh failed)' : '')", "(m.eodStale ? ' (stale)' : '')"); return mutated.indexOf("' (stale)'") !== -1; })());

  // ── R-J7: research recency is not-evaluated and NEVER lowers the verdict ─────
  check('R-J7: control packet carries research.recency "not-evaluated" and is still current',
    CTL.packet.readiness.dimensions.research.recency === 'not-evaluated' && CTL.packet.readiness.verdict === 'current');
  const rj7Removed = build(ctlSeed(), { patchSrc: { _eodComputeReadiness: function (s) {
    const m = s.replace(", recency: 'not-evaluated'", '');
    if (m === s) throw new Error('R-J7 mutation anchor missing');
    return m;
  } } });
  check('R-J7 (planted negative): removing the recency field leaves the verdict unchanged — recency is excluded from the rollup',
    rj7Removed.packet.readiness.verdict === CTL.packet.readiness.verdict && rj7Removed.packet.readiness.dimensions.research.recency === undefined);
  const rj7Lowering = build(ctlSeed(), { patchSrc: { _eodComputeReadiness: function (s) {
    const m = s.replace("  var verdict = 'current';", "  lower('degraded', 'research-recency');\n  var verdict = 'current';");
    if (m === s) throw new Error('R-J7 lowering mutation anchor missing');
    return m;
  } } });
  check('R-J7 (planted negative): a mutation that lets recency lower the verdict is caught by the control assertion',
    rj7Lowering.packet.readiness.verdict !== 'current');
  check('R-J7: no J7 band literal or J7 reference in the readiness path',
    !/evidence-freshness|J7|agingAfter|staleAfter/.test(authoredSrc));

  // ── R-U1: the three cash conditions from the ratified predicate ─────────────
  const u1Present = build(ctlSeed());
  const u1Old = build(ctlSeed({ pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-09-01' }) }));
  check('R-U1: cash.asOf AFTER oldestBaselineAt → present',
    u1Present.packet.readiness.dimensions.cash.condition === 'present' && u1Present.packet.readiness.dimensions.cash.asOf === '2026-09-15');
  check('R-U1: cash.asOf BEFORE oldestBaselineAt → old-user-maintained-state (named, degraded, not a forced not-representative)',
    u1Old.packet.readiness.dimensions.cash.condition === 'old-user-maintained-state' && u1Old.packet.readiness.verdict === 'degraded' &&
    !!reasonFor(u1Old.packet, 'cash-old-user-maintained-state'));
  const u1Direct = CTL.api._eodComputeReadiness({ asOf: iso(NOW_MS), symbols: [], holdings: {}, eodCache: {}, fxState: 'fresh',
    needsAttention: [], cashState: { state: 'recorded', amountILS: 1, asOf: '2020-01-01' }, oldestBaselineAt: null,
    recon: { status: 'unset' }, coverage: { researched: [], notResearched: [], failed: [], zeroAccepted: [] } });
  check('R-U1: oldestBaselineAt === null → present, however old cash.asOf is',
    u1Direct.dimensions.cash.condition === 'present' && u1Direct.verdict === 'current');
  check('R-U1: cash state !== recorded (unset / invalid) → missing/invalid',
    ['unset', 'invalid'].every(function (st) {
      return CTL.api._eodComputeReadiness({ asOf: iso(NOW_MS), symbols: [], holdings: {}, eodCache: {}, fxState: 'fresh',
        needsAttention: [], cashState: { state: st }, oldestBaselineAt: null, recon: { status: 'unset' },
        coverage: { researched: [], notResearched: [], failed: [], zeroAccepted: [] } }).dimensions.cash.condition === 'missing/invalid';
    }));

  // ── Source-mutation controls: each ruled boundary can actually fail ─────────
  const bandMut = build(ctlSeed({ pt_eod_cache: JSON.stringify(Object.assign({}, CTL_EOD, { AAA: usEntry('2026-09-11') })) }),
    { patchSrc: { _eodComputeReadiness: function (s) { const m = s.replace('age <= 1', 'age <= 99'); if (m === s) throw new Error('band anchor'); return m; } } });
  check('planted negative (N1): widening the session band makes the two-session-lag fixture read current — N1 can fail',
    bandMut.packet.readiness.dimensions.market.symbols[0].state === 'current');
  const promoteMut = build(ctlSeed({ pt_holdings: n4Hold }),
    { patchSrc: { _eodComputeReadiness: function (s) { const m = s.replace("lower('degraded', 'positions-needs-confirmation'", "lower('not-representative', 'positions-needs-confirmation'"); if (m === s) throw new Error('promote anchor'); return m; } } });
  check('planted negative (N4): promoting position age to an expiry-grade effect is caught (verdict no longer "degraded")',
    promoteMut.packet.readiness.verdict === 'not-representative');

  // ── RD-AC12: Markdown is a deterministic projection of the JSON, before Limitations ──
  const mdCtl1 = CTL.api._eodPacketToMarkdown(CTL.packet);
  const mdCtl2 = CTL.api._eodPacketToMarkdown(JSON.parse(JSON.stringify(CTL.packet)));
  check('RD-AC12: same JSON in → byte-identical Markdown out', mdCtl1 === mdCtl2);
  check('RD-AC12: "## Readiness" renders before "## Limitations"',
    mdCtl1.indexOf('## Readiness') !== -1 && mdCtl1.indexOf('## Readiness') < mdCtl1.indexOf('## Limitations') &&
    mdCtl1.indexOf('## Readiness') > mdCtl1.indexOf('Status: '));
  const readinessBlock = mdCtl1.slice(mdCtl1.indexOf('## Readiness') + '## Readiness'.length, mdCtl1.indexOf('## Limitations'));
  check('RD-AC12: the Readiness block equals the deterministic projection of packet.readiness (nothing the JSON lacks)',
    readinessBlock.trim() === CTL.api._eodReadinessLines(CTL.packet.readiness).join('\n'));
  check('RD-AC12 (control): a Markdown whose Readiness block is dropped no longer matches the projection',
    mdCtl1.replace(readinessBlock, '\n').indexOf('- Verdict:') === -1);
  const mdAll = ALL_PACKETS.map(function (p) { return CTL.api._eodPacketToMarkdown(p); });
  check('RD-AC12: every fixture renders its verdict label and every reason in the Markdown',
    ALL_PACKETS.every(function (p, i) {
      return mdAll[i].indexOf('- Verdict: ' + dhTable.verdict[p.readiness.verdict]) !== -1 &&
        p.readiness.reasons.every(function (r) { return mdAll[i].indexOf(dhTable.reason[r.class]) !== -1; });
    }));

  // ── RD-AC14: readiness is additive — the pinned-base limitation set is a subset ──
  const BASE_LIMITATIONS = [
    {
      "code": "coverage",
      "text": "Researched 2 of 3 holdings. Not researched: CCC."
    },
    {
      "code": "date-semantics",
      "text": "The \"date\" shown for each source is publication metadata from the search provider. It is not an event date and must not be read as when something happened."
    },
    {
      "code": "provider-coverage",
      "text": "Evidence comes from a single provider request per holding. Coverage is non-exhaustive — absence of a source does not mean absence of news."
    },
    {
      "code": "market-state",
      "text": "Market and session data is partial. Figures reflect only the market state currently available."
    },
    {
      "code": "reconciliation",
      "text": "Reconciliation: not recorded."
    },
    {
      "code": "fx",
      "text": "FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, fresh."
    },
    {
      "code": "staleness:AAA",
      "text": "AAA: position values were last updated 2026-09-13T12:00:00.000Z; figures derived from them are as of that date, not today."
    },
    {
      "code": "staleness:BBB",
      "text": "BBB: position values were last updated 2026-09-06T12:00:00.000Z; figures derived from them are as of that date, not today."
    },
    {
      "code": "staleness:CCC",
      "text": "CCC: position values were last updated 2026-09-15T12:00:00.000Z; figures derived from them are as of that date, not today."
    },
    {
      "code": "source-conflict:https://ex.com/shared",
      "text": "Conflicting metadata for https://ex.com/shared: title. The first-encountered values were used."
    },
    {
      "code": "synthesis:AAA",
      "text": "AAA — Synthesis: done."
    },
    {
      "code": "synthesis:BBB",
      "text": "BBB — Synthesis: pending."
    }
  ];
  check('RD-AC14: every pinned pre-DH-M1 limitation (code + text) is still present, unchanged, for the identical input',
    BASE_LIMITATIONS.length === 12 && BASE_LIMITATIONS.every(function (b) {
      return MAIN_PACKET.limitations.some(function (l) { return l.code === b.code && l.text === b.text; });
    }));
  check('RD-AC14 (control): the subset check fails if one pinned limitation is reworded',
    !BASE_LIMITATIONS.map(function (b, i) { return i === 0 ? { code: b.code, text: b.text + ' (reworded)' } : b; }).every(function (b) {
      return MAIN_PACKET.limitations.some(function (l) { return l.code === b.code && l.text === b.text; });
    }));
  check('RD-AC14: the market-state limitation still renders as prose (readiness routes nothing around it)',
    CTL.api._eodPacketToMarkdown(MAIN_PACKET).indexOf(BASE_LIMITATIONS.find(function (b) { return b.code === 'market-state'; }).text) !== -1);

  // ── RD-D2: the shared display table — exact words, single location ──────────
  check('RD-D2: verdict labels are exactly Current / Partly out of date / Not representative',
    JSON.stringify(dhTable.verdict) === JSON.stringify({ current: 'Current', degraded: 'Partly out of date', 'not-representative': 'Not representative' }));
  check('RD-D2: the ruled state words Current / Stale / Not recorded / Unavailable (reason) are all in the state table',
    dhTable.state.current === 'Current' && dhTable.state.aged === 'Stale' && dhTable.state.missing === 'Not recorded' &&
    /^Unavailable \(.+\)$/.test(dhTable.state.unknown) && dhTable.researchRecency === 'Research recency: not evaluated' &&
    dhTable.refreshFailed === 'Refresh failed');
  check('RD-D2: each ruled display phrase is defined in exactly one place in index.html',
    ['Partly out of date', 'Research recency: not evaluated'].every(function (ph) { return content.split("'" + ph + "'").length - 1 === 1; }));
  check('RD-D2: Markdown and briefing render the ruled research-recency line for the not-evaluated dimension',
    mdCtl1.indexOf('Research recency: not evaluated') !== -1 && CTL.api._eodPacketToBriefing(CTL.packet).indexOf('Research recency: not evaluated') !== -1);
  check('RD-D2: readiness projection functions never hardcode a display phrase (only reference DH_DISPLAY via _dhLabel)',
    ['Partly out of date', 'Not representative', 'Not recorded', 'Stale'].every(function (ph) { return stripped('_eodReadinessLines').indexOf("'" + ph) === -1; }));

  // ── RD-B1: briefing speaks the verdict and its reasons, transported not recomputed ──
  const brCtl = CTL.api._eodPacketToBriefing(CTL.packet);
  const brN1 = CTL.api._eodPacketToBriefing(n1.packet);
  check('RD-B1: briefing carries a Readiness section before Limitations with the verdict and each reason',
    brN1.indexOf('## Readiness') !== -1 && brN1.indexOf('## Readiness') < brN1.indexOf('## Limitations') &&
    brN1.indexOf('- Verdict: Partly out of date') !== -1 && brN1.indexOf(dhTable.reason['market-aged'] + ' — AAA') !== -1);
  check('RD-B1: briefing readiness lines are exactly the shared projection of packet.readiness',
    brN1.indexOf(CTL.api._eodReadinessLines(n1.packet.readiness).join('\n')) !== -1 && brCtl.indexOf('- Verdict: Current') !== -1);
  check('RD-B1: briefing marketStale wording is the D3 meaning; key names unchanged',
    new Function(src.NC_BRIEFING_VOCAB + '\nreturn NC_BRIEFING_VOCAB;')().marketStale === 'the last refresh of market data failed' &&
    JSON.stringify(Object.keys(new Function(src.NC_BRIEFING_VOCAB + '\nreturn NC_BRIEFING_VOCAB;')())) === JSON.stringify(['weightUnavailable', 'marketStale', 'marketUnavailable']));

  // ── No pt_* write during packet build with readiness ────────────────────────
  check('no storage write: zero localStorage writes while building + projecting a readiness packet',
    CTL.ls._writes.length === 0);
  (function () {
    const before = CTL.ls._dump();
    CTL.api._eodPacketToMarkdown(CTL.packet); CTL.api._eodPacketToBriefing(CTL.packet);
    check('no storage write: pt_* bytes byte-identical across both projections', CTL.ls._dump() === before && CTL.ls._writes.length === 0);
  })();

  // ── RD-F1: market identity + session date at the fetch boundary ─────────────
  function norm(meta, sym, providerOverride) {
    const b = buildApi({});
    return b.api._pfLiveNormalize({ chart: { result: [{ meta: Object.assign({ _provider: 'yahoo', regularMarketPrice: 100, chartPreviousClose: 99,
      currency: 'USD' }, meta), indicators: { quote: [{ close: [] }] } }] } }, sym);
  }
  const epoch = function (isoStr) { return Date.parse(isoStr) / 1000; };
  const fNy = norm({ exchangeTimezoneName: 'America/New_York', regularMarketTime: epoch('2026-09-16T02:00:00Z') }, 'AAPL');
  check('RD-F1: US via provider-meta; sessionDate is EXCHANGE-LOCAL (22:00 ET on 09-15, not the UTC date 09-16)',
    fNy.market === 'US' && fNy.marketBasis === 'provider-meta' && fNy.sessionDate === '2026-09-15');
  const fTase = norm({ exchangeTimezoneName: 'Asia/Jerusalem', currency: 'ILA', regularMarketTime: epoch('2026-09-14T22:30:00Z') }, 'NXSN.TA');
  check('RD-F1: TASE via provider-meta; sessionDate uses the TASE calendar timeZone (01:30 IDT on 09-15)',
    fTase.market === 'TASE' && fTase.marketBasis === 'provider-meta' && fTase.sessionDate === '2026-09-15');
  const fSuffix = norm({ regularMarketTime: epoch('2026-09-15T12:00:00Z') }, 'NXSN.TA');
  check('RD-F1: .TA suffix falls back to TASE ONLY when provider timezone is absent, basis symbol-suffix-fallback',
    fSuffix.market === 'TASE' && fSuffix.marketBasis === 'symbol-suffix-fallback' && fSuffix.sessionDate === '2026-09-15');
  const fNone = norm({ regularMarketTime: epoch('2026-09-15T12:00:00Z') }, 'AAPL');
  check('RD-F1: no timezone and no .TA → market null, marketBasis null, sessionDate null (fails closed)',
    fNone.market === null && fNone.marketBasis === null && fNone.sessionDate === null);
  const fNoTime = norm({ exchangeTimezoneName: 'America/New_York' }, 'AAPL');
  check('RD-F1: market resolved but no provider session time → sessionDate null (never guessed)',
    fNoTime.market === 'US' && fNoTime.sessionDate === null && fNoTime.sessionEpoch === null);
  const fOther = norm({ exchangeTimezoneName: 'Europe/London', regularMarketTime: epoch('2026-09-15T12:00:00Z') }, 'X.TA');
  check('RD-F1: an unrelated provider timezone is NOT overridden by the .TA suffix → null / null / null',
    fOther.market === null && fOther.marketBasis === null && fOther.sessionDate === null);
  check('RD-F1: existing normalized fields are unchanged (price, change_percent, source, currency, sessionEpoch)',
    fNy.price === 100 && fNy.change_percent === parseFloat(((100 - 99) / 99 * 100).toFixed(2)) && fNy.source === 'yahoo' &&
    fNy.currency === 'USD' && fNy.sessionEpoch === epoch('2026-09-16T02:00:00Z'));

  // ── RD-C1: _pfEodCacheSet writes the three fields; whole-entry replace ──────
  (function () {
    const cs = buildApi({ pt_eod_cache: JSON.stringify({ AAA: { price: 1, changePercent: 1, lastFailAt: iso(NOW_MS), fetchedAt: 'x' } }) });
    cs.api._pfEodCacheSet('AAA', fNy);
    const stored = JSON.parse(cs.ls.getItem('pt_eod_cache')).AAA;
    check('RD-C1: _pfEodCacheSet writes market / marketBasis / sessionDate and replaces the whole entry (lastFailAt dropped)',
      stored.market === 'US' && stored.marketBasis === 'provider-meta' && stored.sessionDate === '2026-09-15' &&
      stored.lastFailAt === undefined && stored.price === 100);
    const only = cs.ls._writes.filter(function (w) { return w[0] === 'set'; });
    check('RD-C1: the cache write touches only pt_eod_cache', only.length === 1 && only[0][1] === 'pt_eod_cache');
    cs.api._pfEodCacheSet('BBB', { price: 5, change_percent: 0, currency: 'USD', sessionEpoch: null });
    const legacyNorm = JSON.parse(cs.ls.getItem('pt_eod_cache')).BBB;
    check('RD-C1: a normalized quote without market identity stores null / null / null (never inferred)',
      legacyNorm.market === null && legacyNorm.marketBasis === null && legacyNorm.sessionDate === null);
  })();

  // ── RD-F2: the ONE market rule — TS1 behaviour byte-equivalent ──────────────
  const rm = CTL.api._ts1ResolveMarket;
  const BASE_RULE = [
    ['America/New_York', 'AAPL', 'US', 'provider-meta'], ['America/New_York', 'X.TA', 'US', 'provider-meta'],
    ['Asia/Jerusalem', 'NXSN.TA', 'TASE', 'provider-meta'], ['Asia/Jerusalem', 'AAPL', 'TASE', 'provider-meta'],
    [undefined, 'NXSN.TA', 'TASE', 'symbol-suffix-fallback'], [null, 'NXSN.TA', 'TASE', 'symbol-suffix-fallback'],
    ['', 'NXSN.TA', 'TASE', 'symbol-suffix-fallback'], [undefined, 'AAPL', null, null], ['', 'AAPL', null, null],
    ['Europe/London', 'X.TA', null, null], ['Europe/London', 'AAPL', null, null]
  ];
  check('RD-F2: the shared rule reproduces the pre-change _ts1FetchRawSeries market/basis table exactly (11 cases)',
    BASE_RULE.every(function (c) { const r = rm(c[0], c[1]); return r.market === c[2] && r.marketBasis === c[3]; }));
  const fetchRawSrc = extractFunctionSource(content, '_ts1FetchRawSeries');
  check('RD-F2: _ts1FetchRawSeries and _pfLiveNormalize both call the ONE shared rule; the timezone literal is defined once',
    /_ts1ResolveMarket\(/.test(fetchRawSrc) && /_ts1ResolveMarket\(/.test(src._pfLiveNormalize) &&
    (content.match(/tz === 'America\/New_York'/g) || []).length === 1 && fetchRawSrc.indexOf('America/New_York') === -1);
  check('RD-F2: the pre-change TS1 return shape is preserved (market / marketBasis still destructured into the returned series)',
    /market:\s*market/.test(fetchRawSrc) || /market,/.test(fetchRawSrc) || fetchRawSrc.indexOf('marketBasis') !== -1);
})();

console.log(failures === 0
  ? 'EOD PACKET V0: PASS (' + asserts + ' asserts)'
  : 'EOD PACKET V0: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
