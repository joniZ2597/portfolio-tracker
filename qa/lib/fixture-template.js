'use strict';

/*
 * qa/lib/fixture-template.js - work/qa-template-fixtures/brief.md §1.1. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * Build an identical fixture repository ONCE per process, then give every test its own isolated COPY made with the file
 * system (no Git process): template(key, build) builds into <os.tmpdir()>/tpl-<sha256(key) first 12> and caches it;
 * materialize(tplDir, destDir, rewrites) copies it and rewrites the absolute paths Git wrote into the copy.
 *
 * - The template directory lives under os.tmpdir(), i.e. inside the private run root of qa/lib/run-tmp.js, so it is removed
 *   with the run. A template directory is never handed to a test; only copies are.
 * - materialize() starts no Git process and changes no environment variable.
 * - Git records the template's absolute path in three spellings: forward slashes (worktree gitdir files, a slot's .git
 *   file), single backslashes (as given on a Windows command line) and DOUBLE backslashes (git escapes a backslash inside
 *   a config value, so .git/config holds them). All three are rewritten, and the leak scan below looks for all three
 *   plus the template directory's unique name, so a spelling nobody predicted still cannot survive.
 * - After the rewrite every file under destDir outside any objects/ folder is scanned; if the template's path (any
 *   spelling, any letter case) or its unique directory name is still there, materialize() THROWS.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const cache = new Map(); // key -> { dir, meta }
const counters = { builds: 0, buildMs: 0, copies: 0, copyMs: 0, rewrittenFiles: 0, rewriteMs: 0, scannedFiles: 0, scanMs: 0 };

function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }

// ── template ────────────────────────────────────────────────────────────────────────────
// build(dir) fills `dir` and may return a metadata object (task id, OIDs ...) recorded with the template.
function template(key, build) {
  const k = String(key);
  if (cache.has(k)) return cache.get(k);
  const dir = path.join(os.tmpdir(), 'tpl-' + crypto.createHash('sha256').update(k).digest('hex').slice(0, 12));
  if (fs.existsSync(dir)) throw new Error('fixture-template: ' + dir + ' already exists for a different key');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = nowMs();
  let meta;
  try {
    meta = build(dir);
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e2) { /* best effort */ }
    throw e;
  }
  counters.builds += 1;
  counters.buildMs += nowMs() - t0;
  const entry = { dir, meta: meta === undefined ? null : meta };
  cache.set(k, entry);
  return entry;
}

// ── path spellings ──────────────────────────────────────────────────────────────────────
function spellings(p) {
  const fwd = String(p).replace(/\\/g, '/');
  const back = fwd.replace(/\//g, '\\');
  const dbl = back.replace(/\\/g, '\\\\');
  return { fwd, back, dbl };
}

// rewrites: relative paths under the copy; a single "*" segment matches every entry of that directory.
function expandTargets(destDir, rewrites) {
  const out = [];
  for (const rel of rewrites || []) {
    const parts = String(rel).replace(/\\/g, '/').split('/');
    let bases = [destDir];
    for (let i = 0; i < parts.length; i += 1) {
      const next = [];
      for (const b of bases) {
        if (parts[i] === '*') {
          let names = [];
          try { names = fs.readdirSync(b); } catch (e) { names = []; }
          for (const n of names) next.push(path.join(b, n));
        } else {
          next.push(path.join(b, parts[i]));
        }
      }
      bases = next;
    }
    if (parts.indexOf('*') === -1 && !fs.existsSync(bases[0])) throw new Error('fixture-template: rewrite target missing in the copy: ' + rel);
    for (const b of bases) if (fs.existsSync(b) && fs.statSync(b).isFile()) out.push(b);
  }
  return out;
}

// Git for Windows marks a worktree's `.git` file hidden, and Windows refuses a truncating open of a hidden file (EPERM), so the
// content is replaced in place through an existing-file open (the file's attributes stay as they were).
function overwriteInPlace(file, text) {
  try {
    fs.writeFileSync(file, text);
  } catch (e) {
    if (!e || (e.code !== 'EPERM' && e.code !== 'EACCES')) throw e;
    const fd = fs.openSync(file, 'r+');
    try {
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, text, 0, 'utf8');
    } finally { fs.closeSync(fd); }
  }
}
function rewriteFile(file, from, to) {
  const text = fs.readFileSync(file, 'utf8');
  let next = text.split(from.dbl).join(to.dbl);
  next = next.split(from.back).join(to.back);
  next = next.split(from.fwd).join(to.fwd);
  if (next !== text) { overwriteInPlace(file, next); return true; }
  return false;
}

// Throws if the template's path (three spellings, any case) or its unique directory name is left in any non-object file.
function scanForLeaks(destDir, tplDir) {
  const s = spellings(tplDir);
  const tokens = [s.fwd, s.back, s.dbl, path.basename(tplDir)].map((t) => t.toLowerCase());
  let scanned = 0;
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'objects') continue;
      const abs = path.join(dir, name);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) { walk(abs); continue; }
      if (!st.isFile()) continue;
      const text = fs.readFileSync(abs).toString('latin1').toLowerCase();
      scanned += 1;
      for (const t of tokens) {
        if (text.indexOf(t) !== -1) throw new Error('fixture-template: the template path survives in ' + abs + ' (' + t + ')');
      }
    }
  })(destDir);
  return scanned;
}

function materialize(tplDir, destDir, rewrites) {
  const t0 = nowMs();
  fs.cpSync(tplDir, destDir, { recursive: true });
  const t1 = nowMs();
  const from = spellings(tplDir);
  const to = spellings(destDir);
  let changed = 0;
  for (const file of expandTargets(destDir, rewrites)) if (rewriteFile(file, from, to)) changed += 1;
  const t2 = nowMs();
  const scanned = scanForLeaks(destDir, tplDir);
  const t3 = nowMs();
  counters.copies += 1;
  counters.copyMs += t1 - t0;
  counters.rewrittenFiles += changed;
  counters.rewriteMs += t2 - t1;
  counters.scannedFiles += scanned;
  counters.scanMs += t3 - t2;
  return { copyMs: t1 - t0, rewriteMs: t2 - t1, scanMs: t3 - t2, rewrittenFiles: changed, scannedFiles: scanned };
}

function timings() { return Object.assign({}, counters); }

module.exports = { template, materialize, timings };
