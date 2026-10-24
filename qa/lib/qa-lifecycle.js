'use strict';

/*
 * qa-lifecycle-v2: pure functions for stale-pin reporting (R1), default-fail / --allow-stale (R2),
 * the run record and part hashes behind qa/tools/pin-from-run.js (R3) and the runtime regression
 * flag (R4). No process is spawned here and no Git is read. The only I/O is the record / baseline
 * store, which takes its directory as an argument (the runner passes PT_QA_RECORD_DIR).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SURFACE = '@@QA-SURFACE@@ ';
const REGRESSION_FACTOR = 2;
const OVERRIDE_VARS = ['PT_LAND_TOOL_PATH', 'AH_HOOK_PATH', 'AH_SETTINGS_PATH', 'TB_ONLY', 'NODE_OPTIONS', 'PT_QA_FORCE_HEAVY'];

// The six pinned suites. The set is also DERIVED from the suites' sources (derivePinnedSuites) and the two are compared by the
// lifecycle suite, so a seventh pinned suite fails a test instead of going unreported.
const PINNED_SUITES = [
  { file: 'qa/auto_mode_hardening_offline.js', label: 'auto-mode-hardening', kind: 'E1' },
  { file: 'qa/pt_land_offline.js', label: 'pt-land', kind: 'E1' },
  { file: 'qa/pt_land_resync_offline.js', label: 'pt-land-resync', kind: 'E1' },
  { file: 'qa/task_base_offline.js', label: 'task-base', kind: 'E1' },
  { file: 'qa/fixture_template_offline.js', label: 'fixture-template', kind: 'FT' },
  { file: 'qa/git_contract_offline.js', label: 'git-contract', kind: 'GC' }
];

// ── R1: reading a suite's stdout ─────────────────────────────────────────────────────────────
const HEX64 = '[0-9a-f]{64}';
const RE_E1_REPLAY = new RegExp('E1 ([a-z-]+): REPLAY PASS \\(([^)]*)\\) src (' + HEX64 + ') env (' + HEX64 + '), (.*?), (\\d+) heavy skipped');
const RE_E1_SKIP = /E1 ([a-z-]+): SKIP \(contract pinned: ([0-9a-f]{12})\/([0-9a-f]{12})\) (\d+) heavy (?:block|row)\(s\) not run, (\d+) (?:assertion|light)/;
const RE_PLAIN_SKIP = /^\s*SKIP {2}\(contract pinned: ([0-9a-f]{12})\/([0-9a-f]{12})\)(?: (\d+) heavy real-Git row\(s\) not run)?\s*$/m;
const RE_NOTE_STALE = new RegExp('^\\s*NOTE {2}pin stale \\((every [^)]*)\\): source (' + HEX64 + ') environment (' + HEX64 + '); re-pin optional\\s*$', 'm');
const RE_NOTE_ENV = new RegExp('^\\s*NOTE {2}environment not pinned: (' + HEX64 + ')', 'm');

function lines(stdout) { return String(stdout || '').split(/\r?\n/); }

// Every stale / not-pinned note in a suite's stdout, in the exact shapes the suites print today.
function parseStaleNotes(stdout) {
  const out = [];
  for (const line of lines(stdout)) {
    let m = RE_E1_REPLAY.exec(line);
    if (m) { out.push({ kind: 'E1', reason: m[2], line: line.trim() }); continue; }
    m = RE_NOTE_STALE.exec(line);
    if (m) { out.push({ kind: 'NOTE', reason: 'pin stale', line: line.trim() }); continue; }
    if (RE_NOTE_ENV.test(line)) out.push({ kind: 'NOTE', reason: 'environment not pinned', line: line.trim() });
  }
  return out;
}

function countsOf(text) {
  const heavy = /(\d+) heavy/.exec(text);
  const light = /(\d+) (?:light|assertion)/.exec(text);
  return { heavy: heavy ? Number(heavy[1]) : null, light: light ? Number(light[1]) : null };
}

// One pinned suite's state from its own stdout: skip | stale | no-skip-line.
function classifySuite(suite, stdout) {
  const text = String(stdout || '');
  const base = { file: suite.file, label: suite.label, kind: suite.kind, state: 'no-skip-line', reason: 'no SKIP line and no recognised note', gate: null, src: null, env: null, heavyRows: null, lightRows: null, skipped: null, line: null };
  for (const line of lines(text)) {
    const r = RE_E1_REPLAY.exec(line);
    if (r && r[1] === suite.label && suite.kind === 'E1') {
      // any REPLAY PASS (pin stale, forced, environment not proven, override ...) is a non-SKIP state
      const c = countsOf(r[5]);
      return Object.assign(base, { state: 'stale', reason: r[2], gate: 'replay', src: r[3], env: r[4], heavyRows: c.heavy, lightRows: c.light, skipped: Number(r[6]), line: line.trim() });
    }
    const s = RE_E1_SKIP.exec(line);
    if (s && s[1] === suite.label && suite.kind === 'E1') {
      return Object.assign(base, { state: 'skip', reason: 'pinned', gate: 'skip', heavyRows: Number(s[4]), lightRows: Number(s[5]), skipped: Number(s[4]), line: line.trim() });
    }
  }
  if (suite.kind !== 'E1') {
    const stale = RE_NOTE_STALE.exec(text);
    if (stale) return Object.assign(base, { state: 'stale', reason: 'pin stale', gate: 'replay', src: stale[2], env: stale[3], skipped: 0, line: stale[0].trim() });
    const env = RE_NOTE_ENV.exec(text);
    if (env) return Object.assign(base, { state: 'stale', reason: 'environment not pinned', gate: 'replay-notice', env: env[1], skipped: 0, line: env[0].trim() });
    const skip = RE_PLAIN_SKIP.exec(text);
    if (skip) return Object.assign(base, { state: 'skip', reason: 'pinned', gate: 'skip', heavyRows: skip[3] === undefined ? null : Number(skip[3]), skipped: skip[3] === undefined ? null : Number(skip[3]), line: skip[0].trim() });
  }
  return base;
}

// ── R2: the verdict and the eligibility ─────────────────────────────────────────────────────
// results: classifySuite() output for every pinned suite. allowStale: the argv flag, strictly true.
function staleVerdict(results, opts) {
  const allow = !!opts && opts.allowStale === true;
  const notSkip = results.filter((r) => r.state !== 'skip');
  const sectionLines = notSkip.length === 0
    ? ['  none']
    : notSkip.map((r) => '  ' + r.label + '  ' + r.kind + '  ' + (r.state === 'no-skip-line' ? 'no-skip-line' : r.reason));
  const hardFailures = [];
  const landStop = [];
  if (!allow) {
    for (const r of notSkip) hardFailures.push('stale-pin: ' + r.label + ' (' + (r.state === 'no-skip-line' ? 'no-skip-line' : r.kind) + ')');
    if (notSkip.length > 0) landStop.push('LAND STOP: stale pin(s) — re-pin with proof; see AGENTS.md Test commands');
  }
  return { sectionLines, hardFailures, landStop, staleCount: notSkip.length, mode: allow ? 'allow-stale' : 'default' };
}

// The argv of the runner: only --allow-stale is known; anything else is an error (never an env var).
function parseArgv(argv) {
  const flags = { allowStale: false };
  const errors = [];
  for (const a of argv) {
    if (a === '--allow-stale') flags.allowStale = true;
    else errors.push('unknown argument: ' + a);
  }
  return { flags, errors };
}

function landEligible(record, opts) {
  const o = opts || {};
  if (!record || typeof record !== 'object') return false;
  if (record.mode !== 'default') return false;
  if (record.result !== 'PASS' || record.exitCode !== 0 || record.final !== true) return false;
  if (typeof o.expectedSuiteCount === 'number' && record.suiteCount !== o.expectedSuiteCount) return false;
  const suites = record.suites || {};
  const files = PINNED_SUITES.map((s) => s.file);
  if (Object.keys(suites).length !== files.length) return false;
  return files.every((f) => suites[f] && suites[f].state === 'skip');
}

// ── R4: runtime regression ─────────────────────────────────────────────────────────────────
// baselineMs: stored total for this environment key or null. staleCount: R1 count of this run.
function runtimeVerdict(o) {
  const total = o.totalMs;
  const base = o.baselineMs;
  if (typeof base !== 'number' || !(base > 0)) {
    return { flag: false, line: 'runtime baseline: none for this environment — recorded', writeBaseline: o.staleCount === 0 };
  }
  const ratio = total / base;
  const flag = total > REGRESSION_FACTOR * base;
  return {
    flag: flag,
    line: flag ? 'RUNTIME REGRESSION: ' + Math.round(total / 1000) + ' s vs baseline ' + Math.round(base / 1000) + ' s (' + ratio.toFixed(2) + '×)' : null,
    // a stale-pin run never updates the baseline (slow must not become normal); a regressed run does not either
    writeBaseline: o.staleCount === 0 && !flag
  };
}

// ── the persistent record / baseline store (outside the repo; write + rename) ────────────────
function recordDir(env) {
  const e = env || process.env;
  if (e.PT_QA_RECORD_DIR) return e.PT_QA_RECORD_DIR;
  return path.resolve(ROOT, '..', 'pt-work-artifacts', 'qa-lifecycle');
}
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function readBaseline(dir, envKey) {
  const all = readJson(path.join(dir, 'runtime-baseline.json')) || {};
  const v = all[envKey];
  return typeof v === 'number' && v > 0 ? v : null;
}
function writeBaseline(dir, envKey, totalMs) {
  const file = path.join(dir, 'runtime-baseline.json');
  const all = readJson(file) || {};
  all[envKey] = totalMs;
  writeAtomic(file, JSON.stringify(all, null, 2) + '\n');
}
function writeRecord(dir, record) {
  writeAtomic(path.join(dir, 'run-record.json'), JSON.stringify(record, null, 2) + '\n');
}
function newRunId(now) {
  return new Date(now || Date.now()).toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '') + '-' + crypto.randomBytes(3).toString('hex');
}

// ── R3: digest-part hashes (LF-normalised; the suite's own text with every pin statement neutralised) ──
const PIN_STATEMENT = /const [A-Z0-9_]*_CONTRACT_PIN = \{[\s\S]*?\n\};/g;
function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }
function lf(text) { return String(text).replace(/\r\n/g, '\n'); }
function neutralise(text) { return lf(text).replace(PIN_STATEMENT, 'const PIN = PIN;'); }

// repo-relative path literals inside a source region
function pathLiterals(region) {
  const out = [];
  const re = /'([.\w\/-]+\.(?:js|json|md))'/g;
  let m;
  while ((m = re.exec(region)) !== null) if (out.indexOf(m[1]) === -1) out.push(m[1]);
  return out;
}

// The digest-part files of a pinned suite, read from its own source (class (f): the named array of repo paths the suite hashes).
// TEMPLATE and GIT digest only extracted functions of the land / resync suites; the whole files are hashed here (a conservative superset).
function discoverPartFiles(suite, suiteSrc, root) {
  const src = lf(suiteSrc);
  let region = '';
  if (suite.kind === 'E1') {
    const s = src.indexOf('const E1_PART_NAMES = [');
    const e = s === -1 ? -1 : src.indexOf('];', s);
    region = s === -1 || e === -1 ? '' : src.slice(s, e);
  } else {
    const s = src.search(suite.kind === 'FT' ? /function ftSourceParts\(\)/ : /function sourceParts\(\)/);
    const e = s === -1 ? -1 : src.indexOf('\n}\n', s);
    region = s === -1 || e === -1 ? '' : src.slice(s, e);
  }
  const files = pathLiterals(region).filter((f) => f !== suite.file);
  if (suite.kind !== 'E1') {
    for (const extra of ['qa/pt_land_offline.js', 'qa/pt_land_resync_offline.js']) if (files.indexOf(extra) === -1) files.push(extra);
  }
  if (suite.kind === 'GC') {
    const dir = path.join(root, 'qa', 'fixtures', 'git-contract');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => /\.json$/.test(n)).sort()) files.push('qa/fixtures/git-contract/' + f);
  }
  return files;
}

// sha256 per digest-part file; the suite's own file is hashed neutralised. Missing file -> null (never silently dropped).
function hashParts(suite, root) {
  const own = path.join(root, suite.file);
  const ownText = fs.readFileSync(own, 'utf8');
  const out = {};
  for (const rel of discoverPartFiles(suite, ownText, root)) {
    const p = path.join(root, rel);
    out[rel] = fs.existsSync(p) ? sha256(lf(fs.readFileSync(p, 'utf8'))) : null;
  }
  out[suite.file] = sha256(neutralise(ownText));
  return out;
}

// The pinned set derived from the suites themselves: every top-level suite declaring `const <NAME>_PIN = {`.
function derivePinnedSuites(root) {
  const dir = path.join(root, 'qa');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => /(_offline|_test)\.js$/.test(n)).sort()) {
    if (/^const [A-Z0-9_]+_PIN = \{/m.test(lf(fs.readFileSync(path.join(dir, f), 'utf8')))) out.push('qa/' + f);
  }
  return out;
}

function buildRecord(o) {
  const suites = {};
  for (const r of o.results) {
    suites[r.file] = {
      label: r.label, kind: r.kind, state: r.state, reason: r.reason, gate: r.gate, src: r.src, env: r.env,
      heavyRows: r.heavyRows, lightRows: r.lightRows, skipped: r.skipped, line: r.line,
      partHashes: o.partHashes ? (o.partHashes[r.file] || null) : null
    };
  }
  return {
    schema: 1, runId: o.runId, mode: o.mode, head: o.head, clean: o.clean === true, suiteCount: o.suiteCount,
    totalMs: o.totalMs, result: 'PASS', exitCode: 0, final: true, overrides: o.overrides || [], envKey: o.envKey || null, suites: suites
  };
}

module.exports = {
  PINNED_SUITES, OVERRIDE_VARS, REGRESSION_FACTOR, SURFACE,
  parseStaleNotes, classifySuite, staleVerdict, parseArgv, landEligible, runtimeVerdict,
  recordDir, writeAtomic, readJson, readBaseline, writeBaseline, writeRecord, newRunId,
  sha256, lf, neutralise, discoverPartFiles, hashParts, derivePinnedSuites, buildRecord
};
