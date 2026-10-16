'use strict';

/**
 * services/evidence-memory.js
 *
 * evidence-memory-1 S1 (rev 2) - local research memory (Owner ruling R-3, 2026-10-16).
 *
 * Stores structured per-ticker research snapshots and source metadata in local browser storage, keeps
 * them for a retention window (default 90 days) and exports them as one JSON document.
 *
 * Privacy (R-3): only an explicit allowlist can be stored. Labels, verbs, ratings, freshness and dates
 * are closed vocabularies or strict patterns; the only free text is a parsed research item (catalyst,
 * earnings, guidance, contracts, peer move) or a source title, each a single line within a hard length
 * limit - a longer value is dropped and counted, never truncated into storage. URLs keep scheme, a
 * validated public host name and a validated path; anything else is dropped.
 *
 * One rule set: `sanitizeBody` both builds a snapshot body and validates a stored one (a stored body is
 * valid only if sanitizing it changes nothing). `contentHash` is an integrity / dedup checksum, not
 * authentication: a record is trusted for its structure, never for its hash.
 *
 * Not wired into the app. No network, no DOM, no cookies, no web storage other than the IndexedDB backend.
 * The clock is injected. Every public function and method returns or resolves; none throws or rejects.
 *
 * Storage goes through a replaceable backend contract (four async methods), so a future server backend can
 * implement the same contract. No server backend, sync, accounts or authentication here.
 */

var SNAPSHOT_SCHEMA = 'pulse.evidence-snapshot/v1';
var EXPORT_FORMAT = 'pulse.evidence-memory-export/v1';
var DAY_MS = 86400000;

// Ruled / default values. Changing DEFAULT_RETENTION_DAYS is an Owner ruling (R-3 = 90 days).
var DEFAULT_RETENTION_DAYS = 90;
var LIMITS = {
  textChars: 300,        // one parsed research item (catalyst, earnings, guidance, contracts, peer move)
  titleChars: 160,       // one source title
  firmChars: 40,         // one analyst firm name
  pathChars: 300,        // URL path
  listItems: 10,         // items kept per catalyst list
  actions: 10,           // analyst actions kept per list
  sources: 8,            // sources kept per snapshot
  perTickerPerDay: 10,   // snapshots kept per ticker per UTC day (newest kept)
  totalSnapshots: 20000, // global cap (newest kept)
  futureSkewMs: DAY_MS   // a capturedAt further in the future than this is refused
};

// ---------- closed vocabularies (the app's own contracts; anything else is dropped) ----------

var ACTIONS = ['hold_wait', 'add_on_pullback', 'add_on_reclaim', 'add_on_breakout', 'trim', 'avoid', 'hold'];
var SETUPS = ['extended_near_ath', 'healthy_uptrend_near_ath', 'healthy_uptrend', 'pullback_in_uptrend',
  'support_test', 'breakdown_risk', 'below_key_mas', 'unknown'];
var SENTIMENTS = ['positive', 'negative', 'neutral'];
var DIRECTIONS = ['bullish', 'bearish', 'mixed'];
var REVISION = ['upgrading', 'downgrading', 'mixed', 'stable'];
var FRESHNESS = ['today', 'this week', 'this month'];
var VERBS = ['raised', 'cut', 'lowered', 'trimmed', 'reduced', 'boosted', 'hiked', 'set', 'upgraded', 'downgraded',
  'reiterated', 'reaffirmed', 'maintained', 'initiated', 'started', 'launched', 'reinstated', 'resumed'];
var RATINGS = ['Strong Buy', 'Strong Sell', 'Buy', 'Outperform', 'Overweight', 'Accumulate', 'Add', 'Positive', 'Hold',
  'Neutral', 'Equal Weight', 'Market Perform', 'Sector Perform', 'Peer Perform', 'In Line', 'Market Weight', 'Sector Weight',
  'Underperform', 'Underweight', 'Reduce', 'Sell', 'Negative'];
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- primitives (pure; none throws) ----------

var TICKER_RE = /^[A-Z]{1,10}(?:[.\-][A-Z0-9]{1,3})?$/;
var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
var BAD_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;
var FIRM_RE = /^[A-Za-z0-9][A-Za-z0-9&.,' \-]{0,39}$/;
var REPORTED_DATE_RE = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? ([1-9]|[12]\d|3[01])(?:, (20\d\d))?$/;

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function inList(v, list) { return typeof v === 'string' && list.indexOf(v) !== -1 ? v : null; }

// One line of text, no control / zero-width / bidi characters, within `max`; otherwise null (never truncated).
function oneLine(v, max) {
  if (typeof v !== 'string') return null;
  var s = v.replace(/[ \t]+/g, ' ').trim();
  if (!s || s.length > max || BAD_CHARS_RE.test(s)) return null;
  return s;
}

function finiteNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

function normalizeTicker(v) {
  if (typeof v !== 'string') return null;
  var t = v.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

// Strict UTC ISO timestamp -> milliseconds, or null. Every component is range-checked; nothing is normalised.
function parseIso(v) {
  if (typeof v !== 'string') return null;
  var m = ISO_RE.exec(v);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +m[6];
  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  var ms = Date.UTC(y, mo - 1, d, h, mi, s, m[7] ? +(m[7] + '00').slice(0, 3) : 0);
  var dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

function isoOf(ms) { return new Date(ms).toISOString(); }

// A calendar date "YYYY-MM-DD" that exists, or null.
function isoDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return parseIso(v + 'T00:00:00Z') === null ? null : v;
}

// A date as reported in research text ("October 14", "Oct 2, 2026"); the day must exist in that month.
function reportedDate(v) {
  if (typeof v !== 'string') return null;
  var m = REPORTED_DATE_RE.exec(v.trim());
  if (!m) return null;
  var mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
  var y = m[3] ? +m[3] : 2024; // leap year when no year is given, so Feb 29 is allowed
  var dt = new Date(Date.UTC(y, mo - 1, +m[2]));
  return dt.getUTCMonth() === mo - 1 ? v.trim() : null;
}

// The reported date inside an analyst item, e.g. "(October 14)". Only the date leaves this function.
function dateInItem(raw) {
  if (typeof raw !== 'string') return null;
  var m = /\(([A-Za-z]{3,9}\.? \d{1,2}(?:, \d{4})?)\)/.exec(raw);
  return m ? reportedDate(m[1]) : null;
}

// Public host name only: 2+ labels, letters / digits / hyphens, a letter TLD; no IP literal, no localhost,
// no port other than the scheme default.
function cleanHost(h, scheme) {
  var m = /^([a-z0-9.\-]+)(?::(\d{1,5}))?$/.exec(h);
  if (!m) return null;
  if (m[2] !== undefined && !((scheme === 'https' && m[2] === '443') || (scheme === 'http' && m[2] === '80'))) return null;
  var host = m[1];
  if (host.length > 253) return null;
  var labels = host.split('.');
  if (labels.length < 2) return null;
  for (var i = 0; i < labels.length; i++) {
    if (!/^[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?$/.test(labels[i])) return null;
  }
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9\-]{2,59})$/.test(labels[labels.length - 1])) return null;
  return host;
}

// A path segment that may be kept: unreserved characters and valid percent-escapes only, and nothing that
// looks like a credential (a long unbroken token, a known key prefix, a JWT).
var SECRET_WORDS_RE = /apikey|secret|token|passw/;

function safeSegment(seg) {
  if (seg.length > 120) return false;
  if (!/^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*$/.test(seg)) return false;
  var dec;
  try { dec = decodeURIComponent(seg); } catch (e) { return false; }
  // Every content rule reads the decoded segment, so percent-encoding cannot hide a dot segment or split a token.
  if (BAD_CHARS_RE.test(dec) || dec === '.' || dec === '..') return false;
  if (/[A-Za-z0-9]{32,}/.test(dec)) return false;
  if (/^(?:sk|pk|rk)[_-]|^(?:AKIA|ASIA)[A-Z0-9]{12,}|^gh[pousr]_|^xox[abprs]-|^eyJ[A-Za-z0-9_\-]+\./i.test(dec)) return false;
  return true;
}

// Source URL -> "https://host/path" (http(s); lower-case scheme and host; query and fragment removed).
// Any invalid part makes the whole URL null (the source is then dropped).
function cleanUrl(v) {
  if (typeof v !== 'string' || v.length > 2048 || /\s/.test(v)) return null;
  var m = /^([A-Za-z][A-Za-z0-9+.\-]*):\/\/([^\/?#]*)([^?#]*)/.exec(v);
  if (!m) return null;
  var scheme = m[1].toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') return null;
  if (m[2].indexOf('@') !== -1) return null;
  var host = cleanHost(m[2].toLowerCase(), scheme);
  if (!host) return null;
  var path = m[3] || '/';
  if (path.length > LIMITS.pathChars || path.charAt(0) !== '/') return null;
  var segs = path.split('/').slice(1);
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] === '.' || segs[i] === '..' || (segs[i] !== '' && !safeSegment(segs[i]))) return null;
  }
  // Secret words are matched on the whole decoded path with every separator removed, so no spelling,
  // encoding or segment split ("api key", "api%2Fkey", "/api/key", "pass-word") can carry one through.
  var flat;
  try { flat = decodeURIComponent(path).toLowerCase().replace(/[^a-z0-9]/g, ''); } catch (e) { return null; }
  if (SECRET_WORDS_RE.test(flat)) return null;
  return scheme + '://' + host + path;
}

function leadToken(v, list) {
  if (typeof v !== 'string') return null;
  var s = v.toLowerCase().replace(/\[\d+\]/g, ' ').trim();
  for (var i = 0; i < list.length; i++) {
    if (s === list[i] || s.indexOf(list[i] + ' ') === 0 || s.indexOf(list[i] + '\u2014') === 0 || s.indexOf(list[i] + ' \u2014') === 0) return list[i];
  }
  return null;
}

// FNV-1a-style 64-bit checksum (two 32-bit lanes) -> 16 hex chars. Integrity / dedup only, not a security hash.
function fnv64(str) {
  var h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 ^= (h1 >>> 7); h2 = h2 >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

// Canonical JSON: own keys sorted, arrays in order.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

// Strict structural equality (types, key sets, values). Unlike canonical JSON it tells NaN, undefined and
// non-JSON values apart from null, so a stored record cannot pass by serialising like a valid one.
function same(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join('\u0000') !== kb.join('\u0000')) return false;
  for (var j = 0; j < ka.length; j++) if (!same(a[ka[j]], b[ka[j]])) return false;
  return true;
}

// ---------- the single rule set: stored-form body -> sanitized body ----------
// Used to BUILD (after mapping the parser's field names) and to VALIDATE (a stored body must be a fixed point).

function sanAction(a, withTarget) {
  if (!isObj(a)) return null;
  var firm = oneLine(a.firm, LIMITS.firmChars);
  if (!firm || !FIRM_RE.test(firm) || firm.split(' ').length > 6) return null;
  var r = {
    firm: firm,
    action: inList(a.action, VERBS),
    ratingAction: inList(a.ratingAction, VERBS),
    rating: inList(a.rating, RATINGS),
    date: reportedDate(a.date)
  };
  if (withTarget) {
    var t = finiteNum(a.target), f = finiteNum(a.targetFrom);
    r.target = (t !== null && t > 0 && t < 1e7) ? t : null;
    r.targetFrom = (f !== null && f > 0 && f < 1e7) ? f : null;
    r.targetAction = inList(a.targetAction, VERBS);
  }
  return r;
}

function sanList(arr, max, fn, counter) {
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length; i++) {
    var v = fn(arr[i]);
    if (v === null) { counter.n += 1; continue; }
    if (out.length < max) out.push(v); else counter.n += 1;
  }
  return out;
}

// A free-text value that was supplied but cannot be kept is dropped and counted, never truncated.
function keepText(v, max, c) {
  var t = oneLine(v, max);
  if (t === null && v !== null && v !== undefined && v !== '') c.n++;
  return t;
}

function sanSource(s, c) {
  if (!isObj(s)) return null;
  var url = cleanUrl(s.url);
  if (!url) return null;
  return { url: url, domain: url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), title: keepText(s.title, LIMITS.titleChars, c), date: isoDay(s.date) || reportedDate(s.date) };
}

// Returns { body, dropped } where body has exactly the v1 keys.
function sanitizeBody(b) {
  var src = isObj(b) ? b : {};
  var r = isObj(src.research) ? src.research : {};
  var a = isObj(src.assessment) ? src.assessment : {};
  var mk = isObj(src.market) ? src.market : {};
  var c = { n: 0 };
  var text = function (v) { return oneLine(v, LIMITS.textChars); };            // list items: sanList counts drops
  var scalar = function (v) { return keepText(v, LIMITS.textChars, c); };   // single fields: counted here
  var price = finiteNum(mk.price);
  var score = finiteNum(a.sentimentScore);
  var seen = {};
  var sources = sanList(src.sources, LIMITS.sources, function (s) {
    var x = sanSource(s, c);
    if (!x || seen[x.url]) return null;
    seen[x.url] = true;
    return x;
  }, c);
  var research = {
    unavailable: r.unavailable === true,
    allNone: r.allNone === true,
    analystActions: sanList(r.analystActions, LIMITS.actions, function (x) { return sanAction(x, true); }, c),
    ratingOnlyActions: sanList(r.ratingOnlyActions, LIMITS.actions, function (x) { return sanAction(x, false); }, c),
    bullish: sanList(r.bullish, LIMITS.listItems, text, c),
    bearish: sanList(r.bearish, LIMITS.listItems, text, c),
    macro: sanList(r.macro, LIMITS.listItems, text, c),
    earnings: scalar(r.earnings),
    guidance: scalar(r.guidance),
    contracts: scalar(r.contracts),
    peerMove: scalar(r.peerMove),
    revisionDirection: inList(r.revisionDirection, REVISION),
    revisionRecency: reportedDate(r.revisionRecency),
    dataFreshness: inList(r.dataFreshness, FRESHNESS)
  };
  var body = {
    research: research,
    assessment: {
      action: inList(a.action, ACTIONS),
      technicalSetup: inList(a.technicalSetup, SETUPS),
      sentiment: inList(a.sentiment, SENTIMENTS),
      sentimentScore: (score !== null && score >= 0 && score <= 100) ? score : null,
      catalystDirection: inList(a.catalystDirection, DIRECTIONS)
    },
    market: {
      price: (price !== null && price > 0 && price < 1e9) ? price : null,
      currency: (typeof mk.currency === 'string' && /^[A-Z]{3}$/.test(mk.currency)) ? mk.currency : null
    },
    sources: sources
  };
  return { body: body, dropped: c.n };
}

// Map one ticker's parsePerplexityContext result and the scan's labels into stored-form field names.
// Parser-specific text is reduced here (leading vocabulary tokens; the analyst item's date) before sanitizing.
function mapInput(input) {
  var r = isObj(input.research) ? input.research : {};
  var a = isObj(input.assessment) ? input.assessment : {};
  var mapAct = function (x) {
    return isObj(x) ? { firm: x.bank, action: x.action, ratingAction: x.ratingAction, rating: x.rating, date: dateInItem(x.raw),
      target: x.target, targetFrom: x.ptFrom, targetAction: x.ptAction } : x;
  };
  var none = function (v) { return (typeof v === 'string' && /^(?:none|n\/a|unknown)\b/i.test(v.trim())) ? null : v; };
  return {
    research: {
      unavailable: r._unavailable === true,
      allNone: r._allNone === true,
      analystActions: Array.isArray(r.analystActions) ? r.analystActions.map(mapAct) : [],
      ratingOnlyActions: Array.isArray(r.ratingOnlyActions) ? r.ratingOnlyActions.map(mapAct) : [],
      bullish: r.bullishCatalysts, bearish: r.bearishCatalysts, macro: r.macroDrivers,
      earnings: none(r.earnings), guidance: none(r.guidance), contracts: none(r.contracts), peerMove: none(r.peerMove),
      revisionDirection: leadToken(r.revisionDirection, REVISION),
      revisionRecency: typeof r.revisionRecency === 'string' ? r.revisionRecency.replace(/\[\d+\]/g, '').trim() : null,
      dataFreshness: leadToken(r.dataFreshness, FRESHNESS)
    },
    assessment: { action: a.action, technicalSetup: a.technicalSetup, sentiment: a.sentiment, sentimentScore: a.sentimentScore, catalystDirection: a.catalystDirection },
    market: input.market,
    sources: r.sources
  };
}

var TOP_KEYS = ['assessment', 'capturedAt', 'contentHash', 'day', 'id', 'market', 'research', 'schema', 'sources', 'ticker'];

function finish(ticker, ms, body) {
  var contentHash = fnv64(canon(body));
  var capturedAt = isoOf(ms);
  return {
    schema: SNAPSHOT_SCHEMA,
    id: ticker + '|' + capturedAt + '|' + contentHash,
    ticker: ticker,
    capturedAt: capturedAt,
    day: capturedAt.slice(0, 10),
    contentHash: contentHash,
    research: body.research,
    assessment: body.assessment,
    market: body.market,
    sources: body.sources
  };
}

// Build a snapshot from capture input { ticker, capturedAt, research, assessment?, market? }.
// Returns { ok: true, snapshot, dropped } or { ok: false, reason }. Never throws.
function buildSnapshot(input) {
  try {
    if (!isObj(input)) return { ok: false, reason: 'INVALID_INPUT' };
    var ticker = normalizeTicker(input.ticker);
    if (!ticker) return { ok: false, reason: 'INVALID_TICKER' };
    var ms = parseIso(input.capturedAt);
    if (ms === null) return { ok: false, reason: 'INVALID_CAPTURED_AT' };
    if (!isObj(input.research)) return { ok: false, reason: 'NO_RESEARCH' };
    var s = sanitizeBody(mapInput(input));
    return { ok: true, snapshot: finish(ticker, ms, s.body), dropped: s.dropped };
  } catch (e) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
}

// A stored record is valid only if it has exactly the v1 keys, a strict ticker / time, and a body that the
// rule set leaves unchanged, with id / day / checksum consistent. Never throws.
function validateSnapshot(s) {
  try {
    if (!isObj(s) || Object.keys(s).sort().join(',') !== TOP_KEYS.join(',') || s.schema !== SNAPSHOT_SCHEMA) return false;
    if (normalizeTicker(s.ticker) !== s.ticker) return false;
    var ms = parseIso(s.capturedAt);
    if (ms === null || isoOf(ms) !== s.capturedAt) return false;
    var body = { research: s.research, assessment: s.assessment, market: s.market, sources: s.sources };
    var san = sanitizeBody(body);
    if (san.dropped !== 0 || !same(san.body, body)) return false;
    return same(finish(s.ticker, ms, san.body), s);
  } catch (e) {
    return false;
  }
}

function keyOf(s) { return 'snap:' + s.ticker + ':' + s.capturedAt + ':' + s.contentHash; }

// Key -> { key, ticker, capturedAt, ms, day, hash } or null. Retention, caps and "unchanged" are decided from keys
// alone, so a put reads no stored values.
var KEY_RE = /^snap:([A-Z0-9.\-]{1,14}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):([0-9a-f]{16})$/;
function parseKey(k) {
  var m = typeof k === 'string' ? KEY_RE.exec(k) : null;
  if (!m || normalizeTicker(m[1]) !== m[1]) return null;
  var ms = parseIso(m[2]);
  if (ms === null || isoOf(ms) !== m[2]) return null;
  return { key: k, ticker: m[1], capturedAt: m[2], ms: ms, day: m[2].slice(0, 10), hash: m[3] };
}
function byTime(x, y) { return x.ms - y.ms || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0); }

// ---------- backends (the replaceable storage contract) ----------
// contract: get(key) -> value | undefined \u00b7 put(key, value) \u00b7 del(key) \u00b7 keys() -> string[]; all return Promises.
// Atomicity is per call only; see the brief \u00a72.2 for what this means for caps under concurrent writers.

function memoryBackend() {
  var m = {};
  // Backend contract: operations never throw synchronously; a failure is a rejected promise.
  var op = function (f) { return function (k, v) { try { return Promise.resolve(f(String(k), v)); } catch (e) { return Promise.reject(e); } }; };
  return {
    kind: 'memory',
    get: op(function (k) { return own(m, k) ? JSON.parse(m[k]) : undefined; }),
    put: op(function (k, v) { var j = JSON.stringify(v); if (typeof j !== 'string') throw new Error('UNSERIALIZABLE'); m[k] = j; }),
    del: op(function (k) { delete m[k]; }),
    keys: op(function () { return Object.keys(m); })
  };
}

// IndexedDB backend (browser). `idb` is the IndexedDB factory (injected in tests; defaults to the browser's).
// One database, one object store "kv" with out-of-line keys. A database that exists without the store is
// upgraded to the next version to create it; a blocked upgrade or open failure rejects (and is contained by
// the memory). Each operation is one transaction; it settles once, on complete, error or abort.
function indexedDbBackend(opts) {
  try { return buildIndexedDbBackend(opts); } catch (e) { return unavailableBackend(); }
}

function buildIndexedDbBackend(opts) {
  var o = opts || {};
  var idb = own(o, 'idb') ? o.idb : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  var dbName = typeof o.dbName === 'string' && o.dbName ? o.dbName : 'pulse-evidence-memory';
  var storeName = 'kv';
  var dbp = null;
  function openAt(version) {
    // Settles once. A connection that arrives after the promise has already settled (e.g. success after
    // `blocked` was reported) has no owner, so it is closed at once: every opened connection is either
    // returned to db() or closed.
    return new Promise(function (resolve, reject) {
      var settled = false;
      var req = version === undefined ? idb.open(dbName) : idb.open(dbName, version);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(storeName)) d.createObjectStore(storeName);
      };
      req.onblocked = function () { if (!settled) { settled = true; reject(new Error('INDEXEDDB_BLOCKED')); } };
      req.onsuccess = function () {
        var d = req.result;
        if (settled) { try { d.close(); } catch (e) { /* already closed */ } return; }
        settled = true; resolve(d);
      };
      req.onerror = function () { if (!settled) { settled = true; reject(req.error || new Error('INDEXEDDB_OPEN_FAILED')); } };
    });
  }
  function db() {
    if (!idb || typeof idb.open !== 'function') return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (!dbp) {
      dbp = openAt(undefined).then(function (d) {
        if (d.objectStoreNames.contains(storeName)) return d;
        var next = d.version + 1;
        d.close();
        return openAt(next);
      }).then(function (d) {
        d.onversionchange = function () { d.close(); dbp = null; };
        return d;
      });
      dbp.then(null, function () { dbp = null; });
    }
    return dbp;
  }
  function run(mode, fn) {
    // new Promise turns a synchronous throw (e.g. a hostile `idb`) into a rejection: backend ops never throw.
    return new Promise(function (r) { r(db()); }).then(function (d) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var done = function (f, v) { if (!settled) { settled = true; f(v); } };
        var tx = d.transaction(storeName, mode);
        var req = fn(tx.objectStore(storeName));
        var result;
        req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { done(resolve, result); };
        tx.onerror = function () { done(reject, tx.error || req.error || new Error('INDEXEDDB_TX_FAILED')); };
        tx.onabort = function () { done(reject, tx.error || new Error('INDEXEDDB_TX_ABORTED')); };
      });
    });
  }
  return {
    kind: 'indexeddb',
    get: function (k) { return run('readonly', function (s) { return s.get(k); }); },
    put: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }).then(function () {}); },
    del: function (k) { return run('readwrite', function (s) { return s.delete(k); }).then(function () {}); },
    keys: function () { return run('readonly', function (s) { return s.getAllKeys(); }).then(function (ks) { return Array.isArray(ks) ? ks.map(String) : []; }); }
  };
}

// ---------- the memory ----------

// Run a public operation so that it can neither throw synchronously nor reject: any failure becomes `fallback`.
function contained(fn, fallback) {
  try {
    return Promise.resolve(fn()).then(null, function () { return fallback(); });
  } catch (e) {
    return Promise.resolve(fallback());
  }
}

// A backend whose every operation rejects. Used when a factory gets unusable options, so the public
// factories never throw: the instance they return fails closed through the normal contained paths.
function unavailableBackend() {
  var fail = function () { return Promise.reject(new Error('BACKEND_UNAVAILABLE')); };
  return { kind: 'unavailable', get: fail, put: fail, del: fail, keys: fail };
}

function createEvidenceMemory(opts) {
  try { return buildMemory(opts); } catch (e) { return buildMemory({ backend: unavailableBackend() }); }
}

function buildMemory(opts) {
  var o = opts || {};
  var backend = o.backend;
  if (!backend || typeof backend.get !== 'function' || typeof backend.put !== 'function' ||
      typeof backend.del !== 'function' || typeof backend.keys !== 'function') {
    throw new Error('evidence-memory: a backend with get / put / del / keys is required');
  }
  var retentionDays = (typeof o.retentionDays === 'number' && isFinite(o.retentionDays) && o.retentionDays >= 1)
    ? Math.floor(o.retentionDays) : DEFAULT_RETENTION_DAYS;
  var clock = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
  var limits = {};
  Object.keys(LIMITS).forEach(function (k) { limits[k] = LIMITS[k]; });
  if (isObj(o.limits)) {
    ['perTickerPerDay', 'totalSnapshots'].forEach(function (k) {
      if (typeof o.limits[k] === 'number' && isFinite(o.limits[k]) && o.limits[k] >= 1) limits[k] = Math.floor(o.limits[k]);
    });
  }

  // The injected clock must give a finite number; otherwise the operation fails closed.
  function now() {
    var t = clock();
    if (typeof t !== 'number' || !isFinite(t)) throw new Error('CLOCK_ERROR');
    return t;
  }
  function cutoffMs() { return now() - retentionDays * DAY_MS; }

  // Snapshot keys, parsed and sorted oldest first. Foreign or malformed keys are ignored, never deleted.
  function snapKeys() {
    return Promise.resolve(backend.keys()).then(function (ks) {
      if (!Array.isArray(ks)) throw new Error('BACKEND_KEYS_INVALID');
      var out = [];
      ks.forEach(function (k) { var p = parseKey(k); if (p) out.push(p); });
      return out.sort(byTime);
    });
  }

  // Read values; a record is used only if it is a valid v1 snapshot that matches its key. Others are counted.
  function readValid(parsed) {
    return Promise.all(parsed.map(function (p) {
      return Promise.resolve().then(function () { return backend.get(p.key); }).then(function (v) { return { p: p, v: v }; }, function () { return { p: p, v: null }; });
    })).then(function (rows) {
      var valid = [], invalid = 0;
      rows.forEach(function (r) { if (validateSnapshot(r.v) && keyOf(r.v) === r.p.key) valid.push(r.v); else invalid += 1; });
      return { valid: valid, invalid: invalid };
    });
  }

  function delAll(keys) { return Promise.all(keys.map(function (k) { return backend.del(k); })); }

  function prune() {
    return contained(function () {
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var drop = ps.filter(function (p) { return p.ms < cut; }).map(function (p) { return p.key; });
        return delAll(drop).then(function () { return { ok: true, removed: drop.length }; });
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR', removed: 0 }; });
  }

  function put(input) {
    var built = buildSnapshot(input);
    if (!built.ok) return Promise.resolve({ stored: false, reason: built.reason });
    var s = built.snapshot;
    var t;
    try { t = now(); } catch (e) { return Promise.resolve({ stored: false, reason: 'CLOCK_ERROR', id: s.id }); }
    var ms = parseIso(s.capturedAt);
    var cut = t - retentionDays * DAY_MS;
    if (ms < cut) return Promise.resolve({ stored: false, reason: 'EXPIRED', id: s.id });
    if (ms > t + limits.futureSkewMs) return Promise.resolve({ stored: false, reason: 'FUTURE', id: s.id });
    var k = keyOf(s);
    return contained(function () {
      return snapKeys().then(function (ps) {
        var expired = ps.filter(function (p) { return p.ms < cut; }).map(function (p) { return p.key; });
        var live = ps.filter(function (p) { return p.ms >= cut; });
        var mine = live.filter(function (p) { return p.ticker === s.ticker; });
        var cleanup = function (result) { return delAll(expired).then(function () { return result; }); };
        // Same ticker and capturedAt: identical content is a no-op; different content replaces it (if stored).
        var sameTime = mine.filter(function (p) { return p.ms === ms; });
        if (sameTime.some(function (p) { return p.hash === s.contentHash; })) return cleanup({ stored: false, reason: 'UNCHANGED', id: s.id });
        var others = mine.filter(function (p) { return p.ms !== ms; });
        var prev = others.filter(function (p) { return p.ms < ms; }).pop() || null;
        if (prev && prev.hash === s.contentHash) return cleanup({ stored: false, reason: 'UNCHANGED', id: prev.ticker + '|' + prev.capturedAt + '|' + prev.hash });
        // Caps are decided before anything is deleted; a refused snapshot never removes an existing record.
        var dayList = others.filter(function (p) { return p.day === s.day; }).concat([{ key: k, ms: ms, isNew: true }]).sort(byTime);
        var dayOver = dayList.slice(0, Math.max(0, dayList.length - limits.perTickerPerDay));
        if (dayOver.some(function (p) { return p.isNew; })) return cleanup({ stored: false, reason: 'DAY_CAP', id: s.id });
        var replaced = sameTime.map(function (p) { return p.key; });
        var gone = replaced.concat(dayOver.map(function (p) { return p.key; }));
        var rest = live.filter(function (p) { return gone.indexOf(p.key) === -1; }).concat([{ key: k, ms: ms, isNew: true }]).sort(byTime);
        var totalOver = rest.slice(0, Math.max(0, rest.length - limits.totalSnapshots));
        if (totalOver.some(function (p) { return p.isNew; })) return cleanup({ stored: false, reason: 'TOTAL_CAP', id: s.id });
        gone = gone.concat(totalOver.map(function (p) { return p.key; }));
        // Write first, then delete: a failed write leaves the existing records in place.
        return Promise.resolve(backend.put(k, s)).then(function () {
          return delAll(gone.concat(expired));
        }).then(function () {
          return { stored: true, reason: replaced.length ? 'REPLACED' : 'STORED', id: s.id, evicted: dayOver.length + totalOver.length };
        });
      });
    }, function () { return { stored: false, reason: 'BACKEND_ERROR', id: s.id }; });
  }

  // Live, valid snapshots of one ticker, oldest first. Optional { sinceDay, untilDay, limit } (limit keeps the newest).
  function list(ticker, q) {
    return contained(function () {
      var tk = normalizeTicker(ticker);
      if (!tk) return [];
      var qq = isObj(q) ? q : {};
      var since = isoDay(qq.sinceDay), until = isoDay(qq.untilDay);
      var lim = (typeof qq.limit === 'number' && isFinite(qq.limit) && qq.limit >= 1) ? Math.floor(qq.limit) : null;
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var mine = ps.filter(function (p) {
          return p.ticker === tk && p.ms >= cut && (!since || p.day >= since) && (!until || p.day <= until);
        });
        if (lim !== null) mine = mine.slice(-lim);
        return readValid(mine).then(function (r) { return r.valid; });
      });
    }, function () { return []; });
  }

  // The newest live snapshot of a ticker strictly before `beforeIso` (default: now) - the "previous scan" for a later diff.
  function latest(ticker, beforeIso) {
    return contained(function () {
      var lim = beforeIso === undefined ? now() + 1 : parseIso(beforeIso);
      if (lim === null) return null;
      return list(ticker).then(function (xs) {
        var c = xs.filter(function (v) { return parseIso(v.capturedAt) < lim; });
        return c.length ? c[c.length - 1] : null;
      });
    }, function () { return null; });
  }

  function tickers() {
    return contained(function () {
      var cut = cutoffMs();
      return snapKeys().then(function (ps) {
        var seen = {};
        ps.forEach(function (p) { if (p.ms >= cut) seen[p.ticker] = true; });
        return Object.keys(seen).sort();
      });
    }, function () { return []; });
  }

  function liveValid() {
    var cut = cutoffMs();
    return snapKeys().then(function (ps) { return readValid(ps.filter(function (p) { return p.ms >= cut; })); });
  }

  function stats() {
    return contained(function () {
      return liveValid().then(function (r) {
        var tk = {};
        r.valid.forEach(function (v) { tk[v.ticker] = true; });
        return {
          ok: true,
          snapshots: r.valid.length,
          tickers: Object.keys(tk).length,
          oldestDay: r.valid.length ? r.valid[0].day : null,
          newestDay: r.valid.length ? r.valid[r.valid.length - 1].day : null,
          invalidSkipped: r.invalid,
          retentionDays: retentionDays,
          backend: typeof backend.kind === 'string' ? backend.kind : 'custom'
        };
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR' }; });
  }

  function sortExport(snaps) {
    return snaps.slice().sort(function (x, y) {
      return x.ticker < y.ticker ? -1 : x.ticker > y.ticker ? 1 : (x.capturedAt < y.capturedAt ? -1 : x.capturedAt > y.capturedAt ? 1 : (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    });
  }

  // Export: one JSON document of every live, valid snapshot, sorted by ticker, then capturedAt, then id; null on failure.
  function exportAll() {
    return contained(function () {
      var t = now();
      return liveValid().then(function (r) {
        var snaps = sortExport(r.valid);
        return { format: EXPORT_FORMAT, snapshotSchema: SNAPSHOT_SCHEMA, exportedAt: isoOf(t), retentionDays: retentionDays, snapshotCount: snaps.length, snapshots: snaps };
      });
    }, function () { return null; });
  }

  // The export as a string with sorted keys (equal content -> identical string); null on failure.
  function exportJson() {
    return exportAll().then(function (doc) { return doc ? canon(doc) : null; });
  }

  // Delete every snapshot (the user's "clear local research history"). Keys this module does not own are untouched.
  function clear() {
    return contained(function () {
      return snapKeys().then(function (ps) {
        return delAll(ps.map(function (p) { return p.key; })).then(function () { return { ok: true, removed: ps.length }; });
      });
    }, function () { return { ok: false, reason: 'BACKEND_ERROR', removed: 0 }; });
  }

  return { put: put, list: list, latest: latest, tickers: tickers, stats: stats, prune: prune, exportAll: exportAll, exportJson: exportJson, clear: clear };
}

var EXPORT_KEYS = ['exportedAt', 'format', 'retentionDays', 'snapshotCount', 'snapshotSchema', 'snapshots'];

// An export document is valid when it has exactly the v1 header keys, consistent values, strictly increasing
// (ticker, capturedAt, id) order with no duplicates, and every snapshot valid. Never throws.
function validateExport(doc) {
  try {
    if (!isObj(doc) || Object.keys(doc).sort().join(',') !== EXPORT_KEYS.join(',')) return false;
    if (doc.format !== EXPORT_FORMAT || doc.snapshotSchema !== SNAPSHOT_SCHEMA) return false;
    var t = parseIso(doc.exportedAt);
    if (t === null || isoOf(t) !== doc.exportedAt) return false;
    if (typeof doc.retentionDays !== 'number' || !isFinite(doc.retentionDays) || doc.retentionDays < 1 || Math.floor(doc.retentionDays) !== doc.retentionDays) return false;
    if (!Array.isArray(doc.snapshots) || doc.snapshotCount !== doc.snapshots.length) return false;
    for (var i = 0; i < doc.snapshots.length; i++) {
      var s = doc.snapshots[i];
      if (!validateSnapshot(s)) return false;
      if (i > 0) {
        var p = doc.snapshots[i - 1];
        var order = p.ticker < s.ticker || (p.ticker === s.ticker && (p.capturedAt < s.capturedAt || (p.capturedAt === s.capturedAt && p.id < s.id)));
        if (!order) return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain script
// (matching services/market-structure.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SNAPSHOT_SCHEMA: SNAPSHOT_SCHEMA,
    EXPORT_FORMAT: EXPORT_FORMAT,
    DEFAULT_RETENTION_DAYS: DEFAULT_RETENTION_DAYS,
    LIMITS: LIMITS,
    VOCAB: { ACTIONS: ACTIONS, SETUPS: SETUPS, SENTIMENTS: SENTIMENTS, DIRECTIONS: DIRECTIONS, REVISION: REVISION, FRESHNESS: FRESHNESS, VERBS: VERBS, RATINGS: RATINGS },
    buildSnapshot: buildSnapshot,
    validateSnapshot: validateSnapshot,
    validateExport: validateExport,
    memoryBackend: memoryBackend,
    indexedDbBackend: indexedDbBackend,
    createEvidenceMemory: createEvidenceMemory
  };
}
