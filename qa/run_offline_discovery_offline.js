'use strict';

/*
 * Offline-suite discovery contract (WFT-S1 / W1), cases D01-D09 plus the fail-closed
 * shape guard.
 *
 * The runner exports its discovery and effective-set logic behind a require.main guard
 * (D-1 clause 2, D-2.2), so the code exercised here is byte-for-byte the code that ships -
 * not a copy, and not source text evaluated in a sandbox.
 *
 * Fixture trees are created under the OS temp directory, never inside the repository, and
 * are removed on exit. Nothing in this suite writes to qa/ or to any repo file.
 *
 * This suite is discovered automatically; it is deliberately never registered in the
 * runner, and D09 asserts that.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const runner = require('./run-offline.js');
const {
  OFFLINE_TESTS_BASELINE,
  OFFLINE_TESTS_DENYLIST,
  discoverSuites,
  computeEffective,
  OFFLINE_TESTS
} = runner;

const ROOT = path.resolve(__dirname, '..');
const RUNNER_REL = 'qa/run-offline.js';
const RUNNER_PATH = path.join(ROOT, RUNNER_REL);
const SELF = 'qa/run_offline_discovery_offline.js';

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

const tempDirs = [];
// Names may contain a forward slash to place a fixture inside a subdirectory; the parent
// is created first. This is what lets D04b plant a nested file and prove non-recursion.
function tmpTree(label, names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wft-s1-' + label + '-'));
  tempDirs.push(dir);
  for (const n of names) {
    const target = path.join(dir, n);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '// fixture\n');
  }
  return dir;
}
function cleanup() {
  for (const d of tempDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
}

const runnerSrc = fs.readFileSync(RUNNER_PATH, 'utf8');

// ── D01: live subset guard, order prefix, denylist absence ───────────────────────────
section('D01 live effective set');

check('D01 every baseline entry is present in the live effective set',
  OFFLINE_TESTS_BASELINE.every((e) => OFFLINE_TESTS.indexOf(e) !== -1));
check('D01 the effective set opens with the baseline in its landed order (order prefix)',
  OFFLINE_TESTS.slice(0, OFFLINE_TESTS_BASELINE.length).join('\n') === OFFLINE_TESTS_BASELINE.join('\n'));
check('D01 no denylisted file appears in the live effective set',
  OFFLINE_TESTS_DENYLIST.every((d) => OFFLINE_TESTS.indexOf(d) === -1));
check('D01 every live effective entry exists on disk',
  OFFLINE_TESTS.every((f) => fs.existsSync(path.join(ROOT, f))));

// ── D02: controlled equality in a fixture tree ───────────────────────────────────────
section('D02 controlled equality');

const d02 = tmpTree('d02', ['alpha_offline.js', 'beta_test.js']);
check('D02 discovery over a controlled tree returns exactly the matching files, sorted',
  discoverSuites(d02).join(',') === 'qa/alpha_offline.js,qa/beta_test.js');

// ── D03: planted positives are appended and sorted among the additions ───────────────
section('D03 planted positives');

const d03Baseline = ['qa/zulu_offline.js', 'qa/alpha_offline.js'];
const d03Discovered = ['qa/alpha_offline.js', 'qa/mike_test.js', 'qa/bravo_offline.js', 'qa/zulu_offline.js'];
const d03 = computeEffective({ baseline: d03Baseline, denylist: [], discovered: d03Discovered });

check('D03 the baseline keeps its own order, never re-sorted',
  d03.slice(0, 2).join(',') === 'qa/zulu_offline.js,qa/alpha_offline.js');
check('D03 newly discovered files are appended after the baseline',
  d03.slice(2).every((f) => d03Baseline.indexOf(f) === -1));
check('D03 the appended additions are sorted among themselves',
  d03.slice(2).join(',') === 'qa/bravo_offline.js,qa/mike_test.js');

// ── D04: pattern negatives ───────────────────────────────────────────────────────────
section('D04 pattern negatives');

const d04 = tmpTree('d04', [
  'helper.js', 'notes_offline.txt', 'foo.spec.js', 'run-writer-offline.js', 'real_offline.js'
]);
const d04Found = discoverSuites(d04);

check('D04 only the underscore _offline.js / _test.js files are discovered',
  d04Found.join(',') === 'qa/real_offline.js');
check('D04 run-writer-offline.js is not discovered - hyphenated, not underscore',
  d04Found.indexOf('qa/run-writer-offline.js') === -1);
check('D04 helper.js, notes_offline.txt and foo.spec.js are all excluded',
  ['qa/helper.js', 'qa/notes_offline.txt', 'qa/foo.spec.js'].every((f) => d04Found.indexOf(f) === -1));

// ── D04b: non-recursion - a nested lib/ file must never be discovered ────────────────
// The closeCondition requires qa/lib to be undiscoverable. Asserting that against the real
// qa/lib only shows that today's lib holds no matching filename; it would keep passing if
// discovery were changed to recurse. This plants a matching file inside a nested lib/ so
// the non-recursion property itself is what is under test.
section('D04b non-recursion');

const d04b = tmpTree('d04b', ['top_offline.js', 'lib/nested_offline.js']);
const d04bFound = discoverSuites(d04b);

check('D04b the top-level matching file is discovered',
  d04bFound.indexOf('qa/top_offline.js') !== -1);
check('D04b a matching file inside a nested lib/ directory is NOT discovered',
  d04bFound.indexOf('qa/nested_offline.js') === -1
  && d04bFound.indexOf('qa/lib/nested_offline.js') === -1);
check('D04b that tree yields the top-level file and nothing else',
  d04bFound.join(',') === 'qa/top_offline.js');

// ── D05: denylist honored - files present on disk, still not run ─────────────────────
section('D05 denylist honored');

check('D05 both denylisted files are present on disk',
  OFFLINE_TESTS_DENYLIST.every((f) => fs.existsSync(path.join(ROOT, f))));
check('D05 both denylisted files match the discovery pattern yet are excluded', (() => {
  const discovered = discoverSuites(path.join(ROOT, 'qa'));
  return OFFLINE_TESTS_DENYLIST.every((f) => discovered.indexOf(f) !== -1 && OFFLINE_TESTS.indexOf(f) === -1);
})());

// ── D06: determinism ─────────────────────────────────────────────────────────────────
section('D06 determinism');

check('D06 two consecutive computations produce identical arrays',
  computeEffective().join('\n') === computeEffective().join('\n'));
check('D06 discovery order does not affect the result',
  computeEffective({ baseline: d03Baseline, denylist: [], discovered: d03Discovered.slice().reverse() }).join(',')
  === d03.join(','));

// ── D07: FATAL missing-baseline branch, via the injected seam and for real ───────────
section('D07 FATAL missing-baseline branch');

let fatalMessage = null;
const d07 = computeEffective({
  baseline: ['qa/present_offline.js', 'qa/ghost_offline.js'],
  denylist: [],
  discovered: ['qa/present_offline.js'],
  onFatal: (msg) => { fatalMessage = msg; return 'FATAL'; }
});

check('D07 the FATAL branch is taken when a baseline entry is missing from disk', d07 === 'FATAL');
check('D07 the FATAL message names the missing suite',
  typeof fatalMessage === 'string' && fatalMessage.indexOf('qa/ghost_offline.js') !== -1);

// Negative control: the same shape with nothing missing must not reach the FATAL branch.
let negativeControlFired = false;
computeEffective({
  baseline: ['qa/present_offline.js'],
  denylist: [],
  discovered: ['qa/present_offline.js'],
  onFatal: () => { negativeControlFired = true; return 'FATAL'; }
});
check('D07 negative control: no FATAL when every baseline entry is present', negativeControlFired === false);

// The real exit code, proven in a child process so this suite is not terminated by it.
const child = spawnSync(process.execPath, [
  '-e',
  'const m=require(' + JSON.stringify(RUNNER_PATH.replace(/\\/g, '/')) + ');'
  + 'm.computeEffective({baseline:["qa/ghost_offline.js"],denylist:[],discovered:[]});'
], { encoding: 'utf8', cwd: ROOT });

check('D07 direct use of the default FATAL handler exits with code 1', child.status === 1);
check('D07 the FATAL exit prints a message naming the missing suite',
  String(child.stdout || '').indexOf('qa/ghost_offline.js') !== -1);

// ── D08: static pins in the runner source ────────────────────────────────────────────
section('D08 static pins');

const baselineBlock = (() => {
  const start = runnerSrc.indexOf('const OFFLINE_TESTS_BASELINE = [');
  const end = runnerSrc.indexOf('];', start);
  return start === -1 || end === -1 ? '' : runnerSrc.slice(start, end);
})();
const denylistBlock = (() => {
  const start = runnerSrc.indexOf('const OFFLINE_TESTS_DENYLIST = [');
  const end = runnerSrc.indexOf('];', start);
  return start === -1 || end === -1 ? '' : runnerSrc.slice(start, end);
})();

check('D08 the baseline array block is present in the runner source', baselineBlock.length > 0);
check('D08 the baseline block holds exactly 41 quoted qa/ literals',
  (baselineBlock.match(/'qa\//g) || []).length === 41);
check('D08 the exported baseline array holds exactly 41 entries',
  OFFLINE_TESTS_BASELINE.length === 41);
check('D08 the denylist block holds exactly 2 quoted qa/ literals',
  (denylistBlock.match(/'qa\//g) || []).length === 2);
check('D08 the exported denylist resolves to exactly 2 entries',
  OFFLINE_TESTS_DENYLIST.length === 2);
check('D08 OFFLINE_TESTS is assigned from discovery, not hand-maintained',
  /const OFFLINE_TESTS = computeEffective\(\);/.test(runnerSrc));
check('D08 the FATAL missing-baseline guard is present in the runner source',
  /baseline suite missing from qa\//.test(runnerSrc) && /process\.exit\(1\)/.test(runnerSrc));

// ── D09: this suite's own relationship to the runner ─────────────────────────────────
section('D09 self');

check('D09 this suite is absent from the baseline array',
  OFFLINE_TESTS_BASELINE.indexOf(SELF) === -1);
check('D09 this suite has no registration literal anywhere in the runner source',
  runnerSrc.indexOf("'" + SELF + "'") === -1);
check('D09 this suite matches the discovery pattern and is in the live effective set',
  /(_offline|_test)\.js$/.test(SELF) && OFFLINE_TESTS.indexOf(SELF) !== -1);

// ── Fail-closed shape guard (D-2.1, generalized post-WFT-S1) ─────────────────────────
section('shape guard');

// PRE_SLICE_EFFECTIVE_COUNT is a frozen historical constant captured from the pre-WFT-S1
// baseline run: it protects against the LANDED baseline array silently shrinking or being
// corrupted, and is never expected to change.
//
// The set of suites beyond that baseline is NOT hand-enumerated per slice - a hardcoded
// list would reject any legitimate suite a later, unrelated slice adds (exactly WFT-S1's
// own limitation). It is instead independently re-derived by re-scanning the real qa/
// directory through the same discoverSuites() primitive the runner itself uses, then
// applying the identical baseline/denylist exclusion - NOT by subtracting
// OFFLINE_TESTS_BASELINE from OFFLINE_TESTS itself, which would make every check below
// tautologically true (count-only in disguise) and defeat the guard's purpose.
const PRE_SLICE_EFFECTIVE_COUNT = 41;
const rediscovered = discoverSuites(path.join(ROOT, 'qa'));
const derivedAdditions = rediscovered
  .filter((f) => OFFLINE_TESTS_DENYLIST.indexOf(f) === -1 && OFFLINE_TESTS_BASELINE.indexOf(f) === -1)
  .sort();

check('shape the pre-slice effective count equals the landed baseline size',
  OFFLINE_TESTS_BASELINE.length === PRE_SLICE_EFFECTIVE_COUNT);
check('shape the effective set is exactly pre-slice plus the independently re-derived additions',
  OFFLINE_TESTS.length === PRE_SLICE_EFFECTIVE_COUNT + derivedAdditions.length);
check('shape every pre-slice member is still present',
  OFFLINE_TESTS_BASELINE.every((e) => OFFLINE_TESTS.indexOf(e) !== -1));
check('shape every independently re-derived addition is present in the effective set',
  derivedAdditions.every((e) => OFFLINE_TESTS.indexOf(e) !== -1));
check('shape no entry appears that is neither pre-slice nor an independently re-derived addition',
  OFFLINE_TESTS.every((e) => OFFLINE_TESTS_BASELINE.indexOf(e) !== -1 || derivedAdditions.indexOf(e) !== -1));
check('shape both denylisted filenames are absent',
  OFFLINE_TESTS_DENYLIST.every((d) => OFFLINE_TESTS.indexOf(d) === -1));

// ── summary ──────────────────────────────────────────────────────────────────────────
cleanup();

console.log('');
if (failed === 0) {
  console.log('run_offline_discovery_offline: PASS (' + total + ' checks)');
  process.exit(0);
}
console.log('run_offline_discovery_offline: FAIL (' + failed + ' of ' + total + ' checks)');
for (const f of failures) {
  console.log('  - ' + f);
}
process.exit(1);
