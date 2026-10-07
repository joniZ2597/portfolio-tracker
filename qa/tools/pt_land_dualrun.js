#!/usr/bin/env node
'use strict';

/*
 * qa/tools/pt_land_dualrun.js - work/qa-stage2-git-contracts/brief.md §3.5. NOT a suite; the one-time equivalence evidence for G-MAP.
 *
 *   node qa/tools/pt_land_dualrun.js [--only id,...] [--family name,...] [--log file]
 *
 * For every scenario of the table (the moved rows and the controls of the moved mutants) it does BOTH sides on the same scenario:
 *   REAL   the scenario is run again against real Git (fixture, mutation, one verb call) under the recording stand-in;
 *   LOGIC  the transcript just recorded is replayed under the strict fake with the real file-system skeleton, zero processes;
 * and requires
 *   - the REAL outcome satisfies the assertion of the real row (done by the recorder) and the LOGIC outcome is the same outcome:
 *     identical tuple (ok, exitCode, verb, reason) and identical complete result;
 *   - the REAL "nothing changed" verdict equals the ORACLE verdict;
 *   - for a moved mutant the mutant violates the invariant and its control satisfies it, on both sides;
 *   - the freshly recorded transcript equals the stored one (so the stored transcripts describe today's real Git).
 * Output: one line per scenario, a per-family summary and the totals, to --log (default: the system temp folder) and to stdout.
 * Exit 0 only when every scenario is identical.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const REC = require('./record-git-transcripts');
const T = require('../lib/git-transcript');

function main() {
  require('../lib/run-tmp').isolate('ptqa-dual-');
  const args = process.argv.slice(2);
  let only = null;
  let family = null;
  let log = path.join(os.tmpdir(), 'dualrun.log');
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--only') only = new Set(args[++i].split(','));
    else if (args[i] === '--family') family = new Set(args[++i].split(','));
    else if (args[i] === '--log') log = path.resolve(args[++i]);
    else { process.stderr.write('pt_land_dualrun: unknown argument ' + args[i] + '\n'); process.exit(3); }
  }
  const families = REC.loadAll();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-'));
  const lines = [];
  const emit = (l) => { lines.push(l); process.stdout.write(l + '\n'); };
  const perFamily = {};
  let total = 0;
  let identical = 0;
  let mismatches = 0;
  let storedDiffers = 0;
  const t0 = Date.now();
  for (const scn of REC.SCENARIOS) {
    if ((only && !only.has(scn.id)) || (family && !family.has(scn.family))) continue;
    total += 1;
    const f = (perFamily[scn.family] = perFamily[scn.family] || { n: 0, ok: 0 });
    f.n += 1;
    let verdict = 'IDENTICAL';
    let detail = '';
    try {
      const fresh = REC.recordScenario(scn); // REAL side (throws if the real outcome violates the real row's assertion)
      const doc = families[scn.family];
      const stored = doc && doc.scenarios[scn.id];
      if (!stored) { storedDiffers += 1; detail += ' [no stored transcript]'; }
      else {
        const sInv = stored.invocations[0];
        const same = T.sameValue(fresh.entry.invocations[0].calls, doc.pools[sInv.pool]) && T.sameValue(fresh.entry.invocations[0].result, sInv.result) &&
          T.sameValue(fresh.entry.fs, stored.fs) && T.sameValue(fresh.entry.invocations[0].opts, sInv.opts);
        if (!same) { storedDiffers += 1; detail += ' [stored transcript differs from a fresh recording]'; }
      }
      const r = REC.replayEntry(scn, fresh.entry, {}, base); // LOGIC side on the fresh recording
      if (r.problems.length) { verdict = 'MISMATCH'; detail += ' ' + r.problems.join(' ; '); }
      else {
        const real = fresh.real;
        if (!scn.mutate && r.out.oracle.ok !== real.unchanged) { verdict = 'MISMATCH'; detail += ' oracle ' + r.out.oracle.ok + ' vs real ' + real.unchanged; }
        else detail += ' outcome=' + (r.out.result.ok ? 'ok' : 'refused') + (r.out.result.exitCode !== undefined ? '/' + r.out.result.exitCode : '') + ' calls=' + r.out.calls.length + ' verdict=' + (real.unchanged ? 'unchanged' : 'changed');
      }
    } catch (e) {
      verdict = 'MISMATCH';
      detail += ' ' + (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 400);
    }
    if (verdict === 'IDENTICAL') { identical += 1; f.ok += 1; } else mismatches += 1;
    emit(verdict + '  ' + scn.id + '  [' + scn.suite + '/' + scn.family + ']  ' + scn.name.slice(0, 110) + detail);
  }
  emit('');
  for (const k of Object.keys(perFamily)) emit('family ' + k + ': ' + perFamily[k].ok + '/' + perFamily[k].n + ' identical');
  emit('TOTAL scenarios=' + total + ' identical=' + identical + ' mismatches=' + mismatches + ' storedTranscriptDiffers=' + storedDiffers + ' seconds=' + Math.round((Date.now() - t0) / 1000));
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, lines.join('\n') + '\n');
  try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.exit(mismatches === 0 && storedDiffers === 0 ? 0 : 1);
}

if (require.main === module) main();
module.exports = { main };
