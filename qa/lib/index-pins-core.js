'use strict';

/*
 * qa/lib/index-pins-core.js - work/pin-consolidation/brief.md §2. Test-only helper (qa/lib/ is not auto-discovered).
 *
 * Pure: no file, process or network access. The caller passes the text of index.html; every digest is computed on the
 * LF-normalised text (normalizeText), so a CRLF checkout yields the same map.
 *
 * Map shape (keys sorted, no timestamp):
 *   { schema: 'index-pins/v1', fileSha256, functions: {NAME: sha256}, regions: {NAME: {start, end, occurrence, sha256}}, remainderSha256 }
 *
 * Extraction rule (BRIEF WORDING NOTE). Brief §2 says the extractor brace-matches "with the same rules as the existing
 * extractors (strings, template literals, comments, async prefix included)". The extractors the 13 pinning suites carry
 * today do NOT skip strings, template literals or comments: they match braces character by character, include the
 * `async ` prefix, and, when the braces never close (parseJSON, fetchAnthropicAnalysis carry a literal "{" in a string or
 * prompt text), end at the first column-0 closing brace line ("\n}\n"). The binding statement of the brief is the parity row
 * IP-11 (byte-for-byte equality with those extractors), so this module applies exactly that rule. It adds no string/comment
 * awareness: that would change the span, and so the digest, of every function that has an unbalanced brace in a literal,
 * and the replacement would no longer cover the text the old pins covered. Enumeration differs from the old extractors in
 * one way only: they locate the FIRST textual `function NAME(`; this module enumerates every column-0 declaration (top-level
 * only, nested declarations are never listed) and applies the same span rule from that declaration.
 */

const crypto = require('crypto');

const SCHEMA = 'index-pins/v1';
const DECL_RE = /^(async )?function ([A-Za-z_$][\w$]*)\(/gm;

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function normalizeText(s) { return String(s).replace(/\r\n/g, '\n'); }
function countOf(hay, needle) { return needle ? hay.split(needle).length - 1 : 0; }

// Span of the declaration that begins at `declStart` (the "async " or "function" keyword, column 0); `sigStart` is the index of "function NAME(".
function spanFrom(text, declStart, sigStart) {
  const braceStart = text.indexOf('{', sigStart);
  if (braceStart === -1) return -1;
  let depth = 0;
  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  // braces never close (an unbalanced brace in a string / prompt text): the declaration ends at its column-0 closing brace
  const closeAt = text.indexOf('\n}\n', sigStart);
  return closeAt === -1 ? -1 : closeAt + 2;
}

// Every top-level (column-0) function declaration, in file order. Duplicate names are keyed NAME, NAME#2, NAME#3.
function extractFunctions(text) {
  const out = [];
  const seen = Object.create(null);
  DECL_RE.lastIndex = 0;
  let m;
  const decls = [];
  while ((m = DECL_RE.exec(text)) !== null) {
    decls.push({ name: m[2], start: m.index, sig: m.index + (m[1] ? m[1].length : 0) });
  }
  for (let i = 0; i < decls.length; i += 1) {
    const d = decls[i];
    const end = spanFrom(text, d.start, d.sig);
    if (end === -1) throw new Error('index-pins: cannot find the end of function ' + d.name);
    if (i + 1 < decls.length && end > decls[i + 1].start) {
      throw new Error('index-pins: function ' + d.name + ' overruns the next top-level declaration (' + decls[i + 1].name + ')');
    }
    seen[d.name] = (seen[d.name] || 0) + 1;
    out.push({ key: seen[d.name] === 1 ? d.name : d.name + '#' + seen[d.name], name: d.name, start: d.start, end, text: text.slice(d.start, end) });
  }
  return out;
}

function findDuplicates(text) {
  const counts = Object.create(null);
  for (const f of extractFunctions(text)) counts[f.name] = (counts[f.name] || 0) + 1;
  return Object.keys(counts).filter(n => counts[n] > 1).sort();
}

function sortedObject(o) {
  const r = {};
  for (const k of Object.keys(o).sort()) r[k] = o[k];
  return r;
}

// Resolve the named regions against `text`. Fail closed: an anchor must match exactly once, the end after the start, and a
// region may not straddle a function boundary or overlap another out-of-function region.
function resolveRegions(text, regionDefs, fnSpans) {
  const resolved = {};
  for (const name of Object.keys(regionDefs || {}).sort()) {
    const def = regionDefs[name] || {};
    if (typeof def.start !== 'string' || !def.start || typeof def.end !== 'string' || !def.end) {
      throw new Error('index-pins: region ' + name + ' needs non-empty start and end anchors');
    }
    const ns = countOf(text, def.start);
    if (ns !== 1) throw new Error('index-pins: region ' + name + ' start anchor matches ' + ns + ' time(s), expected exactly 1');
    const ne = countOf(text, def.end);
    if (ne !== 1) throw new Error('index-pins: region ' + name + ' end anchor matches ' + ne + ' time(s), expected exactly 1');
    const s = text.indexOf(def.start);
    const eStart = text.indexOf(def.end);
    const e = eStart + def.end.length;
    if (eStart < s) throw new Error('index-pins: region ' + name + ' ends before it starts');
    const inside = fnSpans.find(f => s >= f.start && e <= f.end);
    const straddle = fnSpans.find(f => !(e <= f.start || s >= f.end) && !(s >= f.start && e <= f.end) && !(s <= f.start && e >= f.end));
    if (straddle) throw new Error('index-pins: region ' + name + ' straddles the boundary of function ' + straddle.key);
    resolved[name] = { name, def, start: s, end: e, inFunction: inside ? inside.key : null };
  }
  const outside = Object.keys(resolved).map(n => resolved[n]).filter(r => !r.inFunction).sort((a, b) => a.start - b.start);
  for (let i = 1; i < outside.length; i += 1) {
    if (outside[i].start < outside[i - 1].end) throw new Error('index-pins: regions ' + outside[i - 1].name + ' and ' + outside[i].name + ' overlap');
  }
  return resolved;
}

// Full computation. `text` must already be LF-normalised (the caller's job: normalizeText).
function buildMapDetailed(text, regionDefs) {
  const fns = extractFunctions(text);
  const regions = resolveRegions(text, regionDefs, fns);
  const functions = {};
  const functionTexts = {};
  for (const f of fns) { functions[f.key] = sha256(f.text); functionTexts[f.key] = f.text; }
  const regionOut = {};
  const regionTexts = {};
  for (const name of Object.keys(regions)) {
    const r = regions[name];
    const body = text.slice(r.start, r.end);
    regionOut[name] = { start: r.def.start, end: r.def.end, occurrence: r.def.occurrence === undefined ? 1 : r.def.occurrence, sha256: sha256(body) };
    regionTexts[name] = body;
  }
  // remainder: every function span and every out-of-function region replaced by a fixed placeholder
  // (a region may span whole functions: it masks its entire span and those functions keep their own entries; a partial
  // overlap with a function is rejected in resolveRegions)
  const regionMasks = Object.keys(regions).map(n => regions[n]).filter(r => !r.inFunction).map(r => ({ start: r.start, end: r.end, label: 'regions.' + r.name }));
  const masks = fns.filter(f => !regionMasks.some(r => f.start >= r.start && f.end <= r.end)).map(f => ({ start: f.start, end: f.end, label: 'functions.' + f.key }))
    .concat(regionMasks)
    .sort((a, b) => a.start - b.start);
  let rem = '';
  let pos = 0;
  for (const mk of masks) {
    rem += text.slice(pos, mk.start) + '\u0000' + mk.label + '\u0000';
    pos = mk.end;
  }
  rem += text.slice(pos);
  const map = {
    schema: SCHEMA,
    fileSha256: sha256(text),
    functions: sortedObject(functions),
    regions: sortedObject(regionOut),
    remainderSha256: sha256(rem)
  };
  return { map, texts: { functions: functionTexts, regions: regionTexts, remainder: rem } };
}

function buildMap(text, regionDefs) { return buildMapDetailed(text, regionDefs).map; }

// Entry-level comparison. Entry names: functions.NAME, regions.NAME, remainder. fileSha256 is reported separately.
function compareMaps(a, b) {
  const flat = m => {
    const e = {};
    for (const k of Object.keys(m.functions || {})) e['functions.' + k] = m.functions[k];
    for (const k of Object.keys(m.regions || {})) {
      const r = m.regions[k];
      e['regions.' + k] = r.sha256 + '|' + r.start + '|' + r.end + '|' + r.occurrence;
    }
    e.remainder = m.remainderSha256;
    return e;
  };
  const fa = flat(a);
  const fb = flat(b);
  const changed = Object.keys(fa).filter(k => k in fb && fa[k] !== fb[k]).sort();
  const removed = Object.keys(fa).filter(k => !(k in fb)).sort();
  const added = Object.keys(fb).filter(k => !(k in fa)).sort();
  const fileChanged = a.fileSha256 !== b.fileSha256;
  return { ok: !changed.length && !removed.length && !added.length && !fileChanged, changed, added, removed, fileChanged };
}

// Suite-side helper (pin consolidation): the entries of `names` (functions.NAME / regions.NAME / remainder) that differ between
// the committed map and the map computed from `text` (LF-normalised). A map that cannot be computed fails closed: every
// requested name is reported. Memoised on the last (text, regions) pair so a suite's many checks compute the map once.
let lastCall = { text: null, regionsJson: null, map: null, error: null };
function entryMismatches(text, committedMap, names) {
  const regionsJson = JSON.stringify((committedMap && committedMap.regions) || {});
  if (lastCall.text !== text || lastCall.regionsJson !== regionsJson) {
    lastCall = { text, regionsJson, map: null, error: null };
    try { lastCall.map = buildMap(text, (committedMap && committedMap.regions) || {}); } catch (e) { lastCall.error = e; }
  }
  if (lastCall.error) return names.slice();
  const flat = m => {
    const e = {};
    for (const k of Object.keys(m.functions || {})) e['functions.' + k] = m.functions[k];
    for (const k of Object.keys(m.regions || {})) e['regions.' + k] = m.regions[k].sha256;
    e.remainder = m.remainderSha256;
    return e;
  };
  const want = flat(committedMap);
  const got = flat(lastCall.map);
  return names.filter(n => !(n in want) || !(n in got) || want[n] !== got[n]);
}
// Every entry name of the committed map except `excluded` (used where an old pin hashed "the file minus some functions").
function entryNamesExcept(committedMap, excluded) {
  const skip = new Set(excluded || []);
  const all = Object.keys(committedMap.functions || {}).map(k => 'functions.' + k)
    .concat(Object.keys(committedMap.regions || {}).map(k => 'regions.' + k), ['remainder']);
  return all.filter(n => !skip.has(n));
}

module.exports = { SCHEMA, sha256, normalizeText, extractFunctions, findDuplicates, buildMap, buildMapDetailed, compareMaps, entryMismatches, entryNamesExcept };
