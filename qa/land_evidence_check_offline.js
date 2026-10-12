'use strict';
// Offline suite for qa/land_evidence_check.js (read-only L9 pre-LAND readiness check).
// Pure Node; fixtures are in memory; the only files written are LE-7 temp fixtures under
// os.tmpdir(), deleted afterwards. No network, no Git.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL_PATH = path.join(__dirname, 'land_evidence_check.js');
const PT_LAND_PATH = path.join(ROOT, '.claude', 'hooks', 'pt-land.js');

let passed = 0;
let failed = 0;
function check(id, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + id); }
  else { failed++; console.log('  FAIL  ' + id + (detail ? ' - ' + detail : '')); }
}

const ptLandText = fs.readFileSync(PT_LAND_PATH, 'utf8');
const toolSrc = fs.readFileSync(TOOL_PATH, 'utf8');

// land-evidence-check-2: the shebang line ends in CRLF on Windows checkouts.
const SHEBANG_RE = /^#!.*\r?\n/;
function loadFromSource(src, stripRe) {
  const body = src.replace(stripRe || SHEBANG_RE, '');
  const m = { exports: {} };
  // `module` here is not require.main, so the CLI guard stays inert.
  new Function('require', 'module', 'exports', '__dirname', body)(require, m, m.exports, __dirname);
  return m.exports;
}
const tool = loadFromSource(toolSrc);

// Static read-only scan used by LE-8 (and fed the planted-negative mutants).
function staticViolations(src) {
  const bad = [];
  if (/writeFile|appendFile|createWriteStream|unlinkSync|rmSync|mkdirSync/.test(src)) bad.push('fs write');
  if (/fetch\(/.test(src)) bad.push('fetch(');
  if (/http/i.test(src)) bad.push('http');
  if (/require\([^)]*pt-land/.test(src)) bad.push('require of pt-land.js');
  if (/['"](commit|push|add|checkout|switch|reset|merge|rebase|pull|update-ref|clean|stash|tag|branch|rm|mv|gc|config)['"]/.test(src)) bad.push('git write verb');
  return bad;
}

const V = 'LAND-EVIDENCE: qa-offline=PASS 84; targeted=PASS; codex-classI-unresolved=0';
const doc = (lines, eol) => lines.join(eol || '\n') + (eol || '\n');
const RE = tool.extractContract(ptLandText);

// ── LE-1 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-1 contract extraction');
const literal = /const LAND_EVIDENCE_RE = \/(.*)\/;/.exec(ptLandText);
check('LE-1a real pt-land.js yields a RegExp', RE instanceof RegExp);
check('LE-1b .source equals the pt-land.js literal', !!literal && RE.source === new RegExp(literal[1]).source);
const fake = 'x\nconst LAND_EVIDENCE_RE = /^DIFFERENT-LINE \\d+$/;\ny\n';
const RE2 = tool.extractContract(fake);
check('LE-1c a differing contract text yields the differing regex', RE2 instanceof RegExp && RE2.source === '^DIFFERENT-LINE \\d+$' && RE2.test('DIFFERENT-LINE 7') && !RE2.test(V));
check('LE-1d missing literal is null, not a throw', tool.extractContract('nothing here') === null);

// ── fixtures ─────────────────────────────────────────────────────────────────────────
const ready = {
  'LE-2a LF': doc(['# review', '', V, '']),
  'LE-2b CRLF': doc(['# review', '', V, ''], '\r\n'),
  'LE-2c under heading': doc(['## LAND-EVIDENCE', '', V, '']),
};
const nearMisses = {
  bullet: '- ' + V,
  backticks: '`' + V + '`',
  bold: '**' + V + '**',
  'trailing space': V + ' ',
  '82/82': 'LAND-EVIDENCE: qa-offline=PASS 82/82; targeted=PASS; codex-classI-unresolved=0',
  'targeted=n/a': 'LAND-EVIDENCE: qa-offline=PASS 84; targeted=n/a; codex-classI-unresolved=0',
  'extra text': V + ' (all green)',
};
const notReadyZero = {};
Object.keys(nearMisses).forEach((k) => { notReadyZero['LE-3 ' + k] = doc(['# review', nearMisses[k], '']); });
const dup = { 'LE-4 duplicate': doc(['# review', V, 'text', V, '']) };
const leaks = {
  'guard-integrity': 'guard-integrity: PASS',
  REPORT: 'REPORT: base ok',
  'mode: task-record': 'mode: task-record',
  'WARN no record': 'WARN: no task-base record',
};
const leakDocs = {};
Object.keys(leaks).forEach((k) => { leakDocs['LE-5 ' + k] = doc(['# review', V, leaks[k], '']); });
const stricter = { 'LE-6x valid + near-miss': doc(['# review', V, '- ' + V, '']) };

// ── LE-2 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-2 READY');
Object.keys(ready).forEach((k) => {
  const r = tool.checkReviewText(ready[k], RE);
  check(k + ' is READY with one exact line', r.ready === true && r.exact.length === 1 && r.near.length === 0 && r.integrity.length === 0, JSON.stringify(r));
});

// ── LE-3 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-3 NOT READY exact = 0');
Object.keys(notReadyZero).forEach((k) => {
  const r = tool.checkReviewText(notReadyZero[k], RE);
  const reason = r.problems.join(' | ');
  check(k + ' is NOT READY, exact = 0, near-miss reported', r.ready === false && r.exact.length === 0 && r.near.length === 1 && /exact LAND-EVIDENCE lines = 0/.test(reason), JSON.stringify(r));
});
const none = tool.checkReviewText(doc(['# review', 'nothing']), RE);
check('LE-3 no line at all is NOT READY (exact = 0)', none.ready === false && none.exact.length === 0 && none.near.length === 0);

// ── LE-4 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-4 NOT READY exact = 2');
Object.keys(dup).forEach((k) => {
  const r = tool.checkReviewText(dup[k], RE);
  check(k + ' is NOT READY, exact = 2', r.ready === false && r.exact.length === 2 && /exact LAND-EVIDENCE lines = 2/.test(r.problems.join(' | ')), JSON.stringify(r));
});

// ── LE-5 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-5 integrity-output leak');
Object.keys(leakDocs).forEach((k) => {
  const r = tool.checkReviewText(leakDocs[k], RE);
  check(k + ' is NOT READY despite a valid line', r.ready === false && r.exact.length === 1 && r.integrity.length === 1, JSON.stringify(r));
});

// ── LE-6 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-6 parity with pt-land.js landEvidenceCheck');
function extractFn(text, name) {
  const start = text.indexOf('function ' + name + '(');
  if (start < 0) return null;
  const tail = /\r?\n\}\r?\n/.exec(text.slice(start));
  if (!tail) return null;
  return text.slice(start, start + tail.index + tail[0].length);
}
const fnSrc = extractFn(ptLandText, 'landEvidenceCheck');
const reLit = /const LAND_EVIDENCE_RE = (\/.*\/);/.exec(ptLandText);
check('LE-6a landEvidenceCheck and LAND_EVIDENCE_RE extracted from pt-land.js text', !!fnSrc && !!reLit);
if (!fnSrc || !reLit) {
  console.log('\nLAND-EVIDENCE CHECK OFFLINE: FAIL (L9 definition not found in pt-land.js text; parity cannot be checked)');
  process.exit(1);
}
const landEvidenceCheck = new Function('LAND_EVIDENCE_RE', fnSrc + '\nreturn landEvidenceCheck;')(new Function('return ' + reLit[1])());
const allFixtures = Object.assign({}, ready, notReadyZero, dup, leakDocs, stricter);
let parityBad = 0;
Object.keys(allFixtures).forEach((k) => {
  const G = () => ({ status: 0, stdout: allFixtures[k] });
  const l9 = landEvidenceCheck(G, 'root', 'tip', 'work/x/review.md');
  const r = tool.checkReviewText(allFixtures[k], RE);
  const same = l9.ok === (r.exact.length === 1);
  if (!same) parityBad++;
  check('parity ' + k + ' (L9 ok=' + l9.ok + ', exact=' + r.exact.length + ')', same);
});
check('LE-6b no parity mismatch across all fixtures', parityBad === 0);
const stricterR = tool.checkReviewText(stricter['LE-6x valid + near-miss'], RE);
check('LE-6c the tool is stricter than L9 only on near-misses', stricterR.ready === false && stricterR.exact.length === 1 && stricterR.near.length === 1);

// ── LE-7 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-7 CLI exit codes');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-land-evidence-'));
try {
  const fOk = path.join(tmp, 'ok.md');
  const fBad = path.join(tmp, 'bad.md');
  fs.writeFileSync(fOk, ready['LE-2a LF']);
  fs.writeFileSync(fBad, notReadyZero['LE-3 bullet']);
  const run = (a) => spawnSync(process.execPath, [TOOL_PATH].concat(a), { encoding: 'utf8' });
  const r0 = run(['--root', ROOT, '--file', fOk]);
  check('LE-7a READY file exits 0', r0.status === 0 && /READY/.test(r0.stdout) && !/NOT READY/.test(r0.stdout), r0.stdout + r0.stderr);
  const r1 = run(['--root', ROOT, '--file', fBad]);
  check('LE-7b NOT READY file exits 1', r1.status === 1 && /NOT READY/.test(r1.stdout), r1.stdout + r1.stderr);
  const r3a = run([]);
  check('LE-7c no arguments exits 3', r3a.status === 3);
  const r3b = run(['--root', ROOT, '--task', 'task/x', '--file', fOk]);
  check('LE-7d both --task and --file exits 3', r3b.status === 3);
  const r3c = run(['--root', ROOT, '--task', 'task/../evil']);
  check('LE-7e bad task name exits 3', r3c.status === 3);
  const r1b = run(['--root', ROOT, '--file', path.join(tmp, 'missing.md')]);
  check('LE-7f unreadable file exits 1 (NOT READY), not a crash', r1b.status === 1 && /NOT READY/.test(r1b.stdout), r1b.stdout + r1b.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── LE-8 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-8 static read-only scan');
check('LE-8a tool source has no write / network / pt-land require / git write verb', staticViolations(toolSrc).length === 0, staticViolations(toolSrc).join(','));
check('LE-8b tool reads pt-land.js as text', /readFileSync/.test(toolSrc) && /pt-land\.js/.test(toolSrc));
check('LE-8c Git child env drops GIT_CONFIG_PARAMETERS and sets GIT_OPTIONAL_LOCKS=0', /GIT_OPTIONAL_LOCKS/.test(toolSrc) && /delete env\.GIT_CONFIG_PARAMETERS/.test(toolSrc));

// ── LE-9 ─────────────────────────────────────────────────────────────────────────────
console.log('LE-9 CRLF tool source (Windows checkout)');
const crlfSrc = toolSrc.replace(/\r?\n/g, '\r\n');
function loadsAndWorks(re) {
  try {
    const t = loadFromSource(crlfSrc, re);
    const c = t.extractContract(ptLandText);
    return c instanceof RegExp && c.source === RE.source && typeof t.checkReviewText === 'function';
  } catch (e) {
    return false;
  }
}
check('LE-9a CRLF-converted tool source starts with a CRLF shebang line', /^#![^\n]*\r\n/.test(crlfSrc));
check('LE-9b CRLF tool source loads with SHEBANG_RE and still extracts the contract', loadsAndWorks(SHEBANG_RE) === true);

// ── planted negatives (in-memory mutants of the tool) ────────────────────────────────
console.log('Planted negatives');
const hardCoded = loadFromSource(toolSrc + '\nmodule.exports.extractContract = function () { return /^LAND-EVIDENCE: qa-offline=PASS \\d+; targeted=PASS; codex-classI-unresolved=0$/; };\n');
const hcRe = hardCoded.extractContract(fake);
check('PN-1 hard-coded regex is caught by LE-1c', !(hcRe instanceof RegExp && hcRe.source === '^DIFFERENT-LINE \\d+$'));

const trimmer = loadFromSource(toolSrc + '\nconst __orig = module.exports.checkReviewText; module.exports.checkReviewText = function (t, re) { return __orig(t.split(/\\r\\n|\\r|\\n/).map(function (l) { return l.trim(); }).join("\\n"), re); };\n');
const tr = trimmer.checkReviewText(notReadyZero['LE-3 trailing space'], RE);
check('PN-2 trimming lines is caught by LE-3 trailing space', !(tr.ready === false && tr.exact.length === 0));

const noInteg = loadFromSource(toolSrc + '\nconst __o2 = module.exports.checkReviewText; module.exports.checkReviewText = function (t, re) { return __o2(t.split(/\\r\\n|\\r|\\n/).filter(function (l) { return !/^(guard-integrity|REPORT: |mode: task-record|WARN: no task-base record)/.test(l.trim()); }).join("\\n"), re); };\n');
const ni = noInteg.checkReviewText(leakDocs['LE-5 guard-integrity'], RE);
check('PN-3 skipping the integrity scan is caught by LE-5', !(ni.ready === false && ni.integrity.length === 1));

const reqMutant = toolSrc + "\nrequire('../.claude/hooks/pt-land.js');\n";
check('PN-4 require-ing pt-land.js is caught by LE-8', staticViolations(reqMutant).indexOf('require of pt-land.js') !== -1);

check('PN-5 reverting the strip to /^#!.*\\n/ is caught by LE-9b', loadsAndWorks(/^#!.*\n/) === false);

console.log('\n' + (failed === 0 ? 'LAND-EVIDENCE CHECK OFFLINE: PASS' : 'LAND-EVIDENCE CHECK OFFLINE: FAIL') + ' (' + passed + ' passed, ' + failed + ' failed)');
process.exit(failed === 0 ? 0 : 1);
