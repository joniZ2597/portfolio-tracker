'use strict';

/*
 * Instruction-layer QA (WFT-S1 / W3 + W4).
 *
 * W3 - regression coverage for the byte-level end-of-line verifier in qa/lib/eol-verify.js,
 *      over five fixture buffers plus the real qa/run-offline.js.
 * W4 - read-only structural QA over exactly three instruction-layer files: existence and
 *      readability, required structural anchors, and a sha256 fingerprint baseline table.
 *
 * This suite NEVER writes, repairs or normalizes an instruction file. It only reads them.
 * It is discovered automatically by qa/run-offline.js; it is deliberately not registered.
 *
 * Fingerprints are taken over CR-stripped content, not raw bytes. The three subject files
 * are CRLF in this working tree and LF at HEAD (core.autocrlf=true, no .gitattributes), so
 * a raw-byte fingerprint would encode a property of the checkout rather than of the file
 * and would fail on any machine configured differently. The sibling arc suites normalize
 * the same way for the same reason.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const eol = require('./lib/eol-verify.js');

const ROOT = path.resolve(__dirname, '..');
const abs = (rel) => path.join(ROOT, rel);
const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');
const stripCR = (s) => String(s).replace(/\r/g, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

let total = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
  total += 1;
  if (!cond) {
    failed += 1;
    failures.push(name);
    console.log('  FAIL  ' + name);
  }
}

function section(title) {
  console.log('== ' + title + ' ==');
}

// ── W3: fixture buffers ──────────────────────────────────────────────────────────────
section('W3 end-of-line verifier - fixture buffers');

const B = (s) => Buffer.from(s, 'utf8');

const FIXTURES = [
  { name: 'pure-LF', buf: B('alpha\nbeta\ngamma\n'), lf: 3, crlf: 0, cr: 0, cls: 'LF-ONLY', trailing: true },
  { name: 'pure-CRLF', buf: B('alpha\r\nbeta\r\ngamma\r\n'), lf: 0, crlf: 3, cr: 0, cls: 'CRLF-ONLY', trailing: true },
  { name: 'mixed', buf: B('alpha\r\nbeta\ngamma\r'), lf: 1, crlf: 1, cr: 1, cls: 'MIXED', trailing: true },
  { name: 'empty', buf: B(''), lf: 0, crlf: 0, cr: 0, cls: 'NONE', trailing: false },
  { name: 'no-trailing-newline', buf: B('alpha\nbeta'), lf: 1, crlf: 0, cr: 0, cls: 'LF-ONLY', trailing: false }
];

for (const f of FIXTURES) {
  const r = eol.classifyBuffer(f.buf);
  check('W3 fixture ' + f.name + ': LF count is ' + f.lf, r.lf === f.lf);
  check('W3 fixture ' + f.name + ': CRLF count is ' + f.crlf, r.crlf === f.crlf);
  check('W3 fixture ' + f.name + ': CR count is ' + f.cr, r.cr === f.cr);
  check('W3 fixture ' + f.name + ': classification is ' + f.cls, r.classification === f.cls);
  check('W3 fixture ' + f.name + ': endsWithNewline is ' + f.trailing, r.endsWithNewline === f.trailing);
  check('W3 fixture ' + f.name + ': byte length reported', r.bytes === f.buf.length);
  check('W3 fixture ' + f.name + ': total equals lf + crlf + cr', r.total === r.lf + r.crlf + r.cr);
}

// A CRLF pair must never be double-counted as a bare CR plus a bare LF. This is the exact
// error a regex-over-text implementation makes, and the reason this verifier reads bytes.
const pair = eol.classifyBuffer(B('x\r\ny'));
check('W3 a CRLF pair counts once as CRLF and never as CR + LF',
  pair.crlf === 1 && pair.cr === 0 && pair.lf === 0);

check('W3 classifyBuffer rejects a non-Buffer argument rather than guessing', (() => {
  try { eol.classifyBuffer('a\nb'); return false; } catch (e) { return e instanceof TypeError; }
})());

// ── W3: the real runner ──────────────────────────────────────────────────────────────
section('W3 end-of-line verifier - real qa/run-offline.js');

const runner = eol.classifyFile(abs('qa/run-offline.js'));
// Deliberately NOT pinned to CRLF-ONLY or LF-ONLY: which one holds is a property of this
// checkout's autocrlf setting, not of the repository. What must hold is internal consistency.
check('W3 runner: classification is one of the four defined values',
  ['LF-ONLY', 'CRLF-ONLY', 'MIXED', 'NONE'].indexOf(runner.classification) !== -1);
check('W3 runner: total equals lf + crlf + cr',
  runner.total === runner.lf + runner.crlf + runner.cr);
check('W3 runner: the file has line endings at all', runner.total > 0);
check('W3 runner: classification agrees with the counts', (() => {
  if (runner.total === 0) return runner.classification === 'NONE';
  if (runner.crlf > 0 && runner.lf === 0 && runner.cr === 0) return runner.classification === 'CRLF-ONLY';
  if (runner.lf > 0 && runner.crlf === 0 && runner.cr === 0) return runner.classification === 'LF-ONLY';
  return runner.classification === 'MIXED';
})());
check('W3 runner: byte length matches the file on disk',
  runner.bytes === fs.statSync(abs('qa/run-offline.js')).size);

// ── W4: instruction-layer structural checks ──────────────────────────────────────────
section('W4 instruction layer - existence, anchors, fingerprints');

const CLAUDE_MD = 'CLAUDE.md';
const ROUTER_SKILL = '.claude/skills/portfolio-skill-router/SKILL.md';
const OPTIMIZATION_RULES = '.claude/skills/approval-flow-optimizer/references/optimization-rules.md';

const SUBJECTS = [CLAUDE_MD, ROUTER_SKILL, OPTIMIZATION_RULES];

for (const rel of SUBJECTS) {
  check('W4 exists and is readable: ' + rel, (() => {
    try { return fs.existsSync(abs(rel)) && readText(rel).length > 0; } catch (e) { return false; }
  })());
}

const claudeMd = readText(CLAUDE_MD);
const router = readText(ROUTER_SKILL);
const rules = readText(OPTIMIZATION_RULES);

// CLAUDE.md - four required structural anchors.
check('W4 CLAUDE.md: Git-safety command block present',
  /##\s*Git safety/.test(claudeMd)
  && claudeMd.indexOf('git status --short --branch') !== -1
  && claudeMd.indexOf('git log --oneline origin/branch-dev -1') !== -1);
check('W4 CLAUDE.md: execution-routing checkpoint present',
  /###\s*Execution-routing checkpoint/.test(claudeMd)
  && claudeMd.indexOf('portfolio-skill-router') !== -1);
check('W4 CLAUDE.md: pre-flight checklist heading present',
  /###\s*Agent Pre-Flight Skills & Goal Checklist/.test(claudeMd));
check('W4 CLAUDE.md: frontend-aesthetics block present and closed',
  claudeMd.indexOf('<frontend_aesthetics>') !== -1
  && claudeMd.indexOf('</frontend_aesthetics>') !== -1
  && claudeMd.indexOf('<frontend_aesthetics>') < claudeMd.indexOf('</frontend_aesthetics>'));

// Router skill - frontmatter plus the lane list including the Docs lane.
check('W4 router SKILL.md: frontmatter opens the file and carries name + disable-model-invocation',
  /^---\r?\n/.test(router)
  && /\bname:\s*portfolio-skill-router\b/.test(router)
  && /\bdisable-model-invocation:\s*true\b/.test(router));
check('W4 router SKILL.md: lane list present and includes the Docs lane',
  /lane\s+`Docs`/.test(router)
  && /lane\s+`QA_ONLY`/.test(router)
  && /Recommended lane:/.test(router));

// Optimization rules - the preview-semantics rule text.
check('W4 optimization-rules.md: approval-preview section present',
  /##\s*\d*\.?\s*Approval-preview rules/.test(rules)
  && /###\s*Preview semantics and distortion handling/.test(rules));
check('W4 optimization-rules.md: a distorted preview is not evidence of disk corruption',
  /distorted preview is \*\*not\*\* evidence/.test(rules));

// Fingerprint baseline. Drift is a deliberate act; this suite makes it visible rather than
// silently accepting a changed instruction layer.
const FINGERPRINTS = {
  'CLAUDE.md': 'b1e3c4530bbbd4caa43fc121880f91b91b7bb275163c0e296ff5135956404591',
  '.claude/skills/portfolio-skill-router/SKILL.md': 'cebc935783d30f617e0e67d62fa70030a0c721215f6587f9ddea42c4ba5fadd9',
  '.claude/skills/approval-flow-optimizer/references/optimization-rules.md': '44b03e3e2bdc8dc77c3af5e284d01174e7c5f584ff00524f4fba9d840a07446c'
};

check('W4 fingerprint table covers exactly the three instruction files',
  Object.keys(FINGERPRINTS).length === 3
  && SUBJECTS.every((rel) => Object.prototype.hasOwnProperty.call(FINGERPRINTS, rel)));

for (const rel of SUBJECTS) {
  const actual = sha256(stripCR(readText(rel)));
  const expected = FINGERPRINTS[rel];
  check('W4 instruction-layer fingerprint unchanged: ' + rel
    + (actual === expected ? '' : ' - DRIFT: expected ' + expected + ', measured ' + actual
      + '. This file changed. If the change was deliberate, update the baseline entry for '
      + rel + ' in qa/instruction_layer_offline.js in the same slice that changed it.'),
    actual === expected);
}

// This suite reads the instruction layer and must never be a route by which it is edited.
// The forbidden API names are assembled from fragments so that this guard does not match
// itself: a literal list would appear in this file's own source and make the check
// permanently RED regardless of what the rest of the suite does.
check('W4 this suite contains no write call against an instruction file', (() => {
  const self = readText('qa/instruction_layer_offline.js');
  const forbidden = [
    'write' + 'FileSync',
    'append' + 'FileSync',
    'create' + 'WriteStream',
    'rm' + 'Sync',
    'unlink' + 'Sync',
    'mkd' + 'irSync'
  ];
  return forbidden.every((name) => self.indexOf(name) === -1);
})());

// ── summary ──────────────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log('instruction_layer_offline: PASS (' + total + ' checks)');
  process.exit(0);
}
console.log('instruction_layer_offline: FAIL (' + failed + ' of ' + total + ' checks)');
for (const f of failures) {
  console.log('  - ' + f);
}
process.exit(1);
