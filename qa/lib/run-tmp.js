'use strict';

/*
 * qa/lib/run-tmp.js - work/qa-isolation-meter/brief.md §1.1. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * isolate(prefix): give the calling process its own private temp root and point TEMP / TMP / TMPDIR at it, in this
 * process only, so everything that reads os.tmpdir() at call time (the land tool's <tmp>/pt-<id>/protected manifests,
 * the suites' fixtures, the resync tool's temp worktrees) and every child that inherits the environment works under
 * <original temp>/<prefix><random> instead of the shared temp folder. Two concurrent runs can then no longer share
 * "pt-oag*" manifests or sweep each other's "pt-resync-*" folders.
 *
 * Idempotent per process. Verifies that os.tmpdir() really follows the variables (otherwise it throws, so the suite
 * fails before any row runs). The exit handler removes the root on a best-effort basis; if that fails it prints ONE
 * "@@QA-SURFACE@@ run-tmp: root left behind <root>" line and never throws. It touches no GIT_* variable.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let state = null;

// Written with fs.writeSync so the line survives the process exit; never throws.
function leftover(root) {
  try { fs.writeSync(1, '@@QA-SURFACE@@ run-tmp: root left behind ' + root + '\n'); } catch (e) { /* never throws */ }
}

function isolate(prefix) {
  if (state) return state;
  const parent = os.tmpdir();
  const root = fs.mkdtempSync(path.join(parent, prefix));
  // Registered before the verification below so a root made by a failing call is still removed at exit.
  process.on('exit', () => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (e) {
      leftover(root);
    }
  });
  process.env.TEMP = root;
  process.env.TMP = root;
  process.env.TMPDIR = root;
  if (os.tmpdir() !== root) throw new Error('run-tmp: os.tmpdir() did not follow TEMP/TMP/TMPDIR (got ' + os.tmpdir() + ', expected ' + root + ')');
  state = { root, parent };
  return state;
}

module.exports = { isolate };
