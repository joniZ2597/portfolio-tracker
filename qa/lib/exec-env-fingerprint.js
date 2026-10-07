'use strict';

/*
 * qa/lib/exec-env-fingerprint.js - work/qa-stage2-git-contracts/brief.md §3.6. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * The execution-environment fingerprint: a sha256 over a canonical JSON of every factor that can change what Git (or Node's copy and
 * process machinery) does for the fixtures, so cached equivalence or transcript evidence is reused ONLY in an environment whose
 * digest was proven. Reading the real environment costs exactly 2 Git starts (`git version --build-options` and one
 * `git config --list --show-scope --show-origin -z`, both run from the private root, outside any repository).
 *
 *   collect(opts)            reads the real environment -> { digest, snapshot, manifest }
 *   fromFacts(facts)         PURE: the same computation from supplied facts (what the planted negatives alter)
 *   digestOf(snapshot)       sha256 of the canonical JSON of a snapshot
 *
 * Privacy: values enter only the digest. The readable manifest holds platform fields, the Git version line and the explicit core.*
 * fields - never a URL, a credential or a path (path-valued keys are reduced to "set" / "unset").
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// The only keys left out of the digest: identity, editors, aliases (none can change a built-in command's semantics).
const EXCLUDED_KEY_RE = /^(?:user\..*|credential\..*|core\.editor|core\.pager|sequence\.editor|gui\..*|alias\..*)$/i;
const ENV_NAMED = ['LANG', 'LC_ALL', 'LC_MESSAGES', 'TZ', 'HOME', 'XDG_CONFIG_HOME'];
const EXPLICIT_CORE = ['autocrlf', 'eol', 'safecrlf', 'filemode', 'ignorecase', 'symlinks', 'precomposeunicode', 'longpaths', 'fsmonitor',
  'untrackedcache', 'hookspath', 'excludesfile', 'attributesfile'];
const PATH_VALUED_CORE = new Set(['hookspath', 'excludesfile', 'attributesfile']);

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') { const o = {}; for (const k of Object.keys(value).sort()) o[k] = stable(value[k]); return o; }
  return value;
}
function digestOf(snapshot) { return sha256(JSON.stringify(stable(snapshot))); }

// `git config --list --show-scope --show-origin -z`: NUL-separated triples  scope, origin, "key\nvalue".
function parseConfigZ(text) {
  const tokens = String(text || '').split('\0');
  const records = [];
  for (let i = 0; i + 2 < tokens.length + 0 && tokens[i] !== undefined; i += 3) {
    if (tokens[i] === '' && i + 2 >= tokens.length) break;
    const kv = tokens[i + 2] === undefined ? '' : tokens[i + 2];
    const nl = kv.indexOf('\n');
    records.push({ scope: tokens[i], key: (nl === -1 ? kv : kv.slice(0, nl)).trim().toLowerCase(), value: nl === -1 ? '' : kv.slice(nl + 1) });
  }
  return records.filter((r) => r.key);
}

// PURE. facts = { platform, arch, osRelease, fsCaseInsensitive, fsSymlinks, gitBuildOptions, configZ, env, nodeMajor }
function fromFacts(facts) {
  const config = parseConfigZ(facts.configZ)
    .filter((r) => !EXCLUDED_KEY_RE.test(r.key))
    .map((r) => [r.key, r.value])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const env = {};
  const names = Object.keys(facts.env || {});
  for (const k of names.filter((n) => /^GIT_/i.test(n)).sort()) env[k] = facts.env[k];
  for (const k of ENV_NAMED) env[k] = facts.env && facts.env[k] !== undefined ? facts.env[k] : null;
  const snapshot = {
    platform: facts.platform, arch: facts.arch, osRelease: facts.osRelease,
    fsCaseInsensitive: facts.fsCaseInsensitive, fsSymlinks: facts.fsSymlinks,
    gitBuildOptions: String(facts.gitBuildOptions || ''),
    config, env, nodeMajor: facts.nodeMajor
  };
  const core = {};
  for (const [k, v] of config) {
    const m = /^core\.(.+)$/.exec(k);
    if (m && EXPLICIT_CORE.indexOf(m[1]) !== -1) core[m[1]] = PATH_VALUED_CORE.has(m[1]) || (m[1] === 'fsmonitor' && !/^(?:true|false|yes|no|on|off|0|1)$/i.test(v)) ? (v ? 'set' : 'unset') : v;
  }
  const versionLine = String(facts.gitBuildOptions || '').split('\n')[0].trim();
  const manifest = {
    platform: facts.platform, arch: facts.arch, osRelease: facts.osRelease, nodeMajor: facts.nodeMajor,
    gitVersion: versionLine, fsCaseInsensitive: facts.fsCaseInsensitive, fsSymlinks: facts.fsSymlinks, core
  };
  return { digest: digestOf(snapshot), snapshot, manifest };
}

function probeFs(root) {
  const stamp = process.pid + '-' + Date.now();
  const a = path.join(root, 'ptfp-a-' + stamp);
  const upper = path.join(root, 'PTFP-A-' + stamp);
  let caseInsensitive = false;
  let symlinks = false;
  try { fs.writeFileSync(a, 'x'); caseInsensitive = fs.existsSync(upper); } catch (e) { caseInsensitive = false; }
  const link = path.join(root, 'ptfp-link-' + stamp);
  try { fs.symlinkSync(a, link, 'file'); symlinks = true; } catch (e) { symlinks = false; }
  for (const p of [link, a]) { try { fs.unlinkSync(p); } catch (e) { /* best effort */ } }
  return { caseInsensitive, symlinks };
}

function git(args, cwd, gitExec, spawn) {
  return (spawn || spawnSync)(gitExec || 'git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

// Only the named variables and every GIT_* variable; the named ones are read through process.env (case-insensitive on Windows).
function realEnv() {
  const env = {};
  for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) env[k] = process.env[k];
  for (const k of ENV_NAMED) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

// Reads the real environment. root: a directory outside any repository (default os.tmpdir(), the private root of a QA run).
function collect(opts) {
  const o = opts || {};
  const root = o.root || os.tmpdir();
  const probes = probeFs(root);
  const build = git(['version', '--build-options'], root, o.gitExec, o.spawn);
  const cfg = git(['config', '--list', '--show-scope', '--show-origin', '-z'], root, o.gitExec, o.spawn);
  if (build.status !== 0) throw new Error('exec-env-fingerprint: git version --build-options failed: ' + String(build.stderr || '').trim());
  if (cfg.status !== 0) throw new Error('exec-env-fingerprint: git config --list failed: ' + String(cfg.stderr || '').trim());
  return fromFacts({
    platform: process.platform, arch: process.arch, osRelease: os.release(),
    fsCaseInsensitive: probes.caseInsensitive, fsSymlinks: probes.symlinks,
    gitBuildOptions: build.stdout, configZ: cfg.stdout,
    env: realEnv(), nodeMajor: Number(process.versions.node.split('.')[0])
  });
}

// ── the digest gate shared by GC-4 (qa/git_contract_offline.js) and FT-0 (qa/fixture_template_offline.js) ──
// parts: [{ name, bytes }] -> one sha256 over the names and the content hashes (a one-byte change to any part, or a removed part, changes it).
function digestParts(parts) {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p.name + '\0' + crypto.createHash('sha256').update(p.bytes).digest('hex') + '\n');
  return h.digest('hex');
}
// 'skip' only when the source digest equals the pin AND this environment digest is one of the proven ones;
// 'replay-notice' (same source, unproven environment): run the proofs, pass with a notice; 'replay-fail' (changed or unpinned source):
// run the proofs, then fail "re-pin required" so the task that changed an input re-proves and re-pins in its own diff.
function gateDecision(src, env, pin) {
  if (pin.source !== src) return 'replay-fail';
  return pin.environments.indexOf(env) !== -1 ? 'skip' : 'replay-notice';
}

module.exports = { collect, fromFacts, digestOf, digestParts, gateDecision, parseConfigZ, EXCLUDED_KEY_RE, ENV_NAMED };
