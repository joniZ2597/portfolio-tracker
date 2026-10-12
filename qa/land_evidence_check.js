#!/usr/bin/env node
'use strict';
// Read-only pre-LAND readiness check for the L9 LAND-EVIDENCE line. No writes, no network.
//
//   node qa/land_evidence_check.js --root <canonical checkout> --task task/<id>   # committed tip (what L9 reads)
//   node qa/land_evidence_check.js --root <canonical checkout> --file <review.md> # working-tree file, before the commit
//
// Exit 0 = READY, 1 = NOT READY, 3 = usage. The contract is read as TEXT from
// .claude/hooks/pt-land.js (never required), so it cannot drift from L9.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONTRACT_RE = /const LAND_EVIDENCE_RE = \/(.*)\/([a-z]*);/;
const INTEGRITY_RE = /^(guard-integrity: (PASS|FAIL)|REPORT: |mode: task-record|WARN: no task-base record)/;
const TASK_NAME_RE = /^task\/[A-Za-z0-9._-]+$/;

// Returns the RegExp literal assigned to LAND_EVIDENCE_RE in pt-land.js text, or null.
function extractContract(ptLandText) {
  const m = CONTRACT_RE.exec(String(ptLandText));
  if (!m) return null;
  try { return new RegExp(m[1], m[2]); } catch (e) { return null; }
}

// Classifies the lines of a review.md body against the contract regex.
function checkReviewText(text, re) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const exact = [];
  const near = [];
  const integrity = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    if (re.test(l)) exact.push(n);
    else if (/LAND-EVIDENCE\s*:/i.test(l)) near.push(n + ': ' + JSON.stringify(l.slice(0, 120)));
    if (INTEGRITY_RE.test(l.trim())) integrity.push(n);
  });
  const problems = [];
  if (exact.length !== 1) problems.push('exact LAND-EVIDENCE lines = ' + exact.length + ' (L9 needs exactly 1)' + (exact.length ? ' at lines ' + exact.join(',') : ''));
  if (near.length) problems.push('near-miss lines L9 will NOT count (formatting, n/a, extra text, trailing space): ' + near.join(' | '));
  if (integrity.length) problems.push('integrity-check output found in review.md (must not be recorded there) at lines ' + integrity.join(','));
  return { ready: problems.length === 0, exact, near, integrity, problems };
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = opt('--root');
  const task = opt('--task');
  const file = opt('--file');
  if (!root || (!task && !file) || (task && file)) {
    console.log('usage: --root <canonical> (--task task/<id> | --file <review.md>)');
    return 3;
  }
  if (task && !TASK_NAME_RE.test(task)) { console.log('usage: bad task name'); return 3; }

  let ptLandText;
  try { ptLandText = fs.readFileSync(path.join(root, '.claude', 'hooks', 'pt-land.js'), 'utf8'); }
  catch (e) { console.log('NOT READY: cannot read .claude/hooks/pt-land.js under --root'); return 1; }
  const re = extractContract(ptLandText);
  if (!re) { console.log('NOT READY: LAND_EVIDENCE_RE not found in pt-land.js (contract changed?)'); return 1; }

  let text;
  let where;
  if (task) {
    where = task + ':work/' + task.replace(/^task\//, '') + '/review.md';
    const env = Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0' });
    delete env.GIT_CONFIG_PARAMETERS;
    try { text = execFileSync('git', ['-C', root, 'show', where], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { console.log('NOT READY: cannot read ' + where + ' (review.md not committed on the task branch?)'); return 1; }
  } else {
    where = file;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (e) { console.log('NOT READY: cannot read ' + file); return 1; }
  }

  const r = checkReviewText(text, re);
  console.log('source: ' + where);
  console.log('contract: /' + re.source + '/' + re.flags);
  if (!r.ready) { r.problems.forEach((p) => console.log('NOT READY: ' + p)); return 1; }
  console.log('READY: exactly one LAND-EVIDENCE line (line ' + r.exact[0] + '); no near-misses; no integrity output');
  return 0;
}

module.exports = { extractContract, checkReviewText };

if (require.main === module) process.exit(main(process.argv.slice(2)));
