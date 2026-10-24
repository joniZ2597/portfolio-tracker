'use strict';

/*
 * qa-lifecycle-v2 (R1-R4): stale-pin reporting, default-fail with --allow-stale, the run record and pin-from-run, and the
 * runtime regression flag. Pure: no process is spawned, no real Git, no network. Fixture trees live under the OS temp
 * directory and are removed on exit. Mutants are applied to the production lib source text by the Worker in the mutation
 * proofs (see work/qa-lifecycle-v2/qa.log), never to this file.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const QL = require('./lib/qa-lifecycle');
const PFR = require('./tools/pin-from-run');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let total = 0;
const failures = [];
function check(name, cond) {
  total += 1;
  if (!cond) { failures.push(name); console.log('  FAIL  ' + name); }
}
function section(t) { console.log('== ' + t + ' =='); }

const tempDirs = [];
function tmp(label) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lifecycle-' + label + '-'));
  tempDirs.push(d);
  return d;
}
process.on('exit', () => { for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } } });

const H = (c) => c.repeat(64);
const SRC = H('a');
const ENV = H('b');

// ── synthetic child stdout (fixture inputs in the exact shapes the suites print today) ──
const e1Skip = (label) => '@@QA-SURFACE@@ E1 ' + label + ': SKIP (contract pinned: aaaaaaaaaaaa/bbbbbbbbbbbb) 21 heavy row(s) not run, 5 light row(s) PASS\n';
const e1Stale = (label) => '@@QA-SURFACE@@ E1 ' + label + ': REPLAY PASS (pin stale, re-pin optional) src ' + SRC + ' env ' + ENV + ', 21 heavy + 5 light row(s) run, 0 heavy skipped\n';
const ftSkip = '  SKIP  (contract pinned: aaaaaaaaaaaa/bbbbbbbbbbbb) 16 heavy real-Git row(s) not run\n  PASS  5 fixture-template assertion(s) passed\n';
const ftNote = '  NOTE  pin stale (every heavy proof above ran against real Git): source ' + SRC + ' environment ' + ENV + '; re-pin optional\n  PASS  21 fixture-template assertion(s) passed\n';
const gcSkip = '  NOTE  GC-4 batch plan: 153 scenarios in 16 batches of 10\n  SKIP  (contract pinned: aaaaaaaaaaaa/bbbbbbbbbbbb)\n  PASS  34 git-contract assertion(s) passed\n';
const gcNote = '  NOTE  GC-4 batch plan: 153 scenarios in 16 batches of 10\n  NOTE  pin stale (every transcript replayed identically against real Git in 16 batches): source ' + SRC + ' environment ' + ENV + '; re-pin optional\n  PASS  34 git-contract assertion(s) passed\n';

function stdoutFor(suite, stale) {
  if (suite.kind === 'E1') return stale ? e1Stale(suite.label) : e1Skip(suite.label);
  if (suite.kind === 'FT') return stale ? ftNote : ftSkip;
  return stale ? gcNote : gcSkip;
}
function classifyAll(staleLabels, emptyLabels) {
  return QL.PINNED_SUITES.map((s) => QL.classifySuite(s, (emptyLabels || []).indexOf(s.label) !== -1 ? 'PASS only\n' : stdoutFor(s, (staleLabels || []).indexOf(s.label) !== -1)));
}
const byLabel = (label) => QL.PINNED_SUITES.find((s) => s.label === label);

// ═══ R1: reporting ═══
section('R1 stale-pin reporting');
{
  const all = classifyAll([]);
  check('L1e all six SKIP -> every suite is skip and the section is exactly "  none"',
    all.every((r) => r.state === 'skip') && JSON.stringify(QL.staleVerdict(all, { allowStale: false }).sectionLines) === JSON.stringify(['  none']));
  check('L1a a stale E1 line is listed with kind E1 and its reason',
    (() => { const r = classifyAll(['task-base'])[3]; return r.state === 'stale' && r.kind === 'E1' && r.reason === 'pin stale, re-pin optional' && r.src === SRC && r.env === ENV && r.skipped === 0 && r.heavyRows === 21 && r.lightRows === 5; })());
  check('L1b a fixture-template NOTE is listed (kind FT) and is parsed by parseStaleNotes',
    (() => { const r = classifyAll(['fixture-template'])[4]; return r.state === 'stale' && r.kind === 'FT' && r.reason === 'pin stale' && QL.parseStaleNotes(ftNote).length === 1; })());
  check('L1c a git-contract NOTE is listed (kind GC) and is parsed by parseStaleNotes',
    (() => { const r = classifyAll(['git-contract'])[5]; return r.state === 'stale' && r.kind === 'GC' && r.reason === 'pin stale' && QL.parseStaleNotes(gcNote).length === 1; })());
  check('L1d a pinned suite with neither SKIP nor a recognised note is reported as no-skip-line',
    (() => { const r = classifyAll([], ['pt-land'])[1]; const v = QL.staleVerdict(classifyAll([], ['pt-land']), { allowStale: true }); return r.state === 'no-skip-line' && v.sectionLines.length === 1 && /pt-land .*no-skip-line/.test(v.sectionLines[0]); })());
  check('L1d2 an environment-not-pinned note is a non-SKIP state for FT and GC',
    (() => { const note = '  NOTE  environment not pinned: ' + ENV + '; record it in a task to enable the fast path\n'; return QL.classifySuite(byLabel('fixture-template'), note).state === 'stale' && QL.classifySuite(byLabel('git-contract'), note).reason === 'environment not pinned'; })());
  check('L1d3 an E1 forced / environment-not-proven replay is a non-SKIP state',
    ['forced', 'environment not proven', 'override NODE_OPTIONS'].every((why) => QL.classifySuite(byLabel('pt-land'),
      '@@QA-SURFACE@@ E1 pt-land: REPLAY PASS (' + why + ') src ' + SRC + ' env ' + ENV + ', 66 heavy + 21 light row(s) run, 0 heavy skipped\n').state === 'stale'));
  check('L1d4 an E1 line of ANOTHER suite does not count as this suite\'s SKIP',
    QL.classifySuite(byLabel('pt-land'), e1Skip('task-base')).state === 'no-skip-line');
  check('L1d5 the block-shaped counts of the hardening suite are read (23 heavy block(s), 4848 assertion(s))',
    (() => { const r = QL.classifySuite(byLabel('auto-mode-hardening'), '@@QA-SURFACE@@ E1 auto-mode-hardening: SKIP (contract pinned: 5c3fae451171/5257c2271402) 23 heavy block(s) not run, 4848 assertion(s) PASS\n'); return r.state === 'skip' && r.heavyRows === 23 && r.lightRows === 4848; })());
}

section('R1 format pinning (class (e): the runner reads what the suites print)');
{
  const lits = {
    E1: ["': SKIP (contract pinned: '", "': REPLAY PASS ('", "'pin stale, re-pin optional'"],
    FT: ["'  SKIP  (contract pinned: '", "'  NOTE  pin stale (every heavy proof above ran against real Git): source '", "'  NOTE  environment not pinned: '"],
    GC: ["'  SKIP  (contract pinned: '", "'  NOTE  pin stale (every transcript replayed identically against real Git in '", "'  NOTE  environment not pinned: '"]
  };
  for (const s of QL.PINNED_SUITES) {
    const src = read(s.file);
    for (const lit of lits[s.kind]) check('L1f ' + s.label + ' still prints ' + lit, src.indexOf(lit.slice(1, -1)) !== -1);
  }
  const derived = QL.derivePinnedSuites(ROOT);
  check('L1g the pinned set derived from the suites\' own "const <NAME>_PIN = {" equals the runner\'s fixed list of six (a seventh fails here)',
    JSON.stringify(derived) === JSON.stringify(QL.PINNED_SUITES.map((s) => s.file).sort()) && derived.length === 6);
  for (const s of QL.PINNED_SUITES) {
    const files = QL.discoverPartFiles(s, read(s.file), ROOT);
    check('L1h ' + s.label + ': class (f) digest-part files are discovered from its own source and all exist', files.length >= 3 && files.every((f) => fs.existsSync(path.join(ROOT, f))));
  }
  check('L1i the digest-part list of the E1 suites is the E1_PART_NAMES block (task-base: 6 files)', QL.discoverPartFiles(byLabel('task-base'), read('qa/task_base_offline.js'), ROOT).length === 6);
}

// ═══ R2: default-fail / --allow-stale / eligibility ═══
section('R2 default-fail and --allow-stale');
{
  const stale = classifyAll(['pt-land-resync']);
  const d = QL.staleVerdict(stale, { allowStale: false });
  check('L2a default + a stale input -> a hard failure "stale-pin: <suite> (<kind>)" and the LAND STOP line',
    d.hardFailures.length === 1 && d.hardFailures[0] === 'stale-pin: pt-land-resync (E1)' && d.landStop.length === 1 && /^LAND STOP: stale pin\(s\) .* re-pin with proof; see AGENTS\.md Test commands$/.test(d.landStop[0]) && d.mode === 'default');
  const n = QL.staleVerdict(classifyAll([], ['git-contract']), { allowStale: false });
  check('L2b default + a pinned suite with no SKIP and no note (no-skip-line) -> FAIL', n.hardFailures.length === 1 && n.hardFailures[0] === 'stale-pin: git-contract (no-skip-line)' && n.landStop.length === 1);
  const a = QL.staleVerdict(stale, { allowStale: true });
  check('L2c --allow-stale + a stale input -> no hard failure, the suite is listed, mode allow-stale',
    a.hardFailures.length === 0 && a.landStop.length === 0 && a.mode === 'allow-stale' && a.sectionLines.length === 1 && /pt-land-resync/.test(a.sectionLines[0]));
  const ok = QL.staleVerdict(classifyAll([]), { allowStale: false });
  check('L2d default + all six SKIP -> PASS (no hard failure, no LAND STOP)', ok.hardFailures.length === 0 && ok.landStop.length === 0 && ok.staleCount === 0);
  check('L2d2 the allow flag must be exactly true (a truthy string does not opt in)', QL.staleVerdict(stale, { allowStale: 'yes' }).hardFailures.length === 1);

  const mk = (results, mode, extra) => Object.assign(QL.buildRecord({ runId: 'r1', mode: mode, head: 'x', clean: true, suiteCount: 106, totalMs: 1000, results: results, partHashes: null }), extra || {});
  const good = mk(classifyAll([]), 'default');
  check('L2e landEligible accepts a default all-SKIP PASS record with the expected count', QL.landEligible(good, { expectedSuiteCount: 106 }) === true);
  check('L2e landEligible rejects an allow-stale record', QL.landEligible(mk(classifyAll([]), 'allow-stale'), { expectedSuiteCount: 106 }) === false);
  check('L2e landEligible rejects a FAIL record', QL.landEligible(mk(classifyAll([]), 'default', { result: 'FAIL', exitCode: 1 }), { expectedSuiteCount: 106 }) === false);
  check('L2e landEligible rejects a record with a non-SKIP suite', QL.landEligible(mk(classifyAll(['task-base']), 'default'), { expectedSuiteCount: 106 }) === false);
  check('L2e landEligible rejects a wrong suite count', QL.landEligible(good, { expectedSuiteCount: 105 }) === false);
  check('L2e landEligible rejects a record that is not final or lacks a pinned suite',
    QL.landEligible(mk(classifyAll([]), 'default', { final: false }), { expectedSuiteCount: 106 }) === false && QL.landEligible(mk(classifyAll([]).slice(1), 'default'), { expectedSuiteCount: 106 }) === false);
  check('L2e landEligible rejects null and non-objects', QL.landEligible(null) === false && QL.landEligible('PASS') === false);

  const flags = QL.parseArgv(['--allow-stale']);
  check('L2f --allow-stale is the only known flag; an unknown flag (including the superseded one) is a runner error',
    flags.flags.allowStale === true && flags.errors.length === 0 && QL.parseArgv([]).flags.allowStale === false && QL.parseArgv(['--strict-pins']).errors.length === 1 && QL.parseArgv(['--bogus']).errors.length === 1);
  const runnerSrc = read('qa/run-offline.js');
  const libSrc = read('qa/lib/qa-lifecycle.js');
  check('L2g the flag is argv-only: the name has no pt-land text and no environment variable is read for it', !/pt-land/i.test('--allow-stale') && !/process\.env\.[A-Z_]*ALLOW[A-Z_]*STALE/i.test(runnerSrc + libSrc) && !/--strict-pins/.test(runnerSrc + libSrc));
  // each spawnSync( call up to its closing "});"
  const spawnOpts = runnerSrc.split('spawnSync(').slice(1).map((c) => c.slice(0, c.indexOf('});') + 3)).filter((c) => c.indexOf('});') !== -1);
  check('L2h the runner passes no new variable to its children: no spawnSync option block sets env, and the runner never assigns to process.env',
    spawnOpts.length >= 2 && spawnOpts.every((b) => !/\benv\s*:/.test(b)) && !/process\.env(\.\w+|\[[^\]]+\])\s*=[^=]/.test(runnerSrc));
  check('L2i the runner header comment now says it writes state outside the repo (header truth)', /writes persistent state OUTSIDE the repo/.test(runnerSrc.split('*/')[0]) && !/This runner only reads repo files/.test(runnerSrc));
  check('L2j the runner wires the lifecycle: stale section after the timing summary and before "=== Summary ===", LAND STOP printed on failure',
    (() => { const t = runnerSrc.search(/printTimingSummary\(\);\s*const lifecycle = printLifecycle\(/); const s = runnerSrc.indexOf("'\\n=== Summary ==='"); return t !== -1 && s > t && /lifecycle\.verdict\.landStop/.test(runnerSrc); })());
}

// ═══ R4: runtime regression ═══
section('R4 runtime regression');
{
  const B = 100000;
  check('L4a 2.01x the baseline -> RUNTIME REGRESSION with seconds and the ratio', (() => { const v = QL.runtimeVerdict({ totalMs: 201000, baselineMs: B, staleCount: 0 }); return v.flag === true && /^RUNTIME REGRESSION: 201 s vs baseline 100 s \(2\.01×\)$/.test(v.line); })());
  check('L4b 1.99x the baseline -> no flag, and exactly 2.00x is not a flag either', QL.runtimeVerdict({ totalMs: 199000, baselineMs: B, staleCount: 0 }).flag === false && QL.runtimeVerdict({ totalMs: 200000, baselineMs: B, staleCount: 0 }).flag === false);
  check('L4c a run with stale pins never updates the baseline (and neither does a regressed run)',
    QL.runtimeVerdict({ totalMs: 90000, baselineMs: B, staleCount: 2 }).writeBaseline === false && QL.runtimeVerdict({ totalMs: 500000, baselineMs: B, staleCount: 0 }).writeBaseline === false && QL.runtimeVerdict({ totalMs: 90000, baselineMs: B, staleCount: 0 }).writeBaseline === true);
  const dir = tmp('baseline');
  QL.writeBaseline(dir, 'envA', 120000);
  check('L4d a different environment key reads no baseline; the same key reads it back', QL.readBaseline(dir, 'envB') === null && QL.readBaseline(dir, 'envA') === 120000);
  const first = QL.runtimeVerdict({ totalMs: 90000, baselineMs: null, staleCount: 0 });
  check('L4e no baseline -> "runtime baseline: none for this environment - recorded" and the baseline is written (fresh run only)', first.flag === false && /^runtime baseline: none for this environment/.test(first.line) && first.writeBaseline === true && QL.runtimeVerdict({ totalMs: 90000, baselineMs: null, staleCount: 1 }).writeBaseline === false);
  check('L4f the threshold factor is exactly 2', QL.REGRESSION_FACTOR === 2);
  const d2 = tmp('record');
  QL.writeBaseline(d2, 'k1', 1000);
  QL.writeBaseline(d2, 'k2', 2000);
  check('L4g the store keeps one baseline per environment key and writes no temp file behind', QL.readBaseline(d2, 'k1') === 1000 && QL.readBaseline(d2, 'k2') === 2000 && fs.readdirSync(d2).every((f) => !/\.tmp$/.test(f)));
}

// ═══ R3: pin-from-run ═══
section('R3 pin-from-run');
function fakeRoot() {
  const root = tmp('root');
  const w = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  w('qa/lib/a.js', 'module.exports = 1;\n');
  w('qa/lib/b.js', 'module.exports = 2;\n');
  w('qa/task_base_offline.js', "const TB_CONTRACT_PIN = {\n  source: '" + H('c') + "',\n  environments: ['" + ENV + "']\n};\nconst E1_PART_NAMES = [\n  'qa/lib/a.js',\n  'qa/lib/b.js'\n];\nconst own = 1;\n");
  return { root: root, w: w };
}
function recordFor(root, patch) {
  const suite = byLabel('task-base');
  const results = [QL.classifySuite(suite, e1Stale('task-base'))];
  const rec = QL.buildRecord({ runId: 'run-1', mode: 'allow-stale', head: 'h', clean: true, suiteCount: 106, totalMs: 1, results: results, partHashes: { [suite.file]: QL.hashParts(suite, root) } });
  return Object.assign(rec, patch || {});
}
function snapshot(root) {
  const out = {};
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = fs.readFileSync(p, 'utf8'); } })(root);
  return JSON.stringify(out);
}
{
  const f = fakeRoot();
  const rec = recordFor(f.root);
  const before = snapshot(f.root);
  const good = PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106 });
  check('L3p the planted positive: a complete PASS replay, unchanged parts, environment pinned -> the tool accepts and prints the pin text',
    good.ok === true && good.checks.every((c) => c.ok) && good.pinText.indexOf("source: '" + SRC + "'") !== -1 && /^TB_CONTRACT_PIN = \{/.test(good.pinText) && /run-1/.test(good.reviewText));
  check('L3i the tool edits nothing: the fixture tree is byte-identical after an accepted run', snapshot(f.root) === before);
  check('L3a negative: a killed-run record (no final flag) is refused', PFR.evaluate(Object.assign({}, rec, { final: false }), 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === false);
  check('L3b negative: a FAIL record is refused', PFR.evaluate(Object.assign({}, rec, { result: 'FAIL', exitCode: 1 }), 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === false);
  check('L3c negative: a wrong suite count is refused', PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 105 }).ok === false);
  check('L3c2 negative: a record that ran with an override variable is refused', PFR.evaluate(Object.assign({}, rec, { overrides: ['PT_QA_FORCE_HEAVY'] }), 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === false);
  f.w('qa/lib/b.js', 'module.exports = 2; // changed after the run\n');
  const changed = PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106 });
  check('L3d negative: ONE digest part changed after the record is refused (check 3, by content hash)', changed.ok === false && changed.failures.some((x) => /^check 3/.test(x) && /qa\/lib\/b\.js/.test(x)));
  f.w('qa/lib/b.js', 'module.exports = 2;\n');
  const envBad = recordFor(f.root);
  envBad.suites['qa/task_base_offline.js'].env = H('d');
  check('L3e negative: an environment key not in the pin\'s environments is refused (check 4)', PFR.evaluate(envBad, 'task-base', { root: f.root, expectedSuiteCount: 106 }).failures.some((x) => /^check 4/.test(x)));
  const skipped = recordFor(f.root);
  skipped.suites['qa/task_base_offline.js'].skipped = 3;
  check('L3f negative: "heavy skipped" != 0 is refused (check 1)', PFR.evaluate(skipped, 'task-base', { root: f.root, expectedSuiteCount: 106 }).failures.some((x) => /^check 1/.test(x)));
  check('L3g negative: row counts that differ from the expected counts are refused',
    PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106, expectHeavy: 20 }).ok === false && PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106, expectLight: 6 }).ok === false && PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106, expectHeavy: 21, expectLight: 5 }).ok === true);
  const skipRec = recordFor(f.root);
  skipRec.suites['qa/task_base_offline.js'] = Object.assign({}, skipRec.suites['qa/task_base_offline.js'], { state: 'skip', gate: 'skip' });
  check('L3j negative: a record in which the suite SKIPped (nothing replayed) is refused', PFR.evaluate(skipRec, 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === false);
  check('L3k negative: an unknown suite name is refused', PFR.evaluate(rec, 'no-such-suite', { root: f.root }).ok === false);
  f.w('qa/task_base_offline.js', "const TB_CONTRACT_PIN = {\n  source: '" + H('e') + "',\n  environments: ['" + ENV + "']\n};\nconst E1_PART_NAMES = [\n  'qa/lib/a.js',\n  'qa/lib/b.js'\n];\nconst own = 1;\n");
  check('L3l the planted positive: a PIN-ONLY edit (the *_CONTRACT_PIN statement changed) is accepted - pin edits are digest-neutral',
    PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === true);
  f.w('qa/task_base_offline.js', "const TB_CONTRACT_PIN = {\n  source: '" + H('e') + "',\n  environments: ['" + ENV + "']\n};\nconst E1_PART_NAMES = [\n  'qa/lib/a.js',\n  'qa/lib/b.js'\n];\nconst own = 2;\n");
  check('L3m negative: a change OUTSIDE the pin statement in the suite\'s own text is refused', PFR.evaluate(rec, 'task-base', { root: f.root, expectedSuiteCount: 106 }).ok === false);
  const toolSrc = read('qa/tools/pin-from-run.js');
  check('L3n the tool source contains no repo-write call', !/\b(writeFileSync|appendFileSync|renameSync|mkdirSync|unlinkSync|rmSync|copyFileSync)\b/.test(toolSrc.replace(/\/\*[\s\S]*?\*\//, '')));
  check('L3o the CLI requires --record and --suite and rejects unknown arguments', PFR.parseCli([]).errors.length === 2 && PFR.parseCli(['--record', 'x', '--suite', 'y']).errors.length === 0 && PFR.parseCli(['--write', 'x', '--record', 'a', '--suite', 'b']).errors.length === 1);
}

section('R3 record store');
{
  const dir = tmp('store');
  const rec = QL.buildRecord({ runId: QL.newRunId(1700000000000), mode: 'default', head: 'h', clean: true, suiteCount: 106, totalMs: 5, results: classifyAll([]), partHashes: null });
  QL.writeRecord(dir, rec);
  const back = QL.readJson(path.join(dir, 'run-record.json'));
  check('L3q a record round-trips (write + rename) and is landEligible', back.runId === rec.runId && QL.landEligible(back, { expectedSuiteCount: 106 }) === true && fs.readdirSync(dir).every((n) => !/\.tmp$/.test(n)));
  check('L3r the record directory defaults outside the repo and PT_QA_RECORD_DIR overrides it',
    !QL.recordDir({}).startsWith(ROOT + path.sep) && /pt-work-artifacts/.test(QL.recordDir({})) && QL.recordDir({ PT_QA_RECORD_DIR: dir }) === dir);
  check('L3s a record is built only as PASS / exit 0 / final (the runner writes it as its last step)', rec.result === 'PASS' && rec.exitCode === 0 && rec.final === true);
}

if (failures.length > 0) {
  console.log('OFFLINE VALIDATION (qa-lifecycle): FAIL (' + failures.length + '/' + total + ')');
  process.exit(1);
}
console.log('  PASS  ' + total + ' qa-lifecycle assertion(s) passed');
