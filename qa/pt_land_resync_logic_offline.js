'use strict';
require('./lib/run-tmp').isolate('ptqa-rslogic-');
const meter = require('./lib/spawn-meter').install();

/*
 * qa/pt_land_resync_logic_offline.js - work/qa-stage2-git-contracts/brief.md §3.4 (resync families).
 *
 * The decision rows of qa/pt_land_resync_offline.js, replayed with ZERO processes (see qa/pt_land_logic_offline.js for the method:
 * strict fake child_process answering from recorded Git transcripts, real file system in a private skeleton, oracle for "nothing
 * changed", exact row name + " [logic]"). A decision mutant is replayed with the mutated tool source against ITS OWN recorded real
 * call sequence; the unmutated control of the same scenario helper is replayed once per row (the same transcript, no process) and must
 * satisfy the invariant, while the mutant must violate it. An UNSCRIPTED_GIT-only catch is never accepted.
 * The suite must start no Git and no Node process; the meter's own count is asserted at the end.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const REC = require('./tools/record-git-transcripts');

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  meter.beginRow(name); try {
    try { fn(); passed += 1; } catch (e) { failed += 1; failures.push(name + ' -- ' + (e && e.message ? e.message : String(e))); }
  } finally { meter.endRow(); }
}

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-'));
const families = REC.loadAll();
const rows = REC.logicRows('resync');

test('LOGIC precondition: the suite has rows, every scenario has a recorded transcript, and every row name is unique', () => {
  assert.ok(rows.length > 0, 'no resync rows in the scenario table');
  const names = new Set();
  for (const r of rows) {
    assert.ok(!names.has(r.name), 'duplicate row name ' + r.name);
    names.add(r.name);
    for (const p of r.parts) assert.ok(families[p.family] && families[p.family].scenarios[p.id], 'no transcript for ' + p.id);
  }
});

for (const row of rows) {
  test(row.name + ' [logic]', () => {
    for (const scn of row.parts) {
      const r = REC.replayScenario(scn, families, BASE);
      assert.deepStrictEqual(r.problems, [], scn.id + ': ' + r.problems.join(' ; '));
    }
  });
}

// ── summary ────────────────────────────────────────────────────────────────────────────────
try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) { /* best effort */ }
let surface = '';
meter.report({ write(t) { surface += t; } }, 'pt-land-resync-logic');
process.stdout.write(surface);
const starts = /starts git=(\d+) node=(\d+) other=(\d+)/.exec(surface);
if (!starts || starts[1] !== '0' || starts[2] !== '0' || starts[3] !== '0') {
  failed += 1;
  failures.push('LOGIC zero-process: the suite started processes (' + (starts ? 'git=' + starts[1] + ' node=' + starts[2] + ' other=' + starts[3] : 'no meter line') + ')');
}
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land resync logic): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
}
process.stdout.write('  PASS  ' + passed + ' pt-land resync logic assertion(s) passed\n');
