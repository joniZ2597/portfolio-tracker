'use strict';

/*
 * qa/ath_isolation_offline.js
 *
 * R-1 Slice B (B1+B3) — static isolation (AR-7).
 *
 * The ATH store and its operator tool must not touch the browser, storage, scoring, the 1Y High
 * or any existing server function, and must read only their own environment keys. This suite
 * proves that structurally, over the real files, with a scanner that is itself attacked by
 * planted negatives (a forbidden token appended to the real source must be flagged).
 *
 * Brief section 6 / AR-7 also asks for "byte-equal to baseline (sha256 pins captured at Step 0)":
 * AR-7i pins the LF-normalised sha256 of index.html (client, scoring engines, storage keys) and of
 * the existing server modules this task must not touch. MAINTENANCE: any later task that
 * legitimately edits one of these files must re-pin it here in the same change (B4 will edit
 * index.html and re-pin it in its own brief).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');
const LIB = path.join(FN, 'lib');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    process.stdout.write('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e) + '\n');
  }
}

function ok(cond, msg) {
  if (!cond) { throw new Error(msg || 'assertion failed'); }
}

const SERVER_FILES = {
  'netlify/functions/lib/ath-record.js': { requires: [], imports: [] },
  'netlify/functions/lib/ath-preflight.js': { requires: ['./ath-record'], imports: [] },
  'netlify/functions/lib/ath-yahoo.js': { requires: ['./ath-record'], imports: [] },
  'netlify/functions/lib/ath-ensure-core.js': { requires: ['./ath-preflight', './ath-record', './ath-yahoo', '@netlify/blobs'], imports: [] },
  'netlify/functions/ath-ensure.mjs': { requires: [], imports: ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/ath-ensure-core.js'] },
  'netlify/functions/lib/ath-read-core.js': { requires: ['./ath-preflight', './ath-record', '@netlify/blobs'], imports: [] },
  'netlify/functions/lib/ath-write-core.js': { requires: ['./ath-preflight', './ath-record', '@netlify/blobs'], imports: [] },
  'netlify/functions/ath-read.mjs': { requires: [], imports: ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/ath-read-core.js'] },
  'netlify/functions/ath-write.mjs': { requires: [], imports: ['@netlify/blobs', '@netlify/aws-lambda-compat', './lib/ath-write-core.js'] }
};
const TOOL_FILE = 'tools/ath-verify-owner.js';

const ALLOWED_ENV_KEYS = [
  'PT_ENABLE_ATH_READ_SERVER', 'PT_ENABLE_ATH_WRITE_SERVER', 'PT_ENABLE_ATH_ENSURE_SERVER', 'PT_ATH_READ_TOKEN', 'PT_ATH_WRITE_TOKEN', 'PT_ATH_ALLOWED_TICKERS',
  'PT_FUND_FACTS_TOKEN', 'PT_SEC_EVIDENCE_PULL_TOKEN', 'PT_SEC_EVIDENCE_STORE_WRITE_TOKEN', 'PT_OWNER_TOKEN'
];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function stripComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');
}

// Forbidden surface for every new file: browser state, DOM, scoring and the 1Y High.
const FORBIDDEN = [
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'web storage'],
  [/\b(document|window|navigator)\./, 'DOM / browser global'],
  [/index\.html/, 'index.html'],
  [/\b(orchestrate|analyzeChunk|enforceScoreConsistency|_techCache)\b/, 'scoring engine'],
  [/\b(computeHigh1yDistance|high1yDist|hasHigh1y|high1y)\b|1Y High/i, '1Y High'],
  [/\bpt_(results|tickers|holdings)\b/, 'existing storage key']
];

function scanForbidden(code) {
  const hits = [];
  FORBIDDEN.forEach(function (f) { if (f[0].test(code)) { hits.push(f[1]); } });
  return hits;
}

function envHits(code) {
  const bad = [];
  (code.match(/process\.env\.[A-Za-z0-9_]+/g) || []).forEach(function (m) {
    const key = m.slice('process.env.'.length);
    if (ALLOWED_ENV_KEYS.indexOf(key) === -1) { bad.push(key); }
  });
  (code.match(/process\.env\[/g) || []).forEach(function () { bad.push('computed process.env access'); });
  (code.match(/['"](PT_[A-Z0-9_]+|SEC_[A-Z0-9_]+)['"]/g) || []).forEach(function (m) {
    const key = m.slice(1, -1);
    if (ALLOWED_ENV_KEYS.indexOf(key) === -1) { bad.push(key); }
  });
  return bad;
}

function requireHits(code, allowedRequires, allowedImports) {
  const bad = [];
  (code.match(/require\(['"][^'"]+['"]\)/g) || []).forEach(function (m) {
    const spec = m.slice(9, -2);
    if (allowedRequires.indexOf(spec) === -1) { bad.push('require ' + spec); }
  });
  (code.match(/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"][^'"]+['"]/g) || []).forEach(function (m) {
    const spec = m.replace(/^[\s\S]*['"]([^'"]+)['"]$/, '$1');
    if (allowedImports.indexOf(spec) === -1) { bad.push('import ' + spec); }
  });
  return bad;
}

function fetchHits(code) { return /\bfetch\s*\(|XMLHttpRequest|https?\.request/.test(code) ? ['network call'] : []; }

// ── AR-7 ──────────────────────────────────────────────────────────────────────
test('AR-7a every new product file exists', function () {
  Object.keys(SERVER_FILES).concat([TOOL_FILE]).forEach(function (rel) {
    ok(fs.existsSync(path.join(ROOT, rel)), 'missing ' + rel);
  });
});

test('AR-7b server files: no storage, DOM, scoring, 1Y High, index.html or existing storage key', function () {
  Object.keys(SERVER_FILES).forEach(function (rel) {
    const hits = scanForbidden(stripComments(read(rel)));
    ok(hits.length === 0, rel + ' references ' + hits.join(', '));
  });
  const toolHits = scanForbidden(stripComments(read(TOOL_FILE)));
  ok(toolHits.length === 0, TOOL_FILE + ' references ' + toolHits.join(', '));
});

// B2-auto: ath-yahoo.js is the ONLY ATH module allowed to reach the network (injectable fetch).
const NETWORK_MODULE = 'netlify/functions/lib/ath-yahoo.js';

test('AR-7c server files read only the ATH and collision environment keys; the network is reachable only from ath-yahoo.js', function () {
  Object.keys(SERVER_FILES).forEach(function (rel) {
    const code = stripComments(read(rel));
    const bad = envHits(code);
    ok(bad.length === 0, rel + ' touches env ' + bad.join(', '));
    if (rel !== NETWORK_MODULE) { ok(fetchHits(code).length === 0, rel + ' makes a network call'); }
  });
  const yahoo = stripComments(read(NETWORK_MODULE));
  ok(/globalThis\.fetch/.test(yahoo), 'the network module reaches the network through globalThis.fetch (injectable)');
  ok(!/\brequire\(['"](https?|node:https?|net|node-fetch|axios)['"]\)/.test(yahoo), 'no http client module');
  ok((yahoo.match(/https?:\/\/[^'"`\s]+/g) || []).every(function (u) { return u.indexOf('https://query1.finance.yahoo.com/') === 0; }), 'only the Yahoo chart host');
  ok(!/polygon|alphavantage|finnhub|tradingview/i.test(yahoo), 'no other provider');
});

test('AR-7d the owner tool reads only PT_ATH_WRITE_TOKEN (injected) and writes no file', function () {
  const code = stripComments(read(TOOL_FILE));
  ok((code.match(/process\.env/g) || []).length === 1 && /env:\s*process\.env,/.test(code), 'process.env only as the entry-point hand-over');
  const keys = (code.match(/\benv\.([A-Za-z0-9_]+)/g) || []).map(function (m) { return m.slice(4); });
  ok(keys.length >= 1 && keys.every(function (k) { return k === 'PT_ATH_WRITE_TOKEN'; }), 'only PT_ATH_WRITE_TOKEN: ' + keys.join(','));
  ok(!/\b(writeFileSync|writeFile|appendFile|appendFileSync|unlink|unlinkSync|rmSync|mkdirSync|renameSync|copyFileSync)\b/.test(code), 'no filesystem writes');
});

test('AR-7e every require / import is from the allowed set', function () {
  Object.keys(SERVER_FILES).forEach(function (rel) {
    const spec = SERVER_FILES[rel];
    const bad = requireHits(stripComments(read(rel)), spec.requires, spec.imports);
    ok(bad.length === 0, rel + ': ' + bad.join(', '));
  });
});

// B4 client (nlm-consistency-1 S2, Entry 34, Owner rulings D6 / D-B4-1 = A): index.html may now call the public
// ath-ensure / ath-read routes (the ath-read-v2 projection) behind window.PT_ENABLE_ATH_CLIENT. Everything else about
// the ATH store stays out of the client: the write route, the operator token / tool, the store name, the record
// schema key and the server gate names.
const AR7F_FORBIDDEN = ['ath-write', 'PT_ATH', 'PT_ENABLE_ATH_READ_SERVER', 'PT_ENABLE_ATH_ENSURE_SERVER', 'PT_ENABLE_ATH_WRITE_SERVER', 'ath-record-store', 'ath:v1', 'ath-verify-owner'];
const AR7F_ALLOWED = ['ath-ensure', 'ath-read', 'PT_ENABLE_ATH_CLIENT'];
function athWiringHits(html) { return AR7F_FORBIDDEN.filter(function (needle) { return html.indexOf(needle) !== -1; }); }
test('AR-7f index.html carries only the public ATH client wiring (ath-ensure / ath-read / PT_ENABLE_ATH_CLIENT), never the write route, token, store or server gates', function () {
  const html = read('index.html');
  const hits = athWiringHits(html);
  ok(hits.length === 0, 'index.html mentions ' + hits.join(', '));
  AR7F_ALLOWED.forEach(function (needle) { ok(html.indexOf(needle) !== -1, 'index.html lacks the client wiring token ' + needle); });
});
test('PN each forbidden ATH needle added to index.html is flagged (AR-7f)', function () {
  const html = read('index.html');
  AR7F_FORBIDDEN.forEach(function (needle) {
    ok(athWiringHits(html + '\n// ' + needle + '\n').indexOf(needle) !== -1, needle + ' not flagged');
  });
  ok(athWiringHits(html + "\nfetch('/.netlify/functions/ath-write', { headers: { Authorization: 'Bearer ' + PT_ATH_WRITE_TOKEN } });\n").length >= 2, 'a write call with the token is flagged twice');
});

test('AR-7g no existing server function or lib references the ATH modules', function () {
  const ours = /^ath-/;
  const dirs = [FN, LIB];
  let scanned = 0;
  dirs.forEach(function (dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
      if (!d.isFile() || ours.test(d.name) || !/\.(js|mjs)$/.test(d.name)) { return; }
      scanned += 1;
      const code = fs.readFileSync(path.join(dir, d.name), 'utf8');
      ok(!/ath-record|ath-preflight|ath-read|ath-write|ath:v1|PT_ATH_|PT_ENABLE_ATH_/.test(code), d.name + ' references the ATH modules');
    });
  });
  ok(scanned > 10, 'scanned a meaningful set of existing files: ' + scanned);
});

test('AR-7h the 1Y High cannot reach the comparison: compareToVerifiedAth takes (record, price, high) only', function () {
  const ath = require(path.join(LIB, 'ath-record.js'));
  ok(ath.compareToVerifiedAth.length === 3, 'arity');
  const code = stripComments(read('netlify/functions/lib/ath-record.js'));
  ok(!/high1y|1Y High/i.test(code), 'no 1Y High identifier in the record module');
});

// Baseline pins (LF-normalised sha256, captured at Step 0 from the baseline commit 5844eab, which
// is byte-identical to f2acfe1 for these files). index.html carries the scoring engines
// (orchestrate, analyzeChunk, enforceScoreConsistency, _techCache), the Deep Dive / scan / Actionable
// Take flows, the 1Y High code and every pt_* storage key. The two preflight modules are the ones
// brief section 2 says are not edited; market-data.js is the existing price / history path.
const BASELINE_PINS = {
  'index.html': '9ae1a5bb8cc9f5968dee56f4a02d207e6c0406f6ed6a5cccfdbadba7db65ce8f',
  'netlify/functions/lib/fund-facts-preflight.js': '2a9a4d3682d68904745b9ec14cbc6fa19fb18e81ad3cd29fa7848eb5455101c2',
  'netlify/functions/lib/fund-facts-read-preflight.js': '1ce8c4c5bead5ddd0f0b52e24f012266f1ff06e44daf77721e9a34131c431990',
  'netlify/functions/market-data.js': 'f9b70977eade3a9ec967b87111a54a5a85d634f0824e448ab2ed746989c61125'
};

function sha256Lf(text) { return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex'); }
function pinHolds(rel, text) { return sha256Lf(text) === BASELINE_PINS[rel]; }

test('AR-7i index.html, the scoring/storage code and the untouched server modules are byte-equal to the baseline pins', function () {
  Object.keys(BASELINE_PINS).forEach(function (rel) {
    ok(pinHolds(rel, read(rel)), rel + ' differs from its baseline pin (re-pin deliberately if another task changed it)');
  });
});

// ── planted negatives: the scanner must flag a forbidden token added to the real source ──
test('PN any byte change to index.html, a pinned module or the preflights breaks its pin (AR-7)', function () {
  Object.keys(BASELINE_PINS).forEach(function (rel) {
    const text = read(rel);
    ok(!pinHolds(rel, text + ' '), rel + ': an appended space must break the pin');
    ok(!pinHolds(rel, text.replace(/[A-Za-z]/, function (c) { return c === 'x' ? 'y' : 'x'; })), rel + ': a changed character must break the pin');
  });
});
test('PN a CRLF working copy still matches the LF pin (EOL-normalised), so autocrlf cannot break AR-7', function () {
  const text = read('index.html');
  ok(pinHolds('index.html', text.replace(/\r?\n/g, '\r\n')), 'CRLF form matches');
});
function mutantFlagged(rel, addition, scanner) {
  const code = stripComments(read(rel)) + '\n' + addition + '\n';
  return scanner(code).length > 0;
}

test('PN a localStorage read added to the reader is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-read-core.js', 'localStorage.getItem("pt_results");', scanForbidden), 'flagged');
});
test('PN a DOM reference added to the record module is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-record.js', 'document.getElementById("x");', scanForbidden), 'flagged');
});
test('PN a scoring identifier added to the writer is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-write-core.js', 'enforceScoreConsistency(x);', scanForbidden), 'flagged');
});
test('PN a 1Y High identifier added to the record module is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-record.js', 'const v = high1yDist;', scanForbidden), 'flagged');
});
test('PN an extra environment key added to the preflight is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-preflight.js', 'const k = process.env.SEC_USER_AGENT;', envHits), 'flagged');
  ok(mutantFlagged('netlify/functions/lib/ath-preflight.js', 'const k = process.env[name];', envHits), 'computed access flagged');
});
test('PN an extra require added to the writer is flagged (AR-7)', function () {
  const code = stripComments(read('netlify/functions/lib/ath-write-core.js')) + "\nrequire('./fund-facts-core');\n";
  ok(requireHits(code, SERVER_FILES['netlify/functions/lib/ath-write-core.js'].requires, []).length > 0, 'flagged');
});
test('PN a network call added to the reader is flagged (AR-7)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-read-core.js', 'fetch("https://x");', fetchHits), 'flagged');
});
test('PN a network call added to the ensure core, the record module or the write core is flagged (AR-7)', function () {
  ['netlify/functions/lib/ath-ensure-core.js', 'netlify/functions/lib/ath-record.js', 'netlify/functions/lib/ath-write-core.js'].forEach(function (rel) {
    ok(mutantFlagged(rel, 'fetch("https://x");', fetchHits), rel + ' flagged');
  });
});
test('PN a second provider host added to the network module is flagged (AR-7c)', function () {
  const mutant = stripComments(read(NETWORK_MODULE)) + "\nconst u = 'https://api.polygon.io/v2/aggs';\n";
  ok(!(mutant.match(/https?:\/\/[^'"`\s]+/g) || []).every(function (u) { return u.indexOf('https://query1.finance.yahoo.com/') === 0; }), 'flagged');
});
test('PN the ensure route and its wrapper are scanned: a DOM reference added to either is flagged (AR-7b)', function () {
  ok(mutantFlagged('netlify/functions/lib/ath-ensure-core.js', 'document.getElementById("x");', scanForbidden), 'core flagged');
  ok(mutantFlagged('netlify/functions/ath-ensure.mjs', 'localStorage.getItem("pt_results");', scanForbidden), 'wrapper flagged');
});
test('PN the ensure gate key is the only new environment key; an ensure token key would be flagged (AR-7c)', function () {
  ok(ALLOWED_ENV_KEYS.indexOf('PT_ENABLE_ATH_ENSURE_SERVER') !== -1 && ALLOWED_ENV_KEYS.indexOf('PT_ATH_ENSURE_TOKEN') === -1, 'key set');
  ok(mutantFlagged('netlify/functions/lib/ath-ensure-core.js', 'const t = process.env.PT_ATH_ENSURE_TOKEN;', envHits), 'flagged');
});

const result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
if (failed > 0) { process.exitCode = 1; }
