'use strict';

/*
 * qa/lib/spawn-meter.js - work/qa-isolation-meter/brief.md §1.2. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * Counts and times every process start made through child_process.spawnSync (the one entry point the two land suites,
 * the land tool and qa/guard_integrity_check.js use) and reports, per suite and per row, how the time splits between
 * fixture setup, the tool under test and everything else, which Git executable actually runs, and the average time
 * of a Git start. It changes nothing: the wrapper calls the original with the same `this`, arguments and options
 * object and returns the original result object. No environment variable, no file write, no network call, no extra
 * process. Meter-internal errors are counted (meterErrors) and never thrown.
 *
 * Limits (stated, not hidden): only child_process.spawnSync is wrapped. execFileSync / exec* / spawn use other entry
 * points and are not counted; CLI children (a Node spawn of pt-land.js) are counted with their wall time only, their own
 * Git starts happen in another process and are not seen here.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

// Frames whose function name marks fixture setup (brief §1.2).
const FIXTURE_FRAMES = ['buildFixture', 'buildCleanupFixture', 'buildProtectedFixture', 'buildApprovedLandFixture', 'makeFlakyGitViaNodeOptions'];
const TOOL_FILE_RE = /(?:^|[\\/])(?:pt-land|guard_integrity_check)\.js$/;
const CLI_FILE_RE = /(?:^|[\\/])pt-land\.js$/;

const meterState = { installed: false, original: null, records: [], rows: [], current: null, meterErrors: 0 };

function nowNs() { return process.hrtime.bigint(); }

function countMeterError(e) {
  meterState.meterErrors += 1; // record failed
}

// ── stack -> category ───────────────────────────────────────────────────────────────────
function parseFrames(stack) {
  const frames = [];
  for (const line of String(stack).split('\n').slice(1)) {
    let name = '';
    let loc = '';
    let m = /^\s*at (?:async )?(?:new )?(.+?) \((.*)\)\s*$/.exec(line);
    if (m) { name = m[1]; loc = m[2]; } else {
      m = /^\s*at (?:async )?(.+?)\s*$/.exec(line);
      if (m) loc = m[1];
    }
    const fn = name.replace(/ \[as [^\]]*\]$/, '').split('.').pop();
    frames.push({ fn: fn || '', file: loc.replace(/:\d+:\d+$/, '') });
  }
  return frames;
}
function exeName(file) {
  const base = path.basename(String(file === undefined || file === null ? '' : file)).toLowerCase();
  return base.replace(/\.exe$/, '') || 'unknown';
}
function categorize(frames, exe, argv) {
  for (const f of frames) {
    if (FIXTURE_FRAMES.indexOf(f.fn) !== -1) return { cat: 'fixture', cli: false };
  }
  for (const f of frames) {
    if (TOOL_FILE_RE.test(f.file)) return { cat: 'tool', cli: false };
  }
  const first = Array.isArray(argv) && argv.length ? String(argv[0]) : '';
  if (exe === 'node' && CLI_FILE_RE.test(first)) {
    return { cat: 'tool', cli: true };
  }
  return { cat: 'other', cli: false };
}
// The first non-option argument; the value of -c / -C is skipped (the tool runs `git -c core.hooksPath=... <sub>`).
function gitSub(argv) {
  const a = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < a.length; i += 1) {
    const s = String(a[i]);
    if (s === '-c' || s === '-C') { i += 1; continue; }
    if (s.charAt(0) === '-') continue;
    return s;
  }
  return '(none)';
}

function record(t0, file, argv) {
  const t1 = nowNs();
  const ms = Number(t1 - t0) / 1e6;
  const limit = Error.stackTraceLimit;
  let stack = '';
  Error.stackTraceLimit = 60;
  try { stack = new Error().stack; } finally { Error.stackTraceLimit = limit; }
  const exe = exeName(file);
  const c = categorize(parseFrames(stack), exe, argv);
  meterState.records.push({ exe, sub: exe === 'git' ? gitSub(argv) : null, ms, cat: c.cat, cli: c.cli, row: meterState.current ? meterState.rows.length : 0 });
}

const api = { install, beginRow, endRow, report, resolveGitOnPath };

function install() {
  if (meterState.installed) return api;
  meterState.installed = true;
  const original = childProcess.spawnSync;
  meterState.original = original;
  childProcess.spawnSync = function meteredSpawnSync() {
    let t0 = null;
    try { t0 = nowNs(); } catch (e) { countMeterError(e); }
    const result = original.apply(this, arguments);
    try {
      if (t0 === null) throw new Error('no start time');
      record(t0, arguments[0], arguments[1]);
    } catch (e) { countMeterError(e); }
    return result; // pass-through: the original result object, unchanged
  };
  return api;
}

// ── rows ────────────────────────────────────────────────────────────────────────────────
function beginRow(name) {
  try {
    const row = { name: String(name), t0: nowNs(), wall: 0 };
    meterState.rows.push(row);
    meterState.current = row;
  } catch (e) { countMeterError(e); }
}
function endRow() {
  try {
    if (meterState.current) meterState.current.wall = Number(nowNs() - meterState.current.t0) / 1e6;
  } catch (e) { countMeterError(e); }
  meterState.current = null; // row closed
}

// ── which git does spawnSync('git') run? (no process is started) ─────────────────────────
function classifyGit(file) {
  const p = String(file).replace(/\\/g, '/').toLowerCase();
  if (/\/git\/(?:cmd|bin)\/git\.exe$/.test(p)) return 'launcher';
  if (/\/mingw(?:32|64)\/bin\/git\.exe$/.test(p)) return 'direct';
  return 'other';
}
function resolveGitOnPath(env, platform) {
  const isWin = platform === 'win32';
  const e = env || {};
  const key = Object.keys(e).find((k) => /^path$/i.test(k));
  const pathVar = key === undefined ? '' : e[key];
  const dirs = String(pathVar || '').split(isWin ? ';' : ':').filter(Boolean);
  const names = isWin ? ['git', 'git.com', 'git.exe'] : ['git'];
  for (const raw of dirs) {
    const dir = raw.replace(/^"(.*)"$/, '$1');
    for (const name of names) {
      const candidate = path.join(dir, name);
      let isFile = false;
      try { isFile = fs.statSync(candidate).isFile(); } catch (err) { isFile = false; }
      if (isFile) return { path: candidate, kind: isWin ? classifyGit(candidate) : 'other' };
    }
  }
  return { path: null, kind: 'none' };
}

// ── report ──────────────────────────────────────────────────────────────────────────────
function ms(x) { return String(Math.round(x)); }
function tally(records) {
  const t = { fixture: { n: 0, ms: 0 }, tool: { n: 0, ms: 0 }, other: { n: 0, ms: 0 } };
  for (const r of records) { t[r.cat].n += 1; t[r.cat].ms += r.ms; }
  return t;
}
function counts(records) {
  const t = tally(records);
  return 'fixture=' + t.fixture.n + '/' + ms(t.fixture.ms) + ' tool=' + t.tool.n + '/' + ms(t.tool.ms) + ' other=' + t.other.n + '/' + ms(t.other.ms);
}
function report(stream, suiteLabel) {
  const git = resolveGitOnPath(process.env, process.platform);
  const records = meterState.records;
  let gitStarts = 0;
  let nodeStarts = 0;
  let otherStarts = 0;
  let gitMs = 0;
  let cliStarts = 0;
  let cliMs = 0;
  const subs = {};
  for (const r of records) {
    if (r.exe === 'git') { gitStarts += 1; gitMs += r.ms; subs[r.sub] = (subs[r.sub] || 0) + 1; } else if (r.exe === 'node') nodeStarts += 1; else otherStarts += 1;
    if (r.cli) { cliStarts += 1; cliMs += r.ms; }
  }
  const all = tally(records);
  const lines = [];
  lines.push('@@QA-SURFACE@@ ' + suiteLabel + ' meter: git=' + (git.path || 'none') + ' (' + git.kind + ')' +
    '; rows=' + meterState.rows.length +
    '; starts git=' + gitStarts + ' node=' + nodeStarts + ' other=' + otherStarts +
    '; ms fixture=' + ms(all.fixture.ms) + ' tool=' + ms(all.tool.ms) + ' other=' + ms(all.other.ms) +
    '; cli=' + cliStarts + '/' + ms(cliMs) +
    '; avgGitMs=' + (gitStarts ? gitMs / gitStarts : 0).toFixed(1) +
    '; meterErrors=' + meterState.meterErrors);
  const top = Object.keys(subs).sort((a, b) => subs[b] - subs[a] || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 10);
  lines.push('@@QA-SURFACE@@ ' + suiteLabel + ' meter: top git subcommands: ' + (top.length ? top.map((k) => k + '=' + subs[k]).join(' ') : '(none)'));
  meterState.rows.forEach((row, i) => {
    lines.push('@@PL-METER@@ ' + suiteLabel + ' row ' + (i + 1) + ' ' + ms(row.wall) + ' ' + counts(records.filter((r) => r.row === i + 1)) + ' | ' + row.name);
  });
  const outside = records.filter((r) => r.row === 0);
  lines.push('@@PL-METER@@ ' + suiteLabel + ' outside ' + counts(outside));
  stream.write(lines.join('\n') + '\n');
}

module.exports = api;
