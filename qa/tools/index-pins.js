#!/usr/bin/env node
'use strict';

/*
 * qa/tools/index-pins.js - work/pin-consolidation/brief.md §2 (qa/tools/ is not discovered by the offline runner).
 *
 *   node qa/tools/index-pins.js --check [--root <dir>]          exit 0 if the committed map equals the map computed from index.html,
 *                                                               exit 1 listing the changed / added / removed entries
 *   node qa/tools/index-pins.js --update [--root <dir>]         rewrites ONLY <root>/qa/fixtures/index-pins.json (region anchors are kept)
 *   node qa/tools/index-pins.js --diff <git-ref> [--root <dir>] prints the entries that differ from the map of <git-ref>:index.html,
 *                                                               with a unified line diff of each changed span; writes nothing
 *
 * <root> defaults to the repository root; index.html is <root>/index.html. The region anchors always come from the committed
 * map (the map file is the single place regions are defined). Exit 2 is a usage or input error.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const core = require('../lib/index-pins-core.js');

function usage(msg) {
  process.stderr.write((msg ? msg + '\n' : '') + 'usage: index-pins.js (--check | --update | --diff <git-ref>) [--root <dir>]\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
let mode = null;
let ref = null;
let root = path.resolve(__dirname, '..', '..');
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--check' || a === '--update') { if (mode) usage('one mode only'); mode = a.slice(2); }
  else if (a === '--diff') { if (mode) usage('one mode only'); mode = 'diff'; ref = argv[i + 1]; i += 1; if (!ref || ref.startsWith('--')) usage('--diff needs a git ref'); }
  else if (a === '--root') { if (!argv[i + 1]) usage('--root needs a directory'); root = path.resolve(argv[i + 1]); i += 1; }
  else usage('unknown argument ' + a);
}
if (!mode) usage('a mode is required');

const INDEX_PATH = path.join(root, 'index.html');
const MAP_PATH = path.join(root, 'qa', 'fixtures', 'index-pins.json');

function readMap() {
  if (!fs.existsSync(MAP_PATH)) { process.stdout.write('map file missing: ' + MAP_PATH + '\n'); process.exit(1); }
  let m;
  try { m = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')); } catch (e) { process.stdout.write('map file is not valid JSON: ' + e.message + '\n'); process.exit(1); }
  if (!m || m.schema !== core.SCHEMA) { process.stdout.write('map file schema is not ' + core.SCHEMA + '\n'); process.exit(1); }
  return m;
}
function readIndex() {
  if (!fs.existsSync(INDEX_PATH)) { process.stdout.write('index.html missing: ' + INDEX_PATH + '\n'); process.exit(1); }
  return core.normalizeText(fs.readFileSync(INDEX_PATH, 'utf8'));
}
function compute(text, regionDefs) {
  try { return core.buildMapDetailed(text, regionDefs); } catch (e) { process.stdout.write('INVALID MAP (fail closed): ' + e.message + '\n'); process.exit(1); }
  return null;
}

// Minimal unified line diff (common prefix / suffix trimmed, LCS on the middle); falls back to a summary for a huge middle.
function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p += 1;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s += 1;
  const xm = x.slice(p, x.length - s);
  const ym = y.slice(p, y.length - s);
  const out = [];
  if (xm.length * ym.length > 4000000) {
    out.push('(change too large for a line diff: ' + xm.length + ' line(s) before, ' + ym.length + ' after)');
    return out;
  }
  const lcs = Array.from({ length: xm.length + 1 }, () => new Uint32Array(ym.length + 1));
  for (let i = xm.length - 1; i >= 0; i -= 1) {
    for (let j = ym.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = xm[i] === ym[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < xm.length && j < ym.length) {
    if (xm[i] === ym[j]) { i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push('-' + xm[i]); i += 1; }
    else { out.push('+' + ym[j]); j += 1; }
  }
  while (i < xm.length) { out.push('-' + xm[i]); i += 1; }
  while (j < ym.length) { out.push('+' + ym[j]); j += 1; }
  return out;
}

if (mode === 'check') {
  const committed = readMap();
  const { map } = compute(readIndex(), committed.regions || {});
  const cmp = core.compareMaps(committed, map);
  if (cmp.ok) { process.stdout.write('index-pins: OK (' + Object.keys(map.functions).length + ' functions, ' + Object.keys(map.regions).length + ' regions)\n'); process.exit(0); }
  process.stdout.write('index-pins: MISMATCH\n');
  for (const n of cmp.changed) process.stdout.write('  changed  ' + n + '\n');
  for (const n of cmp.added) process.stdout.write('  added    ' + n + '\n');
  for (const n of cmp.removed) process.stdout.write('  removed  ' + n + '\n');
  if (cmp.fileChanged && !cmp.changed.length && !cmp.added.length && !cmp.removed.length) process.stdout.write('  file digest differs only (no entry changed)\n');
  process.stdout.write('run: node qa/tools/index-pins.js --update  (then review the diff with --diff <ref>)\n');
  process.exit(1);
}

if (mode === 'update') {
  const committed = fs.existsSync(MAP_PATH) ? readMap() : { regions: {} };
  const { map } = compute(readIndex(), committed.regions || {});
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
  process.stdout.write('index-pins: wrote ' + path.relative(root, MAP_PATH).replace(/\\/g, '/') + ' (' + Object.keys(map.functions).length + ' functions, ' + Object.keys(map.regions).length + ' regions)\n');
  process.exit(0);
}

// diff
{
  const committed = readMap();
  const regionDefs = committed.regions || {};
  const cur = compute(readIndex(), regionDefs);
  const show = spawnSync('git', ['show', ref + ':index.html'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (show.status !== 0) { process.stdout.write('cannot read index.html at ' + ref + ': ' + String(show.stderr).trim() + '\n'); process.exit(1); }
  const oldText = core.normalizeText(show.stdout);
  // a region whose anchors do not resolve at <ref> (added later) is left out of the old side and shows as added
  const oldDefs = {};
  for (const n of Object.keys(regionDefs)) {
    try { core.buildMap(oldText, { [n]: regionDefs[n] }); oldDefs[n] = regionDefs[n]; } catch (e) { /* not present at ref */ }
  }
  const old = compute(oldText, oldDefs);
  const cmp = core.compareMaps(old.map, cur.map);
  const textOf = (res, name) => {
    if (name === 'remainder') return res.texts.remainder;
    const dot = name.indexOf('.');
    return res.texts[name.slice(0, dot)][name.slice(dot + 1)];
  };
  if (!cmp.changed.length && !cmp.added.length && !cmp.removed.length) {
    process.stdout.write('index-pins --diff ' + ref + ': no function or region differs\n');
    process.exit(0);
  }
  process.stdout.write('index-pins --diff ' + ref + ': ' + cmp.changed.length + ' changed, ' + cmp.added.length + ' added, ' + cmp.removed.length + ' removed\n');
  for (const n of cmp.removed) process.stdout.write('removed  ' + n + '\n');
  for (const n of cmp.added) process.stdout.write('added    ' + n + '\n');
  for (const n of cmp.changed) {
    process.stdout.write('changed  ' + n + '\n');
    process.stdout.write('--- ' + n + ' @ ' + ref + '\n+++ ' + n + ' @ working tree\n');
    for (const l of lineDiff(textOf(old, n), textOf(cur, n))) process.stdout.write(l + '\n');
  }
  process.exit(0);
}
