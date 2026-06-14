const { test, expect } = require('@playwright/test');

const SEED = '{"AAPL":{"symbol":"AAPL","positionSize":5000}}';
// Matches both JS-level warn messages (contain URL) and browser-level resource errors (generic 404 text)
const LOCALHOST_404_PATTERN = /\.netlify\/functions\/(?:market-data|av-proxy)|Failed to load resource: the server responded with a status of 404/;

test('Phase 1C-1A — Gated Portfolio Runtime Price Bridge', async ({ page }) => {
  const results = [];
  const check = (id, label, pass, obs) => {
    results.push({ id, pass, obs });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${label}${obs ? ' — ' + obs : ''}`);
  };

  // Separate real errors from expected localhost 404s
  const realConsoleErrors = [];
  const localhostNetworkErrors = [];
  const consoleWarnings = [];
  const marketCalls = [];
  const scanCalls = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (LOCALHOST_404_PATTERN.test(text)) {
        localhostNetworkErrors.push(text);
      } else {
        realConsoleErrors.push(text);
      }
    }
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });

  page.on('request', req => {
    const url = req.url();
    if (url.includes('/.netlify/functions/market-data') ||
        url.includes('/.netlify/functions/av-proxy')) {
      marketCalls.push(url);
    }
    if (url.includes('anthropic-proxy') || url.includes('perplexity-proxy') ||
        url.includes('edgar-form4') || url.includes('finance-search') ||
        url.includes('capital-returns')) {
      scanCalls.push(url);
    }
  });

  // ── Navigate ──────────────────────────────────────────────────────────────
  await page.goto('/index.html');
  await page.waitForTimeout(800);

  // ── Capture baseline localStorage keys ───────────────────────────────────
  const baselineKeys = await page.evaluate(() => Object.keys(localStorage));
  console.log('Baseline localStorage keys:', baselineKeys.join(', ') || 'none');

  // ── Capture original pt_holdings; seed if null/empty ─────────────────────
  const originalRaw = await page.evaluate(() => localStorage.getItem('pt_holdings'));

  let holdings = {};
  try { holdings = originalRaw ? JSON.parse(originalRaw) : {}; } catch (e) {}
  const hadRealHoldings = Object.keys(holdings || {}).length > 0;

  let seedUsed = false;
  let symbols = Object.keys(holdings || {});

  if (!hadRealHoldings) {
    await page.evaluate((seed) => localStorage.setItem('pt_holdings', seed), SEED);
    seedUsed = true;
    symbols = ['AAPL'];
    console.log('Seed used: YES — injected temporary AAPL holding (positionSize: 5000)');
  } else {
    console.log('Seed used: NO — real pt_holdings present');
  }

  console.log('=== PRE-CHECK ===');
  console.log('Holdings symbols:', symbols.join(', '));

  // Reset error collectors after page load noise
  realConsoleErrors.length = 0;
  localhostNetworkErrors.length = 0;
  consoleWarnings.length = 0;

  // ── Open Portfolio tab ────────────────────────────────────────────────────
  await page.click('button[data-view="portfolio"]');
  await page.waitForTimeout(600);

  // ═════════════════════════ GATE OFF ═════════════════════════════════════
  console.log('\n=== GATE OFF ===');

  const gateOff = await page.evaluate(() => window.PT_ENABLE_PORTFOLIO_LIVE_PRICES);
  check('G-OFF-1', 'PT_ENABLE_PORTFOLIO_LIVE_PRICES not set', gateOff !== true, String(gateOff));

  const portfolioVisible = await page.evaluate(() => {
    const el = document.getElementById('portfolioPanel');
    return el ? el.style.display !== 'none' : false;
  });
  check('G-OFF-2', 'Portfolio panel rendered', portfolioVisible, `display:${portfolioVisible ? 'visible' : 'hidden'}`);

  const mktElsOff = await page.evaluate(() =>
    document.querySelectorAll('[id^="pf-mkt-"]').length
  );
  check('G-OFF-3', 'No pf-mkt-* elements in DOM', mktElsOff === 0, `found: ${mktElsOff}`);

  await page.waitForTimeout(1200);

  const netOff = [...marketCalls];
  check('G-OFF-4', 'No market-data network calls triggered', netOff.length === 0,
    netOff.length > 0 ? netOff.join(', ') : 'none');

  const scanOff = [...scanCalls];
  check('G-OFF-5', 'No scan/analyze calls triggered', scanOff.length === 0,
    scanOff.length > 0 ? scanOff.join(', ') : 'none');

  const holdingsSnapOff = await page.evaluate(() => localStorage.getItem('pt_holdings'));
  const expectedSnap = seedUsed ? SEED : originalRaw;
  check('G-OFF-6', 'pt_holdings unchanged during Gate OFF', holdingsSnapOff === expectedSnap, '');

  // Only new keys added AFTER baseline are checked
  const keysAfterOff = await page.evaluate(() => Object.keys(localStorage));
  const newKeysOff = keysAfterOff.filter(k => !baselineKeys.includes(k) && k !== 'pt_holdings');
  const forbiddenNewOff = newKeysOff.filter(k => /pt_results|pt_tickers|market|price/i.test(k));
  check('G-OFF-7', 'No forbidden new localStorage keys written (Gate OFF)',
    forbiddenNewOff.length === 0,
    newKeysOff.length > 0 ? `new keys: ${newKeysOff.join(', ')}` : 'none');

  const errOff = [...realConsoleErrors];
  check('G-OFF-8', 'No real console errors (Gate OFF)', errOff.length === 0,
    errOff.length > 0 ? errOff.join('; ') : 'none');

  // reset collectors
  marketCalls.length = 0;
  scanCalls.length = 0;
  realConsoleErrors.length = 0;
  localhostNetworkErrors.length = 0;
  consoleWarnings.length = 0;

  // ═════════════════════════ GATE ON ══════════════════════════════════════
  console.log('\n=== GATE ON ===');

  await page.evaluate(() => {
    window.PT_ENABLE_PORTFOLIO_LIVE_PRICES = true;
    if (typeof _renderPortfolioPanel === 'function') _renderPortfolioPanel();
  });

  // 8s Portfolio timeout + 1.5s margin; resolves faster on DEV with live Netlify
  await page.waitForTimeout(9500);

  // ── G-ON-3 diagnostics ────────────────────────────────────────────────────
  console.log('\n--- G-ON-3 diagnostics ---');

  const diag = await page.evaluate(() => ({
    fetchingFlag:   typeof _portfolioFetching !== 'undefined' ? _portfolioFetching : 'UNDEFINED',
    runtimeKeys:    typeof _portfolioRuntime  !== 'undefined' ? Object.keys(_portfolioRuntime) : 'UNDEFINED',
    aapl_el_text:   document.getElementById('pf-mkt-AAPL') ? document.getElementById('pf-mkt-AAPL').textContent.trim() : 'MISSING',
    aapl_el_html:   document.getElementById('pf-mkt-AAPL') ? document.getElementById('pf-mkt-AAPL').innerHTML : 'MISSING',
  }));
  console.log('  _portfolioFetching after wait:', diag.fetchingFlag);
  console.log('  _portfolioRuntime keys:', Array.isArray(diag.runtimeKeys) ? (diag.runtimeKeys.join(', ') || 'empty') : diag.runtimeKeys);
  console.log('  pf-mkt-AAPL text:', JSON.stringify(diag.aapl_el_text));
  console.log('  pf-mkt-AAPL html:', diag.aapl_el_html);
  console.log('  market-data calls fired:', marketCalls.length, marketCalls.join(', ') || 'none');
  console.log('  console.warn messages:', consoleWarnings.join(' | ') || 'none');
  console.log('  localhost 404 errors:', localhostNetworkErrors.join(' | ') || 'none');
  console.log('--- end diagnostics ---\n');

  // pf-mkt-AAPL exists
  const placeholders = await page.evaluate((syms) =>
    syms.map(sym => ({
      sym,
      exists: !!document.getElementById('pf-mkt-' + sym),
    }))
  , symbols);
  const allExist = placeholders.every(p => p.exists);
  check('G-ON-1', 'pf-mkt-* elements exist for all holdings', allExist,
    placeholders.map(p => `${p.sym}:${p.exists}`).join(', '));

  const mktContent = await page.evaluate((syms) =>
    syms.map(sym => {
      const el = document.getElementById('pf-mkt-' + sym);
      if (!el) return { sym, exists: false, text: '', html: '' };
      return { sym, exists: true, text: el.textContent.trim(), html: el.innerHTML };
    })
  , symbols);

  console.log('pf-mkt element content:');
  mktContent.forEach(m => console.log(`  ${m.sym}: "${m.text}"`));

  // No $0 / $0.00
  const hasDollarZero = mktContent.some(m => /\$0(\.00)?(\b|%)/.test(m.text));
  check('G-ON-2', 'No $0.00 fallback (absent data shows — not $0)', !hasDollarZero,
    hasDollarZero ? 'FOUND $0 in output' : 'clean');

  // Price or — shown (not still loading …)
  const allResolved = mktContent.every(m =>
    m.text === '—' || /^\$\d/.test(m.text)
  );
  check('G-ON-3', 'Price resolved (— or $price, not still loading …)', allResolved,
    mktContent.map(m => `${m.sym}:"${m.text}"`).join(', '));

  // No P/L label in market price area
  const hasPLLabel = mktContent.some(m => /P\/L|P&L|pnl/i.test(m.html));
  check('G-ON-4', 'Daily change not labeled as P/L', !hasPLLabel,
    hasPLLabel ? 'FOUND P/L label' : 'clean');

  // No avgCost / shares / market value leaking into mkt element HTML
  const hasLeakedFields = mktContent.some(m =>
    /avgCost|avg.cost|shares|market.value/i.test(m.html)
  );
  check('G-ON-5', 'No avgCost/shares/market-value in mkt elements', !hasLeakedFields,
    hasLeakedFields ? 'FOUND leaked field' : 'clean');

  // pt_holdings not mutated
  const holdingsDuringOn = await page.evaluate(() => localStorage.getItem('pt_holdings'));
  check('G-ON-6', 'pt_holdings not mutated (Gate ON)', holdingsDuringOn === expectedSnap, '');

  // No pt_results / pt_tickers newly written (compare against baseline)
  const keysAfterOn = await page.evaluate(() => Object.keys(localStorage));
  const newKeysOn = keysAfterOn.filter(k => !baselineKeys.includes(k) && k !== 'pt_holdings');
  const forbiddenNewOn = newKeysOn.filter(k => /pt_results|pt_tickers/i.test(k));
  check('G-ON-7', 'No pt_results/pt_tickers newly written', forbiddenNewOn.length === 0,
    forbiddenNewOn.length > 0 ? `newly added: ${forbiddenNewOn.join(', ')}` : 'none');

  // No unexpected market/price keys newly added
  const unexpectedNewOn = newKeysOn.filter(k => /market|price|portfolio|runtime/i.test(k));
  check('G-ON-8', 'No unexpected new market/price localStorage keys', unexpectedNewOn.length === 0,
    unexpectedNewOn.length > 0 ? `found: ${unexpectedNewOn.join(', ')}` : 'none');

  // No scan/analyze/orchestrate calls
  const scanOn = [...scanCalls];
  check('G-ON-9', 'No scan/analyze/orchestrate calls', scanOn.length === 0,
    scanOn.length > 0 ? scanOn.join(', ') : 'none');

  // Console errors — real only; localhost 404 for market-data is recorded as limitation
  const errOn = [...realConsoleErrors];
  check('G-ON-10', 'No real console errors (Gate ON)', errOn.length === 0,
    errOn.length > 0 ? errOn.join('; ') : 'none');

  if (localhostNetworkErrors.length > 0) {
    console.log(`[LIMITATION] localhost 404 for Netlify function (expected): ${localhostNetworkErrors.length} error(s)`);
  }

  // ── Restore pt_holdings ───────────────────────────────────────────────────
  if (originalRaw === null) {
    await page.evaluate(() => localStorage.removeItem('pt_holdings'));
  } else {
    await page.evaluate((raw) => localStorage.setItem('pt_holdings', raw), originalRaw);
  }

  const restoredRaw = await page.evaluate(() => localStorage.getItem('pt_holdings'));
  const restored = restoredRaw === originalRaw;
  check('CLEANUP-1', 'pt_holdings restored to original state', restored,
    restored ? (originalRaw === null ? 'removed (was null)' : 'restored exact string') : 'MISMATCH');

  // ═════════════════════════ SUMMARY ══════════════════════════════════════
  console.log('\n=== SUMMARY ===');
  console.log('Seed used:', seedUsed ? 'YES' : 'NO');
  const failed = results.filter(r => !r.pass);
  console.log(`Checks: ${results.length}  PASS: ${results.filter(r => r.pass).length}  FAIL: ${failed.length}`);
  if (failed.length > 0) {
    console.log('Failed:');
    failed.forEach(r => console.log(`  ${r.id}: ${r.obs}`));
  }

  expect(failed.length, `${failed.length} check(s) failed`).toBe(0);
});
