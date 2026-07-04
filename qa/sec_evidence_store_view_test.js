'use strict';
// qa/sec_evidence_store_view_test.js
// EG-20C-4B-2 offline UI test — Node-only, no deps, no jsdom, no network/browser.
// Extracts the inlined EG-20C-4B-2 handler block from index.html and drives it in a
// Function sandbox with mock window/document/adapter/_edgarEsc/renderResearchSourceMeta.
// Also runs static + parity proofs over index.html + services/sec-evidence-store-client.js.
// Never touches real browser storage/app state; never calls a live endpoint.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IDX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SVC = fs.readFileSync(path.join(ROOT, 'services/sec-evidence-store-client.js'), 'utf8');

function slice(src, startMark, endMark) {
  const s = src.indexOf(startMark);
  assert(s !== -1, 'start marker not found: ' + startMark);
  const e = src.indexOf(endMark, s);
  assert(e !== -1, 'end marker not found: ' + endMark);
  return src.slice(s, e);
}

const HANDLER_BLOCK = slice(
  IDX,
  '// ── EG-20C-4B-2: Stored SEC Evidence gated manual UI',
  '// ── end EG-20C-4B-2 Stored SEC Evidence handlers'
);

// ---- sandbox --------------------------------------------------------------
function edgarEsc(s) {
  return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
}
function sourceMetaStub(ev, esc) {
  return (ev && ev.sourceUrl) ? '<span class="src-stub">' + esc(ev.sourceLabel || ev.sourceUrl) + '</span>' : '';
}
function buildApi(win, doc, adapter) {
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'window', 'document', 'requestSecEvidenceStoreLookup', '_edgarEsc', 'renderResearchSourceMeta',
    HANDLER_BLOCK +
    '\nreturn { statusMsg: _sesStatusMsg, render: _renderSecEvidenceStorePanel,' +
    ' run: _runSecEvidenceStoreCard, lastDisplay: _sesLastDisplay };'
  );
  return factory(win, doc, adapter, edgarEsc, sourceMetaStub);
}
function mkBtn() { return { disabled: false, textContent: '' }; }
function mkPanel() { return { innerHTML: '' }; }
function mkDoc(map) { return { getElementById: function (id) { return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null; } }; }
function item(over) {
  return Object.assign({
    evidenceId: 'e1', category: 'sec10q', claim: 'Revenue up', direction: 'positive',
    scoringImpact: 'none', requiresVerification: true, confidence: null,
    sourceUrl: 'https://www.sec.gov/x', sourceLabel: '10-Q', sourceDate: '2026-05-01', sourceType: 'sec_filing'
  }, over || {});
}
const FOOTER_BITS = ['Non-scoring', 'require independent verification', 'confidence: n/a', 'provider: sec_evidence_store', 'stored snapshot'];

// A DOM-free instance for the pure render/status matrix.
const pure = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: false }, mkDoc({}), function () {});

function statusMatrix() {
  assert.strictEqual(pure.statusMsg('STORE_MISS'), 'No stored SEC evidence snapshot for this ticker yet.');
  assert.strictEqual(pure.statusMsg('STORE_INVALID'), 'Stored snapshot could not be validated.');
  assert.strictEqual(pure.statusMsg('DISABLED'), 'Stored SEC evidence is disabled on the server.');
  assert.strictEqual(pure.statusMsg('DEGRADED', 'STORE_UNAVAILABLE'), 'Evidence store temporarily unavailable — try again.');
  assert.strictEqual(pure.statusMsg('DEGRADED', 'STORE_READ_FAILURE'), 'Evidence store read failed — try again.');
  assert.strictEqual(pure.statusMsg('CLIENT_INVALID_INPUT'), 'Invalid ticker for stored SEC evidence.');
  assert.strictEqual(pure.statusMsg('CLIENT_TIMEOUT'), 'Request timed out — try again.');
  assert.strictEqual(pure.statusMsg('CLIENT_FETCH_ERROR'), 'Network error — could not reach the server.');
  assert.strictEqual(pure.statusMsg('CLIENT_HTTP_ERROR', null, 500), 'Unexpected server response (HTTP 500).');
  assert.strictEqual(pure.statusMsg('CLIENT_INVALID_RESPONSE'), 'Unreadable server response.');
}

function renderMatrix() {
  // STORE_HIT with 3 items
  const hit = pure.render({ status: 'STORE_HIT', evidenceItems: [item({ claim: 'A' }), item({ claim: 'B', direction: 'negative' }), item({ claim: 'C', direction: 'neutral' })] });
  assert(hit.indexOf('>A<') !== -1 && hit.indexOf('>B<') !== -1 && hit.indexOf('>C<') !== -1, '3 claims render');
  assert(hit.indexOf('neg') !== -1 && hit.indexOf('pos') !== -1, 'direction classes render');
  FOOTER_BITS.forEach(function (b) { assert(hit.indexOf(b) !== -1, 'footer contains: ' + b); });

  // empty STORE_HIT distinct from STORE_MISS
  const empty = pure.render({ status: 'STORE_HIT', evidenceItems: [] });
  const miss = pure.render({ status: 'STORE_MISS' });
  assert(empty.indexOf('No stored SEC evidence items for this ticker.') !== -1, 'empty-hit message');
  assert(miss.indexOf('No stored SEC evidence snapshot for this ticker yet.') !== -1, 'miss message');
  assert(empty !== miss && empty.indexOf('snapshot for this ticker yet') === -1, 'empty-hit distinct from miss');

  // tones + non-hit statuses
  assert(pure.render({ status: 'STORE_INVALID' }).indexOf('warn') !== -1, 'invalid -> warn');
  assert(pure.render({ status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' }).indexOf('warn') !== -1, 'degraded -> warn');
  assert(pure.render({ status: 'DEGRADED', reason: 'STORE_READ_FAILURE' }).indexOf('read failed') !== -1, 'read-failure msg');
  assert(pure.render({ status: 'DISABLED', reason: 'SERVER_DISABLED' }).indexOf('neutral-v') !== -1, 'disabled -> neutral');
  assert(pure.render({ status: 'CLIENT_HTTP_ERROR', httpStatus: 500 }).indexOf('HTTP 500') !== -1, 'http error interpolated');

  // never echo raw payload
  const leak = pure.render({ status: 'DEGRADED', reason: 'STORE_READ_FAILURE', secret: 'LEAKTOKEN' });
  assert(leak.indexOf('LEAKTOKEN') === -1, 'raw payload fields never echoed');

  // hostile text escaped, not injected raw
  const hostile = pure.render({ status: 'STORE_HIT', evidenceItems: [item({ claim: '<script>alert(1)</script>', category: '<b>x</b>' })] });
  assert(hostile.indexOf('<script>') === -1, 'raw <script> not present');
  assert(hostile.indexOf('&lt;script&gt;') !== -1, 'claim escaped');
}

async function behavior() {
  // gate OFF -> no fetch, nothing touched
  {
    let calls = 0; const btn = mkBtn(), panel = mkPanel();
    const api = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: false }, mkDoc({ 'ses-btn-AAPL': btn, 'ses-panel-AAPL': panel }),
      function () { calls++; return Promise.resolve({ status: 'STORE_MISS', ticker: 'AAPL', categories: ['sec10q'] }); });
    await api.run('AAPL');
    assert.strictEqual(calls, 0, 'gate OFF -> no fetch');
    assert.strictEqual(panel.innerHTML, '', 'gate OFF -> panel untouched');
    assert.strictEqual(btn.disabled, false, 'gate OFF -> button untouched');
  }
  // missing adapter -> no fetch
  {
    const btn = mkBtn(), panel = mkPanel();
    const api = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: true }, mkDoc({ 'ses-btn-AAPL': btn, 'ses-panel-AAPL': panel }), null);
    await api.run('AAPL');
    assert.strictEqual(panel.innerHTML, '', 'missing adapter -> panel untouched');
    assert.strictEqual(btn.disabled, false, 'missing adapter -> button untouched');
  }
  // in-flight disable + duplicate-click no second fetch + restore + memory-only record
  {
    let resolveFn, calls = 0; const btn = mkBtn(), panel = mkPanel();
    const api = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: true }, mkDoc({ 'ses-btn-AAPL': btn, 'ses-panel-AAPL': panel }),
      function (input) { calls++; assert.strictEqual(input.ticker, 'AAPL'); return new Promise(function (r) { resolveFn = r; }); });
    const p = api.run('AAPL');
    assert.strictEqual(btn.disabled, true, 'in-flight -> disabled');
    assert.strictEqual(calls, 1, 'one fetch');
    await api.run('AAPL');
    assert.strictEqual(calls, 1, 'duplicate click while disabled -> no second fetch');
    resolveFn({ status: 'STORE_MISS', ticker: 'AAPL', categories: ['sec10q'] });
    await p;
    assert.strictEqual(btn.disabled, false, 'after settle -> restored');
    assert.strictEqual(api.lastDisplay.AAPL.status, 'STORE_MISS', 'memory-only display recorded');
    assert(panel.innerHTML.indexOf('snapshot for this ticker yet') !== -1, 'panel rendered miss');
  }
  // finally restores button even if panel.innerHTML setter throws
  {
    const btn = mkBtn();
    const panel = {}; Object.defineProperty(panel, 'innerHTML', { get: function () { return ''; }, set: function () { throw new Error('boom'); } });
    const api = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: true }, mkDoc({ 'ses-btn-AAPL': btn, 'ses-panel-AAPL': panel }),
      function () { return Promise.resolve({ status: 'STORE_MISS', ticker: 'AAPL', categories: ['sec10q'] }); });
    let threw = false;
    try { await api.run('AAPL'); } catch (e) { threw = true; }
    assert(threw, 'render throw propagates');
    assert.strictEqual(btn.disabled, false, 'finally restores button on render throw');
  }
  // two tickers keep independent memory + panels
  {
    const bA = mkBtn(), pA = mkPanel(), bM = mkBtn(), pM = mkPanel();
    const api = buildApi({ PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT: true },
      mkDoc({ 'ses-btn-AAPL': bA, 'ses-panel-AAPL': pA, 'ses-btn-MSFT': bM, 'ses-panel-MSFT': pM }),
      function (input) {
        return Promise.resolve(input.ticker === 'AAPL'
          ? { status: 'STORE_HIT', ticker: 'AAPL', categories: ['sec10q'], evidenceItems: [item({ claim: 'AAPL-claim' })] }
          : { status: 'STORE_MISS', ticker: 'MSFT', categories: ['sec10q'] });
      });
    await api.run('AAPL');
    await api.run('MSFT');
    assert.strictEqual(api.lastDisplay.AAPL.status, 'STORE_HIT', 'AAPL entry');
    assert.strictEqual(api.lastDisplay.MSFT.status, 'STORE_MISS', 'MSFT entry');
    assert(api.lastDisplay.AAPL !== api.lastDisplay.MSFT, 'independent entries');
    assert(pA.innerHTML.indexOf('AAPL-claim') !== -1, 'AAPL panel has its claim');
    assert(pM.innerHTML.indexOf('snapshot for this ticker yet') !== -1, 'MSFT panel has miss');
  }
}

function staticProofs() {
  // card behind strict client gate, ids inside the ternary
  const gate = '${window.PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT === true ? `';
  const gi = IDX.indexOf(gate);
  assert(gi !== -1, 'card gate ternary present');
  const close = IDX.indexOf("` : ''}", gi);
  assert(close !== -1, 'card ternary closes');
  const card = IDX.slice(gi, close);
  assert(card.indexOf('id="ses-btn-${item.ticker}"') !== -1, 'ses-btn inside gate');
  assert(card.indexOf('id="ses-panel-${item.ticker}"') !== -1, 'ses-panel inside gate');
  assert(card.indexOf('Stored SEC Evidence (non-scoring)') !== -1, 'card title inside gate');
  // no category UI in the new card
  assert(card.indexOf('re-cat-cb') === -1, 'no re-cat-cb in SES card');
  assert(card.indexOf('type="checkbox"') === -1, 'no checkbox in SES card');
  // handler strict gates
  assert(HANDLER_BLOCK.indexOf('if (window.PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT !== true) return;') !== -1, 'handler entry gate');
  assert(HANDLER_BLOCK.indexOf("if (typeof requestSecEvidenceStoreLookup !== 'function') return;") !== -1, 'adapter guard');
  assert(HANDLER_BLOCK.indexOf('if (btn.disabled) return;') !== -1, 'dup-click guard');
  assert(HANDLER_BLOCK.indexOf('} finally {') !== -1, 'finally restore');
  // inlined adapter parity vs committed source minus leading 'use strict'
  const inl = slice(IDX, '// ═══ services/sec-evidence-store-client.js — inlined (EG-20C-4B-2)', '// ═══ end services/sec-evidence-store-client.js');
  const afterBanner = inl.slice(inl.indexOf('no auto-invocation at load.'));
  const inlinedBody = afterBanner.slice(afterBanner.indexOf('\n') + 1).replace(/[ \t\r\n]+$/, '').replace(/\r\n/g, '\n');
  const svcBody = SVC.replace(/^﻿?'use strict';[ \t]*\r?\n\r?\n?/, '').replace(/[ \t\r\n]+$/, '').replace(/\r\n/g, '\n');
  assert.strictEqual(inlinedBody, svcBody, 'inlined adapter === committed source minus use strict');
  // no forbidden recommendation language in added UI surfaces (card + handler)
  const bad = (card + '\n' + HANDLER_BLOCK).match(/\b(verified|confirmed|buy|sell|rating|target|score|risk)\b/ig) || [];
  assert.strictEqual(bad.length, 0, 'no forbidden UI words: ' + bad.join(','));
  // no forbidden mutation surfaces in the handler block
  ['localStorage', 'sessionStorage', 'pt_', 'orchestrate', 'analyzeChunk', 'enforceScoreConsistency', '_techCache', 'setItem'].forEach(function (t) {
    assert.strictEqual(HANDLER_BLOCK.indexOf(t), -1, 'handler block free of: ' + t);
  });
}

async function main() {
  statusMatrix();
  renderMatrix();
  await behavior();
  staticProofs();
}
main().then(function () {
  console.log('sec_evidence_store_view_test: PASS');
}).catch(function (e) {
  console.error('sec_evidence_store_view_test: FAIL');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
