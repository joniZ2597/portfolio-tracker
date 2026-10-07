'use strict';
require('./lib/run-tmp').isolate('ptqa-logic-');
const meter = require('./lib/spawn-meter').install();

/*
 * qa/pt_land_logic_offline.js - work/qa-stage2-git-contracts/brief.md §3.4 (main families).
 *
 * The decision rows of qa/pt_land_offline.js, replayed with ZERO processes: the land tool and its integrity module run in-process
 * against a strict fake child_process (qa/lib/git-fake.js) that answers only from the Git transcript recorded for the scenario
 * (qa/fixtures/git-contract/*.json, recorded against real Git by qa/tools/record-git-transcripts.js). The file system is real
 * (a private skeleton directory per row: approval records, the audit log, locks, hook directories, manifests).
 *
 * Each row keeps the exact name of the real row plus " [logic]" and asserts:
 *   - the same outcome the real row asserts (ok / exitCode / verb / reason regex / extra checks of the scenario table);
 *   - the outcome identical to the one recorded from the real run (reason text included);
 *   - "nothing changed" through the oracle: no mutating Git call in the recorded sequence AND an equal byte snapshot of the skeleton,
 *     the oracle verdict being the verdict the real run produced;
 *   - for a mutant row: the UNMUTATED control satisfies the invariant and the mutant (the mutated tool source, replayed against the
 *     mutant's own recorded calls) violates it. A mutant that is only "caught" by an UNSCRIPTED_GIT throw fails the row.
 * The whole suite must start no Git and no Node process; any start fails it (the meter's own count is asserted at the end).
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
const rows = REC.logicRows('land');

test('LOGIC precondition: the suite has rows, every scenario has a recorded transcript, and every row name is unique', () => {
  assert.ok(rows.length > 0, 'no land rows in the scenario table');
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
meter.report({ write(t) { surface += t; } }, 'pt-land-logic');
process.stdout.write(surface);
const starts = /starts git=(\d+) node=(\d+) other=(\d+)/.exec(surface);
if (!starts || starts[1] !== '0' || starts[2] !== '0' || starts[3] !== '0') {
  failed += 1;
  failures.push('LOGIC zero-process: the suite started processes (' + (starts ? 'git=' + starts[1] + ' node=' + starts[2] + ' other=' + starts[3] : 'no meter line') + ')');
}
if (failed > 0) {
  for (const f of failures) process.stdout.write('  FAIL  ' + f + '\n');
  process.stdout.write('\nOFFLINE VALIDATION (pt-land logic): FAIL (' + failed + '/' + (passed + failed) + ')\n');
  process.exit(1);
}
process.stdout.write('  PASS  ' + passed + ' pt-land logic assertion(s) passed\n');
