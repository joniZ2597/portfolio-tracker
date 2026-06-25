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

const OFFLINE_TESTS = [
  'qa/research_evidence_contract_test.js',
  'qa/research_evidence_mock_provider_test.js',
  'qa/research_evidence_cache_test.js',
  'qa/research_evidence_source_renderer_test.js',
  'qa/research_evidence_client_adapter_test.js',
  'qa/research_evidence_sec10q_fixture_provider_test.js',
  'qa/research_evidence_sec10q_live_provider_test.js'
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

function main() {
  console.log('OFFLINE VALIDATION - portfolio-tracker');
  console.log('read-only, no network, no browser, no live services');

  phaseSyntax();
  phaseOfflineTests();
  phaseForbiddenSurface();

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
