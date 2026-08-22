#!/usr/bin/env node
'use strict';

/*
 * arc-publish-plan/scripts/resolve-profiles.js — the publisher's RESOLVE step (P-B, B1; --arc P-E, B5).
 *
 *   node resolve-profiles.js --in <proposed-plan.json> --out <resolved-plan.json>
 *                            [--source <source.md>] [--library <dir>] [--skills-root <dir>]
 *                            [--runtime-root <ROOT>] [--acknowledge-live-claims]
 *                            [--arc <ARC-ID> [--registry-root <dir>] [--acknowledge-stale-promotion] [--now <ISO-UTC>]]
 *
 * Reads the proposed plan (tasks referencing library profiles by id), runs P-V1…P-V9, P-V11
 * (reserved name; existence with --runtime-root), P-V13 (read-only scan with --runtime-root),
 * P-V15, P-V16 and P-V21…P-V26, embeds the referenced profiles (K2/K3) and writes the canonical
 * resolved plan.json to --out. Deterministic: the same input and library produce the same
 * bytes. Prints the projection fragments (RESOLVER, ARC, PROFILES, TASK PROFILES, VALIDATION) and
 * `projectionHash` = sha256 of the bytes written.
 *
 * --arc <ARC-ID> (B5): the ARC identity originates ONLY from this literal (P-V16; never from a prefix,
 * filename, slug or header; a case variant is refused, never normalized; CORE-STREAM is refused). With
 * it the resolver declares `arcId` in the output, scopes P-V13 to `plans/arcs/<ARC-ID>/current.json` +
 * `arc-claims/<ARC-ID>/` (P-V19 arc-claim integrity), reads `.ai-reports/arcs/<ARC-ID>/arc.json`
 * (P-V17, P-V20 via --registry-root, default <repo>/.ai-reports/arcs) and requires --runtime-root and
 * --source. Without it the behaviour and the output bytes are those of the B1 resolver (legacy stream).
 * --now is the READY-decay clock for P-V17 (default: the current UTC instant; QA passes a fixed value).
 *
 * The ONLY write this script ever performs is --out (created, never overwritten, never under
 * the runtime root). It never touches --in, the library, the skills, the registry or the runtime. It
 * takes no mutex and makes no git call — `--dry-run` in the skill is this script plus the read-only
 * pre-mutex steps of publish-protocol.md.
 *
 * Exit codes: 0 resolved (WARN lock-outs / acknowledged overrides allowed) · 2 REFUSED (>= 1 P-V
 * violation; nothing written) · 3 usage / IO error (bad arguments, unreadable input, missing library
 * or skills root, --out exists or is under the runtime root, --arc without --runtime-root/--source,
 * ARC roots plans/arcs/ + arc-claims/ absent under --runtime-root — owner bootstrap, never created here).
 */

const fs = require('fs');
const path = require('path');
const lib = require('./lib/profile-contract.js');
const identity = require('./lib/runtime-identity.js');

const USAGE = 'usage: resolve-profiles.js --in <proposed-plan.json> --out <resolved-plan.json> [--source <source.md>] [--library <dir>] [--skills-root <dir>] [--runtime-root <ROOT>] [--acknowledge-live-claims] [--arc <ARC-ID> [--registry-root <dir>] [--acknowledge-stale-promotion] [--now <ISO-UTC>]]';
const ISO_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

function die(code, msg) { process.stderr.write(msg + '\n'); process.exit(code); }
function usage(msg) { die(3, 'RESOLVE ERROR - ' + msg + '\n' + USAGE); }

function parseArgs(argv) {
  const o = { acknowledgeLiveClaims: false, acknowledgeStalePromotion: false };
  const takes = { '--in': 'in', '--out': 'out', '--source': 'source', '--library': 'library', '--skills-root': 'skillsRoot', '--runtime-root': 'runtimeRoot', '--arc': 'arc', '--registry-root': 'registryRoot', '--now': 'now' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a in takes) { if (i + 1 >= argv.length) usage(a + ' needs a value'); o[takes[a]] = argv[i + 1]; i += 1; }
    else if (a === '--acknowledge-live-claims') o.acknowledgeLiveClaims = true;
    else if (a === '--acknowledge-stale-promotion') o.acknowledgeStalePromotion = true;
    else if (a === '--help' || a === '-h') { process.stdout.write(USAGE + '\n'); process.exit(0); }
    else usage('unknown argument ' + a);
  }
  return o;
}

function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in) usage('--in is required');
  if (!args.out) usage('--out is required');
  const inPath = path.resolve(args.in);
  const outPath = path.resolve(args.out);
  const libDir = path.resolve(args.library || path.join(__dirname, '..', 'references', 'execution-profiles'));
  const skillsRoot = path.resolve(args.skillsRoot || path.join(__dirname, '..', '..'));
  const runtimeRoot = args.runtimeRoot ? path.resolve(args.runtimeRoot) : null;
  // the ARC literal, exactly as typed: never trimmed, folded or normalized (P-V16 judges it)
  const arc = args.arc === undefined ? null : args.arc;
  const arcValid = arc !== null && identity.isValidArcId(arc) && !lib.RESERVED_RUNTIME_ARC_IDS.includes(arc);
  const registryRoot = path.resolve(args.registryRoot || path.join(__dirname, '..', '..', '..', '..', '.ai-reports', 'arcs'));
  const nowIso = args.now !== undefined ? args.now : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (!fs.existsSync(inPath) || !fs.statSync(inPath).isFile()) usage('--in not found: ' + inPath);
  if (fs.existsSync(outPath)) usage('--out already exists (never overwritten): ' + outPath);
  if (!fs.existsSync(path.dirname(outPath))) usage('--out directory does not exist: ' + path.dirname(outPath));
  if (!fs.existsSync(libDir) || !fs.statSync(libDir).isDirectory()) usage('library directory not found: ' + libDir);
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) usage('skills root not found: ' + skillsRoot);
  if (runtimeRoot) {
    if (!fs.existsSync(runtimeRoot) || !fs.statSync(runtimeRoot).isDirectory()) usage('--runtime-root not found: ' + runtimeRoot);
    for (const d of ['plans', 'claims', 'mutex']) if (!fs.existsSync(path.join(runtimeRoot, d))) usage('--runtime-root incomplete (missing ' + d + '/): ' + runtimeRoot);
    if (isInside(outPath, runtimeRoot)) usage('--out must never be under the runtime root: ' + outPath);
  }
  if (arc !== null) {
    if (!runtimeRoot) usage('--arc requires --runtime-root (P-V13 and P-V19 are evaluated against the selected ARC namespace)');
    if (!args.source) usage('--arc requires --source (P-V17 pins the publication source bytes)');
    if (!ISO_RE.test(String(nowIso))) usage('--now must be an ISO UTC instant (YYYY-MM-DDTHH:MM:SSZ): ' + nowIso);
    // the ARC roots are owner bootstrap (bootstrap.md section 4a): absent => refuse, never create
    if (arcValid) for (const d of ['plans/arcs', 'arc-claims']) if (!fs.existsSync(path.join(runtimeRoot, d)) || !fs.statSync(path.join(runtimeRoot, d)).isDirectory()) usage('--runtime-root has no ' + d + '/ (ARC roots are owner bootstrap, never created by the publisher): ' + runtimeRoot);
  }
  let sourceText = null;
  let sourceBytes = null;
  if (args.source) {
    const sp = path.resolve(args.source);
    if (!fs.existsSync(sp) || !fs.statSync(sp).isFile()) usage('--source not found: ' + sp);
    sourceBytes = fs.readFileSync(sp);
    sourceText = sourceBytes.toString('utf8');
  }

  let plan;
  try { plan = JSON.parse(lib.stripCR(fs.readFileSync(inPath, 'utf8'))); } catch (e) { usage('cannot parse --in as JSON: ' + e.message); }

  const selfHash = lib.sha256(lib.stripCR(fs.readFileSync(__filename, 'utf8')));
  const libHash = lib.sha256(lib.stripCR(fs.readFileSync(path.join(__dirname, 'lib', 'profile-contract.js'), 'utf8')));
  const library = lib.loadLibrary(libDir);
  const out = [];
  out.push('RESOLVER      scripts/resolve-profiles.js ' + selfHash + ' · lib/profile-contract.js ' + libHash + ' · library ' + Object.keys(library.profiles).length + ' profiles');
  out.push('LIBRARY       ' + libDir);
  out.push('SKILLS ROOT   ' + skillsRoot);
  out.push('RUNTIME ROOT  ' + (runtimeRoot || '(none - P-V11 existence and P-V13 not checked here)'));
  out.push('ARC           ' + (arc === null
    ? '(none - legacy stream: pointer plans/current.json, claims root claims/)'
    : arc + '  registry .ai-reports/arcs/' + arc + '/arc.json (root ' + registryRoot + ')  pointer plans/arcs/' + arc + '/current.json  claims root arc-claims/' + arc + '/'));

  const check = lib.planCheck(plan, { library, skillsRoot, sourceText, requireProfiles: true, arcId: arc === null ? undefined : arc });
  let violations = check.violations.slice();
  let warnings = check.warnings.slice();
  const rules = Object.assign({}, check.rules);
  const notes = {};
  const arcRefused = arc !== null && check.violations.some((v) => v.rule === 'P-V16');
  if (runtimeRoot && (arc === null || arcValid) && !arcRefused) {
    const rt = lib.runtimeChecks(runtimeRoot, plan, { acknowledgeLiveClaims: args.acknowledgeLiveClaims, arcId: arc === null ? undefined : arc });
    violations = violations.concat(rt.violations);
    warnings = warnings.concat(rt.warnings);
    if (rules['P-V11'] === 'PASS' && rt.rules['P-V11'] !== 'PASS') rules['P-V11'] = rt.rules['P-V11'];
    rules['P-V13'] = rt.rules['P-V13'];
    if (arc !== null) {
      rules['P-V19'] = rt.rules['P-V19'];
      const reg = lib.registryChecks(registryRoot, plan, { arcId: arc, runtimeRoot, sourceBytes, nowIso, acknowledgeStalePromotion: args.acknowledgeStalePromotion });
      violations = violations.concat(reg.violations);
      warnings = warnings.concat(reg.warnings);
      rules['P-V17'] = reg.rules['P-V17'];
      rules['P-V20'] = reg.rules['P-V20'];
    }
  } else if (!runtimeRoot) {
    notes['P-V13'] = 'NOT CHECKED (no --runtime-root; step 7 of publish-protocol.md is authoritative)';
    if (rules['P-V11'] === 'PASS') rules['P-V11'] = 'PASS (reserved name only; existence checked against the runtime root at publish)';
  }
  if (arc === null) for (const r of ['P-V17', 'P-V19', 'P-V20']) notes[r] = 'N/A (no --arc; legacy stream)';
  else if (arcRefused || !arcValid) for (const r of ['P-V17', 'P-V19', 'P-V20']) notes[r] = 'NOT CHECKED (P-V16 refused the --arc literal)';

  if (violations.length) {
    out.push('');
    out.push(lib.renderValidation(rules, violations, notes));
    warnings.forEach((w) => out.push('  ' + w.message));
    out.push('');
    out.push('RESOLVE REFUSED (' + violations.length + ' violation(s)) - nothing written');
    process.stdout.write(out.join('\n') + '\n');
    process.exit(2);
  }

  const resolved = lib.resolveProfiles(plan, library, arc === null ? undefined : { arcId: arc });
  const bytes = Buffer.from(resolved.text, 'utf8');
  const projectionHash = lib.sha256(bytes);
  out.push('');
  out.push(lib.renderProfilesSection(resolved.plan));
  out.push('');
  out.push(lib.renderTaskProfileLines(plan, library, check.lockouts));
  out.push('');
  out.push(lib.renderValidation(rules, [], notes));
  warnings.forEach((w) => out.push('  ' + w.message));
  out.push('');
  out.push('projectionHash ' + projectionHash);
  try { fs.writeFileSync(outPath, bytes, { flag: 'wx' }); } catch (e) { process.stdout.write(out.join('\n') + '\n'); die(3, 'RESOLVE ERROR - cannot write --out: ' + e.message); }
  out.push('RESOLVE OK -> ' + outPath + ' (' + bytes.length + ' bytes)');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

main();
