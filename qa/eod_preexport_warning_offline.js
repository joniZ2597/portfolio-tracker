'use strict';

/*
 * DH-M3 — pre-export readiness warning offline QA (work/dh-preexport-warning/brief.md §6,
 * PX-1..PX-9). Pure Node, no network, no browser. Extracts DH_DISPLAY, _dhLabel,
 * EOD_PREEXPORT_COPY, _eodPreExportWarning and _eodComputeReadiness from the real index.html
 * (CRLF-normalized) and evaluates them in a sandbox. No re-implementation of production logic.
 *
 * Violable-invariant classification (every family below carries a planted negative against the
 * EXTRACTED PRODUCTION SOURCE, never a test-local reimplementation):
 *   PX-1/PX-2/PX-3 (verdict gate, reason filter), PX-4 (market-unknown note), PX-5 (footer/
 *   choice order), PX-8 (confirm placement) — genuinely DH-M3-authored branches that could
 *   silently regress.
 *   PX-6 (real _eodComputeReadiness outputs), PX-7 (purity), PX-9 (unchanged-surface byte
 *   equality) — direct structural/behavioural proof against the real extracted source; a
 *   mutation would be redundant with the byte-equality/structural checks themselves.
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
// Brace-depth-aware variant for an object-literal `var X = { ... };` whose string
// values may themselves contain a semicolon (e.g. prose copy) — a plain
// indexOf(';') would cut the extraction short at the first one inside a string.
function extractVarObjectSource(content, name) {
  const sig = 'var ' + name;
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const semi = content.indexOf(';', i);
        return semi === -1 ? null : content.slice(start, semi + 1);
      }
    }
  }
  return null;
}
function sha(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

const rawContent = fs.readFileSync(INDEX_PATH, 'utf8');
// index.html is CRLF end to end (brief §4); normalize any stray LF so extracted
// sources always carry \r\n, matching the brief's exact-text pin.
const content = rawContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

const FNS = ['_dhLabel', '_eodComputeReadiness', '_eodBuildPacket', '_eodReadinessLines',
  '_eodPacketToMarkdown', '_eodPacketToBriefing', '_eodPreExportWarning', '_eodExportPacket',
  // TS1 calendar chain — needed only so PX-6 can build one genuinely "current" market row
  // (qa/eod_packet_v0_offline.js's own DH-M1 `usEntry` fixture convention), so the fx/cash
  // scenarios there are not confounded by every holding also being market-missing.
  '_ts1AgeSessions', '_ts1ExchangeLocalParts', '_ts1IsTradingSession', '_ts1SessionCompleted',
  '_ts1SessionCloseMinutes', '_ts1RuleFor'];
const src = {};
let missingExtract = [];
for (const n of FNS) { src[n] = extractFunctionSource(content, n); if (!src[n]) missingExtract.push(n); }
src.DH_DISPLAY = extractVarSource(content, 'DH_DISPLAY');
if (!src.DH_DISPLAY) missingExtract.push('DH_DISPLAY');
src.EOD_PREEXPORT_COPY = extractVarObjectSource(content, 'EOD_PREEXPORT_COPY');
if (!src.EOD_PREEXPORT_COPY) missingExtract.push('EOD_PREEXPORT_COPY');
src.TS1_POLICY_V1 = extractVarObjectSource(content, 'TS1_POLICY_V1');
if (!src.TS1_POLICY_V1) missingExtract.push('TS1_POLICY_V1');
if (missingExtract.length > 0) {
  console.log('  FAIL  could not extract: ' + missingExtract.join(', '));
  process.exit(1);
}

// ── PX-9: unchanged surfaces — byte-equal (CR-normalized) to baseline 0522247 ──
// sha256s computed at authoring time from `git show 0522247:index.html`, CRLF-normalized (the
// blob itself is LF-stored; the working tree is CRLF via core.autocrlf — the same normalization
// this suite applies to `content` above), recorded in review.md.
const BASELINE_SHA256 = {
  _eodComputeReadiness: '085de316864f9b16f620d7fc1eef6bac31b6aa9caa73d32f5457b08b7d47aa2c',
  _eodBuildPacket: 'aa8a41a6149a228daa0d2a113f2b8f32964095e18eb7687d00770b51b5f35f73',
  _eodReadinessLines: 'd1b7c64763db7a28f0719e0c0047e29f8d37e452675ac7dca0c85388204771e9',
  _eodPacketToMarkdown: 'bdaba2e2a460b07e6873a25ff64e3a8351dfbd1663be61047e268ad482879967',
  _eodPacketToBriefing: '120d02d68633dc9343555bcddb51cd8043b851e6affc307888c7531d80806869',
  _dhLabel: '1d95989fe9eea086a34a44bd9d2fe1fef3411b721d941e87236f1023c658ee41',
  DH_DISPLAY: '764b9d30766d45ecc685fe94e328baf88cbf193b75e5eb634b03503fb3fa2938'
};
Object.keys(BASELINE_SHA256).forEach(function (n) {
  check('PX-9: ' + n + ' byte-equal (sha256) to baseline 0522247', sha(src[n]) === BASELINE_SHA256[n]);
});
check('PX-9: no new pt_* / localStorage reference in _eodPreExportWarning',
  !/pt_[a-zA-Z_]+|localStorage/.test(src._eodPreExportWarning));
check('PX-9: no scoring-surface reference in _eodPreExportWarning',
  !/_ptScore|orchestrate|analyzeChunk|enforceScoreConsistency/.test(src._eodPreExportWarning));
check('PX-9: no scoring-surface reference in EOD_PREEXPORT_COPY',
  !/_ptScore|orchestrate|analyzeChunk|enforceScoreConsistency/.test(src.EOD_PREEXPORT_COPY));

// ── sandbox: pure functions only, no localStorage/document ──────────────────
function buildApi(patchSrc) {
  const localSrc = Object.assign({}, src);
  if (patchSrc) {
    for (const fnName of Object.keys(patchSrc)) {
      localSrc[fnName] = patchSrc[fnName](localSrc[fnName]);
    }
  }
  const VARS = ['DH_DISPLAY', 'EOD_PREEXPORT_COPY', 'TS1_POLICY_V1'];
  const CORE_FNS = ['_dhLabel', '_eodComputeReadiness', '_eodPreExportWarning',
    '_ts1AgeSessions', '_ts1ExchangeLocalParts', '_ts1IsTradingSession', '_ts1SessionCompleted',
    '_ts1SessionCloseMinutes', '_ts1RuleFor'];
  const body = VARS.map(n => localSrc[n]).join('\n') + '\n' + CORE_FNS.map(n => localSrc[n]).join('\n') +
    '\nreturn { ' + CORE_FNS.concat(VARS).map(n => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  const factory = new Function('"use strict";\n' + body);
  return factory();
}
const API = buildApi();

// ── PX-7: purity (structural) ────────────────────────────────────────────────
check('PX-7: extracted _eodPreExportWarning source contains no window/document/localStorage/' +
  'fetch/Date/Math.random/confirm',
  !/\bwindow\b|\bdocument\b|localStorage|fetch\s*\(|\bDate\b|Math\.random|\bconfirm\s*\(/.test(stripComments(src._eodPreExportWarning)));

function notRepReadiness(overrideReasons) {
  return { verdict: 'not-representative', reasons: overrideReasons || [
    { class: 'market-missing', effect: 'not-representative', symbols: ['AAA'] }
  ] };
}
const R1 = notRepReadiness();
const out1 = API._eodPreExportWarning(R1);
const out2 = API._eodPreExportWarning(R1);
check('PX-7: calling twice on the identical input gives identical output', out1 === out2);
const before = JSON.stringify(R1);
API._eodPreExportWarning(R1);
check('PX-7: input is not mutated', JSON.stringify(R1) === before);

// ── PX-1: current / degraded (incl. every degraded-only reason class) -> null ──
(function () {
  const cases = {
    current: { verdict: 'current', reasons: [{ class: 'all-dimensions-within-band', effect: 'current' }] },
    'degraded fx-aged': { verdict: 'degraded', reasons: [{ class: 'fx-aged', effect: 'degraded' }] },
    'degraded research-coverage': { verdict: 'degraded', reasons: [{ class: 'research-coverage', effect: 'degraded', symbols: ['AAA'] }] },
    'degraded positions-needs-confirmation': { verdict: 'degraded', reasons: [{ class: 'positions-needs-confirmation', effect: 'degraded', symbols: ['AAA'] }] },
    'degraded cash-old-user-maintained-state': { verdict: 'degraded', reasons: [{ class: 'cash-old-user-maintained-state', effect: 'degraded' }] },
    'degraded partial market (market-aged only, degraded effect)': { verdict: 'degraded', reasons: [{ class: 'market-aged', effect: 'degraded', symbols: ['AAA'] }] }
  };
  Object.keys(cases).forEach(function (label) {
    check('PX-1: ' + label + ' -> null', API._eodPreExportWarning(cases[label]) === null);
  });
  check('PX-1: null/undefined/no-reasons-array readiness -> null',
    API._eodPreExportWarning(null) === null && API._eodPreExportWarning(undefined) === null &&
    API._eodPreExportWarning({ verdict: 'not-representative' }) === null);
})();

// ── PX-2: not-representative -> string, first line exact ────────────────────
(function () {
  const out = API._eodPreExportWarning(notRepReadiness());
  check('PX-2: not-representative returns a string', typeof out === 'string');
  check('PX-2: first line is the exact heading + verdict word',
    out.split('\n')[0] === 'Export check — this EOD packet is Not representative.');
})();

// ── PX-3: only not-representative-effect reasons listed, packet order, a
// degraded reason in the same readiness is absent ───────────────────────────
(function () {
  const r = {
    verdict: 'not-representative',
    reasons: [
      { class: 'market-missing', effect: 'not-representative', symbols: ['AAA', 'BBB'] },
      { class: 'fx-aged', effect: 'degraded' },
      { class: 'cash-missing-or-invalid', effect: 'not-representative' }
    ]
  };
  const out = API._eodPreExportWarning(r);
  const lines = out.split('\n');
  check('PX-3: market-missing line present with symbols',
    lines.indexOf('- Market data: Not recorded — AAA, BBB') !== -1);
  check('PX-3: cash-missing-or-invalid line present, after market-missing (packet order)',
    lines.indexOf('- Cash: Not recorded') > lines.indexOf('- Market data: Not recorded — AAA, BBB'));
  check('PX-3: the degraded fx-aged reason is absent from the dialog',
    out.indexOf('FX rate: Stale') === -1);
})();

// ── PX-4: market note present iff market-unknown is listed ──────────────────
(function () {
  const withUnknown = API._eodPreExportWarning({
    verdict: 'not-representative',
    reasons: [{ class: 'market-unknown', effect: 'not-representative', symbols: ['AAA'] }]
  });
  check('PX-4: market note present when market-unknown is a listed reason',
    withUnknown.indexOf('Prices cached before the readiness check was added') !== -1);
  const withoutUnknown = API._eodPreExportWarning({
    verdict: 'not-representative',
    reasons: [{ class: 'cash-missing-or-invalid', effect: 'not-representative' }]
  });
  check('PX-4: market note absent when market-unknown is not listed',
    withoutUnknown.indexOf('Prices cached before the readiness check was added') === -1);
  const unknownDegraded = API._eodPreExportWarning({
    verdict: 'not-representative',
    reasons: [
      { class: 'market-unknown', effect: 'degraded', symbols: ['AAA'] },
      { class: 'cash-missing-or-invalid', effect: 'not-representative' }
    ]
  });
  check('PX-4: market note absent when market-unknown is present but only at degraded effect',
    unknownDegraded.indexOf('Prices cached before the readiness check was added') === -1);
})();

// ── PX-5: footer + choice lines present, last, in order ─────────────────────
(function () {
  const out = API._eodPreExportWarning(notRepReadiness());
  const lines = out.split('\n');
  check('PX-5: footer is the second-to-last line',
    lines[lines.length - 2] === 'The export will include these limitations in its Readiness section.');
  check('PX-5: choice is the last line',
    lines[lines.length - 1] === 'OK = export anyway · Cancel = go back without exporting.');
})();

// ── PX-6: real _eodComputeReadiness outputs (direct-call fixture shape,
// qa/eod_packet_v0_offline.js:1091-1093 convention). NOW_MS = 2026-09-16T12:00Z
// / sessionDate 2026-09-15 = a genuinely "current" (ageSessions 0) US market
// row — the same NOW/session pairing qa/eod_packet_v0_offline.js's DH-M1
// `usEntry`/`ctlSeed` fixture already establishes — so the cash/fx scenarios
// below are not confounded by every holding also being market-missing. ──────
(function () {
  function usEntry(sessionDate) {
    return { market: 'US', marketBasis: 'provider-meta', sessionDate: sessionDate };
  }
  function baseArgs(over) {
    return Object.assign({
      asOf: '2026-09-16T12:00:00.000Z', symbols: ['AAA'],
      holdings: { AAA: { currency: 'USD', _corrupt: false } },
      eodCache: { AAA: usEntry('2026-09-15') }, fxState: 'fresh', needsAttention: [],
      cashState: { state: 'recorded', amountILS: 100, asOf: '2026-09-01' },
      oldestBaselineAt: null, recon: { status: 'unset' },
      coverage: { researched: ['AAA'], notResearched: [], failed: [], zeroAccepted: [] }
    }, over || {});
  }
  const clean = API._eodComputeReadiness(baseArgs());
  check('PX-6 sanity: the default fixture market row is genuinely current', clean.dimensions.market.symbols[0].state === 'current');
  check('PX-6 sanity: the default fixture is genuinely current end to end', clean.verdict === 'current');

  const allMarketsMissing = API._eodComputeReadiness(baseArgs({ eodCache: {} }));
  check('PX-6 sanity: all markets missing -> not-representative', allMarketsMissing.verdict === 'not-representative');
  check('PX-6: all-markets-missing readiness -> warns', API._eodPreExportWarning(allMarketsMissing) !== null);

  const cashMissing = API._eodComputeReadiness(baseArgs({ cashState: { state: 'unset' } }));
  check('PX-6 sanity: cash missing, market current -> not-representative purely from cash', cashMissing.verdict === 'not-representative');
  check('PX-6: cash-missing readiness -> warns', API._eodPreExportWarning(cashMissing) !== null);

  const fxMissingUsd = API._eodComputeReadiness(baseArgs({ fxState: 'missing' }));
  check('PX-6 sanity: fx missing with a USD holding, market current -> not-representative purely from fx',
    fxMissingUsd.verdict === 'not-representative');
  check('PX-6: fx-missing-with-USD readiness -> warns', API._eodPreExportWarning(fxMissingUsd) !== null);

  const fxMissingNoUsd = API._eodComputeReadiness(baseArgs({
    holdings: { AAA: { currency: 'ILS', _corrupt: false } },
    fxState: 'missing'
  }));
  check('PX-6 sanity: fx missing with no USD holding, market current -> degraded (not not-representative)',
    fxMissingNoUsd.verdict === 'degraded');
  check('PX-6: fx-missing-no-USD readiness -> null (degraded never warns)', API._eodPreExportWarning(fxMissingNoUsd) === null);
})();

// ── PX-8: wiring (static, real _eodExportPacket source) ──────────────────────
(function () {
  const s = src._eodExportPacket;
  const stripped = stripComments(s);
  const warnMatches = stripped.match(/_eodPreExportWarning\(packet\.readiness\)/g) || [];
  check('PX-8: exactly one _eodPreExportWarning(packet.readiness) call', warnMatches.length === 1);
  const confirmMatches = stripped.match(/window\.confirm\(/g) || [];
  check('PX-8: exactly one window.confirm( call', confirmMatches.length === 1);

  const buildIdx = stripped.indexOf('_eodBuildPacket(');
  const warnIdx = stripped.indexOf('_eodPreExportWarning(packet.readiness)');
  const confirmIdx = stripped.indexOf('window.confirm(');
  const mdIdx = stripped.indexOf('_eodPacketToMarkdown(');
  const downloadIdx = stripped.indexOf('_ptDownload(');
  check('PX-8: warning call is after _eodBuildPacket( and before _eodPacketToMarkdown(/_ptDownload(',
    buildIdx !== -1 && warnIdx > buildIdx && warnIdx < mdIdx && warnIdx < downloadIdx);
  check('PX-8: window.confirm( is after _eodBuildPacket( and before _eodPacketToMarkdown(/_ptDownload(',
    confirmIdx > buildIdx && confirmIdx < mdIdx && confirmIdx < downloadIdx);

  const exactGuard = 'if (preExportWarning !== null && !window.confirm(preExportWarning)) return;';
  check('PX-8: the guard is exactly the ruled text', stripped.indexOf(exactGuard) !== -1);

  const downloadCalls = stripped.match(/_ptDownload\(/g) || [];
  check('PX-8: still exactly three _ptDownload calls', downloadCalls.length === 3);
  check('PX-8: json download line byte-unchanged',
    s.indexOf("_ptDownload(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }), 'eod_packet_' + ts + '.json');") !== -1);
  check('PX-8: markdown download line byte-unchanged',
    s.indexOf("_ptDownload(new Blob([md], { type: 'text/markdown' }), 'eod_packet_' + ts + '.md');") !== -1);
})();

// ═══ Planted negatives against the EXTRACTED PRODUCTION SOURCE ═════════════
(function PLANTED_NEGATIVES() {
  // PX-1/2/3: remove the verdict gate -> degraded now warns too.
  (function () {
    const marker = "if (!r || r.verdict !== 'not-representative' || !Array.isArray(r.reasons)) return null;";
    check('sanity: verdict-gate mutation anchor present', src._eodPreExportWarning.indexOf(marker) !== -1);
    const mutated = buildApi({ _eodPreExportWarning: function (fnSrc) {
      return fnSrc.replace(marker, "if (!r || !Array.isArray(r.reasons)) return null;");
    } });
    const degraded = { verdict: 'degraded', reasons: [{ class: 'fx-aged', effect: 'degraded' }] };
    check('planted negative (PX-1): removing the verdict gate makes a degraded readiness warn',
      mutated._eodPreExportWarning(degraded) !== null);
  })();

  // PX-3: drop the effect filter -> a degraded reason leaks into the listing.
  (function () {
    const marker = "if (!x || x.effect !== 'not-representative') return;";
    check('sanity: effect-filter mutation anchor present', src._eodPreExportWarning.indexOf(marker) !== -1);
    const mutated = buildApi({ _eodPreExportWarning: function (fnSrc) {
      return fnSrc.replace(marker, "if (!x) return;");
    } });
    const r = { verdict: 'not-representative', reasons: [
      { class: 'cash-missing-or-invalid', effect: 'not-representative' },
      { class: 'fx-aged', effect: 'degraded' }
    ] };
    check('planted negative (PX-3): dropping the effect filter leaks the degraded fx-aged reason',
      mutated._eodPreExportWarning(r).indexOf('FX rate: Stale') !== -1);
  })();

  // PX-4: always show the market note regardless of hasUnknown.
  (function () {
    const marker = 'if (hasUnknown) lines.push(';
    check('sanity: market-note-gate mutation anchor present', src._eodPreExportWarning.indexOf(marker) !== -1);
    const mutated = buildApi({ _eodPreExportWarning: function (fnSrc) {
      return fnSrc.replace(marker, 'if (true) lines.push(');
    } });
    const r = { verdict: 'not-representative', reasons: [{ class: 'cash-missing-or-invalid', effect: 'not-representative' }] };
    check('planted negative (PX-4): forcing the note always-on shows it with no market-unknown reason',
      mutated._eodPreExportWarning(r).indexOf('Prices cached before the readiness check was added') !== -1);
  })();

  // PX-5: drop the footer/choice push -> last line is no longer the choice line.
  (function () {
    const marker = "lines.push('', EOD_PREEXPORT_COPY.footer, EOD_PREEXPORT_COPY.choice);";
    check('sanity: footer/choice mutation anchor present', src._eodPreExportWarning.indexOf(marker) !== -1);
    const mutated = buildApi({ _eodPreExportWarning: function (fnSrc) {
      return fnSrc.replace(marker, '/* mutated: no-op */;');
    } });
    const out = mutated._eodPreExportWarning(notRepReadiness());
    const lines = out.split('\n');
    check('planted negative (PX-5): dropping the footer/choice push removes the choice as the last line',
      lines[lines.length - 1] !== 'OK = export anyway · Cancel = go back without exporting.');
  })();

  // PX-8: move the confirm guard after the markdown projection — the
  // before-markdown static-order assertion flips.
  (function () {
    const marker = 'var preExportWarning = _eodPreExportWarning(packet.readiness);\r\n' +
      '  if (preExportWarning !== null && !window.confirm(preExportWarning)) return;\r\n';
    check('sanity: PX-8 mutation anchor present in extracted source', src._eodExportPacket.indexOf(marker) !== -1);
    const mdMarker = '  var md = _eodPacketToMarkdown(packet);\r\n';
    const mutated = src._eodExportPacket.replace(marker, '').replace(mdMarker, mdMarker + marker);
    const strippedMut = stripComments(mutated);
    const mdIdxMut = strippedMut.indexOf('_eodPacketToMarkdown(');
    const confirmIdxMut = strippedMut.indexOf('window.confirm(');
    check('planted negative (PX-8): moving the guard after the markdown projection flips the "before markdown" ordering',
      confirmIdxMut > mdIdxMut);
  })();
})();

console.log((failures === 0 ? 'PASS' : 'FAIL') + ' (' + (asserts - failures) + '/' + asserts + ')');
if (failures > 0) process.exit(1);
