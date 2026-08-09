'use strict';

/*
 * QA-1 offline validation entry point.
 *
 * Pure Node, no new dependencies, no network, no browser, no live services.
 * This runner only reads repo files and spawns child node processes.
 *
 * Hard checks:
 *   1. Syntax check JS files with node --check.
 *   2. Run the 7 offline Research Evidence tests as isolated child processes.
 *   3. Static forbidden-surface checks for Research Evidence + Portfolio Sync paths.
 *   4. Server gate strict-string checks.
 *   5. Client gate strict-boolean checks for all 10 known client gates
 *      (direct dot access, bracket access, and FLAG-const indirection).
 *   6. No token persistence patterns.
 *
 * Advisory only:
 *   - Smart/curly quote scan inside index.html script blocks.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

const hardFailures = [];
const advisories = [];

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function exists(relPath) {
  return fs.existsSync(abs(relPath));
}

function read(relPath) {
  if (!exists(relPath)) {
    return null;
  }
  return fs.readFileSync(abs(relPath), 'utf8');
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function header(title) {
  console.log('\n=== ' + title + ' ===');
}

function pass(message) {
  console.log('  PASS  ' + message);
}

function fail(label, message) {
  const item = label + ': ' + message;
  console.log('  FAIL  ' + message);
  hardFailures.push(item);
}

function warn(message) {
  console.log('  WARN  ' + message);
  advisories.push(message);
}

function walkJs(relDir) {
  const dir = abs(relDir);
  const out = [];

  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') {
      continue;
    }

    const childRel = relDir + '/' + entry.name;

    if (entry.isDirectory()) {
      out.push(...walkJs(childRel));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(childRel);
    }
  }

  return out;
}

function uniqueSorted(items) {
  return Array.from(new Set(items)).sort();
}

// Extract a top-level `function name(...) { ... }` source by brace-matching.
// Used by the G-R resolver phase to exercise the real index.html functions in a
// sandbox. Read-only: never edits index.html.
function extractFunctionSource(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) {
    return null;
  }
  // "async function name(...)" matches sig starting at "function" — that
  // would silently drop the "async " prefix and produce an illegal (still
  // containing await, but no longer async) copy. Detect and include it.
  const ASYNC_PREFIX = 'async ';
  const realStart = (start >= ASYNC_PREFIX.length && content.slice(start - ASYNC_PREFIX.length, start) === ASYNC_PREFIX)
    ? start - ASYNC_PREFIX.length
    : start;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) {
    return null;
  }
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(realStart, i + 1);
      }
    }
  }
  return null;
}

// Extract a top-level `var name = ...;` declaration verbatim, up to its
// terminating semicolon. Used by the backup-fidelity phase to pull in the
// small constants _pfNormalizeHoldingEntry depends on, so the sandbox tests
// the real current values rather than a reimplemented copy that could drift.
function extractVarSource(content, name) {
  const sig = 'var ' + name;
  const start = content.indexOf(sig);
  if (start === -1) {
    return null;
  }
  const semi = content.indexOf(';', start);
  if (semi === -1) {
    return null;
  }
  return content.slice(start, semi + 1);
}

const OFFLINE_TESTS = [
  'qa/research_evidence_contract_test.js',
  'qa/research_evidence_mock_provider_test.js',
  'qa/research_evidence_cache_test.js',
  'qa/research_evidence_source_renderer_test.js',
  'qa/research_evidence_client_adapter_test.js',
  'qa/research_evidence_sec10q_fixture_provider_test.js',
  'qa/research_evidence_sec10q_live_provider_test.js',
  'qa/sec_evidence_store_test.js',
  'qa/sec_evidence_store_client_adapter_test.js',
  'qa/sec_evidence_store_view_test.js',
  'qa/portfolio_evidence_pull_offline.js',
  'qa/sec10q_live_cik_seam_offline.js',
  'qa/portfolio_evidence_pull_live_offline.js',
  'qa/evidence_pull_orchestrator_offline.js',
  'qa/evidence_pull_preflight_offline.js',
  'qa/sec_evidence_pull_endpoint_offline.js',
  'qa/evidence_teardown_offline.js',
  'qa/sec_evidence_pull_batch_driver_offline.js',
  'qa/portfolio_ticker_source_offline.js',
  'qa/batch_pull_wiring_offline.js',
  'qa/batch_owner_script_offline.js',
  'qa/fund_facts_provider_offline.js',
  'qa/fund_facts_preflight_offline.js',
  'qa/fund_facts_core_offline.js',
  'qa/fund_facts_route_offline.js',
  'qa/evidence_freshness_offline.js',
  'qa/fund_facts_teardown_offline.js',
  'qa/fund_facts_read_client_test.js'
];

const CLIENT_GATES = [
  'PT_ENABLE_CAPITAL_RETURNS_CLIENT',
  'PT_ENABLE_RESEARCH_EVIDENCE_CLIENT',
  'PT_ENABLE_PORTFOLIO_SYNC_CLIENT',
  'PT_ENABLE_FINANCE_SEARCH_CLIENT',
  'PT_ENABLE_EDGAR_FORM4',
  'PT_ENABLE_PORTFOLIO_RESEARCH',
  'PT_ENABLE_PORTFOLIO_LIVE_PRICES',
  'PT_ENABLE_QUERY_SPLIT_DEEPDIVE',
  'PT_ENABLE_SEC_EVIDENCE_STORE_CLIENT',
  'PT_ENABLE_FUND_FACTS_READ_CLIENT'
];

const SERVER_GATES_DIRECT = [
  {
    file: 'netlify/functions/capital-returns.js',
    name: 'PT_ENABLE_CAPITAL_RETURNS_SERVER'
  },
  {
    file: 'netlify/functions/edgar-form4.js',
    name: 'PT_ENABLE_EDGAR_FORM4_SERVER'
  },
  {
    file: 'netlify/functions/finance-search.js',
    name: 'PT_ENABLE_FINANCE_SEARCH_SERVER'
  },
  {
    file: 'netlify/functions/portfolio-sync.js',
    name: 'PT_ENABLE_PORTFOLIO_SYNC_SERVER'
  },
  {
    file: 'netlify/functions/sec-evidence-store.js',
    name: 'PT_ENABLE_SEC_EVIDENCE_STORE_SERVER'
  }
];

function phaseSyntax() {
  header('Phase 1 - syntax check');

  const files = uniqueSorted(
    []
      .concat(walkJs('netlify/functions'))
      .concat(walkJs('services'))
      .concat(walkJs('qa'))
      .concat(walkJs('tools'))
      .concat(exists('playwright.config.js') ? ['playwright.config.js'] : [])
  );

  if (files.length === 0) {
    fail('syntax', 'no JavaScript files found for syntax checking');
    return;
  }

  let okCount = 0;

  for (const file of files) {
    const result = spawnSync(NODE, ['--check', abs(file)], {
      encoding: 'utf8',
      cwd: ROOT
    });

    if (result.status === 0) {
      okCount += 1;
    } else {
      const output = ((result.stderr || '') + (result.stdout || '')).trim();
      fail('syntax', file + (output ? '\n' + output : ''));
    }
  }

  if (okCount === files.length) {
    pass(okCount + ' JavaScript file(s) parsed cleanly');
  }
}

function phaseOfflineTests() {
  header('Phase 2 - offline Research Evidence tests');

  for (const testFile of OFFLINE_TESTS) {
    if (!exists(testFile)) {
      fail('offline-test', testFile + ' is missing');
      continue;
    }

    const result = spawnSync(NODE, [abs(testFile)], {
      encoding: 'utf8',
      cwd: ROOT
    });

    if (result.status === 0) {
      pass(testFile);
    } else {
      const output = ((result.stdout || '') + (result.stderr || '')).trim();
      fail('offline-test', testFile + ' exited with ' + result.status + (output ? '\n' + output : ''));
    }
  }

  console.log('  (' + OFFLINE_TESTS.length + ' offline test file(s))');
}

function evidenceAndSyncPaths() {
  return uniqueSorted(
    []
      .concat(walkJs('netlify/functions/lib').filter((file) => /evidence/.test(file)))
      .concat([
        'netlify/functions/research-evidence.js',
        'netlify/functions/sec-evidence-store.js',
        'netlify/functions/portfolio-sync.js'
      ])
      .concat(walkJs('services').filter((file) => /research-evidence/.test(file)))
  );
}

function phaseForbiddenSurface() {
  header('Phase 3 - forbidden-surface checks');

  checkNoEvidenceOrSyncMutation();
  checkServerGates();
  checkClientGates();
  checkNoTokenPersistence();
  smartQuoteAdvisory();
}

function checkNoEvidenceOrSyncMutation() {
  const paths = evidenceAndSyncPaths();

  const forbiddenRules = [
    {
      re: /\b(?:orchestrate|analyzeChunk|enforceScoreConsistency)\s*\(/,
      what: 'scoring-engine call'
    },
    {
      re: /_techCache\b/,
      what: '_techCache reference'
    },
    {
      re: /(?:setItem|removeItem)\s*\(\s*[`'"]?pt_results/,
      what: 'pt_results storage write'
    },
    {
      re: /[`'"]pt_results[`'"]\s*\]?\s*=(?!=)/,
      what: 'pt_results assignment'
    },
    {
      re: /localStorage\s*\.\s*setItem\s*\(/,
      what: 'localStorage.setItem'
    },
    {
      re: /localStorage\s*\[[^\]]*\]\s*=(?!=)/,
      what: 'localStorage[...] assignment'
    }
  ];

  let clean = true;

  for (const file of paths) {
    const content = read(file);

    if (content === null) {
      clean = false;
      fail('forbidden-surface', file + ' is missing');
      continue;
    }

    for (const rule of forbiddenRules) {
      const match = rule.re.exec(content);

      if (match) {
        clean = false;
        fail(
          'forbidden-surface',
          file + ':' + lineOf(content, match.index) + ' - ' + rule.what
        );
      }
    }
  }

  if (clean) {
    pass('no scoring / pt_results / localStorage mutation in ' + paths.length + ' evidence+sync path(s)');
  }
}

function checkServerGates() {
  let ok = true;

  for (const gate of SERVER_GATES_DIRECT) {
    const content = read(gate.file);

    if (content === null) {
      ok = false;
      fail('server-gate', gate.file + ' is missing');
      continue;
    }

    const strictEnvCheck = new RegExp(
      'process\\.env\\.' + gate.name + "\\s*!==\\s*(['\"])true\\1"
    );

    if (!strictEnvCheck.test(content)) {
      ok = false;
      fail(
        'server-gate',
        gate.name + ' is not found as a strict !== true string check in ' + gate.file
      );
    }
  }

  const researchEvidence = read('netlify/functions/research-evidence.js');

  if (researchEvidence === null) {
    ok = false;
    fail('server-gate', 'netlify/functions/research-evidence.js is missing');
  } else {
    const indirectChecks = [
      {
        label: 'SERVER_GATE const',
        re: /const\s+SERVER_GATE\s*=\s*(['"])PT_ENABLE_RESEARCH_EVIDENCE_SERVER\1/
      },
      {
        label: 'SERVER_GATE strict check',
        re: /process\.env\[\s*SERVER_GATE\s*\]\s*!==\s*(['"])true\1/
      },
      {
        label: 'CACHE_GATE const',
        re: /const\s+CACHE_GATE\s*=\s*(['"])PT_EVIDENCE_CACHE\1/
      },
      {
        label: 'CACHE_GATE strict check',
        re: /process\.env\[\s*CACHE_GATE\s*\]\s*!==\s*(['"])true\1/
      }
    ];

    for (const check of indirectChecks) {
      if (!check.re.test(researchEvidence)) {
        ok = false;
        fail('server-gate', 'research-evidence.js missing strict pattern: ' + check.label);
      }
    }
  }

  if (ok) {
    pass('5 server gate(s) + 1 sub-gate are strict string checks against true');
  }
}

function checkClientGates() {
  const content = read('index.html');

  if (content === null) {
    fail('client-gate', 'index.html is missing');
    return;
  }

  function hasStrictCheck(name) {
    const direct = new RegExp(
      'window(?:\\.' + name + '|\\[\\s*[\'"]' + name + '[\'"]\\s*\\])\\s*(?:===|!==)\\s*true'
    );

    if (direct.test(content)) {
      return true;
    }

    const assignment = new RegExp(
      '(?:const|let|var)\\s+(\\w+)\\s*=\\s*[\'"]' + name + '[\'"]'
    );

    const match = assignment.exec(content);

    if (!match) {
      return false;
    }

    const variableName = match[1];
    const indirect = new RegExp(
      'window\\[\\s*' + variableName + '\\s*\\]\\s*(?:===|!==)\\s*true'
    );

    return indirect.test(content);
  }

  let okCount = 0;

  for (const gate of CLIENT_GATES) {
    if (hasStrictCheck(gate)) {
      okCount += 1;
    } else {
      fail('client-gate', gate + ' has no strict === true / !== true check in index.html');
    }
  }

  if (okCount === CLIENT_GATES.length) {
    pass('all ' + CLIENT_GATES.length + ' client gate(s) have a strict boolean check against true');
  }
}

function checkNoTokenPersistence() {
  const targets = uniqueSorted(['index.html'].concat(walkJs('services')));

  const tokenPersistenceRules = [
    {
      re: /(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*[`'"][^`'"]*token[^`'"]*[`'"]/i,
      what: 'setItem of token-like key'
    },
    {
      re: /(?:localStorage|sessionStorage)\s*\[\s*[`'"][^`'"]*token[^`'"]*[`'"]\s*\]\s*=(?!=)/i,
      what: 'storage token-like assignment'
    }
  ];

  let clean = true;

  for (const file of targets) {
    const content = read(file);

    if (content === null) {
      continue;
    }

    for (const rule of tokenPersistenceRules) {
      const match = rule.re.exec(content);

      if (match) {
        clean = false;
        fail(
          'token-persistence',
          file + ':' + lineOf(content, match.index) + ' - ' + rule.what
        );
      }
    }
  }

  if (clean) {
    pass('no token persistence patterns in ' + targets.length + ' file(s)');
  }
}

function smartQuoteAdvisory() {
  const content = read('index.html');

  if (content === null) {
    return;
  }

  const smartQuotes = /[‘’“”]/g;
  const scriptBlocks = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const lines = [];
  let block;

  while ((block = scriptBlocks.exec(content)) !== null) {
    const inner = block[1];
    const innerStart = block.index + block[0].indexOf(inner);
    let quoteMatch;

    smartQuotes.lastIndex = 0;

    while ((quoteMatch = smartQuotes.exec(inner)) !== null) {
      lines.push(lineOf(content, innerStart + quoteMatch.index));
    }
  }

  if (lines.length === 0) {
    pass('no smart quotes inside index.html script blocks');
    return;
  }

  const uniqueLines = Array.from(new Set(lines)).slice(0, 8);

  warn(
    'index.html has ' +
    lines.length +
    ' smart quote char(s) inside script blocks at line(s): ' +
    uniqueLines.join(', ') +
    (lines.length > uniqueLines.length ? ', ...' : '')
  );
}

function phaseResolverTests() {
  header('Phase 4 - G-R read-only research resolver (Slice A)');

  const content = read('index.html');
  if (content === null) {
    fail('resolver', 'index.html is missing');
    return;
  }

  let factory;
  try {
    const srSrc = extractFunctionSource(content, '_srSafeParseResults');
    const resolveSrc = extractFunctionSource(content, '_resolveResearchForHolding');
    const getSrc = extractFunctionSource(content, '_getResearchForHolding');
    if (!srSrc || !resolveSrc || !getSrc) {
      fail('resolver', 'could not extract _srSafeParseResults / _resolveResearchForHolding / _getResearchForHolding from index.html');
      return;
    }
    // eslint-disable-next-line no-new-func
    factory = new Function(
      '_cockpitResults',
      '_cockpitResultsSource',
      'localStorage',
      srSrc + '\n' + resolveSrc + '\n' + getSrc +
        '\nreturn { _resolveResearchForHolding: _resolveResearchForHolding, _getResearchForHolding: _getResearchForHolding };'
    );
  } catch (e) {
    fail('resolver', 'factory build error: ' + e.message);
    return;
  }

  const NOW = Date.now();
  const HOUR = 3600 * 1000;

  function iso(msAgo) {
    return new Date(NOW - msAgo).toISOString();
  }

  function rec(ticker, opts) {
    opts = opts || {};
    const r = { ticker: ticker, sentiment_score: 70, summary: 'stub summary for resolver test' };
    if ('_timestamp' in opts) {
      r._timestamp = opts._timestamp;
    }
    if ('_orchestratedAt' in opts) {
      r._orchestratedAt = opts._orchestratedAt;
    }
    if ('_aiUnavailable' in opts) {
      r._aiUnavailable = opts._aiUnavailable;
    }
    return r;
  }

  function makeMockLocalStorage(savedArr) {
    const store = { pt_results: JSON.stringify(savedArr || []) };
    const writes = [];
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) {
        writes.push(['set', k]);
        store[k] = v;
      },
      removeItem: function (k) {
        writes.push(['remove', k]);
        delete store[k];
      },
      _writes: writes,
      _raw: function () {
        return store.pt_results;
      }
    };
  }

  function build(sessionArr, savedArr, sessionSource) {
    const ls = makeMockLocalStorage(savedArr);
    const api = factory(sessionArr, sessionSource || 'session', ls);
    return { api: api, ls: ls };
  }

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('resolver', 'assertion failed: ' + name);
    }
  }

  // 1. partial-session shadowing: session AAPL, saved MSFT -> MSFT resolves saved.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], [rec('MSFT', { _timestamp: iso(2 * HOUR) })]);
    const m = s.api._resolveResearchForHolding('MSFT');
    check('shadowing: MSFT resolves from saved', m.result !== null && m.result.ticker === 'MSFT' && m.source === 'saved');
    const a = s.api._resolveResearchForHolding('AAPL');
    check('shadowing: AAPL still resolves from session', a.result !== null && a.source === 'session');
    check('shadowing: delegate returns saved MSFT result', s.api._getResearchForHolding('MSFT') !== null);
  })();

  // 2. session newer wins.
  (function () {
    const sess = [rec('AAPL', { _timestamp: iso(HOUR) })];
    const s = build(sess, [rec('AAPL', { _timestamp: iso(10 * HOUR) })]);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('session newer wins', r.source === 'session' && r.result === sess[0]);
  })();

  // 3. saved newer wins.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(10 * HOUR) })], [rec('AAPL', { _timestamp: iso(HOUR) })]);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('saved newer wins', r.source === 'saved');
  })();

  // 4. timestamp tie -> session wins.
  (function () {
    const tie = iso(HOUR);
    const s = build([rec('AAPL', { _timestamp: tie })], [rec('AAPL', { _timestamp: tie })]);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('timestamp tie -> session wins', r.source === 'session');
  })();

  // 5. invalid _timestamp + valid _orchestratedAt.
  (function () {
    const orch = iso(HOUR);
    const s = build([rec('AAPL', { _timestamp: 'garbage', _orchestratedAt: orch })], []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('falls back to _orchestratedAt timestamp', r.timestamp === orch);
    check('falls back to _orchestratedAt age', r.ageMs !== null && r.ageMs > HOUR - 1000 && r.ageMs < HOUR + 60000 && r.stale === false);
  })();

  // 6. missing timestamp behavior.
  (function () {
    const s = build([rec('AAPL', {})], []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('missing timestamp -> result kept, ts null, stale true', r.result !== null && r.timestamp === null && r.ageMs === null && r.stale === true);
  })();

  // 7. invalid timestamp behavior.
  (function () {
    const s = build([rec('AAPL', { _timestamp: 'not-a-date' })], []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('invalid timestamp -> ts null, stale true', r.timestamp === null && r.ageMs === null && r.stale === true);
  })();

  // 8. future timestamp guard (>5min invalid; <=5min valid).
  (function () {
    const far = new Date(NOW + 10 * 60 * 1000).toISOString();
    const sFar = build([rec('AAPL', { _timestamp: far })], []);
    const rFar = sFar.api._resolveResearchForHolding('AAPL');
    check('future >5min invalid', rFar.timestamp === null && rFar.ageMs === null && rFar.stale === true);
    const near = new Date(NOW + 2 * 60 * 1000).toISOString();
    const sNear = build([rec('AAPL', { _timestamp: near })], []);
    const rNear = sNear.api._resolveResearchForHolding('AAPL');
    check('future <=5min valid', rNear.timestamp === near && rNear.stale === false);
  })();

  // 9. duplicate same-symbol records within one source -> freshest valid wins; tie keeps first.
  //    Saved-source records are re-parsed from storage JSON, so they are compared
  //    by value/marker rather than by reference identity.
  (function () {
    const olderTs = iso(10 * HOUR);
    const newerTs = iso(HOUR);
    const s = build(null, [rec('AAPL', { _timestamp: olderTs }), rec('AAPL', { _timestamp: newerTs })]);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('dup within source -> freshest wins', r.result !== null && r.result._timestamp === newerTs);
    const tie = iso(HOUR);
    const a = rec('AAPL', { _timestamp: tie });
    a.tag = 'A';
    const b = rec('AAPL', { _timestamp: tie });
    b.tag = 'B';
    const s2 = build(null, [a, b]);
    const r2 = s2.api._resolveResearchForHolding('AAPL');
    check('dup within source tie -> first kept', r2.result !== null && r2.result.tag === 'A');
  })();

  // 10. lowercase normalization (query + stored ticker).
  (function () {
    const s = build(null, [rec('AAPL', { _timestamp: iso(HOUR) })]);
    check('query lowercase normalized', s.api._resolveResearchForHolding('aapl').result !== null);
    const s2 = build(null, [rec('aapl', { _timestamp: iso(HOUR) })]);
    check('stored ticker lowercase normalized', s2.api._resolveResearchForHolding('AAPL').result !== null);
  })();

  // 11. whitespace normalization (query + stored ticker).
  (function () {
    const s = build(null, [rec('AAPL', { _timestamp: iso(HOUR) })]);
    check('query whitespace normalized', s.api._resolveResearchForHolding('  AAPL  ').result !== null);
    const s2 = build(null, [rec(' AAPL ', { _timestamp: iso(HOUR) })]);
    check('stored ticker whitespace normalized', s2.api._resolveResearchForHolding('AAPL').result !== null);
  })();

  // 12. invalid dot-suffix symbol stays out of scope.
  (function () {
    const s = build(null, [rec('BRK.B', { _timestamp: iso(HOUR) })]);
    const r = s.api._resolveResearchForHolding('BRK.B');
    check('dot-suffix symbol -> no match', r.result === null && r.source === 'none' && r.stale === true);
  })();

  // 13. empty / undefined / null symbol.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], []);
    check('empty string symbol -> no match', s.api._resolveResearchForHolding('').result === null);
    check('undefined symbol -> no match', s.api._resolveResearchForHolding(undefined).result === null);
    check('null symbol -> no match', s.api._resolveResearchForHolding(null).result === null);
    check('delegate invalid symbol -> null', s.api._getResearchForHolding('BRK.B') === null);
  })();

  // 14. fresh _aiUnavailable vs older usable research -> freshness dominates.
  (function () {
    const sess = [rec('AAPL', { _timestamp: iso(HOUR), _aiUnavailable: true })];
    const s = build(sess, [rec('AAPL', { _timestamp: iso(10 * HOUR) })]);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('fresh _aiUnavailable wins over older usable', r.result === sess[0] && r.result._aiUnavailable === true && r.source === 'session');
  })();

  // 15. stale > 48h.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(50 * HOUR) })], []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('stale >48h', r.result !== null && r.ageMs > 48 * HOUR && r.stale === true);
  })();

  // 16. fresh < 48h.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('fresh <48h', r.stale === false && r.ageMs < 48 * HOUR);
  })();

  // 17. empty session + empty saved.
  (function () {
    const s = build(null, []);
    const r = s.api._resolveResearchForHolding('AAPL');
    check('empty both -> no match', r.result === null && r.source === 'none' && r.stale === true);
  })();

  // 18. populated both with distinct symbols.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], [rec('MSFT', { _timestamp: iso(HOUR) })]);
    check('distinct: AAPL from session', s.api._resolveResearchForHolding('AAPL').source === 'session');
    check('distinct: MSFT from saved', s.api._resolveResearchForHolding('MSFT').source === 'saved');
    check('distinct: absent symbol -> no match', s.api._resolveResearchForHolding('NVDA').result === null);
  })();

  // 19. zero mutation of source arrays, _cockpitResults, pt_results, localStorage.
  (function () {
    const sessionArr = [rec('AAPL', { _timestamp: iso(HOUR) }), rec('AAPL', { _timestamp: iso(2 * HOUR) })];
    const savedArr = [rec('MSFT', { _timestamp: iso(HOUR) }), rec('MSFT', { _timestamp: iso(3 * HOUR) })];
    const sessionSnap = JSON.stringify(sessionArr);
    const savedSnap = JSON.stringify(savedArr);
    const s = build(sessionArr, savedArr);
    const rawBefore = s.ls._raw();
    s.api._resolveResearchForHolding('AAPL');
    s.api._resolveResearchForHolding('MSFT');
    s.api._resolveResearchForHolding('aapl');
    s.api._getResearchForHolding('MSFT');
    s.api._resolveResearchForHolding('BRK.B');
    check('zero-mutation: session array unchanged', JSON.stringify(sessionArr) === sessionSnap);
    check('zero-mutation: saved array unchanged', JSON.stringify(savedArr) === savedSnap);
    check('zero-mutation: pt_results storage unchanged', s.ls._raw() === rawBefore);
    check('zero-mutation: no localStorage writes', s.ls._writes.length === 0);
  })();

  if (okCount === total) {
    pass(total + ' resolver assertion(s) passed');
  }
}

function phaseResearchViewTests() {
  header('Phase 5 - G-R ResearchView adapter + coverage honesty (Slice B)');

  const content = read('index.html');
  if (content === null) {
    fail('researchview', 'index.html is missing');
    return;
  }

  let factory;
  try {
    const srSrc = extractFunctionSource(content, '_srSafeParseResults');
    const resolveSrc = extractFunctionSource(content, '_resolveResearchForHolding');
    const viewSrc = extractFunctionSource(content, '_researchViewForHolding');
    const countsSrc = extractFunctionSource(content, '_calcResearchCoverageCounts');
    const aggSrc = extractFunctionSource(content, '_calcPortfolioAggregates');
    if (!srSrc || !resolveSrc || !viewSrc || !countsSrc || !aggSrc) {
      fail('researchview', 'could not extract Slice B functions from index.html');
      return;
    }
    // eslint-disable-next-line no-new-func
    factory = new Function(
      '_cockpitResults',
      '_cockpitResultsSource',
      'localStorage',
      'window',
      'fetch',
      'XMLHttpRequest',
      srSrc + '\n' + resolveSrc + '\n' + viewSrc + '\n' + countsSrc + '\n' + aggSrc +
        '\nreturn { view: _researchViewForHolding, counts: _calcResearchCoverageCounts, agg: _calcPortfolioAggregates };'
    );
  } catch (e) {
    fail('researchview', 'factory build error: ' + e.message);
    return;
  }

  const NOW = Date.now();
  const HOUR = 3600 * 1000;

  function iso(msAgo) {
    return new Date(NOW - msAgo).toISOString();
  }

  function rec(ticker, opts) {
    opts = opts || {};
    const r = { ticker: ticker, sentiment_score: 70, summary: 'stub summary for researchview test' };
    if ('_timestamp' in opts) {
      r._timestamp = opts._timestamp;
    }
    if ('_orchestratedAt' in opts) {
      r._orchestratedAt = opts._orchestratedAt;
    }
    if ('_aiUnavailable' in opts) {
      r._aiUnavailable = opts._aiUnavailable;
    }
    return r;
  }

  function makeMockLocalStorage(savedArr) {
    const store = { pt_results: JSON.stringify(savedArr || []) };
    const writes = [];
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) {
        writes.push(['set', k]);
        store[k] = v;
      },
      removeItem: function (k) {
        writes.push(['remove', k]);
        delete store[k];
      },
      _writes: writes,
      _raw: function () {
        return store.pt_results;
      }
    };
  }

  function build(sessionArr, savedArr, opts) {
    opts = opts || {};
    const ls = makeMockLocalStorage(savedArr);
    const win = opts.window || {};
    let netCalls = 0;
    const fetchSpy = function () {
      netCalls += 1;
      throw new Error('fetch is forbidden in Slice B');
    };
    const XhrSpy = function () {
      netCalls += 1;
      throw new Error('XMLHttpRequest is forbidden in Slice B');
    };
    const api = factory(sessionArr, opts.sessionSource || 'session', ls, win, fetchSpy, XhrSpy);
    return { api: api, ls: ls, win: win, netCalls: function () { return netCalls; } };
  }

  function holdingsOf(syms) {
    const h = {};
    for (const s of syms) {
      h[s] = { symbol: s, positionSize: 1000 };
    }
    return h;
  }

  const GATE_ON = { PT_ENABLE_PORTFOLIO_RESEARCH: true };

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('researchview', 'assertion failed: ' + name);
    }
  }

  // 1. envelope shape + covered status for a fresh session record.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], []);
    const v = s.api.view('AAPL');
    const keys = Object.keys(v).sort().join(',');
    check('envelope: exact key set', keys === 'ageMs,asOf,provenance,result,stale,status,symbol');
    check('envelope: fresh record covered', v.status === 'covered' && v.stale === false && v.result !== null);
    check('envelope: provenance session', v.provenance === 'session');
    check('envelope: symbol normalized', s.api.view(' aapl ').symbol === 'AAPL');
    check('envelope: asOf + ageMs populated', v.asOf !== null && typeof v.ageMs === 'number');
  })();

  // 2. gate OFF dormant: aggregate research is null (strict === true check).
  (function () {
    const h = holdingsOf(['AAPL', 'MSFT']);
    const sOff = build([rec('AAPL', { _timestamp: iso(HOUR) })], [], { window: {} });
    check('gate off: research aggregate null', sOff.api.agg(h).research === null);
    const sStr = build([rec('AAPL', { _timestamp: iso(HOUR) })], [], { window: { PT_ENABLE_PORTFOLIO_RESEARCH: 'true' } });
    check('gate off: string "true" stays dormant', sStr.api.agg(h).research === null);
  })();

  // 3. gate ON with no scan data: Research 0 / n, all missing.
  (function () {
    const h = holdingsOf(['AAPL', 'MSFT', 'NVDA']);
    const s = build(null, [], { window: GATE_ON });
    const r = s.api.agg(h).research;
    check('gate on, no data: covered 0 of n', r !== null && r.covered === 0 && r.total === 3);
    check('gate on, no data: all missing', r.missing === 3 && r.stale === 0 && r.unavailable === 0 && r.unsupported === 0);
  })();

  // 4. stale record excluded from covered, counted stale.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(50 * HOUR) })], [], { window: GATE_ON });
    check('stale: view status stale', s.api.view('AAPL').status === 'stale');
    const r = s.api.agg(holdingsOf(['AAPL'])).research;
    check('stale: excluded from covered', r.covered === 0 && r.stale === 1);
  })();

  // 5. invalid + future timestamps classify stale.
  (function () {
    const sBad = build([rec('AAPL', { _timestamp: 'not-a-date' })], []);
    check('invalid timestamp -> stale', sBad.api.view('AAPL').status === 'stale' && sBad.api.view('AAPL').asOf === null);
    const far = new Date(NOW + 10 * 60 * 1000).toISOString();
    const sFut = build([rec('AAPL', { _timestamp: far })], []);
    check('future >5min timestamp -> stale', sFut.api.view('AAPL').status === 'stale');
  })();

  // 6. _aiUnavailable = unavailable; precedence beats stale.
  (function () {
    const sFresh = build([rec('AAPL', { _timestamp: iso(HOUR), _aiUnavailable: true })], []);
    check('_aiUnavailable fresh -> unavailable', sFresh.api.view('AAPL').status === 'unavailable');
    const sStale = build([rec('AAPL', { _timestamp: iso(50 * HOUR), _aiUnavailable: true })], []);
    check('_aiUnavailable stale -> unavailable (precedence)', sStale.api.view('AAPL').status === 'unavailable');
  })();

  // 7. missing = missing.
  (function () {
    const s = build([rec('AAPL', { _timestamp: iso(HOUR) })], []);
    check('absent symbol -> missing', s.api.view('MSFT').status === 'missing' && s.api.view('MSFT').provenance === 'none');
  })();

  // 8. dotted ticker = unsupported, not missing — even with a matching record.
  (function () {
    const s = build(null, [rec('BRK.B', { _timestamp: iso(HOUR) })]);
    const v = s.api.view('BRK.B');
    check('dotted ticker -> unsupported', v.status === 'unsupported' && v.status !== 'missing');
    check('non-string symbol -> unsupported', s.api.view(undefined).status === 'unsupported');
  })();

  // 9. mixed portfolio: one of each status; denominator = all unique holdings.
  (function () {
    const session = [
      rec('AAPL', { _timestamp: iso(HOUR) }),
      rec('MSFT', { _timestamp: iso(50 * HOUR) }),
      rec('NVDA', { _timestamp: iso(HOUR), _aiUnavailable: true })
    ];
    const s = build(session, [], { window: GATE_ON });
    const r = s.api.agg(holdingsOf(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'BRK.B'])).research;
    check('mixed: covered 1', r.covered === 1);
    check('mixed: stale 1', r.stale === 1);
    check('mixed: unavailable 1', r.unavailable === 1);
    check('mixed: missing 1', r.missing === 1);
    check('mixed: unsupported 1', r.unsupported === 1);
    check('mixed: denominator all unique holdings', r.total === 5);
  })();

  // 10. session vs saved conflict provenance + canonicalization of other tags.
  (function () {
    const sNew = build([rec('AAPL', { _timestamp: iso(HOUR) })], [rec('AAPL', { _timestamp: iso(10 * HOUR) })]);
    check('conflict: session newer -> provenance session', sNew.api.view('AAPL').provenance === 'session');
    const sOld = build([rec('AAPL', { _timestamp: iso(10 * HOUR) })], [rec('AAPL', { _timestamp: iso(HOUR) })]);
    check('conflict: saved newer -> provenance saved', sOld.api.view('AAPL').provenance === 'saved');
    const sTag = build([rec('AAPL', { _timestamp: iso(HOUR) })], [], { sessionSource: 'cloud' });
    const vTag = sTag.api.view('AAPL');
    check('canonicalization: non-session tag -> other, never saved', vTag.provenance === 'other' && vTag.provenance !== 'saved');
    check('canonicalization: other tag still covered when fresh', vTag.status === 'covered');
    const sSavedTag = build([rec('AAPL', { _timestamp: iso(HOUR) })], [], { sessionSource: 'saved' });
    check('canonicalization: init-restore saved tag -> saved', sSavedTag.api.view('AAPL').provenance === 'saved');
  })();

  // 11. zero fetch / zero XHR and zero storage or input mutation across all paths.
  (function () {
    const sessionArr = [rec('AAPL', { _timestamp: iso(HOUR) }), rec('MSFT', { _timestamp: iso(50 * HOUR) })];
    const savedArr = [rec('NVDA', { _timestamp: iso(HOUR), _aiUnavailable: true })];
    const sessionSnap = JSON.stringify(sessionArr);
    const savedSnap = JSON.stringify(savedArr);
    const s = build(sessionArr, savedArr, { window: GATE_ON });
    const winKeysBefore = JSON.stringify(Object.keys(s.win));
    s.api.view('AAPL');
    s.api.view('MSFT');
    s.api.view('NVDA');
    s.api.view('TSLA');
    s.api.view('BRK.B');
    s.api.counts(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'BRK.B']);
    s.api.agg(holdingsOf(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'BRK.B']));
    check('zero network: no fetch/XHR calls', s.netCalls() === 0);
    check('zero writes: localStorage untouched', s.ls._writes.length === 0);
    check('zero writes: pt_results raw unchanged', s.ls._raw() === savedSnap);
    check('zero mutation: session array unchanged', JSON.stringify(sessionArr) === sessionSnap);
    check('zero mutation: saved array unchanged', JSON.stringify(savedArr) === savedSnap);
    check('zero mutation: window keys unchanged', JSON.stringify(Object.keys(s.win)) === winKeysBefore);
  })();

  // 12. static: gate init reads key with strict === 'true' and falls back to false,
  //     so a reload with the key absent is dormant.
  (function () {
    const initRead = /window\.PT_ENABLE_PORTFOLIO_RESEARCH\s*=\s*\(localStorage\.getItem\('pt_enable_portfolio_research'\)\s*===\s*'true'\)/;
    check('static: init gate strict string read', initRead.test(content.replace(/\s+/g, ' ')));
    check('static: init gate catch fallback false', /window\.PT_ENABLE_PORTFOLIO_RESEARCH = false/.test(content));
  })();

  // 13. static: the pf-pos-research DOM creation assignment (not CSS selectors or
  //     comments) sits inside a strict G-R gate block.
  (function () {
    const gateStr = 'if (window.PT_ENABLE_PORTFOLIO_RESEARCH === true) {';
    const ranges = [];
    let from = 0;
    for (;;) {
      const at = content.indexOf(gateStr, from);
      if (at === -1) {
        break;
      }
      const braceStart = at + gateStr.length - 1;
      let depth = 0;
      for (let i = braceStart; i < content.length; i += 1) {
        if (content[i] === '{') {
          depth += 1;
        } else if (content[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            ranges.push([at, i]);
            break;
          }
        }
      }
      from = at + gateStr.length;
    }
    check('static: strict gate blocks found', ranges.length >= 2);
    const creationStr = "resRow.className = 'pf-pos-research'";
    let allInside = true;
    let occurrences = 0;
    let seek = 0;
    for (;;) {
      const at = content.indexOf(creationStr, seek);
      if (at === -1) {
        break;
      }
      occurrences += 1;
      if (!ranges.some(function (rg) { return at > rg[0] && at < rg[1]; })) {
        allInside = false;
      }
      seek = at + 1;
    }
    check('static: pf-pos-research creation only inside gate blocks', occurrences > 0 && allInside);
  })();

  if (okCount === total) {
    pass(total + ' researchview assertion(s) passed');
  }
}

function phaseTerminalChainIntegrity() {
  header('Phase 6 - Terminal-chain integrity (scoring/persistence boundary)');

  const content = read('index.html');
  if (content === null) {
    fail('terminal-chain', 'index.html is missing');
    return;
  }

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('terminal-chain', 'assertion failed: ' + name);
    }
  }

  // Structural: applyCapitalReturnsNudge( must occur exactly once in the
  // whole file — the function declaration itself. Zero call sites anywhere.
  (function () {
    const re = /applyCapitalReturnsNudge\(/g;
    const matches = content.match(re) || [];
    check('applyCapitalReturnsNudge( occurs exactly once (declaration only, no call sites)', matches.length === 1);
    check('the one occurrence is the function declaration', content.indexOf('function applyCapitalReturnsNudge(') !== -1);
  })();

  // Structural: the mid-scan write path validates before pushing into
  // newResults; the old unvalidated push pattern is gone.
  (function () {
    check('mid-scan push now goes through _isValidScanResult first',
      content.indexOf('const validBatchResults = batchResults.filter(_isValidScanResult);') !== -1 &&
      content.indexOf('newResults.push(...validBatchResults);') !== -1);
    check('old unvalidated newResults.push(...batchResults) pattern is gone',
      content.indexOf('newResults.push(...batchResults);') === -1);
  })();

  // Structural: the catch path still performs no pt_results write. Scoped
  // via extractFunctionSource to runAnalysis's own body first, so this
  // can't collide with any other catch block in the file, and depends on
  // no localized UI text.
  (function () {
    const runAnalysisSrc = extractFunctionSource(content, 'runAnalysis');
    check('runAnalysis function extracted', !!runAnalysisSrc);
    if (runAnalysisSrc) {
      const catchStart = runAnalysisSrc.indexOf('} catch (err) {');
      check('runAnalysis catch block found', catchStart !== -1);
      if (catchStart !== -1) {
        const finallyIdx = runAnalysisSrc.indexOf('} finally {', catchStart);
        const catchBody = finallyIdx !== -1 ? runAnalysisSrc.slice(catchStart, finallyIdx) : runAnalysisSrc.slice(catchStart);
        check('runAnalysis catch block performs no pt_results write', catchBody.indexOf("localStorage.setItem('pt_results'") === -1);
      }
    }
  })();

  let factory;
  try {
    const enforceSrc = extractFunctionSource(content, 'enforceScoreConsistency');
    const validatorSrc = extractFunctionSource(content, '_isValidScanResult');
    const mergeSrc = extractFunctionSource(content, 'mergeResultsByTicker');
    if (!enforceSrc || !validatorSrc || !mergeSrc) {
      fail('terminal-chain', 'could not extract enforceScoreConsistency / _isValidScanResult / mergeResultsByTicker from index.html');
      return;
    }
    // eslint-disable-next-line no-new-func
    factory = new Function(
      enforceSrc + '\n' + validatorSrc + '\n' + mergeSrc +
        '\nreturn { enforceScoreConsistency: enforceScoreConsistency, _isValidScanResult: _isValidScanResult, mergeResultsByTicker: mergeResultsByTicker };'
    )();
  } catch (e) {
    fail('terminal-chain', 'factory build error: ' + e.message);
    return;
  }

  const enforceScoreConsistency = factory.enforceScoreConsistency;
  const _isValidScanResult = factory._isValidScanResult;
  const mergeResultsByTicker = factory.mergeResultsByTicker;

  const BULLISH_CTX = JSON.stringify('raised PT and upgrade to buy, earnings beat expectations');
  const VALID_SUMMARY = 'This is a valid synthetic summary body used purely for offline pin fixtures and exceeds fifty characters.';

  function baseItem(overrides) {
    return Object.assign({
      ticker: 'AAPL',
      sentiment: 'neutral',
      sentiment_score: 50,
      summary: VALID_SUMMARY,
      _verifiedChangePct: 1.2
    }, overrides || {});
  }

  // Qualifying real item: verified data present, real analysis, score<65,
  // bullish context -> boost fires exactly as before.
  (function () {
    const out = enforceScoreConsistency([baseItem()], BULLISH_CTX);
    check('qualifying item: boost fires (score->72, sentiment positive)',
      out[0].sentiment_score === 72 && out[0].sentiment === 'positive');
  })();

  // Genuinely verified 0.00% day must NOT be confused with missing data —
  // boost still fires normally.
  (function () {
    const out = enforceScoreConsistency([baseItem({ _verifiedChangePct: 0 })], BULLISH_CTX);
    check('verified 0.00% day is eligible for the boost (not treated as missing data)',
      out[0].sentiment_score === 72 && out[0].sentiment === 'positive');
  })();

  // Synthetic/AI-failure item must never be rewritten, even with bullish context.
  (function () {
    const synthetic = baseItem({ _aiUnavailable: true, sentiment_score: 50, sentiment: 'neutral' });
    delete synthetic._verifiedChangePct; // a failed-AI item may also lack verified data
    const out = enforceScoreConsistency([synthetic], BULLISH_CTX);
    check('synthetic/_aiUnavailable item immune to the boost',
      out[0].sentiment_score === 50 && out[0].sentiment === 'neutral');
  })();

  // Synthetic item WITH verified market data present must still be immune
  // (the _aiUnavailable guard, not just the no-data guard, must independently hold).
  (function () {
    const out = enforceScoreConsistency([baseItem({ _aiUnavailable: true, sentiment_score: 50, sentiment: 'neutral' })], BULLISH_CTX);
    check('synthetic item immune even when verified market data is present',
      out[0].sentiment_score === 50 && out[0].sentiment === 'neutral');
  })();

  // Missing verified market data (real analysis) -> boost must not fire,
  // even though bullish/bearish counts and score would otherwise qualify.
  (function () {
    const noData = baseItem();
    delete noData._verifiedChangePct;
    const out = enforceScoreConsistency([noData], BULLISH_CTX);
    check('no verified market data -> boost skipped',
      out[0].sentiment_score === noData.sentiment_score && out[0].sentiment === noData.sentiment);
  })();

  // Pre-existing guards remain intact: down day, extended_near_ath, below_key_mas.
  (function () {
    const out = enforceScoreConsistency([baseItem({ _changePct: -5 })], BULLISH_CTX);
    check('pre-existing down-day guard unchanged (boost skipped)', out[0].sentiment_score === 50);
  })();
  (function () {
    const out = enforceScoreConsistency([baseItem({ technical_setup: 'extended_near_ath' })], BULLISH_CTX);
    check('pre-existing extended_near_ath guard unchanged (boost skipped)', out[0].sentiment_score === 50);
  })();
  (function () {
    const out = enforceScoreConsistency([baseItem({ technical_setup: 'below_key_mas' })], BULLISH_CTX);
    check('pre-existing below_key_mas guard unchanged (boost skipped)', out[0].sentiment_score === 50);
  })();

  // Non-qualifying (no bullish signal) -> unchanged, verified data present.
  (function () {
    const out = enforceScoreConsistency([baseItem()], JSON.stringify('no notable analyst activity'));
    check('no bullish signal -> item unchanged', out[0].sentiment_score === 50 && out[0].sentiment === 'neutral');
  })();

  // _isValidScanResult: the exact pre-existing predicate set, now shared.
  (function () {
    check('valid item accepted', _isValidScanResult(baseItem()) === true);
    check('missing ticker rejected', _isValidScanResult(baseItem({ ticker: '' })) === false);
    check('score out of range rejected', _isValidScanResult(baseItem({ sentiment_score: 999 })) === false);
    check('short summary rejected', _isValidScanResult(baseItem({ summary: 'too short' })) === false);
    check('invalid sentiment enum rejected', _isValidScanResult(baseItem({ sentiment: 'bullish' })) === false);
    check('raw-blob marker rejected', _isValidScanResult(baseItem({ summary: VALID_SUMMARY + ' __raw__' })) === false);
    check('perplexity-blob marker rejected', _isValidScanResult(baseItem({ summary: VALID_SUMMARY + ' === PERPLEXITY' })) === false);
    check('news-context marker rejected', _isValidScanResult(baseItem({ summary: VALID_SUMMARY + ' %%NEWS_CONTEXT' })) === false);
  })();

  // Simulated multi-batch scan using the real, composed extracted functions:
  // proves valid current-scan items persist, an invalid current-scan item
  // never does, and untouched historical results are byte-stable —
  // regardless of whether a later batch never runs (simulated throw).
  (function () {
    const previousResults = [{ ticker: 'GOOG', sentiment_score: 60, summary: VALID_SUMMARY, sentiment: 'neutral' }];
    const previousSnapshot = JSON.stringify(previousResults);
    let newResults = [];

    const batch1 = [{ ticker: 'AAPL', sentiment_score: 55, summary: VALID_SUMMARY, sentiment: 'positive' }];
    newResults.push(...batch1.filter(_isValidScanResult));
    const mergedAfterBatch1 = mergeResultsByTicker(previousResults, newResults);
    check('sim-scan: valid batch-1 item (AAPL) persisted mid-scan',
      mergedAfterBatch1.some(r => r.ticker === 'AAPL' && r.sentiment_score === 55));
    check('sim-scan: untouched previousResults (GOOG) still present after batch 1',
      mergedAfterBatch1.some(r => r.ticker === 'GOOG' && r.sentiment_score === 60));

    // Batch 2 produces a malformed item (score out of range) — simulates the
    // ticker whose analysis a later throw would otherwise have interrupted.
    const batch2 = [{ ticker: 'MSFT', sentiment_score: 999, summary: VALID_SUMMARY, sentiment: 'positive' }];
    newResults.push(...batch2.filter(_isValidScanResult));
    const mergedAfterBatch2 = mergeResultsByTicker(previousResults, newResults);
    check('sim-scan: invalid batch-2 item (MSFT) never persisted',
      !mergedAfterBatch2.some(r => r.ticker === 'MSFT'));
    check('sim-scan: valid batch-1 item (AAPL) still present after batch 2',
      mergedAfterBatch2.some(r => r.ticker === 'AAPL' && r.sentiment_score === 55));
    check('sim-scan: previousResults (GOOG) remains byte-stable throughout',
      JSON.stringify(previousResults) === previousSnapshot);
  })();

  if (okCount === total) {
    pass(total + ' terminal-chain integrity assertion(s) passed');
  }
}

function phaseBackupFidelity() {
  header('Phase 7 - Backup fidelity (.TA ticker restore alignment)');

  const content = read('index.html');
  if (content === null) {
    fail('backup-fidelity', 'index.html is missing');
    return;
  }

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('backup-fidelity', 'assertion failed: ' + name);
    }
  }

  // Structural: the three .TA-aware symbol-grammar copies must stay
  // byte-identical to each other (the exact drift risk the inline comment
  // added alongside this fix calls out).
  (function () {
    const pattern = '/^[A-Z]{1,10}(\\.TA)?$/';
    const occurrences = content.split(pattern).length - 1;
    check('the .TA symbol pattern occurs exactly 3 times (normalizer, saveAddPosition, backup ticker validator), all byte-identical', occurrences === 3);
  })();

  let factory;
  try {
    const validateSrc = extractFunctionSource(content, '_validatePortfolioBackup');
    const normalizeSrc = extractFunctionSource(content, '_pfNormalizeHoldingEntry');
    const normalizePositionSrc = extractFunctionSource(content, '_normalizePosition');
    const isFiniteNumSrc = extractFunctionSource(content, '_pfIsFiniteNum');
    const knownFieldsSrc = extractVarSource(content, 'PF_KNOWN_HOLDING_FIELDS');
    const wrapperMarkerSrc = extractVarSource(content, 'PF_HOLDING_WRAPPER_MARKER');
    const reservedKeysSrc = extractVarSource(content, 'PF_RESERVED_MARKER_KEYS');
    if (!validateSrc || !normalizeSrc || !normalizePositionSrc || !isFiniteNumSrc || !knownFieldsSrc || !wrapperMarkerSrc || !reservedKeysSrc) {
      fail('backup-fidelity', 'could not extract _validatePortfolioBackup or one of its dependencies from index.html');
      return;
    }
    // eslint-disable-next-line no-new-func
    factory = new Function(
      isFiniteNumSrc + '\n' + knownFieldsSrc + '\n' + wrapperMarkerSrc + '\n' + reservedKeysSrc + '\n' +
        normalizeSrc + '\n' + normalizePositionSrc + '\n' + validateSrc +
        '\nreturn { _validatePortfolioBackup: _validatePortfolioBackup };'
    )();
  } catch (e) {
    fail('backup-fidelity', 'factory build error: ' + e.message);
    return;
  }

  const _validatePortfolioBackup = factory._validatePortfolioBackup;

  function backupDoc(tickerSymbol) {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceOrigin: 'http://localhost',
      appBaseline: 'test',
      holdings: { AAPL: { symbol: 'AAPL', positionSize: 1000, currency: 'USD', source: 'manual' } },
      tickers: [{ symbol: tickerSymbol }]
    };
  }

  // Malformed-symbol coverage deliberately proves the "." is literal, not a
  // wildcard. A short probe like "TEVAXTA" cannot discriminate this — at 7
  // letters it matches the base [A-Z]{1,10} clause on its own, regardless
  // of whether the suffix group's dot is escaped, so it passes either way.
  // The base clause caps at 10 letters, so a 13-character probe (10 letters
  // + one non-dot character + "TA") can ONLY match via the suffix group —
  // an unescaped (.TA)? would wrongly accept it (the "." matching that one
  // extra character as a wildcard); the correctly-escaped (\.TA)? rejects
  // it, since there is no literal dot at that position.
  (function () {
    check('TEVA.TA accepted', _validatePortfolioBackup(backupDoc('TEVA.TA')).error === null);
    check('AAPL accepted (plain-letters regression)', _validatePortfolioBackup(backupDoc('AAPL')).error === null);
    check('TEVA.US rejected (wrong suffix)', _validatePortfolioBackup(backupDoc('TEVA.US')).error !== null);
    check('10-letter symbol + non-dot char + TA rejected (proves the dot is literal, not a wildcard)',
      _validatePortfolioBackup(backupDoc('AAAAAAAAAAXTA')).error !== null);
    check('AB1C rejected (digit still rejected)', _validatePortfolioBackup(backupDoc('AB1C')).error !== null);
  })();

  // End-to-end: a backup with both a .TA holding and its matching .TA
  // watchlist ticker validates successfully as a whole.
  (function () {
    const doc = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceOrigin: 'http://localhost',
      appBaseline: 'test',
      holdings: { 'TEVA.TA': { symbol: 'TEVA.TA', positionSize: 5000, currency: 'ILS', source: 'manual' } },
      tickers: [{ symbol: 'TEVA.TA' }]
    };
    const result = _validatePortfolioBackup(doc);
    check('.TA holding + matching .TA watchlist ticker both validate end-to-end',
      result.error === null &&
      result.holdings['TEVA.TA'] && result.holdings['TEVA.TA'].symbol === 'TEVA.TA' &&
      result.tickers.length === 1 && result.tickers[0].symbol === 'TEVA.TA');
  })();

  if (okCount === total) {
    pass(total + ' backup-fidelity assertion(s) passed');
  }
}

async function phasePortfolioReporting() {
  header('Phase 8 - Portfolio Reporting (P-2B cash/FX/total/allocation/day-estimate/backup-v2)');

  const content = read('index.html');
  if (content === null) {
    fail('portfolio-reporting', 'index.html is missing');
    return;
  }

  let factory;
  try {
    const pieces = {
      isFiniteNumSrc:        extractFunctionSource(content, '_pfIsFiniteNum'),
      cashLoadSrc:           extractFunctionSource(content, '_pfCashLoad'),
      cashSaveSrc:           extractFunctionSource(content, '_pfCashSave'),
      cashClearSrc:          extractFunctionSource(content, '_pfCashClear'),
      fxLoadCacheSrc:        extractFunctionSource(content, '_pfFxLoadCache'),
      fxSaveCacheSrc:        extractFunctionSource(content, '_pfFxSaveCache'),
      fxRateValidSrc:        extractFunctionSource(content, '_pfFxRateValid'),
      fxStateSrc:            extractFunctionSource(content, '_pfFxState'),
      fxBackupValidSrc:      extractFunctionSource(content, '_pfFxBackupRecordValid'),
      eodLoadCacheSrc:       extractFunctionSource(content, '_pfEodLoadCache'),
      eodSaveCacheSrc:       extractFunctionSource(content, '_pfEodSaveCache'),
      eodIsStaleSrc:         extractFunctionSource(content, '_pfEodIsStale'),
      dayEstimateSrc:        extractFunctionSource(content, '_pfPortfolioDayEstimate'),
      reportingSrc:          extractFunctionSource(content, '_pfComputePortfolioReporting'),
      holdingIlsValueSrc:    extractFunctionSource(content, '_pfHoldingIlsValue'),
      applyCashFxRestoreSrc: extractFunctionSource(content, '_pfApplyCashFxRestore'),
      normalizeSrc:          extractFunctionSource(content, '_pfNormalizeHoldingEntry'),
      normalizePositionSrc:  extractFunctionSource(content, '_normalizePosition'),
      validateBackupSrc:     extractFunctionSource(content, '_validatePortfolioBackup'),
      cashKeySrc:            extractVarSource(content, 'PF_CASH_KEY'),
      fxCacheKeySrc:         extractVarSource(content, 'PF_FX_CACHE_KEY'),
      fxFreshDaysSrc:        extractVarSource(content, 'PF_FX_FRESH_MAX_AGE_DAYS'),
      fxValidDaysSrc:        extractVarSource(content, 'PF_FX_VALID_MAX_AGE_DAYS'),
      eodCacheKeySrc:        extractVarSource(content, 'PF_EOD_CACHE_KEY'),
      knownFieldsSrc:        extractVarSource(content, 'PF_KNOWN_HOLDING_FIELDS'),
      wrapperMarkerSrc:      extractVarSource(content, 'PF_HOLDING_WRAPPER_MARKER'),
      reservedKeysSrc:       extractVarSource(content, 'PF_RESERVED_MARKER_KEYS')
    };
    const missing = Object.keys(pieces).filter(function (k) { return !pieces[k]; });
    if (missing.length > 0) {
      fail('portfolio-reporting', 'could not extract from index.html: ' + missing.join(', '));
      return;
    }

    // eslint-disable-next-line no-new-func
    factory = new Function(
      'localStorage',
      pieces.cashKeySrc + '\n' + pieces.fxCacheKeySrc + '\n' + pieces.fxFreshDaysSrc + '\n' +
        pieces.fxValidDaysSrc + '\n' + pieces.eodCacheKeySrc + '\n' +
        pieces.knownFieldsSrc + '\n' + pieces.wrapperMarkerSrc + '\n' + pieces.reservedKeysSrc + '\n' +
        pieces.isFiniteNumSrc + '\n' + pieces.cashLoadSrc + '\n' + pieces.cashSaveSrc + '\n' + pieces.cashClearSrc + '\n' +
        pieces.fxLoadCacheSrc + '\n' + pieces.fxSaveCacheSrc + '\n' + pieces.fxRateValidSrc + '\n' +
        pieces.fxStateSrc + '\n' + pieces.fxBackupValidSrc + '\n' +
        pieces.eodLoadCacheSrc + '\n' + pieces.eodSaveCacheSrc + '\n' + pieces.eodIsStaleSrc + '\n' + pieces.dayEstimateSrc + '\n' +
        pieces.reportingSrc + '\n' + pieces.holdingIlsValueSrc + '\n' + pieces.applyCashFxRestoreSrc + '\n' +
        pieces.normalizeSrc + '\n' + pieces.normalizePositionSrc + '\n' + pieces.validateBackupSrc +
        '\nreturn { _pfCashLoad: _pfCashLoad, _pfCashSave: _pfCashSave, _pfCashClear: _pfCashClear,' +
        ' _pfFxLoadCache: _pfFxLoadCache, _pfFxRateValid: _pfFxRateValid, _pfFxState: _pfFxState,' +
        ' _pfFxBackupRecordValid: _pfFxBackupRecordValid, _pfPortfolioDayEstimate: _pfPortfolioDayEstimate,' +
        ' _pfComputePortfolioReporting: _pfComputePortfolioReporting, _pfHoldingIlsValue: _pfHoldingIlsValue,' +
        ' _pfApplyCashFxRestore: _pfApplyCashFxRestore, _validatePortfolioBackup: _validatePortfolioBackup };'
    );
  } catch (e) {
    fail('portfolio-reporting', 'factory build error: ' + e.message);
    return;
  }

  function makeMockLocalStorage(seed) {
    const store = Object.assign({}, seed || {});
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = v; },
      removeItem: function (k) { delete store[k]; },
      _store: store
    };
  }

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('portfolio-reporting', 'assertion failed: ' + name);
    }
  }

  const DAY = 24 * 60 * 60 * 1000;
  function fxRecord(ageMsOrOverrides) {
    const base = {
      rate: 3.68, effectiveAt: new Date().toISOString(), source: 'boi',
      fetchedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastAttemptOk: true
    };
    if (typeof ageMsOrOverrides === 'number') {
      base.effectiveAt = new Date(Date.now() - ageMsOrOverrides).toISOString();
      return base;
    }
    return Object.assign(base, ageMsOrOverrides || {});
  }

  // ── Cash: three distinct states, never coerced to zero ─────────────────────
  (function () {
    const apiUnset = factory(makeMockLocalStorage({}));
    check('cash unset -> state unset (no key)', apiUnset._pfCashLoad().state === 'unset');

    const apiZero = factory(makeMockLocalStorage({ pt_cash: JSON.stringify({ amountILS: 0, asOf: '2026-08-01' }) }));
    const zeroState = apiZero._pfCashLoad();
    check('explicit amountILS:0 -> state recorded, amountILS 0 (not treated as unset)',
      zeroState.state === 'recorded' && zeroState.amountILS === 0);

    const apiUnparseable = factory(makeMockLocalStorage({ pt_cash: 'not json{{{' }));
    check('unparseable pt_cash -> state invalid', apiUnparseable._pfCashLoad().state === 'invalid');

    const apiNegative = factory(makeMockLocalStorage({ pt_cash: JSON.stringify({ amountILS: -5, asOf: '2026-08-01' }) }));
    check('negative amountILS -> state invalid', apiNegative._pfCashLoad().state === 'invalid');

    const apiRw = factory(makeMockLocalStorage({}));
    const saveResult = apiRw._pfCashSave(17626, '2026-08-09');
    check('_pfCashSave writes a recorded value readable back',
      saveResult.ok === true && apiRw._pfCashLoad().state === 'recorded' && apiRw._pfCashLoad().amountILS === 17626);
    const clearResult = apiRw._pfCashClear();
    check('_pfCashClear returns to unset, not a written zero', clearResult.ok === true && apiRw._pfCashLoad().state === 'unset');
  })();

  // ── FX: three-state freshness (fresh / aged-but-valid / stale-invalid) ─────
  (function () {
    const apiMissing = factory(makeMockLocalStorage({}));
    check('no pt_fx key -> state missing', apiMissing._pfFxState(apiMissing._pfFxLoadCache()) === 'missing');

    const apiFresh = factory(makeMockLocalStorage({ pt_fx: JSON.stringify(fxRecord(1 * DAY)) }));
    check('age 1 day -> fresh', apiFresh._pfFxState(apiFresh._pfFxLoadCache()) === 'fresh');

    const apiAged = factory(makeMockLocalStorage({ pt_fx: JSON.stringify(fxRecord(4 * DAY)) }));
    check('age 4 days -> aged-but-valid', apiAged._pfFxState(apiAged._pfFxLoadCache()) === 'aged-but-valid');

    const apiStale = factory(makeMockLocalStorage({ pt_fx: JSON.stringify(fxRecord(10 * DAY)) }));
    check('age 10 days -> stale-invalid, treated like missing for totals', apiStale._pfFxState(apiStale._pfFxLoadCache()) === 'stale-invalid');

    const apiBadRate = factory(makeMockLocalStorage({ pt_fx: JSON.stringify(fxRecord({ rate: -1 })) }));
    check('non-positive rate -> state missing', apiBadRate._pfFxState(apiBadRate._pfFxLoadCache()) === 'missing');
  })();

  // ── FX backup-record strictness (all six fields, source === 'boi') ─────────
  (function () {
    const api = factory(makeMockLocalStorage({}));
    check('complete valid fx record accepted', api._pfFxBackupRecordValid(fxRecord()) === true);
    const missingOk = fxRecord(); delete missingOk.lastAttemptOk;
    check('missing lastAttemptOk rejected', api._pfFxBackupRecordValid(missingOk) === false);
    check('lastAttemptOk non-boolean rejected', api._pfFxBackupRecordValid(fxRecord({ lastAttemptOk: 'true' })) === false);
    const missingAt = fxRecord(); delete missingAt.lastAttemptAt;
    check('missing lastAttemptAt rejected', api._pfFxBackupRecordValid(missingAt) === false);
    check("source !== 'boi' rejected", api._pfFxBackupRecordValid(fxRecord({ source: 'other' })) === false);
    check('non-finite rate rejected', api._pfFxBackupRecordValid(fxRecord({ rate: NaN })) === false);
    check('unparseable effectiveAt rejected', api._pfFxBackupRecordValid(fxRecord({ effectiveAt: 'not-a-date' })) === false);
    check('unparseable fetchedAt rejected', api._pfFxBackupRecordValid(fxRecord({ fetchedAt: 'not-a-date' })) === false);
  })();

  // ── Portfolio Total formula (_pfComputePortfolioReporting) ─────────────────
  // Same production function _renderPortfolioPanel calls — pinned directly
  // rather than reimplemented, so QA and render can never disagree.
  (function () {
    const api = factory(makeMockLocalStorage({}));
    const recordedCash = { state: 'recorded', amountILS: 1000, asOf: '2026-08-09' };
    const unsetCash = { state: 'unset' };
    const freshFx = fxRecord(1 * DAY);

    (function () {
      const r = api._pfComputePortfolioReporting(0, 5000, 0, false, 0, recordedCash, {});
      check('ILS 5000 + cash 1000 -> Portfolio Total 6000, complete', r.completeness === true && r.total === 6000);
    })();
    (function () {
      const r = api._pfComputePortfolioReporting(1000, 0, 0, false, 0, recordedCash, freshFx);
      check('USD 1000 + FX 3.68 + cash 1000 -> Portfolio Total matches positionSize*rate + cash exactly',
        r.completeness === true && Math.abs(r.total - (1000 * freshFx.rate + 1000)) < 1e-9);
    })();
    (function () {
      const r = api._pfComputePortfolioReporting(1000, 5000, 0, false, 0, recordedCash, freshFx);
      check('mixed ILS 5000 + USD 1000@rate + cash 1000 -> Portfolio Total sums all three components',
        r.completeness === true && Math.abs(r.total - (5000 + 1000 * freshFx.rate + 1000)) < 1e-9);
    })();
    check('missing cash -> Portfolio Total NOT complete',
      api._pfComputePortfolioReporting(0, 5000, 0, false, 0, unsetCash, {}).completeness === false);
    check('USD present + missing FX -> Portfolio Total NOT complete',
      api._pfComputePortfolioReporting(1000, 0, 0, false, 0, recordedCash, {}).completeness === false);
    check('USD present + stale-invalid FX -> Portfolio Total NOT complete',
      api._pfComputePortfolioReporting(1000, 0, 0, false, 0, recordedCash, fxRecord(10 * DAY)).completeness === false);
    (function () {
      const rUnknown = api._pfComputePortfolioReporting(0, 5000, 1, false, 0, recordedCash, {});
      check('unknown-currency holding present -> NOT complete (Known Assets Total semantics)',
        rUnknown.completeness === false && rUnknown.knownHasComponent === true);
      const rCorrupt = api._pfComputePortfolioReporting(0, 5000, 0, true, 1, recordedCash, {});
      check('corrupt holding present -> NOT complete (Known Assets Total semantics)',
        rCorrupt.completeness === false && rCorrupt.knownHasComponent === true);
    })();
  })();

  // ── Allocation math (denominator always includes cash) ─────────────────────
  (function () {
    const api = factory(makeMockLocalStorage({}));
    const cash = { state: 'recorded', amountILS: 1300, asOf: '2026-08-09' };
    const fx = fxRecord({ rate: 3.70 });
    const r = api._pfComputePortfolioReporting(1000, 5000, 0, false, 0, cash, fx);
    check('mixed allocation: denominator = 10000 (5000 ILS + 1000*3.70 USD + 1300 cash)',
      r.completeness === true && Math.abs(r.allocationDenominatorValue - 10000) < 1e-9);

    const ilsIls = api._pfHoldingIlsValue({ positionSize: 5000, currency: 'ILS' }, fx);
    const usdIls = api._pfHoldingIlsValue({ positionSize: 1000, currency: 'USD' }, fx);
    const ilsPct = ilsIls / r.allocationDenominatorValue * 100;
    const usdPct = usdIls / r.allocationDenominatorValue * 100;
    const cashPct = r.cashIlsForTotal / r.allocationDenominatorValue * 100;
    check('ILS holding allocation = 50%', Math.abs(ilsPct - 50) < 1e-9);
    check('USD holding allocation = 37%', Math.abs(usdPct - 37) < 1e-9);
    check('cash allocation = 13%', Math.abs(cashPct - 13) < 1e-9);
    check('allocations sum to 100%', Math.abs(ilsPct + usdPct + cashPct - 100) < 1e-9);

    check('incomplete portfolio (cash unset) -> allocation denominator 0 (suppressed)',
      api._pfComputePortfolioReporting(1000, 5000, 0, false, 0, { state: 'unset' }, {}).allocationDenominatorValue === 0);
    check('missing FX with USD holdings -> allocation suppressed',
      api._pfComputePortfolioReporting(1000, 0, 0, false, 0, cash, {}).allocationDenominatorValue === 0);
    check('stale-invalid FX with USD holdings -> allocation suppressed',
      api._pfComputePortfolioReporting(1000, 0, 0, false, 0, cash, fxRecord(10 * DAY)).allocationDenominatorValue === 0);

    const zeroCash = { state: 'recorded', amountILS: 0, asOf: '2026-08-09' };
    const rZero = api._pfComputePortfolioReporting(0, 5000, 0, false, 0, zeroCash, {});
    check('explicit cash amountILS:0 -> still valid completeness input', rZero.completeness === true && rZero.total === 5000);
  })();

  // ── Portfolio-level day estimate ────────────────────────────────────────────
  (function () {
    function eodEntry(changePercent, opts) {
      opts = opts || {};
      const e = { price: 100, changePercent: changePercent, currency: opts.currency || 'USD', sessionEpoch: 1, fetchedAt: new Date().toISOString() };
      if (opts.stale) e.lastFailAt = new Date().toISOString();
      return e;
    }

    (function () {
      const api = factory(makeMockLocalStorage({ pt_eod_cache: JSON.stringify({ 'TEVA.TA': eodEntry(2, { currency: 'ILS' }) }) }));
      const est = api._pfPortfolioDayEstimate({ 'TEVA.TA': { symbol: 'TEVA.TA', positionSize: 10000, currency: 'ILS' } });
      check('TASE/ILS 10000 @ +2% -> +200 exact, positionSize never divided by 100', est !== null && Math.abs(est.totalIls - 200) < 1e-9);
      check('single fully-covered holding -> not partial', est !== null && est.partial === false);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({ pt_eod_cache: JSON.stringify({ AAA: eodEntry(0, { currency: 'ILS' }) }) }));
      const est = api._pfPortfolioDayEstimate({ AAA: { symbol: 'AAA', positionSize: 5000, currency: 'ILS' } });
      check('genuine 0.00% change -> real zero move, estimate still returned (not suppressed as missing)', est !== null && est.totalIls === 0);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({
        pt_eod_cache: JSON.stringify({ AAPL: eodEntry(1, { currency: 'USD' }) }),
        pt_fx: JSON.stringify(fxRecord(1 * DAY))
      }));
      const est = api._pfPortfolioDayEstimate({ AAPL: { symbol: 'AAPL', positionSize: 1000, currency: 'USD' } });
      check('USD 1000 @ +1% with fresh FX 3.68 -> +36.80 (positionSize * pct/100 * rate)', est !== null && Math.abs(est.totalIls - 36.8) < 1e-9);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({
        pt_eod_cache: JSON.stringify({ AAPL: eodEntry(1, { currency: 'USD' }) }),
        pt_fx: JSON.stringify(fxRecord(4 * DAY))
      }));
      const est = api._pfPortfolioDayEstimate({ AAPL: { symbol: 'AAPL', positionSize: 1000, currency: 'USD' } });
      check('USD holding with aged-but-valid FX (not fresh) -> estimate suppressed, stricter than the total\'s bar', est === null);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({ pt_eod_cache: JSON.stringify({ AAA: eodEntry(2, { currency: 'ILS', stale: true }) }) }));
      const est = api._pfPortfolioDayEstimate({ AAA: { symbol: 'AAA', positionSize: 5000, currency: 'ILS' } });
      check('stale EOD on the only covered holding -> suppressed', est === null);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({ pt_eod_cache: JSON.stringify({ AAA: eodEntry(2, { currency: 'ILS' }) }) }));
      const holdings = {
        AAA: { symbol: 'AAA', positionSize: 5000, currency: 'ILS' },
        BBB: { symbol: 'BBB', positionSize: 1000 }
      };
      const est = api._pfPortfolioDayEstimate(holdings);
      check('unknown-currency holding excluded from covered set does not block the estimate', est !== null);
      check('estimate marked partial when a holding was excluded', est !== null && est.partial === true);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({ pt_eod_cache: JSON.stringify({ AAA: eodEntry(2, { currency: 'ILS' }) }) }));
      const holdings = {
        AAA: { symbol: 'AAA', positionSize: 5000, currency: 'ILS' },
        CCC: { symbol: 'CCC', _corrupt: true }
      };
      const est = api._pfPortfolioDayEstimate(holdings);
      check('_corrupt holding excluded from covered set, does not block, marks partial', est !== null && est.partial === true);
    })();

    (function () {
      const api = factory(makeMockLocalStorage({}));
      const est = api._pfPortfolioDayEstimate({ ZZZ: { symbol: 'ZZZ', positionSize: 100 } });
      check('zero covered holdings -> suppressed (null)', est === null);
    })();
  })();

  // ── Backup v2: cash/fx null/object/malformed/absent envelope semantics ─────
  (function () {
    function baseDoc(schemaVersion, extra) {
      return Object.assign({
        schemaVersion: schemaVersion,
        exportedAt: new Date().toISOString(),
        sourceOrigin: 'http://localhost',
        appBaseline: 'test',
        holdings: {},
        tickers: []
      }, extra || {});
    }
    const api = factory(makeMockLocalStorage({}));

    (function () {
      const r = api._validatePortfolioBackup(baseDoc(2, { cash: null, fx: null }));
      check('v2 cash:null, fx:null -> accepted, both null (explicit clear)', r.error === null && r.cash === null && r.fx === null);
    })();
    (function () {
      const r = api._validatePortfolioBackup(baseDoc(2, { cash: { amountILS: 0, asOf: '2026-08-01' }, fx: null }));
      check('v2 cash amountILS:0 -> accepted and preserved as a real zero (not dropped/rejected)',
        r.error === null && r.cash && r.cash.amountILS === 0);
    })();
    (function () {
      const r = api._validatePortfolioBackup(baseDoc(2, { cash: null, fx: fxRecord() }));
      check('v2 valid complete fx object -> accepted and round-trips all six fields unchanged',
        r.error === null && r.fx && r.fx.rate === 3.68 && r.fx.source === 'boi' &&
        typeof r.fx.lastAttemptAt === 'string' && typeof r.fx.lastAttemptOk === 'boolean');
    })();
    check('v2 with cash key absent -> rejected, absence is not "leave untouched" for v2',
      api._validatePortfolioBackup(baseDoc(2, { fx: null })).error !== null);
    check('v2 with fx key absent -> rejected',
      api._validatePortfolioBackup(baseDoc(2, { cash: null })).error !== null);
    check('v2 malformed cash (negative amountILS) -> whole import rejected',
      api._validatePortfolioBackup(baseDoc(2, { cash: { amountILS: -5, asOf: '2026-08-01' }, fx: null })).error !== null);
    (function () {
      const badFx = fxRecord(); delete badFx.lastAttemptOk;
      check('v2 malformed fx (missing lastAttemptOk) -> whole import rejected',
        api._validatePortfolioBackup(baseDoc(2, { cash: null, fx: badFx })).error !== null);
    })();
    check("v2 fx.source !== 'boi' -> whole import rejected",
      api._validatePortfolioBackup(baseDoc(2, { cash: null, fx: fxRecord({ source: 'yahoo' }) })).error !== null);
    (function () {
      const r = api._validatePortfolioBackup(baseDoc(1));
      check('v1 payload -> cash/fx both undefined, signal to leave local state untouched',
        r.error === null && r.cash === undefined && r.fx === undefined);
    })();
    // P-3: schemaVersion 3 is now accepted and requires cash/fx exactly like
    // v2 (the `>= 2` gate) — this directly exercises the two-version-check
    // trap: widening only the envelope accept-list without also widening the
    // cash/fx requirement gate would let a v3 backup validate while silently
    // leaving cash/fx as `undefined` (untouched) instead of restored.
    (function () {
      const r = api._validatePortfolioBackup(baseDoc(3, { cash: null, fx: null }));
      check('schemaVersion 3 -> accepted, cash/fx null (explicit clear), not undefined',
        r.error === null && r.cash === null && r.fx === null);
    })();
    (function () {
      const r = api._validatePortfolioBackup(baseDoc(3, { cash: { amountILS: 500, asOf: '2026-08-09' }, fx: fxRecord() }));
      check('schemaVersion 3 -> cash/fx objects validated and restored, same as v2',
        r.error === null && r.cash && r.cash.amountILS === 500 && r.fx && r.fx.rate === 3.68);
    })();
    check('schemaVersion 3 with cash key absent -> rejected, same as v2',
      api._validatePortfolioBackup(baseDoc(3, { fx: null })).error !== null);
    check('unknown schemaVersion 4 -> rejected',
      api._validatePortfolioBackup(baseDoc(4, { cash: null, fx: null })).error !== null);
  })();

  // ── Backup restore application: _pfApplyCashFxRestore (shared with importPortfolioBackup) ──
  (function () {
    (function () {
      const ls = makeMockLocalStorage({ pt_cash: 'PRE_EXISTING_CASH', pt_fx: 'PRE_EXISTING_FX' });
      const api = factory(ls);
      const failed = api._pfApplyCashFxRestore(undefined, undefined);
      check('v1 restore (both undefined) -> no failures reported, no keys touched',
        failed.length === 0 && ls._store.pt_cash === 'PRE_EXISTING_CASH' && ls._store.pt_fx === 'PRE_EXISTING_FX');
    })();
    (function () {
      const ls = makeMockLocalStorage({ pt_cash: JSON.stringify({ amountILS: 500, asOf: '2026-08-01' }) });
      const api = factory(ls);
      const failed = api._pfApplyCashFxRestore(null, undefined);
      check('v2 cash:null -> pt_cash cleared', failed.length === 0 && api._pfCashLoad().state === 'unset');
    })();
    (function () {
      const ls = makeMockLocalStorage({ pt_fx: JSON.stringify(fxRecord()) });
      const api = factory(ls);
      const failed = api._pfApplyCashFxRestore(undefined, null);
      check('v2 fx:null -> pt_fx cleared', failed.length === 0 && ls._store.pt_fx === undefined);
    })();
    (function () {
      const ls = makeMockLocalStorage({});
      const api = factory(ls);
      const fx = fxRecord();
      const failed = api._pfApplyCashFxRestore({ amountILS: 17626, asOf: '2026-08-09' }, fx);
      const restoredCash = api._pfCashLoad();
      const restoredFx = JSON.parse(ls._store.pt_fx);
      check('v2 valid cash+fx -> both write with zero failures',
        failed.length === 0 && restoredCash.state === 'recorded' && restoredCash.amountILS === 17626);
      check('v2 fx restore round-trips all six fields unchanged (no re-normalization)',
        restoredFx.rate === fx.rate && restoredFx.effectiveAt === fx.effectiveAt && restoredFx.source === fx.source &&
        restoredFx.fetchedAt === fx.fetchedAt && restoredFx.lastAttemptAt === fx.lastAttemptAt && restoredFx.lastAttemptOk === fx.lastAttemptOk);
    })();
    (function () {
      const ls = makeMockLocalStorage({});
      ls.setItem = function () { throw new Error('QUOTA_EXCEEDED'); };
      const api = factory(ls);
      const failed = api._pfApplyCashFxRestore({ amountILS: 100, asOf: '2026-08-09' }, fxRecord());
      check('simulated storage failure on both writes -> both reported as failed, not silently successful',
        failed.indexOf('cash') !== -1 && failed.indexOf('FX rate') !== -1);
    })();
  })();

  // ── FX gate defense-in-depth: all three network entry points self-gate ─────
  // Regression-pins the correction that added a strict gate check inside
  // _pfFxFetchOnce/_pfFxAutoFetchIfDue/_pfFxManualRefresh themselves (not
  // just at their call sites), so no future direct call from anywhere can
  // reach the network while the gate is off.
  await (async function () {
    let fxGateFactory;
    try {
      const g = {
        isFiniteNumSrc:       extractFunctionSource(content, '_pfIsFiniteNum'),
        fxLoadCacheSrc:       extractFunctionSource(content, '_pfFxLoadCache'),
        fxSaveCacheSrc:       extractFunctionSource(content, '_pfFxSaveCache'),
        fxCacheSetSuccessSrc: extractFunctionSource(content, '_pfFxCacheSetSuccess'),
        fxCacheSetFailureSrc: extractFunctionSource(content, '_pfFxCacheSetFailure'),
        fxFetchOnceSrc:       extractFunctionSource(content, '_pfFxFetchOnce'),
        fxAutoFetchSrc:       extractFunctionSource(content, '_pfFxAutoFetchIfDue'),
        fxManualRefreshSrc:   extractFunctionSource(content, '_pfFxManualRefresh'),
        fxCacheKeySrc:        extractVarSource(content, 'PF_FX_CACHE_KEY'),
        fxAutoCooldownSrc:    extractVarSource(content, 'PF_FX_AUTO_COOLDOWN_MS'),
        fxFailCooldownSrc:    extractVarSource(content, 'PF_FX_FAIL_COOLDOWN_MS')
      };
      const missing = Object.keys(g).filter(function (k) { return !g[k]; });
      if (missing.length > 0) {
        fail('portfolio-reporting', 'FX gate: could not extract from index.html: ' + missing.join(', '));
        return;
      }
      // eslint-disable-next-line no-new-func
      fxGateFactory = new Function(
        'localStorage', 'window', 'fetch', '_pfIsPortfolioViewActive', '_renderPortfolioPanel',
        'var _pfFxFetching = false;\n' +
          g.fxCacheKeySrc + '\n' + g.fxAutoCooldownSrc + '\n' + g.fxFailCooldownSrc + '\n' +
          g.isFiniteNumSrc + '\n' + g.fxLoadCacheSrc + '\n' + g.fxSaveCacheSrc + '\n' +
          g.fxCacheSetSuccessSrc + '\n' + g.fxCacheSetFailureSrc + '\n' +
          g.fxFetchOnceSrc + '\n' + g.fxAutoFetchSrc + '\n' + g.fxManualRefreshSrc +
          '\nreturn { _pfFxFetchOnce: _pfFxFetchOnce, _pfFxAutoFetchIfDue: _pfFxAutoFetchIfDue, _pfFxManualRefresh: _pfFxManualRefresh };'
      );
    } catch (e) {
      fail('portfolio-reporting', 'FX gate: factory build error: ' + e.message);
      return;
    }

    function makeCountingFetch(shouldSucceed) {
      let calls = 0;
      const fn = function () {
        calls += 1;
        if (!shouldSucceed) return Promise.reject(new Error('fetch should not have been called with the gate off'));
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({ status: 'OK', rate: 3.68, effectiveAt: new Date().toISOString(), source: 'boi', fetchedAt: new Date().toISOString() });
          }
        });
      };
      fn.callCount = function () { return calls; };
      return fn;
    }
    const noopViewActive = function () { return false; };
    const noopRender = function () {};

    const gateOffEntryPoints = [
      ['_pfFxAutoFetchIfDue', function (api) { return api._pfFxAutoFetchIfDue(); }],
      ['_pfFxManualRefresh', function (api) { return api._pfFxManualRefresh(); }],
      ['_pfFxFetchOnce', function (api) { return api._pfFxFetchOnce(); }]
    ];
    for (const pair of gateOffEntryPoints) {
      const fetchMock = makeCountingFetch(false);
      const api = fxGateFactory(makeMockLocalStorage({}), { PT_ENABLE_PORTFOLIO_FX: false }, fetchMock, noopViewActive, noopRender);
      await pair[1](api);
      check('gate OFF: ' + pair[0] + '() -> zero fetches', fetchMock.callCount() === 0);
    }

    const fetchMockOn = makeCountingFetch(true);
    const apiOn = fxGateFactory(makeMockLocalStorage({}), { PT_ENABLE_PORTFOLIO_FX: true }, fetchMockOn, noopViewActive, noopRender);
    const okOn = await apiOn._pfFxFetchOnce();
    check('gate ON: _pfFxFetchOnce() reaches the fetch call', fetchMockOn.callCount() === 1);
    check('gate ON: successful fetch returns true', okOn === true);
  })();

  if (okCount === total) {
    pass(total + ' portfolio-reporting assertion(s) passed');
  }
}

function phaseMoneyMath() {
  header('Phase 9 - Money Math (P-3 cost-basis P/L)');

  const content = read('index.html');
  if (content === null) {
    fail('money-math', 'index.html is missing');
    return;
  }

  let factory;
  try {
    const pieces = {
      isFiniteNumSrc:       extractFunctionSource(content, '_pfIsFiniteNum'),
      fxRateValidSrc:       extractFunctionSource(content, '_pfFxRateValid'),
      fxStateSrc:           extractFunctionSource(content, '_pfFxState'),
      fxBackupValidSrc:     extractFunctionSource(content, '_pfFxBackupRecordValid'),
      normalizeSrc:         extractFunctionSource(content, '_pfNormalizeHoldingEntry'),
      normalizePositionSrc: extractFunctionSource(content, '_normalizePosition'),
      baselineAtSrc:        extractFunctionSource(content, '_pfComputeBaselineAt'),
      effectiveCostIlsSrc:  extractFunctionSource(content, '_pfEffectiveCostIls'),
      holdingPlSrc:         extractFunctionSource(content, '_pfHoldingPl'),
      portfolioPlSrc:       extractFunctionSource(content, '_pfComputePortfolioPl'),
      validateBackupSrc:    extractFunctionSource(content, '_validatePortfolioBackup'),
      knownFieldsSrc:       extractVarSource(content, 'PF_KNOWN_HOLDING_FIELDS'),
      wrapperMarkerSrc:     extractVarSource(content, 'PF_HOLDING_WRAPPER_MARKER'),
      reservedKeysSrc:      extractVarSource(content, 'PF_RESERVED_MARKER_KEYS'),
      fxFreshDaysSrc:       extractVarSource(content, 'PF_FX_FRESH_MAX_AGE_DAYS'),
      fxValidDaysSrc:       extractVarSource(content, 'PF_FX_VALID_MAX_AGE_DAYS')
    };
    const missing = Object.keys(pieces).filter(function (k) { return !pieces[k]; });
    if (missing.length > 0) {
      fail('money-math', 'could not extract from index.html: ' + missing.join(', '));
      return;
    }

    // eslint-disable-next-line no-new-func
    factory = new Function(
      pieces.knownFieldsSrc + '\n' + pieces.wrapperMarkerSrc + '\n' + pieces.reservedKeysSrc + '\n' +
        pieces.fxFreshDaysSrc + '\n' + pieces.fxValidDaysSrc + '\n' +
        pieces.isFiniteNumSrc + '\n' + pieces.fxRateValidSrc + '\n' + pieces.fxStateSrc + '\n' +
        pieces.fxBackupValidSrc + '\n' + pieces.normalizeSrc + '\n' + pieces.normalizePositionSrc + '\n' +
        pieces.baselineAtSrc + '\n' + pieces.effectiveCostIlsSrc + '\n' + pieces.holdingPlSrc + '\n' +
        pieces.portfolioPlSrc + '\n' + pieces.validateBackupSrc +
        '\nreturn { _pfIsFiniteNum: _pfIsFiniteNum, _pfFxState: _pfFxState,' +
        ' _pfNormalizeHoldingEntry: _pfNormalizeHoldingEntry, _pfComputeBaselineAt: _pfComputeBaselineAt,' +
        ' _pfEffectiveCostIls: _pfEffectiveCostIls, _pfHoldingPl: _pfHoldingPl,' +
        ' _pfComputePortfolioPl: _pfComputePortfolioPl, _validatePortfolioBackup: _validatePortfolioBackup };'
    );
  } catch (e) {
    fail('money-math', 'factory build error: ' + e.message);
    return;
  }

  const api = factory();

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('money-math', 'assertion failed: ' + name);
    }
  }
  function approx(a, b, eps) {
    return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < (eps || 0.01);
  }

  const DAY = 24 * 60 * 60 * 1000;
  function fxRecord(ageMsOrOverrides) {
    const base = {
      rate: 3.006, effectiveAt: new Date().toISOString(), source: 'boi',
      fetchedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastAttemptOk: true
    };
    if (typeof ageMsOrOverrides === 'number') {
      base.effectiveAt = new Date(Date.now() - ageMsOrOverrides).toISOString();
      return base;
    }
    return Object.assign(base, ageMsOrOverrides || {});
  }

  // ── Acceptance example A: Next Vision (TASE/ILS) ───────────────────────────
  // Also the TASE-no-/100 pin: costBasis/positionSize are shekel totals the
  // owner entered directly (never agorot) — a stray /100 regression would
  // fail every numeric check below.
  (function () {
    const nextVision = { symbol: 'NVSN', positionSize: 7376, costBasis: 9140.22, currency: 'ILS', manualPlPct: -19.3 };
    const pl = api._pfHoldingPl(nextVision, {});
    check('Next Vision: nativeAvailable', pl.nativeAvailable === true);
    check('Next Vision: plNative = -1764.22', approx(pl.plNative, -1764.22));
    check('Next Vision: plPctNativePct = -19.30 (percentage points, not a ratio)', approx(pl.plPctNativePct, -19.302, 0.01));
    check('Next Vision: driftPp ~= 0 vs recorded -19.3%', approx(pl.driftPp, 0, 0.05));
    check('Next Vision: driftFlag false', pl.driftFlag === false);
    check('Next Vision: ILS holding — ilsAvailable, plIls === plNative (no double-counting)', pl.ilsAvailable === true && approx(pl.plIls, pl.plNative, 0.001));
    check('Next Vision: eligibleForAggregation', pl.eligibleForAggregation === true);
  })();

  // ── Acceptance examples B/C/D: MRNA (USD) native + ILS + FX decomposition ──
  (function () {
    const mrna = { symbol: 'MRNA', positionSize: 2011.78, costBasis: 1974.72, costBasisILS: 6036.56, currency: 'USD', manualPlPct: 1.88 };
    const fxCache = fxRecord();
    const pl = api._pfHoldingPl(mrna, fxCache);
    check('MRNA native: plNative = 37.06', approx(pl.plNative, 37.06));
    check('MRNA native: plPctNativePct = 1.88', approx(pl.plPctNativePct, 1.877, 0.01));
    check('MRNA: driftPp ~= 0 vs recorded 1.88%', approx(pl.driftPp, 0, 0.05));
    check('MRNA: fxUsable (fresh)', pl.fxUsable === true);
    check('MRNA ILS: valueIls = 6047.41 (2011.78 * 3.006)', approx(pl.valueIls, 6047.41));
    check('MRNA ILS: plIls = 10.85', approx(pl.plIls, 10.85));
    check('MRNA ILS: plPctIlsPct = 0.18', approx(pl.plPctIlsPct, 0.18, 0.01));
    check('MRNA: ratio ~= 3.0569, within [2.0, 5.0] -> not flagged', approx(pl.ratio, 3.0569, 0.001) && pl.ratioFlag === false);
    check('MRNA decomposition: impliedPurchaseFx ~= 3.0569', approx(pl.impliedPurchaseFx, 3.0569, 0.001));
    check('MRNA decomposition: fxEffect ~= -100.55, reconciles plIls - plNative*fx', approx(pl.fxEffect, -100.55, 0.05) && approx(pl.plIls, pl.plNative * fxCache.rate + pl.fxEffect, 0.01));
    check('MRNA: eligibleForAggregation', pl.eligibleForAggregation === true);
  })();

  // ── Drift unit-conversion pin — the exact bug Codex flagged ────────────────
  // plPctNativePct must be on the same 0-100 scale as manualPlPct. A ratio-
  // vs-percentage regression (comparing a 0-1 ratio to a 0-100 manualPlPct)
  // would make this holding's driftPp ~= 19.8 and wrongly flag it, even
  // though the recorded and computed returns agree exactly.
  (function () {
    const h = { symbol: 'DRIFT', positionSize: 8000, costBasis: 10000, currency: 'ILS', manualPlPct: -20 };
    const pl = api._pfHoldingPl(h, {});
    check('drift unit pin: plPctNativePct = -20 (percentage points)', approx(pl.plPctNativePct, -20));
    check('drift unit pin: exact match -> driftPp = 0, not ~19.8', approx(pl.driftPp, 0, 0.001));
    check('drift unit pin: driftFlag false on exact match', pl.driftFlag === false);

    const hFlagged = { symbol: 'DRIFT2', positionSize: 8000, costBasis: 10000, currency: 'ILS', manualPlPct: 0 };
    const plFlagged = api._pfHoldingPl(hFlagged, {});
    check('drift unit pin: real 20pp mismatch -> driftFlag true', plFlagged.driftFlag === true && approx(plFlagged.driftPp, 20, 0.01));
  })();

  // ── FX states: stale-invalid and missing both suppress ILS-side metrics ────
  (function () {
    const h = { symbol: 'STALE', positionSize: 2000, costBasis: 1900, costBasisILS: 6000, currency: 'USD', manualPlPct: 5 };
    const plStale = api._pfHoldingPl(h, fxRecord(10 * DAY));
    check('stale-invalid FX: native still available', plStale.nativeAvailable === true);
    check('stale-invalid FX: fxUsable false', plStale.fxUsable === false);
    check('stale-invalid FX: ilsAvailable false, plIls unset', plStale.ilsAvailable === false && plStale.plIls === undefined);
    check('stale-invalid FX: excluded from aggregation', plStale.eligibleForAggregation === false);

    const plMissing = api._pfHoldingPl(h, {});
    check('missing FX: ilsAvailable false, native unaffected', plMissing.ilsAvailable === false && plMissing.nativeAvailable === true);

    const plAged = api._pfHoldingPl(h, fxRecord(4 * DAY));
    check('aged-but-valid FX: usable (converts, amber in render layer)', plAged.fxUsable === true && plAged.ilsAvailable === true);
  })();

  // ── Unknown currency: ALL derived metrics suppressed, no exception ─────────
  (function () {
    const h = { symbol: 'UNK', positionSize: 5000, costBasis: 4000, manualPlPct: 10 };
    const pl = api._pfHoldingPl(h, {});
    check('unknown currency: currencyKnown false', pl.currencyKnown === false);
    check('unknown currency: nativeAvailable false, plPctNativePct unset', pl.nativeAvailable === false && pl.plPctNativePct === undefined);
    check('unknown currency: ilsAvailable false', pl.ilsAvailable === false);
    check('unknown currency: excluded from aggregation', pl.eligibleForAggregation === false);
    check('unknown currency: manualPlPct itself untouched (render layer still shows it)', h.manualPlPct === 10);
  })();

  // ── Invalid cost basis: suppress only, never corrupt ────────────────────────
  (function () {
    [
      { symbol: 'ZERO', positionSize: 1000, costBasis: 0, currency: 'ILS' },
      { symbol: 'NEG',  positionSize: 1000, costBasis: -100, currency: 'USD', costBasisILS: 300 },
      { symbol: 'NAN',  positionSize: 1000, costBasis: NaN, currency: 'ILS' }
    ].forEach(function (h) {
      const pl = api._pfHoldingPl(h, {});
      check('invalid costBasis (' + h.symbol + '): costBasisValid false', pl.costBasisValid === false);
      check('invalid costBasis (' + h.symbol + '): nativeAvailable false', pl.nativeAvailable === false);
    });
    // Normalizer-level confirmation: a negative-but-finite costBasis is NOT
    // an _issues entry and does NOT route the holding to _corrupt — P-3
    // suppression is owned entirely by _pfHoldingPl, not the normalizer.
    const normalized = api._pfNormalizeHoldingEntry('ZZZ', { positionSize: 1000, currency: 'ILS', costBasis: -100 });
    check('normalizer: negative costBasis passes through unmodified', normalized.costBasis === -100);
    check('normalizer: negative costBasis does not mark the entry corrupt', normalized._corrupt !== true);
    check('normalizer: negative costBasis is not an _issues entry', !normalized._issues || normalized._issues.length === 0);
  })();

  // ── Ratio plausibility guard: [2.0, 5.0] inclusive, display-only ───────────
  (function () {
    const fxCache = fxRecord();
    const outOfRange = api._pfHoldingPl({ symbol: 'RATIO', positionSize: 2000, costBasis: 1900, costBasisILS: 1900, currency: 'USD' }, fxCache);
    check('ratio 1.0 (out of range): ratioFlag true', outOfRange.ratioFlag === true);
    check('ratio 1.0: still not corrupt-equivalent — ilsAvailable true, just excluded from aggregation', outOfRange.ilsAvailable === true && outOfRange.eligibleForAggregation === false);

    const lowBound = api._pfHoldingPl({ symbol: 'R2', positionSize: 2000, costBasis: 1000, costBasisILS: 2000, currency: 'USD' }, fxCache);
    check('ratio exactly 2.0: inclusive, not flagged', lowBound.ratioFlag === false);
    const highBound = api._pfHoldingPl({ symbol: 'R5', positionSize: 2000, costBasis: 1000, costBasisILS: 5000, currency: 'USD' }, fxCache);
    check('ratio exactly 5.0: inclusive, not flagged', highBound.ratioFlag === false);
  })();

  // ── Portfolio aggregation: eligible-only, coverage + exclusion reasons ─────
  // Same holdings as acceptance example E (Next Vision + MRNA), plus two
  // excluded holdings to pin coverage disclosure and per-reason attribution.
  (function () {
    const holdings = {
      NVSN:    { symbol: 'NVSN', positionSize: 7376, costBasis: 9140.22, currency: 'ILS', manualPlPct: -19.3 },
      MRNA:    { symbol: 'MRNA', positionSize: 2011.78, costBasis: 1974.72, costBasisILS: 6036.56, currency: 'USD', manualPlPct: 1.88 },
      BADCUR:  { symbol: 'BADCUR', positionSize: 1000, costBasis: 900 },
      NOCOST:  { symbol: 'NOCOST', positionSize: 1000, currency: 'ILS' }
    };
    const result = api._pfComputePortfolioPl(holdings, fxRecord());
    check('portfolio: coveredCount = 2', result.coveredCount === 2);
    check('portfolio: totalCount = 4', result.totalCount === 4);
    check('portfolio: incomplete -> complete false', result.complete === false);
    check('portfolio: totalValueIls ~= 13423.41 (example E)', approx(result.totalValueIls, 13423.41, 0.1));
    check('portfolio: totalCostIls ~= 15176.78 (example E)', approx(result.totalCostIls, 15176.78, 0.1));
    check('portfolio: totalPlIls ~= -1753.37 (example E)', approx(result.totalPlIls, -1753.37, 0.1));
    check('portfolio: returnPctIls ~= -11.55 (example E)', approx(result.returnPctIls, -11.55, 0.05));
    check('portfolio: unknownCurrency exclusion attributed', result.exclusionReasons.unknownCurrency === 1);
    check('portfolio: invalidCostBasis exclusion attributed', result.exclusionReasons.invalidCostBasis === 1);
  })();

  // ── _pfComputeBaselineAt: extended to costBasis/costBasisILS ────────────────
  (function () {
    const prev = { positionSize: 100, manualPlPct: 5, costBasis: 90, costBasisILS: undefined, baselineAt: 'OLD' };
    check('baselineAt: no field changed -> unchanged', api._pfComputeBaselineAt(prev, 100, 5, 90, undefined, 'NEW') === 'OLD');
    check('baselineAt: costBasis changed -> advances', api._pfComputeBaselineAt(prev, 100, 5, 95, undefined, 'NEW') === 'NEW');
    check('baselineAt: costBasisILS added -> advances', api._pfComputeBaselineAt(prev, 100, 5, 90, 300, 'NEW') === 'NEW');
    check('baselineAt: no prevEntry -> nowIso', api._pfComputeBaselineAt(null, 100, 5, 90, undefined, 'NEW') === 'NEW');
  })();

  // ── Backup v3: envelope accepted, cash/fx required + restored, costBasis round-trips ──
  (function () {
    function baseDoc(schemaVersion, extra) {
      return Object.assign({
        schemaVersion: schemaVersion, exportedAt: new Date().toISOString(),
        sourceOrigin: 'http://localhost', appBaseline: 'test', holdings: {}, tickers: []
      }, extra || {});
    }
    const doc = baseDoc(3, {
      holdings: { AAPL: { positionSize: 5000, currency: 'USD', costBasis: 4500, costBasisILS: 15000, source: 'manual', updatedAt: new Date().toISOString() } },
      cash: { amountILS: 500, asOf: '2026-08-09' },
      fx: fxRecord()
    });
    const r = api._validatePortfolioBackup(doc);
    check('v3 backup: accepted', r.error === null);
    check('v3 backup: costBasis round-trips', r.holdings.AAPL.costBasis === 4500);
    check('v3 backup: costBasisILS round-trips', r.holdings.AAPL.costBasisILS === 15000);
    check('v3 backup: cash restored (same requirement as v2)', r.cash && r.cash.amountILS === 500);
    check('v3 backup: fx restored (same requirement as v2)', r.fx && r.fx.rate === fxRecord().rate);
  })();

  if (okCount === total) {
    pass(total + ' money-math assertion(s) passed');
  }
}

function phaseReconciliation() {
  header('Phase 10 - Broker Reconciliation (P-4A-1)');

  const content = read('index.html');
  if (content === null) {
    fail('reconciliation', 'index.html is missing');
    return;
  }

  let factory;
  try {
    const pieces = {
      isFiniteNumSrc:        extractFunctionSource(content, '_pfIsFiniteNum'),
      cashLoadSrc:           extractFunctionSource(content, '_pfCashLoad'),
      cashSaveSrc:           extractFunctionSource(content, '_pfCashSave'),
      cashClearSrc:          extractFunctionSource(content, '_pfCashClear'),
      fxRateValidSrc:        extractFunctionSource(content, '_pfFxRateValid'),
      fxBackupValidSrc:      extractFunctionSource(content, '_pfFxBackupRecordValid'),
      normalizeSrc:          extractFunctionSource(content, '_pfNormalizeHoldingEntry'),
      normalizePositionSrc:  extractFunctionSource(content, '_normalizePosition'),
      validateBackupSrc:     extractFunctionSource(content, '_validatePortfolioBackup'),
      applyCashFxRestoreSrc: extractFunctionSource(content, '_pfApplyCashFxRestore'),
      reconLoadSrc:          extractFunctionSource(content, '_pfReconLoad'),
      reconSaveSrc:          extractFunctionSource(content, '_pfReconSave'),
      reconClearSrc:         extractFunctionSource(content, '_pfReconClear'),
      reconOldestBaselineSrc: extractFunctionSource(content, '_pfReconOldestBaselineAt'),
      computeReconSrc:       extractFunctionSource(content, '_pfComputeReconciliation'),
      applyReconRestoreSrc:  extractFunctionSource(content, '_pfApplyReconRestore'),
      cashKeySrc:            extractVarSource(content, 'PF_CASH_KEY'),
      reconKeySrc:           extractVarSource(content, 'PF_RECON_KEY'),
      reconStaleDaysSrc:     extractVarSource(content, 'PF_RECON_STALE_MAX_DAYS'),
      fxCacheKeySrc:         extractVarSource(content, 'PF_FX_CACHE_KEY'),
      knownFieldsSrc:        extractVarSource(content, 'PF_KNOWN_HOLDING_FIELDS'),
      wrapperMarkerSrc:      extractVarSource(content, 'PF_HOLDING_WRAPPER_MARKER'),
      reservedKeysSrc:       extractVarSource(content, 'PF_RESERVED_MARKER_KEYS')
    };
    const missing = Object.keys(pieces).filter(function (k) { return !pieces[k]; });
    if (missing.length > 0) {
      fail('reconciliation', 'could not extract from index.html: ' + missing.join(', '));
      return;
    }

    // eslint-disable-next-line no-new-func
    factory = new Function(
      'localStorage',
      pieces.cashKeySrc + '\n' + pieces.reconKeySrc + '\n' + pieces.reconStaleDaysSrc + '\n' +
        pieces.fxCacheKeySrc + '\n' + pieces.knownFieldsSrc + '\n' + pieces.wrapperMarkerSrc + '\n' +
        pieces.reservedKeysSrc + '\n' +
        pieces.isFiniteNumSrc + '\n' + pieces.cashLoadSrc + '\n' + pieces.cashSaveSrc + '\n' + pieces.cashClearSrc + '\n' +
        pieces.fxRateValidSrc + '\n' + pieces.fxBackupValidSrc + '\n' +
        pieces.normalizeSrc + '\n' + pieces.normalizePositionSrc + '\n' + pieces.validateBackupSrc + '\n' +
        pieces.applyCashFxRestoreSrc + '\n' +
        pieces.reconLoadSrc + '\n' + pieces.reconSaveSrc + '\n' + pieces.reconClearSrc + '\n' +
        pieces.reconOldestBaselineSrc + '\n' + pieces.computeReconSrc + '\n' + pieces.applyReconRestoreSrc +
        '\nreturn { _pfCashLoad: _pfCashLoad, _pfCashSave: _pfCashSave, _pfCashClear: _pfCashClear,' +
        ' _validatePortfolioBackup: _validatePortfolioBackup, _pfApplyCashFxRestore: _pfApplyCashFxRestore,' +
        ' _pfReconLoad: _pfReconLoad, _pfReconSave: _pfReconSave, _pfReconClear: _pfReconClear,' +
        ' _pfReconOldestBaselineAt: _pfReconOldestBaselineAt, _pfComputeReconciliation: _pfComputeReconciliation,' +
        ' _pfApplyReconRestore: _pfApplyReconRestore };'
    );
  } catch (e) {
    fail('reconciliation', 'factory build error: ' + e.message);
    return;
  }

  function makeMockLocalStorage(seed) {
    const store = Object.assign({}, seed || {});
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = v; },
      removeItem: function (k) { delete store[k]; },
      _store: store
    };
  }

  let total = 0;
  let okCount = 0;
  function check(name, cond) {
    total += 1;
    if (cond) {
      okCount += 1;
    } else {
      fail('reconciliation', 'assertion failed: ' + name);
    }
  }
  function approx(a, b, eps) {
    return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < (eps || 0.01);
  }

  const api = factory(makeMockLocalStorage({}));

  // ── pt_recon: three states, mirrors pt_cash exactly ─────────────────────────
  (function () {
    const apiUnset = factory(makeMockLocalStorage({}));
    check('recon unset -> state unset (no key)', apiUnset._pfReconLoad().state === 'unset');

    const apiRecorded = factory(makeMockLocalStorage({
      pt_recon: JSON.stringify({ brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: 'fund note' })
    }));
    const recordedState = apiRecorded._pfReconLoad();
    check('recon recorded -> all four fields readable',
      recordedState.state === 'recorded' && recordedState.brokerTotalILS === 78567.62 &&
      recordedState.declaredExclusionsILS === 2400.22 && recordedState.exclusionsNote === 'fund note');

    const apiUnparseable = factory(makeMockLocalStorage({ pt_recon: 'not json{{{' }));
    check('unparseable pt_recon -> state invalid', apiUnparseable._pfReconLoad().state === 'invalid');

    const apiMissingField = factory(makeMockLocalStorage({ pt_recon: JSON.stringify({ brokerTotalILS: 100, asOf: '2026-08-09' }) }));
    check('recon missing required field (declaredExclusionsILS/exclusionsNote) -> state invalid', apiMissingField._pfReconLoad().state === 'invalid');

    const apiRw = factory(makeMockLocalStorage({}));
    const saveResult = apiRw._pfReconSave(78567.62, '2026-08-09', 2400.22, 'note');
    check('_pfReconSave writes a recorded value readable back',
      saveResult.ok === true && apiRw._pfReconLoad().state === 'recorded' && apiRw._pfReconLoad().brokerTotalILS === 78567.62);
    const clearResult = apiRw._pfReconClear();
    check('_pfReconClear returns to unset, never a written zero', clearResult.ok === true && apiRw._pfReconLoad().state === 'unset');

    check('_pfReconSave rejects negative brokerTotalILS', apiRw._pfReconSave(-1, '2026-08-09', 0, '').ok === false);
    check('_pfReconSave rejects invalid asOf date', apiRw._pfReconSave(100, 'not-a-date', 0, '').ok === false);
  })();

  // ── _pfReconOldestBaselineAt: pessimistic-bound conservative heuristic ──────
  (function () {
    const holdings = {
      AAA: { baselineAt: '2026-08-01T00:00:00.000Z' },
      BBB: { baselineAt: '2026-07-15T00:00:00.000Z' },
      CCC: { _corrupt: true, baselineAt: '2026-01-01T00:00:00.000Z' },
      DDD: {}
    };
    check('oldest baselineAt: picks earliest among non-corrupt, valid entries (excludes corrupt/missing)',
      api._pfReconOldestBaselineAt(holdings) === '2026-07-15T00:00:00.000Z');
    check('oldest baselineAt: no relevant holdings -> null (guard has nothing to compare)', api._pfReconOldestBaselineAt({}) === null);
  })();

  // ── Real fixture (2026-08-09 verified Meitav reconciliation) ────────────────
  (function () {
    const fixtureRecon = { state: 'recorded', brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: 'fund 5139233 ...' };
    const r1 = api._pfComputeReconciliation(fixtureRecon, 76167.39, true, '2026-08-09');
    check('fixture: unexplained = 0.01', approx(r1.unexplained, 0.01, 0.001));
    check('fixture: inside tolerance -> reconciled-with-exclusions', r1.status === 'reconciled-with-exclusions');

    const fixtureNoExclusions = Object.assign({}, fixtureRecon, { declaredExclusionsILS: 0 });
    const r2 = api._pfComputeReconciliation(fixtureNoExclusions, 76167.39, true, '2026-08-09');
    check('fixture, exclusions cleared: unexplained = 2400.23', approx(r2.unexplained, 2400.23, 0.001));
    check('fixture, exclusions cleared: unexplained-gap', r2.status === 'unexplained-gap');

    const staleFixture = Object.assign({}, fixtureRecon, { asOf: '2026-07-01' });
    const r3 = api._pfComputeReconciliation(staleFixture, 76167.39, true, '2026-08-09');
    check('fixture, stale asOf 2026-07-01: status stale (neither alarm nor reconciled)', r3.status === 'stale');
    const staleFixtureNoExclusions = Object.assign({}, staleFixture, { declaredExclusionsILS: 0 });
    const r4 = api._pfComputeReconciliation(staleFixtureNoExclusions, 76167.39, true, '2026-08-09');
    check('fixture, stale AND would-be-gap: still stale, alarm suppressed', r4.status === 'stale');
  })();

  // ── Tolerance boundary: max(₪1.00, 0.05% of broker total), inclusive ────────
  (function () {
    const boundaryRecon = { state: 'recorded', brokerTotalILS: 10000, asOf: '2026-08-09', declaredExclusionsILS: 0, exclusionsNote: '' };
    const atBoundary = api._pfComputeReconciliation(boundaryRecon, 9995, true, '2026-08-09'); // unexplained = 5, tolerance = 5
    check('tolerance boundary: exactly at tolerance -> within (inclusive) -> fully-reconciled', atBoundary.status === 'fully-reconciled');
    const justOutside = api._pfComputeReconciliation(boundaryRecon, 9994.98, true, '2026-08-09'); // unexplained = 5.02
    check('tolerance boundary: just past tolerance -> unexplained-gap', justOutside.status === 'unexplained-gap');

    const smallBrokerRecon = { state: 'recorded', brokerTotalILS: 500, asOf: '2026-08-09', declaredExclusionsILS: 0, exclusionsNote: '' };
    // 0.05% of 500 = 0.25, so the ₪1.00 floor governs -> tolerance = 1.00
    const floorCase = api._pfComputeReconciliation(smallBrokerRecon, 499.2, true, '2026-08-09'); // unexplained = 0.8, within ₪1 floor
    check('tolerance floor: ₪1.00 minimum governs for small broker totals', floorCase.status === 'fully-reconciled');
  })();

  // ── unset/invalid pass-through, total-incomplete dependency on P-2B ─────────
  (function () {
    check('unset recon -> status unset', api._pfComputeReconciliation({ state: 'unset' }, 76167.39, true, '2026-08-09').status === 'unset');
    check('invalid recon -> status invalid', api._pfComputeReconciliation({ state: 'invalid' }, 76167.39, true, '2026-08-09').status === 'invalid');
    const incompleteResult = api._pfComputeReconciliation(
      { state: 'recorded', brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: '' },
      76167.39, false, '2026-08-09'
    );
    check('P-2B Portfolio Total incomplete -> reconciliation unavailable (no false gap/reconciled claim)', incompleteResult.status === 'total-incomplete');
  })();

  // ── _pfApplyReconRestore: undefined/null/object three-way, mirrors cash/fx ──
  (function () {
    const ls = makeMockLocalStorage({});
    const apiLocal = factory(ls);
    const failedWrite = apiLocal._pfApplyReconRestore({ brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: 'note' });
    check('_pfApplyReconRestore: writes a valid record, no failures', failedWrite.length === 0);
    const readBack = apiLocal._pfReconLoad();
    check('_pfApplyReconRestore: written record reads back exactly', readBack.state === 'recorded' && readBack.brokerTotalILS === 78567.62 && readBack.exclusionsNote === 'note');
    const failedClear = apiLocal._pfApplyReconRestore(null);
    check('_pfApplyReconRestore(null): explicit clear -> unset', failedClear.length === 0 && apiLocal._pfReconLoad().state === 'unset');
    const failedNoop = apiLocal._pfApplyReconRestore(undefined);
    check('_pfApplyReconRestore(undefined): no-op, returns empty failedParts', failedNoop.length === 0);
  })();

  // ── pt_holdings/pt_cash byte-identical through a recon-only restore-apply ───
  (function () {
    const seedHoldings = JSON.stringify({ AAPL: { symbol: 'AAPL', positionSize: 5000, currency: 'USD', source: 'manual' } });
    const seedCash = JSON.stringify({ amountILS: 17445.24, asOf: '2026-08-09' });
    const ls = makeMockLocalStorage({ pt_holdings: seedHoldings, pt_cash: seedCash });
    const apiLocal = factory(ls);
    apiLocal._pfApplyReconRestore({ brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: 'note' });
    apiLocal._pfApplyReconRestore(null);
    check('_pfApplyReconRestore never touches pt_holdings', ls._store.pt_holdings === seedHoldings);
    check('_pfApplyReconRestore never touches pt_cash', ls._store.pt_cash === seedCash);
  })();

  // ── Backup v4: envelope accepted, recon required + restored ─────────────────
  (function () {
    function baseDoc(schemaVersion, extra) {
      return Object.assign({
        schemaVersion: schemaVersion, exportedAt: new Date().toISOString(),
        sourceOrigin: 'http://localhost', appBaseline: 'test', holdings: {}, tickers: []
      }, extra || {});
    }

    const v4Doc = baseDoc(4, {
      cash: null, fx: null,
      recon: { brokerTotalILS: 78567.62, asOf: '2026-08-09', declaredExclusionsILS: 2400.22, exclusionsNote: 'fund note' }
    });
    const v4Result = api._validatePortfolioBackup(v4Doc);
    check('v4 backup: accepted', v4Result.error === null);
    check('v4 backup: recon round-trips all four fields exactly',
      v4Result.recon && v4Result.recon.brokerTotalILS === 78567.62 && v4Result.recon.asOf === '2026-08-09' &&
      v4Result.recon.declaredExclusionsILS === 2400.22 && v4Result.recon.exclusionsNote === 'fund note');

    const v4NullResult = api._validatePortfolioBackup(baseDoc(4, { cash: null, fx: null, recon: null }));
    check('v4 recon:null -> accepted, explicit clear (not undefined)', v4NullResult.error === null && v4NullResult.recon === null);

    check('v4 missing recon key -> whole import rejected',
      api._validatePortfolioBackup(baseDoc(4, { cash: null, fx: null })).error !== null);

    check('v4 malformed recon (negative brokerTotalILS) -> whole import rejected',
      api._validatePortfolioBackup(baseDoc(4, { cash: null, fx: null, recon: { brokerTotalILS: -5, asOf: '2026-08-09', declaredExclusionsILS: 0, exclusionsNote: '' } })).error !== null);
    check('v4 malformed recon (bad asOf) -> whole import rejected',
      api._validatePortfolioBackup(baseDoc(4, { cash: null, fx: null, recon: { brokerTotalILS: 100, asOf: 'not-a-date', declaredExclusionsILS: 0, exclusionsNote: '' } })).error !== null);

    const v1Result = api._validatePortfolioBackup(baseDoc(1));
    check('v1 payload -> recon undefined (predates the feature)', v1Result.error === null && v1Result.recon === undefined);
    const v2Result = api._validatePortfolioBackup(baseDoc(2, { cash: null, fx: null }));
    check('v2 payload -> recon undefined, signal to leave local pt_recon untouched', v2Result.error === null && v2Result.recon === undefined);
    const v3Result = api._validatePortfolioBackup(baseDoc(3, { cash: null, fx: null }));
    check('v3 payload -> recon undefined, signal to leave local pt_recon untouched', v3Result.error === null && v3Result.recon === undefined);

    check('unknown schemaVersion 5 -> rejected',
      api._validatePortfolioBackup(baseDoc(5, { cash: null, fx: null, recon: null })).error !== null);
  })();

  // ── FX-chip precision rider — structural check on the actual rendered source ──
  check('FX chip: displays 4dp precision (not the old 2dp)', /fxCache\.rate\.toFixed\(4\)/.test(content));
  check('FX chip: full-rate tooltip exposes the exact calculation rate', /fxChipVal\.title = 'Exact rate used in calculations: ' \+ fxCache\.rate;/.test(content));

  if (okCount === total) {
    pass(total + ' reconciliation assertion(s) passed');
  }
}

async function main() {
  console.log('OFFLINE VALIDATION - portfolio-tracker');
  console.log('read-only, no network, no browser, no live services');

  phaseSyntax();
  phaseOfflineTests();
  phaseForbiddenSurface();
  phaseResolverTests();
  phaseResearchViewTests();
  phaseTerminalChainIntegrity();
  phaseBackupFidelity();
  await phasePortfolioReporting();
  phaseMoneyMath();
  phaseReconciliation();

  console.log('\n=== Summary ===');

  if (advisories.length > 0) {
    console.log('  advisory warning(s): ' + advisories.length);
  }

  if (hardFailures.length > 0) {
    console.log('OFFLINE VALIDATION: FAIL (' + hardFailures.length + ' hard failure(s))');

    for (const item of hardFailures) {
      console.log('  - ' + item);
    }

    process.exit(1);
  }

  console.log('OFFLINE VALIDATION: PASS');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
