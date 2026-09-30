'use strict';

/*
 * DH-M2 — UI state vocabulary offline QA (work/dh-ui-vocabulary/brief.md §6).
 *
 * Pure Node, no network, no browser. Static structural assertions over
 * index.html (DH-M1 suite pattern, qa/eod_packet_v0_offline.js): the eight
 * U1-U8 display sites must take their words from DH_DISPLAY / _dhLabel, every
 * branch condition must be byte-unchanged, the out-of-scope surfaces must stay
 * byte-unchanged, and no threshold / owner / persistence drift is allowed.
 * Every assertion family carries a control fixture proving it can fail.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');
const SRC = fs.readFileSync(INDEX_PATH, 'utf8').replace(/\r\n/g, '\n');

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
  const start = content.indexOf('function ' + name + '(');
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
// Function replacer: a large replacement string must not be read for `$` patterns.
const swap = (content, from, to) => content.replace(from, () => to);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Evaluate the real DH_DISPLAY + _dhLabel source (a top-level var + function).
function loadDisplay(content) {
  const m = content.match(/var DH_DISPLAY = \{[\s\S]*?\n\};/);
  const fn = extractFunctionSource(content, '_dhLabel');
  if (!m || !fn) return null;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\n' + fn + '\nthis.DH_DISPLAY = DH_DISPLAY; this._dhLabel = _dhLabel;', ctx);
  return ctx;
}

// ---------------------------------------------------------------- site table
const PANEL = '_renderPortfolioPanel';
const BANNER = 'checkAndShowStaleBanner';
const SITES = [
  { id: 'U1', fn: PANEL, anchor: "fxChipVal.textContent = 'FX ' + fxLabel + ' — ' + _dhFxAgedLabel(_pfFxAgeWholeDays(fxCache));", lhs: 'fxChipVal.textContent',
    cond: /\} else if \(fxState === 'aged-but-valid'\) \{[\s\S]*?\} else \{\s*fxChipVal\.textContent = 'FX '/,
    scope: { fxLabel: '1.2345 · Sep 1 · BOI' }, expect: 'FX 1.2345 · Sep 1 · BOI — Stale, not used in totals',
    refs: ["_dhLabel('state', 'stale-invalid')"], before: ' — stale, not used in totals' },
  { id: 'U2', fn: PANEL, anchor: "recon.status === 'unset'", lhs: 'reconVal.textContent', scope: {},
    expect: 'Broker total — Not recorded', refs: ["_dhLabel('state', 'unset')"], before: '(not recorded)' },
  { id: 'U3', fn: PANEL, anchor: "recon.status === 'invalid'", lhs: 'reconVal.textContent', scope: {},
    expect: 'Broker total — Unavailable (invalid record)', refs: ["_dhLabel('state', 'invalid')"], before: '(data invalid)' },
  { id: 'U4', fn: PANEL, anchor: "recon.status === 'stale'", lhs: 'reconVal.textContent', scope: {},
    expect: 'Broker total — Stale', refs: ["_dhLabel('state', 'stale')"], before: 'Comparison may be stale' },
  { id: 'U5', fn: PANEL, anchor: "recon.status === 'total-incomplete'", lhs: 'reconVal.textContent', scope: {},
    expect: 'Reconciliation — Unavailable (totals incomplete)', refs: ["_dhLabel('state', 'total-incomplete')"],
    before: "'Reconciliation unavailable'" },
  { id: 'U6', fn: PANEL, anchor: '!pl3.fxUsable', lhs: 'pl3FxEl.textContent', scope: {},
    expect: 'Unrealized P/L (ILS) — Unavailable (FX rate not usable)', refs: ["DH_DISPLAY.surface['pl-fx-not-usable']"],
    before: 'FX unavailable' },
  { id: 'U7', fn: PANEL, anchor: 'res._aiUnavailable === true', lhs: 'resStEl.textContent', scope: {},
    expect: 'Unavailable (AI analysis)', refs: ["DH_DISPLAY.surface['ai-unavailable']"], before: "'AI unavailable'" },
  { id: 'U8', fn: BANNER, anchor: 'STALE_RESULT_THRESHOLD_MS', lhs: '_showStaleBanner(', scope: { label: 'Sep 1 · 09:00 AM' },
    expect: 'Stale — results from Sep 1 · 09:00 AM · re-run scan for latest data', refs: ["_dhLabel('state', 'stale')"],
    before: "'Results from '" },
  // DH-M2b (work/dh-ruled-surfaces/brief.md §3) — three additional render-only sites.
  { id: 'B1', fn: PANEL, anchor: "if (fxState === 'missing') {", lhs: 'fxChipVal.textContent', scope: {},
    expect: 'Unavailable (no rate fetched)', refs: ["DH_DISPLAY.surface['fx-not-fetched']"], before: "'FX unavailable'" },
  { id: 'B2', fn: PANEL, anchor: '} else if (!res) {', lhs: 'resStEl.textContent', scope: {},
    expect: 'Not recorded', refs: ["_dhLabel('state', 'missing')"], before: "'No research'" },
  { id: 'B3', fn: BANNER, anchor: 'timestamps.length === 0', lhs: '_showStaleBanner(', scope: {},
    expect: 'Unavailable (scan date unknown) — results from a previous session · re-run scan for latest data',
    refs: ["DH_DISPLAY.surface['scan-date-unknown']"],
    before: 'Scan results are from a previous session (date unknown) — re-run scan to get current data' }
];

// Returns the assignment RHS (or call argument for U8) of the site, or null.
function siteExpr(content, site) {
  const fn = extractFunctionSource(content, site.fn);
  if (!fn) return null;
  const a = fn.indexOf(site.anchor);
  if (a === -1) return null;
  const tail = fn.slice(a + site.anchor.length);
  const l = tail.indexOf(site.lhs);
  if (l === -1) return null;
  const rest = tail.slice(l + site.lhs.length);
  if (site.lhs.endsWith('(')) {
    const e = rest.indexOf(');');
    return e === -1 ? null : rest.slice(0, e);
  }
  const e = rest.indexOf(';');
  const eq = rest.indexOf('=');
  return e === -1 || eq === -1 ? null : rest.slice(eq + 1, e).trim();
}

// Runs every U-site assertion against `content`; returns a list of failure strings.
function runSiteChecks(content) {
  const out = [];
  const ctx = loadDisplay(content);
  const fnPanel = extractFunctionSource(content, PANEL);
  if (!ctx || !fnPanel) return ['display table or panel function not extractable'];
  for (const site of SITES) {
    const expr = siteExpr(content, site);
    if (expr === null) { out.push(site.id + ' site not found'); continue; }
    // UV-1: references + rendered words
    for (const ref of site.refs) if (expr.indexOf(ref) === -1) out.push(site.id + ' missing ref ' + ref);
    const scope = Object.assign({}, site.scope, { DH_DISPLAY: ctx.DH_DISPLAY, _dhLabel: ctx._dhLabel });
    let rendered;
    try { rendered = vm.runInNewContext('(' + expr + ')', scope); } catch (e) { rendered = 'EVAL-ERROR ' + e.message; }
    if (rendered !== site.expect) out.push(site.id + ' renders ' + JSON.stringify(rendered) + ' != ' + JSON.stringify(site.expect));
    // UV-2: before literal absent AT the site
    if (expr.indexOf(site.before) !== -1) out.push(site.id + ' still carries before literal ' + site.before);
  }
  return out;
}

// ------------------------------------------------------------------- UV-1/2
const real = runSiteChecks(SRC);
check('UV-1/UV-2: all eight U1-U8 sites render the after text from DH_DISPLAY, no before literal (' + real.join('; ') + ')', real.length === 0);

// Controls: a fixture keeping a before-literal (or dropping the table word) must fail.
for (const site of SITES) {
  const expr = siteExpr(SRC, site);
  const fnSrc = extractFunctionSource(SRC, site.fn);
  const fixture = swap(SRC, fnSrc, fnSrc.replace(expr, "'" + site.before.replace(/'/g, '') + "'"));
  check('UV-1/UV-2 control: fixture keeping the ' + site.id + ' before-literal is rejected', runSiteChecks(fixture).length > 0);
}

// ---------------------------------------------------------------------- UV-3
const CONDS = [
  ['U1', PANEL, SITES[0].cond],
  ['U2', PANEL, /if \(recon\.status === 'unset'\) \{\s*reconVal\.textContent/],
  ['U3', PANEL, /\} else if \(recon\.status === 'invalid'\) \{\s*reconVal\.textContent[^\n]*\n\s*reconVal\.style\.color = 'var\(--red2\)';/],
  ['U4', PANEL, /\} else if \(recon\.status === 'stale'\) \{\s*reconVal\.textContent[^\n]*\n\s*reconVal\.style\.color = 'var\(--yellow2\)';/],
  ['U5', PANEL, /\} else if \(recon\.status === 'total-incomplete'\) \{\s*reconVal\.textContent[^\n]*\n\s*reconVal\.style\.color = 'var\(--text3\)';/],
  ['U6', PANEL, /\} else if \(!pl3\.fxUsable\) \{\s*var pl3FxEl = document\.createElement\('div'\);\s*pl3FxEl\.className {3}= 'pf-pos-pl pf-pos-pl--muted';\s*pl3FxEl\.textContent/],
  ['U7', PANEL, /\} else if \(res\._aiUnavailable === true\) \{\s*var resStEl = document\.createElement\('span'\);\s*resStEl\.className = 'pf-res-state unavail';\s*resStEl\.textContent/],
  ['U8', BANNER, /if \(\(Date\.now\(\) - mostRecent\) > STALE_RESULT_THRESHOLD_MS\) \{\s*const d = new Date\(mostRecent\);/],
  // DH-M2b RB-3 — B1-B3 branch conditions byte-unchanged.
  ['B1', PANEL, /if \(fxState === 'missing'\) \{\s*fxChipVal\.textContent/],
  ['B2', PANEL, /\} else if \(!res\) \{\s*var resStEl = document\.createElement\('span'\);\s*resStEl\.className = 'pf-res-state missing';\s*resStEl\.textContent/],
  ['B3', BANNER, /if \(timestamps\.length === 0\) \{\s*\/\/ Legacy results with no timestamp — pre-Improvement 2\s*_showStaleBanner\(/]
];
function condFailures(content) {
  return CONDS.filter(([, fn, re]) => {
    const f = extractFunctionSource(content, fn);
    return !f || !re.test(f);
  }).map(([id]) => id);
}
check('UV-3: U1-U8 branch conditions / styles present exactly as at baseline (' + condFailures(SRC).join(',') + ')', condFailures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, PANEL);
  const mutated = swap(SRC, f, f.replace("recon.status === 'stale'", "recon.status === 'aged'"));
  check('UV-3 control: a changed condition is detected', condFailures(mutated).indexOf('U4') !== -1);
  const mutatedB2 = swap(SRC, f, f.replace('} else if (!res) {', "} else if (!res && false) {"));
  check('RB-3 control: a changed B2 condition is detected', condFailures(mutatedB2).indexOf('B2') !== -1);
}

// UV-4 retired (DH-M4b, work/dh-fx-aged-current/brief.md §6): both of its
// out-of-scope literals (`fxLabel + ' (aged)'`, `'FX as of '`) are now in
// scope — AG-5 below supersedes its coverage.
const count = (s, t) => s.split(t).length - 1;

// ---------------------------------------------------------------------- UV-5
const BASE_DISPLAY = {
  verdict: { 'current': 'Current', 'degraded': 'Partly out of date', 'not-representative': 'Not representative' },
  state: {
    'current': 'Current', 'fresh': 'Current', 'present': 'Current',
    'aged': 'Stale', 'aged-but-valid': 'Current', 'stale-invalid': 'Stale', 'stale': 'Stale',
    'old-user-maintained-state': 'Stale',
    'missing': 'Not recorded', 'unset': 'Not recorded', 'missing/invalid': 'Not recorded',
    'unknown': 'Unavailable (market not established)',
    'invalid': 'Unavailable (invalid record)',
    'total-incomplete': 'Unavailable (totals incomplete)',
    'needs-confirmation': 'Needs confirmation'
  },
  reason: {
    'market-aged': 'Market data: Stale',
    'market-unknown': 'Market data: Unavailable (market not established)',
    'market-missing': 'Market data: Not recorded',
    'fx-aged': 'FX rate: Stale',
    'fx-stale-invalid': 'FX rate: Stale',
    'fx-missing': 'FX rate: Unavailable (no rate fetched)',
    'positions-needs-confirmation': 'Positions: Needs confirmation',
    'cash-missing-or-invalid': 'Cash: Not recorded',
    'cash-old-user-maintained-state': 'Cash: Stale (owner-maintained, set before the oldest position baseline)',
    'research-coverage': 'Research coverage: incomplete',
    'all-dimensions-within-band': 'All dimensions within their own band'
  },
  refreshFailed: 'Refresh failed',
  researchRecency: 'Research recency: not evaluated'
};
const SURFACE = {
  'pl-fx-not-usable': 'Unavailable (FX rate not usable)', 'ai-unavailable': 'Unavailable (AI analysis)',
  'fx-not-fetched': 'Unavailable (no rate fetched)', 'scan-date-unknown': 'Unavailable (scan date unknown)'
};
function displayFailures(d) {
  const bad = [];
  if (!d) return ['not extractable'];
  const keys = Object.keys(d).sort().join(',');
  if (keys !== Object.keys(BASE_DISPLAY).concat('surface').sort().join(',')) bad.push('group set ' + keys);
  for (const g of Object.keys(BASE_DISPLAY)) {
    if (JSON.stringify(d[g]) !== JSON.stringify(BASE_DISPLAY[g])) bad.push('baseline group changed: ' + g);
  }
  if (JSON.stringify(d.surface) !== JSON.stringify(SURFACE)) bad.push('surface group != the two DH-M2 entries plus the two DH-M2b §3 entries');
  return bad;
}
{
  const ctx = loadDisplay(SRC);
  const bad = displayFailures(ctx && JSON.parse(JSON.stringify(ctx.DH_DISPLAY)));
  check('UV-5: DH_DISPLAY additive — baseline groups equal, `surface` has exactly four entries (' + bad.join('; ') + ')', bad.length === 0);
  const tampered = JSON.parse(JSON.stringify(ctx ? ctx.DH_DISPLAY : {}));
  if (tampered.state) tampered.state.missing = 'Unavailable (no rate fetched)';
  check('UV-5 control: a changed baseline value is detected', displayFailures(tampered).length > 0);
  const extra = JSON.parse(JSON.stringify(ctx ? ctx.DH_DISPLAY : {}));
  if (extra.surface) extra.surface.extra = 'x';
  check('UV-5 control: an extra surface entry is detected', displayFailures(extra).length > 0);
  check('UV-5: _dhLabel source unchanged', sha(extractFunctionSource(SRC, '_dhLabel') || '') === sha(
    "function _dhLabel(group, code) {\n  var g = DH_DISPLAY[group];\n  if (g && Object.prototype.hasOwnProperty.call(g, code)) return g[code];\n  return String(code);\n}"));
}

// ---------------------------------------------------------------------- UV-6
const FN_HASHES = {
  _pfEodIsStale: '251a554adacbe3049eda5e2ef0d5bf3003f9b13684bd95b46cc4f35a70f1d941',
  _pfFxState: 'e59989a2b68b42bbca26f52e282867edf808d973431368ebc5229feeedbfe0fc',
  _pfComputeReconciliation: '175a6ae8ddebc611a4c4cf93e5b08d912d09ebbfbbfcb89aacf770b616c8dbed',
  _pfComputeNeedsAttention: 'f42b25e470602b4b3d0456e7b49ad0fb1d4f44c24a76931495e65319de274545',
  _pfComputePortfolioReporting: '2b62766507c2d90455e484882ae6cef40da387b724e1ca42081f9590d60e041b'
};
const CONST_HASH = '8c802d21fa4e580a6d61623751b8f70e7abfd8f008efaece45e24d656e26561c';
function constHash(content) {
  const lines = content.split('\n').filter((l) => /^\s*(?:const|var|let)\s+(PF_\w+|STALE_RESULT_THRESHOLD_MS)\b/.test(l));
  return sha(lines.join('\n'));
}
for (const name of Object.keys(FN_HASHES)) {
  const f = extractFunctionSource(SRC, name);
  check('UV-6: ' + name + ' source byte-equal to baseline (CR-normalized)', f !== null && sha(f) === FN_HASHES[name]);
}
check('UV-6: PF_* constants and STALE_RESULT_THRESHOLD_MS declarations equal baseline', constHash(SRC) === CONST_HASH);
check('UV-6 control: a changed threshold is detected', constHash(swap(SRC, 'PF_FX_VALID_MAX_AGE_DAYS = 6;', 'PF_FX_VALID_MAX_AGE_DAYS = 7;')) !== CONST_HASH);
{
  const f = extractFunctionSource(SRC, '_pfFxState');
  const mutated = swap(SRC, f, f.replace('fresh', 'fresh2'));
  check('UV-6 control: a changed owner function is detected', sha(extractFunctionSource(mutated, '_pfFxState')) !== FN_HASHES._pfFxState);
}

// ---------------------------------------------------------------------- UV-7
const FORBIDDEN = ['localStorage.setItem', 'pt_', 'orchestrate(', 'analyzeChunk(', 'enforceScoreConsistency'];
// Line-level pin: the exact set of lines carrying a forbidden token is hashed, so a
// token moved from one line to another (add + remove) fails, not just a count change.
// Baseline: the panel has one such line (a pt_holdings comment); the banner has none.
const FORBIDDEN_LINE_HASH = {
  [PANEL]: 'fecd54030753bb4126976bb0fffa3e6229bb243c10c15a035a82ca23486d961a',
  [BANNER]: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
};
function forbiddenLineHash(content, fn) {
  const f = extractFunctionSource(content, fn) || '';
  return sha(f.split('\n').filter((l) => FORBIDDEN.some((t) => l.indexOf(t) !== -1)).join('\n'));
}
for (const fn of [PANEL, BANNER]) {
  check('UV-7: ' + fn + ' introduces no storage write / pt_* access / scoring call (line-level pin)',
    forbiddenLineHash(SRC, fn) === FORBIDDEN_LINE_HASH[fn]);
}
{
  const f = extractFunctionSource(SRC, BANNER);
  const added = swap(SRC, f, f.replace('_hideStaleBanner();', "_hideStaleBanner(); localStorage.setItem('pt_results', '');"));
  check('UV-7 control: an added storage write is detected', forbiddenLineHash(added, BANNER) !== FORBIDDEN_LINE_HASH[BANNER]);
  const g = extractFunctionSource(SRC, PANEL);
  const shifted = swap(SRC, g, g.replace('// corrupted-but-possibly-non-empty pt_holdings must never present as', '// corrupted-but-possibly-non-empty holdings must never present as').replace('var pl3FxEl = document.createElement', "var _pl = localStorage.getItem('pt_x'); var pl3FxEl = document.createElement"));
  check('UV-7 control: a moved pt_* access (one removed, one added) is detected', forbiddenLineHash(shifted, PANEL) !== FORBIDDEN_LINE_HASH[PANEL]);
}

// ------------------------------------------------------------------- DH-M4a
// work/dh-fx-export-wording/brief.md §3/§5 (FW-1..FW-7) — the ruled FX
// missing/stale wording (R1, D2) applied to the two export-fed compute
// functions and DH_DISPLAY.reason['fx-missing']. Wording only: the trigger
// conditions, id, severity, category, detail sentences and sortKey are
// unchanged (proven by FW-6); the aged/fresh branch stays byte-unchanged
// (FW-4); neither function gains a DH_DISPLAY / _dhLabel reference (FW-6),
// since qa/run-offline.js executes them standalone without DH_DISPLAY in
// scope.

// FW-1: reason['fx-missing'] composes from surface['fx-not-fetched']; every
// other reason/state/verdict/surface value equals its baseline value.
function fw1Failures(content) {
  const ctx = loadDisplay(content);
  const d = ctx && ctx.DH_DISPLAY;
  if (!d) return ['DH_DISPLAY not extractable'];
  const out = [];
  if (d.reason['fx-missing'] !== 'FX rate: ' + d.surface['fx-not-fetched']) {
    out.push("reason['fx-missing'] does not compose from surface['fx-not-fetched']");
  }
  if (d.reason['fx-missing'] !== 'FX rate: Unavailable (no rate fetched)') {
    out.push("reason['fx-missing'] != ruled wording");
  }
  return out.concat(displayFailures(JSON.parse(JSON.stringify(d))));
}
check('FW-1: reason[fx-missing] composes from surface[fx-not-fetched]; every other group value equals baseline (' +
  fw1Failures(SRC).join('; ') + ')', fw1Failures(SRC).length === 0);
check('FW-1 control: reverting the fx-missing wording is detected',
  fw1Failures(swap(SRC, "'fx-missing': 'FX rate: Unavailable (no rate fetched)',", "'fx-missing': 'FX rate: Not recorded',")).length > 0);

// FW-2: _pfComputeNeedsAttention has the exact E2 after-line once; the E2
// before-literals are absent.
const FW2_AFTER = "title: attnFxState === 'missing' ? 'FX rate: Unavailable (no rate fetched)' : 'FX rate: Stale',";
const FW2_BEFORE = ["'FX rate unavailable'", "'FX rate is stale'"];
function fw2Failures(content) {
  const f = extractFunctionSource(content, '_pfComputeNeedsAttention');
  if (!f) return ['function not extractable'];
  const out = [];
  if (count(f, FW2_AFTER) !== 1) out.push('after-line not present exactly once');
  for (const lit of FW2_BEFORE) if (count(f, lit) !== 0) out.push('before literal still present: ' + lit);
  return out;
}
check('FW-2: _pfComputeNeedsAttention carries the exact E2 after-line once, before-literals absent (' +
  fw2Failures(SRC).join('; ') + ')', fw2Failures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, '_pfComputeNeedsAttention');
  const mutated = swap(SRC, f, f.replace(FW2_AFTER, "title: attnFxState === 'missing' ? 'FX rate unavailable' : 'FX rate is stale',"));
  check('FW-2 control: restoring the old title text is detected', fw2Failures(mutated).length > 0);
}

// FW-3: _pfComputePortfolioReporting has both E3 after-literals once, each
// with its original condition; both before-literals are absent.
const FW3_MISSING_AFTER = "if (usdSubtotal > 0 && fxState === 'missing')       completenessReasons.push('USD holdings excluded — FX: Unavailable (no rate fetched)');";
const FW3_STALE_AFTER = "if (usdSubtotal > 0 && fxState === 'stale-invalid') completenessReasons.push('USD holdings excluded — FX: Stale');";
const FW3_BEFORE = ["'USD holdings excluded — FX unavailable'", "'USD holdings excluded — FX stale'"];
function fw3Failures(content) {
  const f = extractFunctionSource(content, '_pfComputePortfolioReporting');
  if (!f) return ['function not extractable'];
  const out = [];
  if (count(f, FW3_MISSING_AFTER) !== 1) out.push('missing-branch after-line (with original condition) not present exactly once');
  if (count(f, FW3_STALE_AFTER) !== 1) out.push('stale-branch after-line (with original condition) not present exactly once');
  for (const lit of FW3_BEFORE) if (count(f, lit) !== 0) out.push('before literal still present: ' + lit);
  return out;
}
check('FW-3: _pfComputePortfolioReporting carries both E3 after-literals once with their original conditions, before-literals absent (' +
  fw3Failures(SRC).join('; ') + ')', fw3Failures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, '_pfComputePortfolioReporting');
  const mutated = swap(SRC, f, f.replace(FW3_MISSING_AFTER,
    "if (usdSubtotal > 0 && fxState === 'missing')       completenessReasons.push('USD holdings excluded — FX unavailable');"));
  check('FW-3 control: restoring the old missing-branch text is detected', fw3Failures(mutated).length > 0);
}

// FW-4: _eodBuildPacket has the exact three-branch E4 block; the aged/fresh
// 'FX: rate ' branch is byte-equal to baseline; the old merged-branch literal
// is absent.
const FW4_BLOCK = "if (reporting.fxState === 'missing') {\n" +
  "    addLimitation('fx', 'FX: Unavailable (no rate fetched) — cross-currency totals are not reported.');\n" +
  "  } else if (reporting.fxState === 'stale-invalid') {\n" +
  "    addLimitation('fx', 'FX: Stale — cross-currency totals are not reported.');\n" +
  "  } else if (preload.fxCache.rate) {";
const FW4_AGED_FRESH_BRANCH = "addLimitation('fx', 'FX: rate ' + preload.fxCache.rate + ', USD/ILS, as of ' + preload.fxCache.effectiveAt + ', ' + reporting.fxState + '.');";
function fw4Failures(content) {
  const f = extractFunctionSource(content, '_eodBuildPacket');
  if (!f) return ['function not extractable'];
  const out = [];
  if (count(f, FW4_BLOCK) !== 1) out.push('three-branch E4 block not present exactly once');
  if (count(f, FW4_AGED_FRESH_BRANCH) !== 1) out.push('aged/fresh branch text not byte-equal to baseline');
  if (count(f, "'FX unavailable — cross-currency") !== 0) out.push('old merged-branch literal still present');
  return out;
}
check('FW-4: _eodBuildPacket carries the exact three-branch E4 block, aged/fresh branch unchanged, old literal absent (' +
  fw4Failures(SRC).join('; ') + ')', fw4Failures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, '_eodBuildPacket');
  const mutated = swap(SRC, f, f.replace(FW4_BLOCK,
    "if (reporting.fxState === 'missing' || reporting.fxState === 'stale-invalid') {\n" +
    "    addLimitation('fx', 'FX unavailable — cross-currency totals are not reported.');\n" +
    "  } else if (preload.fxCache.rate) {"));
  check('FW-4 control: restoring the old merged branch is detected', fw4Failures(mutated).length > 0);
}

// FW-5: consistency — each E2-E4 after-literal composes from the evaluated
// DH_DISPLAY.
function fw5Failures(content) {
  const ctx = loadDisplay(content);
  const d = ctx && ctx.DH_DISPLAY;
  if (!d) return ['DH_DISPLAY not extractable'];
  const out = [];
  const notFetched = d.surface['fx-not-fetched'];
  const stale = d.state['stale-invalid'];
  if ('FX rate: ' + notFetched !== 'FX rate: Unavailable (no rate fetched)') out.push('E2 missing-title composition mismatch');
  if ('FX rate: ' + stale !== 'FX rate: Stale') out.push('E2 stale-title composition mismatch');
  if ('USD holdings excluded — FX: ' + notFetched !== 'USD holdings excluded — FX: Unavailable (no rate fetched)') out.push('E3 missing-reason composition mismatch');
  if ('USD holdings excluded — FX: ' + stale !== 'USD holdings excluded — FX: Stale') out.push('E3 stale-reason composition mismatch');
  if ('FX: ' + notFetched + ' — cross-currency totals are not reported.' !== 'FX: Unavailable (no rate fetched) — cross-currency totals are not reported.') out.push('E4 missing-limitation composition mismatch');
  if ('FX: ' + stale + ' — cross-currency totals are not reported.' !== 'FX: Stale — cross-currency totals are not reported.') out.push('E4 stale-limitation composition mismatch');
  return out;
}
check('FW-5: every E2-E4 after-literal composes from the evaluated DH_DISPLAY (' + fw5Failures(SRC).join('; ') + ')', fw5Failures(SRC).length === 0);
check('FW-5 control: a composition mismatch is detected',
  fw5Failures(swap(SRC, "'fx-not-fetched': 'Unavailable (no rate fetched)'", "'fx-not-fetched': 'Unavailable (rate not fetched)'")).length > 0);

// FW-6: surrounding logic unchanged — id/severity/category/detail/trigger
// condition byte-for-byte in _pfComputeNeedsAttention; E2/E3 carry no
// DH_DISPLAY / _dhLabel reference (standalone-execution safety, per
// qa/run-offline.js's direct calls).
const FW6_UNCHANGED = [
  "id: 'fx:unavailable', severity: 'high', category: 'fx', symbol: null,",
  "if (usdHoldingCount > 0 && (attnFxState === 'missing' || attnFxState === 'stale-invalid')) {",
  "(attnFxState === 'missing' ? 'no FX rate has been fetched yet.' : 'the stored FX rate is more than 6 days old.')"
];
function fw6Failures(content) {
  const out = [];
  const attn = extractFunctionSource(content, '_pfComputeNeedsAttention');
  const rep = extractFunctionSource(content, '_pfComputePortfolioReporting');
  if (!attn || !rep) return ['function not extractable'];
  for (const lit of FW6_UNCHANGED) if (count(attn, lit) !== 1) out.push('unchanged text missing/duplicated: ' + lit);
  if (/DH_DISPLAY|_dhLabel/.test(attn)) out.push('_pfComputeNeedsAttention references DH_DISPLAY/_dhLabel');
  if (/DH_DISPLAY|_dhLabel/.test(rep)) out.push('_pfComputePortfolioReporting references DH_DISPLAY/_dhLabel');
  return out;
}
check('FW-6: id/severity/category/detail/condition unchanged; no DH_DISPLAY/_dhLabel reference in either function (' +
  fw6Failures(SRC).join('; ') + ')', fw6Failures(SRC).length === 0);
{
  const attn = extractFunctionSource(SRC, '_pfComputeNeedsAttention');
  const mutatedId = swap(SRC, attn, attn.replace("id: 'fx:unavailable'", "id: 'fx:unavail'"));
  check('FW-6 control: a changed id is detected', fw6Failures(mutatedId).length > 0);
  const mutatedRef = swap(SRC, attn, attn.replace(FW2_AFTER, "title: DH_DISPLAY.reason['fx-missing'],"));
  check('FW-6 control: an inserted DH_DISPLAY reference is detected', fw6Failures(mutatedRef).length > 0);
}

// FW-7: file-wide — each of the six before-literals is absent (0 times).
const FW7_BEFORE = [
  "'FX rate: Not recorded'",
  "'FX rate unavailable'",
  "'FX rate is stale'",
  "'USD holdings excluded — FX unavailable'",
  "'USD holdings excluded — FX stale'",
  "'FX unavailable — cross-currency totals are not reported.'"
];
function fw7Failures(content) {
  return FW7_BEFORE.filter((lit) => count(content, lit) !== 0);
}
check('FW-7: each of the six before-literals occurs 0 times file-wide (' + fw7Failures(SRC).join(' | ') + ')', fw7Failures(SRC).length === 0);
check('FW-7 control: a reintroduced before-literal is detected',
  fw7Failures(SRC + "\n// 'FX rate unavailable'").length === 1);

// ------------------------------------------------------------------- DH-M4b
// work/dh-fx-aged-current/brief.md §4/§6 (AG-1..AG-6) — aged-but-valid FX is
// Current for display and readiness (R2, D-1, D-2). `_pfFxState`,
// `_pfFxRateValid`, the fresh/stale-invalid/missing branches and
// `reason['fx-aged']` are all unchanged (proven by AG-1/AG-6); the new pure
// helpers `_dhFxAgedLabel`/`_pfFxAgeWholeDays` carry no storage/DOM/scoring
// reference (AG-6).

// Evaluates DH_DISPLAY, _dhLabel, _dhFxAgedLabel, _pfFxRateValid, _pfFxState
// and _pfFxAgeWholeDays from the real source in one vm context.
function loadFxAged(content) {
  const dm = content.match(/var DH_DISPLAY = \{[\s\S]*?\n\};/);
  const dhLabel = extractFunctionSource(content, '_dhLabel');
  const fxAgedLabel = extractFunctionSource(content, '_dhFxAgedLabel');
  const isFiniteNum = extractFunctionSource(content, '_pfIsFiniteNum');
  const fxRateValid = extractFunctionSource(content, '_pfFxRateValid');
  const fxAgeWholeDays = extractFunctionSource(content, '_pfFxAgeWholeDays');
  const fxState = extractFunctionSource(content, '_pfFxState');
  const freshConst = (content.match(/var PF_FX_FRESH_MAX_AGE_DAYS = \d+;/) || [])[0];
  const validConst = (content.match(/var PF_FX_VALID_MAX_AGE_DAYS = \d+;/) || [])[0];
  if (!dm || !dhLabel || !fxAgedLabel || !isFiniteNum || !fxRateValid || !fxAgeWholeDays || !fxState || !freshConst || !validConst) return null;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
    dm[0], dhLabel, fxAgedLabel, freshConst, validConst, isFiniteNum, fxRateValid, fxState, fxAgeWholeDays,
    'this.DH_DISPLAY = DH_DISPLAY; this._dhLabel = _dhLabel; this._dhFxAgedLabel = _dhFxAgedLabel;' +
    'this._pfFxRateValid = _pfFxRateValid; this._pfFxState = _pfFxState; this._pfFxAgeWholeDays = _pfFxAgeWholeDays;'
  ].join('\n'), ctx);
  return ctx;
}

// AG-1: state['aged-but-valid'] === 'Current'; reason['fx-aged'] kept as
// 'FX rate: Stale'; every other reason/state/verdict/surface value equals
// baseline (reused displayFailures, BASE_DISPLAY updated above).
function ag1Failures(content) {
  const ctx = loadFxAged(content);
  const d = ctx && ctx.DH_DISPLAY;
  if (!d) return ['DH_DISPLAY not extractable'];
  const out = [];
  if (d.state['aged-but-valid'] !== 'Current') out.push("state['aged-but-valid'] != 'Current'");
  if (d.reason['fx-aged'] !== 'FX rate: Stale') out.push("reason['fx-aged'] changed (must stay 'FX rate: Stale')");
  return out.concat(displayFailures(JSON.parse(JSON.stringify(d))));
}
check('AG-1: state[aged-but-valid] = Current, reason[fx-aged] kept, every other group value equals baseline (' +
  ag1Failures(SRC).join('; ') + ')', ag1Failures(SRC).length === 0);
check('AG-1 control: reverting aged-but-valid to Stale is detected',
  ag1Failures(swap(SRC, "'aged-but-valid': 'Current'", "'aged-but-valid': 'Stale'")).length > 0);

// AG-2: _dhFxAgedLabel(4) === 'Current · 4 d old', composed from
// _dhLabel('state', 'aged-but-valid').
function ag2Failures(content) {
  const ctx = loadFxAged(content);
  if (!ctx) return ['not extractable'];
  const out = [];
  if (ctx._dhFxAgedLabel(4) !== 'Current · 4 d old') out.push('label(4) != "Current · 4 d old"');
  if (ctx._dhFxAgedLabel(4) !== ctx._dhLabel('state', 'aged-but-valid') + ' · 4 d old') out.push('label does not compose from _dhLabel');
  return out;
}
check('AG-2: _dhFxAgedLabel(4) === "Current · 4 d old", composes from _dhLabel (' + ag2Failures(SRC).join('; ') + ')', ag2Failures(SRC).length === 0);
check('AG-2 control: changing the table word changes the output', (function () {
  const ctx = loadFxAged(swap(SRC, "'aged-but-valid': 'Current'", "'aged-but-valid': 'Recent'"));
  return !!ctx && ctx._dhFxAgedLabel(4) === 'Recent · 4 d old';
})());

// AG-3: _pfFxAgeWholeDays uses effectiveAt + floor, the same basis as
// _pfFxState; invalid record -> null.
function ag3Failures(content) {
  const ctx = loadFxAged(content);
  if (!ctx) return ['not extractable'];
  const out = [];
  const EFF = '2026-09-01T00:00:00.000Z';
  const base = Date.parse(EFF);
  const DAY = 24 * 60 * 60 * 1000;
  for (const [days, expected] of [[3.5, 3], [4.0, 4], [6.0, 6]]) {
    const got = ctx._pfFxAgeWholeDays({ rate: 4.05, effectiveAt: EFF }, base + days * DAY);
    if (got !== expected) out.push(days + 'd -> ' + got + ' (expected ' + expected + ')');
  }
  if (ctx._pfFxAgeWholeDays({ rate: 0, effectiveAt: EFF }, base) !== null) out.push('invalid rate does not yield null');
  if (ctx._pfFxAgeWholeDays(null, base) !== null) out.push('null cache does not yield null');
  const cacheWithFetched = { rate: 4.05, effectiveAt: EFF, fetchedAt: new Date(base + 10 * DAY).toISOString() };
  if (ctx._pfFxAgeWholeDays(cacheWithFetched, base + 4 * DAY) !== 4) out.push('age basis is not effectiveAt');
  return out;
}
check('AG-3: _pfFxAgeWholeDays uses effectiveAt + floor, same basis as _pfFxState, invalid -> null (' +
  ag3Failures(SRC).join('; ') + ')', ag3Failures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, '_pfFxAgeWholeDays');
  const EFF = '2026-09-01T00:00:00.000Z';
  const base = Date.parse(EFF);
  const DAY = 24 * 60 * 60 * 1000;
  const mutatedRound = swap(SRC, f, f.replace('Math.floor', 'Math.round'));
  const ctxRound = loadFxAged(mutatedRound);
  check('AG-3 control: Math.round instead of floor is detected',
    !!ctxRound && ctxRound._pfFxAgeWholeDays({ rate: 4.05, effectiveAt: EFF }, base + 3.5 * DAY) !== 3);
  const mutatedBasis = swap(SRC, f, f.replace('cache.effectiveAt', 'cache.fetchedAt'));
  const ctxBasis = loadFxAged(mutatedBasis);
  check('AG-3 control: fetchedAt as the age basis is detected',
    !!ctxBasis && ctxBasis._pfFxAgeWholeDays({ rate: 4.05, effectiveAt: EFF, fetchedAt: new Date(base + 10 * DAY).toISOString() }, base + 4 * DAY) !== 4);
}

// AG-4: sweeping aged-but-valid ages 3.01d-6.00d in 0.25d steps: whenever
// _pfFxState says aged-but-valid, the label is 'Current · N d old' with
// 3 <= N <= 6.
function ag4Failures(content) {
  const ctx = loadFxAged(content);
  if (!ctx) return ['not extractable'];
  const out = [];
  const EFF = '2026-09-01T00:00:00.000Z';
  const base = Date.parse(EFF);
  const DAY = 24 * 60 * 60 * 1000;
  for (let days = 3.01; days <= 6.001; days += 0.25) {
    const nowMs = base + days * DAY;
    const cache = { rate: 4.05, effectiveAt: EFF };
    if (ctx._pfFxState(cache, nowMs) !== 'aged-but-valid') continue;
    const wholeDays = ctx._pfFxAgeWholeDays(cache, nowMs);
    const label = ctx._dhFxAgedLabel(wholeDays);
    if (label !== 'Current · ' + wholeDays + ' d old') out.push('days=' + days + ' label mismatch: ' + label);
    if (wholeDays < 3 || wholeDays > 6) out.push('days=' + days + ' N out of range: ' + wholeDays);
  }
  return out;
}
check('AG-4: sweeping aged-but-valid ages 3.01-6.00d, label Current · N d old with 3<=N<=6 (' +
  ag4Failures(SRC).join('; ') + ')', ag4Failures(SRC).length === 0);
check('AG-4 control: hard-coding N breaks the sweep', (function () {
  const f = extractFunctionSource(SRC, '_dhFxAgedLabel');
  const mutated = swap(SRC, f, "function _dhFxAgedLabel(days) {\n  return _dhLabel('state', 'aged-but-valid') + ' · 4 d old';\n}");
  return ag4Failures(mutated).length > 0;
})());

// AG-5: site checks in _renderPortfolioPanel — the chip and qualifier lines
// carry the exact E4 after-text once each; ' (aged)' occurs 0 times
// file-wide; the aged-branch condition and both amber colour lines are
// byte-unchanged.
const AG5_CHIP_AFTER = "fxChipVal.textContent = 'FX ' + fxLabel + ' — ' + _dhFxAgedLabel(_pfFxAgeWholeDays(fxCache));";
const AG5_QUALIFIER_AFTER = "totalQualifier.textContent = 'FX as of ' + new Date(fxCache.effectiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' — ' + _dhFxAgedLabel(_pfFxAgeWholeDays(fxCache));";
const AG5_COLOR_LINES = [
  ["fxChipVal.style.color = 'var(--yellow2)';", 2],
  ["totalQualifier.style.cssText = 'font-size:10px;color:var(--yellow2);margin-top:2px';", 1]
];
function ag5Failures(content) {
  const f = extractFunctionSource(content, PANEL);
  if (!f) return ['function not extractable'];
  const out = [];
  if (count(f, AG5_CHIP_AFTER) !== 1) out.push('chip after-text not present exactly once');
  if (count(f, AG5_QUALIFIER_AFTER) !== 1) out.push('qualifier after-text not present exactly once');
  if (count(content, "' (aged)'") !== 0) out.push("' (aged)' still present file-wide");
  if (count(f, "fxState === 'aged-but-valid'") !== 2) out.push('aged-branch condition count changed (expected 2: chip + qualifier)');
  for (const [lit, expected] of AG5_COLOR_LINES) if (count(f, lit) !== expected) out.push('colour line changed/missing: ' + lit);
  return out;
}
check('AG-5: chip/qualifier carry the exact after-text once each, no " (aged)" left file-wide, condition and colour lines unchanged (' +
  ag5Failures(SRC).join('; ') + ')', ag5Failures(SRC).length === 0);
{
  const f = extractFunctionSource(SRC, PANEL);
  const mutated = swap(SRC, f, f.replace(AG5_CHIP_AFTER, "fxChipVal.textContent = 'FX ' + fxLabel + ' (aged)';"));
  check('AG-5 control: restoring the old chip literal is detected', ag5Failures(mutated).length > 0);
}

// AG-6: purity / no drift — _pfFxState, _pfFxRateValid and _dhLabel are
// byte-equal to baseline; the two new helpers reference no storage/DOM/
// scoring surface; the UV-6 hashes and CONST_HASH are unchanged.
const AG6_HASHES = {
  _pfFxState: 'e59989a2b68b42bbca26f52e282867edf808d973431368ebc5229feeedbfe0fc',
  _pfFxRateValid: 'b444b89c17e2f6e87810f117d02903f8e03878a9b3c38fb6780e5ccda0f52678',
  _dhLabel: '900eb54bd0ac78d8a55067b02acc17d874ff1b15c3e01005f7c95dc389fd5683'
};
function ag6Failures(content) {
  const out = [];
  for (const name of Object.keys(AG6_HASHES)) {
    const f = extractFunctionSource(content, name);
    if (!f || sha(f) !== AG6_HASHES[name]) out.push(name + ' changed from baseline');
  }
  for (const name of ['_dhFxAgedLabel', '_pfFxAgeWholeDays']) {
    const f = extractFunctionSource(content, name);
    if (!f) { out.push(name + ' not extractable'); continue; }
    if (/localStorage|\bdocument\b|fetch\s*\(|_ptScore|orchestrate\(|analyzeChunk\(|enforceScoreConsistency/.test(f)) {
      out.push(name + ' references storage/DOM/scoring');
    }
  }
  if (constHash(content) !== CONST_HASH) out.push('CONST_HASH changed');
  for (const name of Object.keys(FN_HASHES)) {
    const f = extractFunctionSource(content, name);
    if (!f || sha(f) !== FN_HASHES[name]) out.push(name + ' (UV-6) changed');
  }
  return out;
}
check('AG-6: _pfFxState/_pfFxRateValid/_dhLabel byte-unchanged; new helpers pure; UV-6 hashes and CONST_HASH unchanged (' +
  ag6Failures(SRC).join('; ') + ')', ag6Failures(SRC).length === 0);
check('AG-6 control: a changed _pfFxState is detected', (function () {
  const f = extractFunctionSource(SRC, '_pfFxState');
  const mutated = swap(SRC, f, f.replace('fresh', 'fresh2'));
  return ag6Failures(mutated).length > 0;
})());

// -------------------------------------------------------------------- result
if (failures) {
  console.log('DH-M2 UI vocabulary: FAIL (' + failures + ' of ' + asserts + ' assertions)');
  process.exit(1);
}
console.log('DH-M2 UI vocabulary: PASS (' + asserts + ' assertions)');
