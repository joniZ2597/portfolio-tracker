'use strict';

/*
 * qa/lib/git-transcript.js - work/qa-stage2-git-contracts/brief.md §3.2. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * A Git TRANSCRIPT is the ordered list of Git calls one verb of the land tool made in one scenario, recorded against real Git and
 * normalised so it can be replayed by qa/lib/git-fake.js in a different directory:
 *   - absolute paths become role tokens: <slotA> <slotB> <canon> <bare> <fx> <tmp>; each spelling Git or the tool may use is its own
 *     token (forward slash "<canon>", single backslash "<canon:bs>", double backslash "<canon:dbs>");
 *   - 40-hex object ids become <oid:N> in first-seen order, and an abbreviation of a registered id becomes <oidp:N:LEN>;
 *   - the random suffix of the tool's own temporary directories becomes <R>.
 * Nothing here starts a process, reads an environment variable or changes global state; the helpers are pure functions plus
 * load / save of stable JSON.
 *
 * Entry shape (one call):  { argv, cwd, enc, stdin, status, stdout, stderr }
 *   argv   normalised argument list; cwd normalised working directory; enc 'utf8' or 'buffer' (as the caller requested);
 *   stdin  null or the sha256 of the normalised input bytes; status the exit status (number) or null;
 *   stdout / stderr normalised text (for enc 'buffer' the bytes as a latin1 string).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROLE_ORDER = ['slotA', 'slotB', 'canon', 'bare', 'fx', 'tmp']; // children before parents
// A full object id is a run of EXACTLY 40 hex digits (a longer run, e.g. a sha256, is not an object id).
const HEX40 = /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/g;
const RANDOM_DIRS = [/pt-land-hooks-[A-Za-z0-9]{6}/g, /pt-resync-[A-Za-z0-9]{6}/g, /pt-protected-idx-[A-Za-z0-9]{6}/g];
const RANDOM_TOKEN_SUFFIX = '<R>';
const REPLAY_TS = '2026-01-01T00:00:00.000Z'; // what <ts> becomes when a transcript is replayed

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── context: the real paths behind the role tokens ──────────────────────────────────────────
// roles: { slotA, slotB, canon, bare, fx, tmp } (any may be missing). Returns the spelled-out table used by both directions.
function makeContext(roles) {
  const ctx = { roles: {}, spell: {} };
  for (const r of ROLE_ORDER) {
    if (!roles || !roles[r]) continue;
    const fwd = String(roles[r]).replace(/\\/g, '/').replace(/\/+$/, '');
    const back = fwd.replace(/\//g, '\\');
    const dbl = back.replace(/\\/g, '\\\\');
    ctx.roles[r] = fwd;
    ctx.spell[r] = { fwd, back, dbl };
  }
  return ctx;
}

// ── OID state ───────────────────────────────────────────────────────────────────────────────
function syntheticOid(n) {
  return crypto.createHash('sha1').update('ptqa-synthetic-oid-' + n).digest('hex');
}
function newState(seedCount) {
  const state = { oids: new Map(), list: [] };
  for (let n = 1; n <= (seedCount || 0); n += 1) { const o = syntheticOid(n); state.oids.set(o, n); state.list.push(o); }
  return state;
}
function registerOid(state, oid) {
  let n = state.oids.get(oid);
  if (n === undefined) { n = state.list.length + 1; state.oids.set(oid, n); state.list.push(oid); }
  return n;
}

// ── normalise ───────────────────────────────────────────────────────────────────────────────
function pathPass(text, ctx) {
  let out = text;
  for (const r of ROLE_ORDER) {
    const sp = ctx.spell[r];
    if (!sp) continue;
    const forms = [['dbs', sp.dbl], ['bs', sp.back], ['', sp.fwd]];
    for (const [suffix, form] of forms) {
      const re = new RegExp(escapeRe(form) + '(?![A-Za-z0-9_-])', 'gi');
      const token = '<' + r + (suffix ? ':' + suffix : '') + '>';
      out = out.replace(re, () => token);
    }
  }
  for (const re of RANDOM_DIRS) out = out.replace(re, (m) => m.replace(/[A-Za-z0-9]{6}$/, RANDOM_TOKEN_SUFFIX));
  // wall-clock times (audit lines, `now` options) vary from run to run and carry no meaning for a decision
  out = out.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<ts>');
  return out;
}
function scanOids(text, state) {
  const found = text.match(HEX40);
  if (found) for (const o of found) registerOid(state, o);
}
function oidPass(text, state) {
  let out = text.replace(HEX40, (o) => '<oid:' + registerOid(state, o) + '>');
  if (state.list.length) {
    out = out.replace(/(?<![0-9a-f])[0-9a-f]{7,39}(?![0-9a-f])/g, (w) => {
      for (let i = 0; i < state.list.length; i += 1) {
        if (state.list[i].startsWith(w)) return '<oidp:' + (i + 1) + ':' + w.length + '>';
      }
      return w;
    });
  }
  return out;
}
// Normalises any JSON-like value; `state` is shared across every value of one transcript so ids number consistently.
// The pre-scan (scanOids) registers ids in traversal order before the substitution pass.
function normalizeValue(value, ctx, state) {
  const walk = (v, fn) => {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, fn));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k], fn); return o; }
    return v;
  };
  walk(value, (s) => { scanOids(pathPass(s, ctx), state); return s; });
  return walk(value, (s) => oidPass(pathPass(s, ctx), state));
}

// Registers every object id found anywhere in `value` (strings, Buffers, nested arrays and objects), in traversal order, WITHOUT
// changing it. The recorder runs this over a whole scenario first and normalises afterwards, so that normalisation (in particular the
// recognition of an abbreviated id) depends on every id of the scenario and never on how far the recording had got; the replay side
// is seeded with all of them too, and both sides therefore normalise identically.
function prescan(value, ctx, state) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') { scanOids(pathPass(value, ctx), state); return; }
  if (Buffer.isBuffer(value)) { scanOids(pathPass(value.toString('latin1'), ctx), state); return; }
  if (Array.isArray(value)) { value.forEach((v) => prescan(v, ctx, state)); return; }
  if (typeof value === 'object') Object.keys(value).forEach((k) => prescan(value[k], ctx, state));
}

// ── denormalise (replay side) ───────────────────────────────────────────────────────────────
function denormalizeString(text, ctx) {
  let out = text;
  out = out.split('<ts>').join(REPLAY_TS);
  out = out.replace(/<oid:(\d+)>/g, (m, n) => syntheticOid(Number(n)));
  out = out.replace(/<oidp:(\d+):(\d+)>/g, (m, n, len) => syntheticOid(Number(n)).slice(0, Number(len)));
  for (const r of ROLE_ORDER.slice().reverse()) {
    const sp = ctx.spell[r];
    if (!sp) continue;
    out = out.split('<' + r + ':dbs>').join(sp.dbl).split('<' + r + ':bs>').join(sp.back).split('<' + r + '>').join(sp.fwd);
  }
  return out;
}
function denormalizeValue(value, ctx) {
  if (typeof value === 'string') return denormalizeString(value, ctx);
  if (Array.isArray(value)) return value.map((x) => denormalizeValue(x, ctx));
  if (value && typeof value === 'object') { const o = {}; for (const k of Object.keys(value)) o[k] = denormalizeValue(value[k], ctx); return o; }
  return value;
}

// Highest <oid:N> number in a value (used to seed the replay-side state with the same synthetic ids).
function maxOidIndex(value) {
  let max = 0;
  const visit = (v) => {
    if (typeof v === 'string') {
      const re = /<oid(?:p)?:(\d+)/g; let m;
      while ((m = re.exec(v)) !== null) max = Math.max(max, Number(m[1]));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => visit(v[k]));
  };
  visit(value);
  return max;
}

// ── one call ────────────────────────────────────────────────────────────────────────────────
function normalizeBytes(buf, ctx, state) {
  const text = Buffer.from(buf).toString('latin1');
  return oidPass(pathPass(text, ctx), state);
}
function stdinDigest(input, ctx, state) {
  if (input === undefined || input === null) return null;
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return sha256(Buffer.from(normalizeBytes(buf, ctx, state), 'latin1'));
}
function encodingOf(opts) { return opts && opts.encoding === 'buffer' ? 'buffer' : 'utf8'; }

// result: the spawnSync result object. Returns the normalised entry (does not mutate its inputs).
function normalizeCall(file, argv, opts, result, ctx, state) {
  const enc = encodingOf(opts);
  const text = (v) => {
    if (v === undefined || v === null) return '';
    return enc === 'buffer' && Buffer.isBuffer(v) ? v.toString('latin1') : String(v);
  };
  const stdout = text(result && result.stdout);
  const stderr = text(result && result.stderr);
  // pre-register every id of this call in order: argv, stdout, stderr
  // A working directory is a path, not text: its separator style carries no meaning, so it is compared in forward-slash form.
  const entry = normalizeValue({ file: String(file), argv: (argv || []).map(String), cwd: opts && opts.cwd ? String(opts.cwd).replace(/\\/g, '/') : null, stdout, stderr }, ctx, state);
  return {
    file: entry.file === 'git' ? 'git' : entry.file,
    argv: entry.argv,
    cwd: entry.cwd,
    enc,
    stdin: stdinDigest(opts && opts.input, ctx, state),
    status: result && typeof result.status === 'number' ? result.status : null,
    stdout: entry.stdout,
    stderr: entry.stderr
  };
}

// ── file-system inputs ──────────────────────────────────────────────────────────────────────
// A verb also reads real files (approval records, the audit log, lock files, hook directories, a protected manifest, slot work
// files). captureFs records them so the logic suites can re-create them in a skeleton directory:
//   spec: [{ dir, include(relPosix, isDir) -> boolean }]  (a missing dir is skipped; the dir itself is recorded as a directory)
//   entry: { path (normalised), kind: 'dir' | 'file', text | b64 }  (text is normalised like a transcript string, b64 is raw bytes)
const FS_FILE_CAP = 256 * 1024;
// A spec item is { dir, include } (a directory tree) or { file } (one file, e.g. an untracked file the tool hashes). With state === null
// the RAW entries are returned (absolute paths, un-normalised) for the recorder's pre-scan; otherwise they are normalised with `state`.
function captureFs(spec, ctx, state) {
  const entries = [];
  for (const s of spec) {
    if (s.file) {
      if (!fs.existsSync(s.file) || !fs.lstatSync(s.file).isFile()) continue;
      const buf = fs.readFileSync(s.file);
      const asText = buf.toString('utf8');
      entries.push(Buffer.from(asText, 'utf8').equals(buf) ? { path: s.file, kind: 'file', text: asText } : { path: s.file, kind: 'file', b64: buf.toString('base64') });
      continue;
    }
    if (!fs.existsSync(s.dir)) continue;
    entries.push({ path: s.dir, kind: 'dir' });
    (function walk(dir, rel) {
      for (const name of fs.readdirSync(dir).sort()) {
        const abs = path.join(dir, name);
        const r = rel ? rel + '/' + name : name;
        const st = fs.lstatSync(abs);
        if (st.isDirectory()) {
          if (!s.include(r, true)) continue;
          entries.push({ path: abs, kind: 'dir' });
          walk(abs, r);
        } else if (st.isFile()) {
          if (!s.include(r, false)) continue;
          if (st.size > FS_FILE_CAP) throw new Error('captureFs: ' + abs + ' is larger than ' + FS_FILE_CAP + ' bytes');
          const buf = fs.readFileSync(abs);
          const asText = buf.toString('utf8');
          if (Buffer.from(asText, 'utf8').equals(buf)) entries.push({ path: abs, kind: 'file', text: asText });
          else entries.push({ path: abs, kind: 'file', b64: buf.toString('base64') });
        }
      }
    })(s.dir, '');
  }
  return state ? normalizeValue(entries, ctx, state) : entries;
}
function materializeFs(entries, ctx) {
  for (const e of entries || []) {
    const abs = denormalizeString(e.path, ctx);
    if (e.kind === 'dir') { fs.mkdirSync(abs, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (e.b64 !== undefined) fs.writeFileSync(abs, Buffer.from(e.b64, 'base64'));
    else fs.writeFileSync(abs, denormalizeString(e.text, ctx));
  }
}

// ── stable JSON, load, save ─────────────────────────────────────────────────────────────────
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') { const o = {}; for (const k of Object.keys(value).sort()) o[k] = stable(value[k]); return o; }
  return value;
}
function toJson(transcript) { return JSON.stringify(stable(transcript), null, 2) + '\n'; }
// Key order carries no meaning: two values are the same when their key-sorted JSON is.
function sameValue(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function save(file, transcript) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toJson(transcript));
}
function load(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = {
  makeContext, newState, registerOid, syntheticOid, normalizeValue, denormalizeValue, denormalizeString, maxOidIndex,
  normalizeCall, normalizeBytes, stdinDigest, encodingOf, sha256, toJson, sameValue, save, load, captureFs, materializeFs, prescan, ROLE_ORDER
};
