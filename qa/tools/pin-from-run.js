'use strict';

/*
 * qa-lifecycle-v2 R3: set a contract pin from a recorded full-run replay instead of a second forced replay.
 *
 *   node qa/tools/pin-from-run.js --record <run-record.json> --suite <label|file> [--expect-count N] [--expect-heavy N] [--expect-light N]
 *
 * It checks the D3 conditions and PRINTS the pin text. It edits nothing: it never writes a repo file (the Worker edits the
 * pin constant by hand, and the next full run must SKIP the suite - that is check 5, made by the runner, not here).
 */

const fs = require('fs');
const path = require('path');
const QL = require('../lib/qa-lifecycle');

const HEX64 = /^[0-9a-f]{64}$/;

function findSuite(name) {
  return QL.PINNED_SUITES.find((s) => s.label === name || s.file === name) || null;
}

// The pin statement of a suite, read from its source: constant name and the environments list.
function readPin(suiteSrc) {
  const m = /const ([A-Z0-9_]+_CONTRACT_PIN) = \{([\s\S]*?)\n\};/.exec(QL.lf(suiteSrc));
  if (!m) return null;
  const sm = /source:\s*'([0-9a-f]{64})'/.exec(m[2]);
  const envs = [];
  const em = /environments:\s*\[([\s\S]*?)\]/.exec(m[2]);
  if (em) { const re = /'([0-9a-f]{64})'/g; let x; while ((x = re.exec(em[1])) !== null) envs.push(x[1]); }
  return { name: m[1], source: sm ? sm[1] : null, environments: envs };
}

// Returns { ok, failures: [string], checks: [{n, ok, text}], pinText, reviewText }.
function evaluate(record, suiteName, opts) {
  const o = opts || {};
  const root = o.root || path.resolve(__dirname, '..', '..');
  const failures = [];
  const checks = [];
  const note = (n, ok, text) => { checks.push({ n: n, ok: ok, text: text }); if (!ok) failures.push('check ' + n + ': ' + text); };

  const suite = findSuite(suiteName);
  if (!suite) return { ok: false, failures: ['unknown pinned suite: ' + suiteName], checks: [], pinText: null, reviewText: null };
  const rs = record && record.suites ? record.suites[suite.file] : null;

  // 2 (first, because every other check reads the record): a complete PASS run with the expected suite count
  const complete = !!record && record.result === 'PASS' && record.exitCode === 0 && record.final === true && Array.isArray(record.overrides) && record.overrides.length === 0;
  note(2, complete, complete ? 'the record is a complete PASS run (exit 0, final, no override variable)' : 'the record is not a complete PASS run (killed, FAIL, not final or an override variable was set)');
  if (typeof o.expectedSuiteCount === 'number') {
    const same = !!record && record.suiteCount === o.expectedSuiteCount;
    note(2, same, same ? 'suite count ' + o.expectedSuiteCount : 'suite count ' + (record && record.suiteCount) + ' is not the expected ' + o.expectedSuiteCount);
  }
  if (!rs) {
    note(1, false, 'the record has no entry for ' + suite.file);
    return { ok: false, failures: failures, checks: checks, pinText: null, reviewText: null };
  }

  // 1 a complete replay line of the suite's kind
  let replay = rs.state === 'stale' && rs.gate === 'replay' && rs.skipped === 0 && HEX64.test(String(rs.src)) && HEX64.test(String(rs.env));
  let why = 'complete replay (' + rs.line + ')';
  if (replay && suite.kind === 'E1') {
    replay = (rs.reason === 'pin stale, re-pin optional' || rs.reason === 'forced') && rs.heavyRows > 0 && rs.lightRows > 0;
    if (replay && typeof o.expectHeavy === 'number' && rs.heavyRows !== o.expectHeavy) { replay = false; why = 'heavy row count ' + rs.heavyRows + ' differs from ' + o.expectHeavy; }
    else if (replay && typeof o.expectLight === 'number' && rs.lightRows !== o.expectLight) { replay = false; why = 'light row count ' + rs.lightRows + ' differs from ' + o.expectLight; }
    else if (!replay) why = 'E1 replay line is not a complete pin-stale / forced replay with row counts';
  } else if (replay && suite.kind === 'FT') {
    replay = /every heavy proof above ran against real Git/.test(String(rs.line));
    if (!replay) why = 'FT note is not "every heavy proof above ran against real Git"';
  } else if (replay && suite.kind === 'GC') {
    replay = /every transcript replayed identically against real Git in \d+ batches/.test(String(rs.line));
    if (!replay) why = 'GC note is not a completed batched replay';
  } else if (!replay) {
    why = rs.state === 'skip' ? 'the suite SKIPped in that run (nothing was replayed)' : 'no complete replay line (state ' + rs.state + ', skipped ' + rs.skipped + ')';
  }
  note(1, replay, why);

  // 3 every digest part unchanged by content hash (pin statements neutralised in the suite's own text)
  let partsOk = false;
  let partsWhy = 'the record stores no part hashes';
  if (rs.partHashes && typeof rs.partHashes === 'object') {
    let now = null;
    try { now = QL.hashParts(suite, root); } catch (e) { partsWhy = 'cannot hash the working tree: ' + e.message; }
    if (now) {
      const keys = Object.keys(rs.partHashes);
      const changed = keys.filter((k) => now[k] !== rs.partHashes[k]).concat(Object.keys(now).filter((k) => keys.indexOf(k) === -1));
      partsOk = keys.length > 0 && changed.length === 0 && keys.every((k) => rs.partHashes[k] !== null);
      partsWhy = partsOk ? keys.length + ' digest parts unchanged since the run' : 'digest part(s) changed or missing since the run: ' + (changed.length ? changed.join(', ') : '(null hash)');
    }
  }
  note(3, partsOk, partsWhy);

  // 4 the printed environment key is in the pin's environments list
  let pin = null;
  try { pin = readPin(fs.readFileSync(path.join(root, suite.file), 'utf8')); } catch (e) { pin = null; }
  const envOk = !!pin && pin.environments.indexOf(rs.env) !== -1;
  note(4, envOk, envOk ? 'environment ' + String(rs.env).slice(0, 12) + ' is in the pin\'s environments' : 'the environment key is not in the pin\'s environments (or the pin is unreadable)');

  if (failures.length > 0) return { ok: false, failures: failures, checks: checks, pinText: null, reviewText: null };

  const pinText = pin.name + ' = {\n  source: \'' + rs.src + '\',\n  environments: ' + JSON.stringify(pin.environments) + '\n};\n(edit the source: line only; environments unchanged)';
  const reviewText = 'pin-from-run: suite ' + suite.label + ' run ' + record.runId + ' (mode ' + record.mode + '): ' + rs.line + '; checks 1-4 PASS; check 5: the next full run must SKIP this suite.';
  return { ok: true, failures: [], checks: checks, pinText: pinText, reviewText: reviewText };
}

function parseCli(argv) {
  const out = { errors: [] };
  const known = { '--record': 'record', '--suite': 'suite', '--expect-count': 'count', '--expect-heavy': 'heavy', '--expect-light': 'light' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = known[argv[i]];
    if (!key || argv[i + 1] === undefined) { out.errors.push('bad argument: ' + argv[i]); continue; }
    out[key] = argv[i + 1];
  }
  if (!out.record) out.errors.push('--record is required');
  if (!out.suite) out.errors.push('--suite is required');
  return out;
}

function main(argv) {
  const cli = parseCli(argv);
  if (cli.errors.length > 0) { console.log('pin-from-run: ' + cli.errors.join('; ')); return 2; }
  const record = QL.readJson(cli.record);
  if (!record) { console.log('REFUSED: cannot read the record ' + cli.record); return 1; }
  let expected = cli.count !== undefined ? Number(cli.count) : null;
  if (expected === null) expected = require('../run-offline.js').OFFLINE_TESTS.length;
  const res = evaluate(record, cli.suite, {
    expectedSuiteCount: expected,
    expectHeavy: cli.heavy !== undefined ? Number(cli.heavy) : undefined,
    expectLight: cli.light !== undefined ? Number(cli.light) : undefined
  });
  for (const c of res.checks) console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  check ' + c.n + ': ' + c.text);
  if (!res.ok) { console.log('REFUSED: ' + res.failures.length + ' check(s) failed - a forced replay is required'); return 1; }
  console.log('\n' + res.pinText + '\n\nreview.md text:\n' + res.reviewText);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { evaluate, readPin, findSuite, parseCli };
