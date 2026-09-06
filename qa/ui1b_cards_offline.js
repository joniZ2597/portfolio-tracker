'use strict';

/*
 * WU-UI1B / UI1B-QA — permanent offline QA for the three Pulse v1.1 card-grid
 * regions in index.html: Signals (sig-card), Comparison (cmp-card), and Key
 * Levels (kl-card). Pure Node, no network, no browser, no live services.
 * Cards are located by their existing HTML-comment header anchors already in
 * index.html; no new masking/extraction machinery is introduced.
 *
 * Contract under test (WU-UI1B r2, planId wu-ui1b-r2-2026-09-06):
 *   U01  the four card-region anchors (Technical Setup / Signals / Comparison
 *        / Key Levels) are present and slice cleanly
 *   U02  sig-card id + "Signals" title
 *   U03  cmp-card id + "Comparison" title
 *   U04  kl-card id + "Key Levels" title
 *   U05  Signals: Volume vs 20D Avg + HIGH/LOW/AVERAGE states
 *   U06  Signals: Volume trend (AI)
 *   U07  Comparison: vs SPY / vs QQQ rows
 *   U08  Comparison: dynamic sector-ETF row + no-ETF fallback row
 *   U09  Comparison: Rating + price-target row
 *   U10  Key Levels: Risk Level + Reward Potential
 *   U11  Key Levels negative assertion: no moving-average / SMA row
 *   U12  drift pin: Technical Setup still carries the MA 20/50/150 table
 *   U13  collapse contract: module-level booleans default to true
 *   U14  collapse contract: each _init*Card binds toggle + class + chevron
 *   U15  collapse contract: card markup wires the collapsed-class + chevron
 *   U16  collapse contract: all three init functions are invoked
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');

let testsPassed = 0;
let testsFailed = 0;
let assertions = 0;

async function test(name, fn) {
  try {
    await fn();
    testsPassed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    testsFailed += 1;
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : String(e)));
  }
}

function ok(cond, label) {
  assertions += 1;
  if (!cond) { throw new Error('assert failed: ' + label); }
}

// Extract a top-level `function name(...) { ... }` source by brace-matching
// (same technique as qa/run-offline.js extractFunctionSource / qa/fund_facts_panel_offline.js extractFn).
function extractFn(source, name) {
  const sig = 'function ' + name + '(';
  const start = source.indexOf(sig);
  if (start === -1) { return null; }
  const isAsync = source.slice(Math.max(0, start - 6), start) === 'async ';
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) { return null; }
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') { depth += 1; }
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { return (isAsync ? 'async ' : '') + source.slice(start, i + 1); }
    }
  }
  return null;
}

// Bound a card's markup region between two of its own existing HTML-comment
// header anchors. These anchors already exist in index.html above each card
// div; nothing here is a new convention.
function sliceBetween(html, startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  if (s === -1) { return null; }
  const e = html.indexOf(endMarker, s + startMarker.length);
  if (e === -1) { return null; }
  return html.slice(s, e);
}

const TS_START  = '<!-- TECHNICAL SETUP — span 6 -->';
const SIG_START = '<!-- SIGNALS (Volume + Catalysts) — span 6 -->';
const SIG_END   = '<!-- AI SUMMARY (Actionable Take) — span 12 -->';
const CMP_START = '<!-- COMPARISON (RS + Rating) — span 6 -->';
const CMP_END   = '<!-- KEY LEVELS (Entry / Invalidation / Risk) — span 6 -->';
const KL_START  = CMP_END;
const KL_END    = '${window.PT_ENABLE_CAPITAL_RETURNS_CLIENT === true ? `';

const CARD_INITS = [
  { fn: '_initSigCard', id: 'sig-card', bool: '_sigCardCollapsed' },
  { fn: '_initCmpCard', id: 'cmp-card', bool: '_cmpCardCollapsed' },
  { fn: '_initKlCard',  id: 'kl-card',  bool: '_klCardCollapsed' }
];

async function main() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  const tsBlock  = sliceBetween(html, TS_START, SIG_START);
  const sigBlock = sliceBetween(html, SIG_START, SIG_END);
  const cmpBlock = sliceBetween(html, CMP_START, CMP_END);
  const klBlock  = sliceBetween(html, KL_START, KL_END);

  await test('U01: card-region anchors present and slice cleanly', function () {
    ok(tsBlock !== null, 'Technical Setup anchor pair found');
    ok(sigBlock !== null, 'Signals anchor pair found');
    ok(cmpBlock !== null, 'Comparison anchor pair found');
    ok(klBlock !== null, 'Key Levels anchor pair found');
  });

  await test('U02: sig-card id and title', function () {
    ok(sigBlock.indexOf('id="sig-card"') !== -1, 'sig-card id present');
    ok(/pc-card-title">\s*Signals\s*</.test(sigBlock), 'Signals title text present');
  });

  await test('U03: cmp-card id and title', function () {
    ok(cmpBlock.indexOf('id="cmp-card"') !== -1, 'cmp-card id present');
    ok(/pc-card-title">\s*Comparison\s*</.test(cmpBlock), 'Comparison title text present');
  });

  await test('U04: kl-card id and title', function () {
    ok(klBlock.indexOf('id="kl-card"') !== -1, 'kl-card id present');
    ok(/pc-card-title">\s*Key Levels\s*</.test(klBlock), 'Key Levels title text present');
  });

  await test('U05: Signals field set - Volume vs 20D Avg + HIGH/LOW/AVERAGE states', function () {
    ok(sigBlock.indexOf('Volume vs 20D Avg') !== -1, 'Volume vs 20D Avg label present');
    ok(sigBlock.indexOf("'HIGH'") !== -1, 'HIGH state literal present');
    ok(sigBlock.indexOf("'LOW'") !== -1, 'LOW state literal present');
    ok(sigBlock.indexOf("'AVERAGE'") !== -1, 'AVERAGE state literal present');
  });

  await test('U06: Signals field set - Volume trend (AI)', function () {
    ok(sigBlock.indexOf('Volume trend (AI)') !== -1, 'Volume trend (AI) label present');
  });

  await test('U07: Comparison field set - vs SPY / vs QQQ rows', function () {
    ok(cmpBlock.indexOf("'vs SPY'") !== -1, 'vs SPY row config present');
    ok(cmpBlock.indexOf("'vs QQQ'") !== -1, 'vs QQQ row config present');
  });

  await test('U08: Comparison field set - dynamic sector ETF row + no-ETF fallback', function () {
    ok(cmpBlock.indexOf("'vs ' + snap.sectorEtf") !== -1, 'dynamic sector ETF label expression present');
    ok(cmpBlock.indexOf('No sector ETF configured') !== -1, 'no-ETF fallback row text present');
  });

  await test('U09: Comparison field set - Rating + price target row', function () {
    ok(cmpBlock.indexOf('>Rating<') !== -1, 'Rating label present');
    ok(cmpBlock.indexOf('PT ${pt}') !== -1, 'price target expression present');
  });

  await test('U10: Key Levels field set - Risk Level + Reward Potential', function () {
    ok(klBlock.indexOf('>Risk Level<') !== -1, 'Risk Level label present');
    ok(klBlock.indexOf('>Reward Potential<') !== -1, 'Reward Potential label present');
  });

  await test('U11: Key Levels negative assertion - no moving-average / SMA row', function () {
    ok(klBlock.indexOf('ma-row') === -1, 'no ma-row class in Key Levels');
    ok(!/\bMA 20\b/.test(klBlock), 'no "MA 20" label in Key Levels');
    ok(!/\bMA 50\b/.test(klBlock), 'no "MA 50" label in Key Levels');
    ok(!/\bMA 150\b/.test(klBlock), 'no "MA 150" label in Key Levels');
    ok(!/\bsma\s*\d/i.test(klBlock), 'no SMA-prefixed token/label (e.g. "SMA 20", "sma20") in Key Levels');
  });

  await test('U12: drift pin - Technical Setup still carries the MA 20/50/150 table', function () {
    ok(tsBlock.indexOf('mp-ma-table') !== -1, 'mp-ma-table class present in Technical Setup');
    ok(tsBlock.indexOf('ma-row') !== -1, 'ma-row class present in Technical Setup');
    ok(tsBlock.indexOf("'MA 20'") !== -1, "'MA 20' label present in Technical Setup");
    ok(tsBlock.indexOf("'MA 50'") !== -1, "'MA 50' label present in Technical Setup");
    ok(tsBlock.indexOf("'MA 150'") !== -1, "'MA 150' label present in Technical Setup");
  });

  await test('U13: collapse contract - module-level booleans default to true', function () {
    ok(/let\s+_sigCardCollapsed\s*=\s*true;/.test(html), '_sigCardCollapsed defaults true');
    ok(/let\s+_cmpCardCollapsed\s*=\s*true;/.test(html), '_cmpCardCollapsed defaults true');
    ok(/let\s+_klCardCollapsed\s*=\s*true;/.test(html), '_klCardCollapsed defaults true');
  });

  for (const spec of CARD_INITS) {
    await test('U14: ' + spec.fn + ' binds toggle + class + chevron for #' + spec.id, function () {
      const src = extractFn(html, spec.fn);
      ok(src !== null, spec.fn + ' extractable from index.html');
      ok(src.indexOf("getElementById('" + spec.id + "')") !== -1, 'targets #' + spec.id);
      ok(src.indexOf(spec.bool + ' = !' + spec.bool) !== -1, 'toggles ' + spec.bool);
      ok(src.indexOf("classList.toggle('collapsed'") !== -1, 'toggles the collapsed class');
      ok(src.indexOf('▶') !== -1 && src.indexOf('▼') !== -1, 'sets both chevron glyphs');
    });
  }

  await test('U15: card markup wires the collapsed-class and chevron expressions', function () {
    ok(sigBlock.indexOf("${_sigCardCollapsed ? ' collapsed' : ''}") !== -1, 'sig-card collapsed-class expression present');
    ok(sigBlock.indexOf("${_sigCardCollapsed ? '▶' : '▼'}") !== -1, 'sig-card chevron expression present');
    ok(cmpBlock.indexOf("${_cmpCardCollapsed ? ' collapsed' : ''}") !== -1, 'cmp-card collapsed-class expression present');
    ok(cmpBlock.indexOf("${_cmpCardCollapsed ? '▶' : '▼'}") !== -1, 'cmp-card chevron expression present');
    ok(klBlock.indexOf("${_klCardCollapsed ? ' collapsed' : ''}") !== -1, 'kl-card collapsed-class expression present');
    ok(klBlock.indexOf("${_klCardCollapsed ? '▶' : '▼'}") !== -1, 'kl-card chevron expression present');
  });

  await test('U16: all three init functions are invoked in the render path', function () {
    ok(/\b_initSigCard\(\)\s*;/.test(html), '_initSigCard() invoked');
    ok(/\b_initCmpCard\(\)\s*;/.test(html), '_initCmpCard() invoked');
    ok(/\b_initKlCard\(\)\s*;/.test(html), '_initKlCard() invoked');
  });

  console.log('');
  console.log('  tests: ' + testsPassed + ' passed, ' + testsFailed + ' failed');
  console.log('  assertions: ' + assertions);
  if (testsFailed > 0) {
    console.log('WU-UI1B card offline suite: FAIL');
    process.exit(1);
  }
  console.log('WU-UI1B card offline suite: PASS');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
