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
 *   5. Client gate strict-boolean checks for all 8 known client gates
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
        return content.slice(start, i + 1);
      }
    }
  }
  return null;
}

const OFFLINE_TESTS = [
  'qa/research_evidence_contract_test.js',
  'qa/research_evidence_mock_provider_test.js',
  'qa/research_evidence_cache_test.js',
  'qa/research_evidence_source_renderer_test.js',
  'qa/research_evidence_client_adapter_test.js',
  'qa/research_evidence_sec10q_fixture_provider_test.js',
  'qa/research_evidence_sec10q_live_provider_test.js',
  'qa/sec_evidence_store_test.js'
];

const CLIENT_GATES = [
  'PT_ENABLE_CAPITAL_RETURNS_CLIENT',
  'PT_ENABLE_RESEARCH_EVIDENCE_CLIENT',
  'PT_ENABLE_PORTFOLIO_SYNC_CLIENT',
  'PT_ENABLE_FINANCE_SEARCH_CLIENT',
  'PT_ENABLE_EDGAR_FORM4',
  'PT_ENABLE_PORTFOLIO_RESEARCH',
  'PT_ENABLE_PORTFOLIO_LIVE_PRICES',
  'PT_ENABLE_QUERY_SPLIT_DEEPDIVE'
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

function main() {
  console.log('OFFLINE VALIDATION - portfolio-tracker');
  console.log('read-only, no network, no browser, no live services');

  phaseSyntax();
  phaseOfflineTests();
  phaseForbiddenSurface();
  phaseResolverTests();

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

main();
