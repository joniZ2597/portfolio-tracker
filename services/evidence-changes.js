'use strict';
// services/evidence-changes.js - evidence-memory-1 S2: change engine v1 (Main Control D-19, D-20, D-21, D-23).
//
// diffSnapshots(prev, next) compares two S1 snapshots of one ticker and returns the material changes - ordered, one
// entry per real-world event, at most 7 shown - and counts what it suppressed. Pure: no network, DOM, storage, clock
// or randomness. Values in the output are copied from the snapshots or are fixed labels; group keys are hashes.
// The S1 module is injected (createChangeEngine(memoryModule)) so its validator is reused without a path import:
// Node tests pass the loaded S1 module, the browser later passes its inlined namespace.

var PRICE_PCT = 3;            // D-20: a price move is material from 3 % (inclusive)
var TARGET_PCT = 5;           // D-20: a price-target move is material from 5 % (inclusive)
var MAX_SHOWN = 7;            // D-20: at most 7 shown
// D-20 order: analyst / rating / target -> AI action -> catalysts -> price -> other
var CLASS = { analyst_new: 1, rating_change: 1, target_change: 1, ai_action_change: 2, catalyst_new: 3, price_move: 4 };
var OTHER_CLASS = 5;
// D-23: a setup change is material only when it crosses between these two groups
var SETUP_GROUP = {
  extended_near_ath: 'constructive', healthy_uptrend_near_ath: 'constructive', healthy_uptrend: 'constructive',
  pullback_in_uptrend: 'constructive', support_test: 'damaged', breakdown_risk: 'damaged', below_key_mas: 'damaged'
};
// D-23: sentiment and catalyst direction are material only when they flip between the two poles
var POLE = { positive: 1, negative: -1, bullish: 1, bearish: -1 };
var RATING_VERBS = ['upgraded', 'downgraded'];
var INITIATION_VERBS = ['initiated', 'started', 'launched', 'reinstated', 'resumed'];
var ANALYST_WORDS = /\b(?:price target|target|pt|upgrades?|upgraded|downgrades?|downgraded|initiat[a-z]*|rating|reiterat[a-z]*|overweight|underweight|outperform|underperform)\b/;
var MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
var DATE_RE = new RegExp('\\b(?:' + MONTH_WORDS + ')\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b', 'g');
var CATALYST_LISTS = ['bullish', 'bearish', 'macro'];
var CATALYST_FIELDS = ['earnings', 'guidance', 'contracts', 'peerMove'];

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function known(v) { return v !== null && v !== undefined && v !== 'unknown'; }
function num(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
function pct(a, b) { return round6((b - a) / a * 100); }
function firmKey(f) { return String(f).toLowerCase(); }

// 64-bit FNV-1a style hash (two 32-bit lanes), 16 hex characters: group keys never carry text
function hash16(str) {
  var h1 = 0x811c9dc5, h2 = 0x050c5d1f;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 ^= (h1 >>> 7); h2 >>>= 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
function key(prefix, s) { return prefix + ':' + hash16(s); }

// Identity of a catalyst text (D-21): calendar dates masked (a reworded date is the same event); numbers kept (a
// different figure or quarter is a different event); case, currency signs, thousands separators and punctuation ignored.
function fingerprint(text) {
  var t = String(text).toLowerCase();
  t = t.replace(DATE_RE, ' ');
  t = t.replace(/[$\u20ac\u00a3\u20aa]/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2');
  return t.replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeValid(validate, s) { try { return validate(s) === true; } catch (e) { return false; } }

function fail(reason) { return { ok: false, reason: reason, changes: [], shown: [], suppressed: { overflow: 0 }, groups: 0 }; }

function classOf(kind) { return own(CLASS, kind) ? CLASS[kind] : OTHER_CLASS; }
function byOrder(a, b) {
  var ca = classOf(a.kind), cb = classOf(b.kind);
  if (ca !== cb) return ca - cb;
  var ma = a.magnitude === null ? -1 : Math.abs(a.magnitude), mb = b.magnitude === null ? -1 : Math.abs(b.magnitude);
  if (ma !== mb) return mb - ma;
  if (a.groupKey !== b.groupKey) return a.groupKey < b.groupKey ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  // total order: equal-ranked changes are ordered by their values, never by input order
  return tieKey(a) < tieKey(b) ? -1 : (tieKey(a) > tieKey(b) ? 1 : 0);
}
function tieKey(c) { return JSON.stringify([c.from, c.to, c.date, c.material]); }

function result(reason, changes) {
  changes.sort(byOrder);
  var suppressed = { overflow: 0 }, seen = {}, groupsList = [];
  for (var i = 0; i < changes.length; i++) {
    var c = changes[i];
    if (!c.material) { suppressed[c.kind] = (suppressed[c.kind] || 0) + 1; continue; }
    if (own(seen, c.groupKey)) continue;          // one entry per real-world event (D-21)
    seen[c.groupKey] = true;
    groupsList.push(c);
  }
  suppressed.overflow = Math.max(0, groupsList.length - MAX_SHOWN);
  return { ok: true, reason: reason, changes: changes, shown: groupsList.slice(0, MAX_SHOWN), suppressed: suppressed, groups: groupsList.length };
}

function analystItems(r) {
  var out = [];
  [r.analystActions, r.ratingOnlyActions].forEach(function (list) {
    if (Array.isArray(list)) list.forEach(function (a) { if (isObj(a) && typeof a.firm === 'string') out.push(a); });
  });
  return out;
}
// Event identity (one real-world event, D-21): firm + verb + date. It is the group key.
// Both keys are JSON-encoded field lists (rev 3): no field value can imitate a separator, so distinct evidence or
// distinct events never share a key, whatever characters a field contains.
function analystIdentity(a) { return JSON.stringify([firmKey(a.firm), a.action || '', a.date || '']); }
// Evidence key: every field of the item. Items that differ in any field are distinct evidence (never collapsed);
// only exact duplicates are one item.
function evidenceKey(a) {
  return JSON.stringify([firmKey(a.firm), a.action, a.ratingAction, a.rating, a.date, a.target, a.targetFrom, a.targetAction]
    .map(function (v) { return v === null || v === undefined ? '' : String(v); }));
}
// The earlier target nearest to x (ties: the lower one). Depends only on the set of earlier targets, not their order.
function nearest(list, x) {
  var best = null;
  for (var i = 0; i < list.length; i++) {
    var v = list[i], d = Math.abs(v - x), bd = best === null ? Infinity : Math.abs(best - x);
    if (d < bd || (d === bd && v < best)) best = v;
  }
  return best;
}

function catalystTexts(r) {
  var out = [];
  CATALYST_LISTS.forEach(function (k) { if (Array.isArray(r[k])) r[k].forEach(function (t) { if (typeof t === 'string') out.push(t); }); });
  CATALYST_FIELDS.forEach(function (k) { if (typeof r[k] === 'string') out.push(r[k]); });
  return out;
}

// A catalyst line that names a firm with a new analyst change, in analyst wording, is the same event (D-21).
function analystGroupFor(text, analystFirms) {
  var t = String(text).toLowerCase();
  if (!ANALYST_WORDS.test(t)) return null;
  var firms = Object.keys(analystFirms).sort();
  for (var i = 0; i < firms.length; i++) {
    var f = firms[i];
    if (f.length >= 3 && (' ' + t.replace(/[^a-z0-9&.' -]+/g, ' ') + ' ').indexOf(' ' + f + ' ') !== -1) return analystFirms[f];
  }
  return null;
}

function compare(prev, next) {
  var changes = [];
  function mk(kind, groupKey, from, to, magnitude, material, date) {
    return { kind: kind, groupKey: groupKey, from: from, to: to, magnitude: magnitude, material: material === true, date: date };
  }
  function add(kind, groupKey, from, to, magnitude, material, date) { changes.push(mk(kind, groupKey, from, to, magnitude, material, date)); }
  var pr = prev.research, nr = next.research;
  var researchKnown = !pr.unavailable && !nr.unavailable;   // unknown is not a change

  if (researchKnown) {
    // analyst actions and rating-only actions
    var prevItems = analystItems(pr), nextItems = analystItems(nr);
    // prior state per firm = the SET of its earlier targets and ratings (order-independent)
    var prevEvidence = {}, prevEvents = {}, priorTargets = {}, priorRatings = {};
    prevItems.forEach(function (a) {
      var fk = firmKey(a.firm);
      prevEvidence[evidenceKey(a)] = true;
      prevEvents[analystIdentity(a)] = true;
      if (num(a.target)) { priorTargets[fk] = priorTargets[fk] || []; if (priorTargets[fk].indexOf(a.target) === -1) priorTargets[fk].push(a.target); }
      if (known(a.rating)) { priorRatings[fk] = priorRatings[fk] || []; if (priorRatings[fk].indexOf(a.rating) === -1) priorRatings[fk].push(a.rating); }
    });
    var doneEvidence = {}, analystOf = [];
    nextItems.slice().sort(function (a, b) { var x = evidenceKey(a), y = evidenceKey(b); return x < y ? -1 : (x > y ? 1 : 0); }).forEach(function (a) {
      var ek = evidenceKey(a);
      if (own(prevEvidence, ek) || own(doneEvidence, ek)) return;     // seen before, or an exact duplicate
      doneEvidence[ek] = true;
      var id = analystIdentity(a), g = key('an', id), fk = firmKey(a.firm);
      var eventKnown = own(prevEvents, id);                            // a re-report of an event already seen
      var ratings = own(priorRatings, fk) ? priorRatings[fk] : [];
      var targets = own(priorTargets, fk) ? priorTargets[fk] : [];
      var verbRating = !eventKnown && (RATING_VERBS.indexOf(a.action) !== -1 || RATING_VERBS.indexOf(a.ratingAction) !== -1);
      var ratingMoved = verbRating || (known(a.rating) && ratings.length > 0 && ratings.indexOf(a.rating) === -1);
      var initiation = !eventKnown && (INITIATION_VERBS.indexOf(a.action) !== -1 || INITIATION_VERBS.indexOf(a.ratingAction) !== -1);
      var base = (!eventKnown && num(a.targetFrom)) ? a.targetFrom : (num(a.target) ? nearest(targets, a.target) : null);
      var before = ratings.length === 1 ? ratings[0] : null;
      var c;
      if (ratingMoved) c = mk('rating_change', g, before, known(a.rating) ? a.rating : null, null, true, a.date || null);
      else if (initiation) c = mk('analyst_new', g, null, known(a.rating) ? a.rating : null, null, true, a.date || null);
      else if (num(a.target) && base !== null && a.target !== base) {
        var m = pct(base, a.target);
        c = mk('target_change', g, base, a.target, m, Math.abs(m) >= TARGET_PCT, a.date || null);
      } else c = mk('analyst_new', g, null, known(a.rating) ? a.rating : null, null, false, a.date || null);
      changes.push(c);
      analystOf.push({ firm: fk, change: c });
    });
    // a firm's catalyst lines join the group of its most significant new analyst change (material first, then the
    // display order) - a function of the changes, not of input order
    var analystFirms = {};
    analystOf.slice().sort(function (x, y) { if (x.change.material !== y.change.material) return x.change.material ? -1 : 1; return byOrder(x.change, y.change); })
      .forEach(function (o) { if (!own(analystFirms, o.firm)) analystFirms[o.firm] = o.change.groupKey; });

    // catalysts: new and gone, by identity
    var prevFp = {}, nextFp = {};
    catalystTexts(pr).forEach(function (t) { var f = fingerprint(t); if (f && (!own(prevFp, f) || t < prevFp[f])) prevFp[f] = t; });
    // one representative per identity: the smallest text, so the output does not depend on which duplicate came first
    catalystTexts(nr).forEach(function (t) { var f = fingerprint(t); if (f && (!own(nextFp, f) || t < nextFp[f])) nextFp[f] = t; });
    Object.keys(nextFp).sort().forEach(function (f) {
      if (own(prevFp, f)) return;
      var text = nextFp[f];
      var joined = analystGroupFor(text, analystFirms);
      add('catalyst_new', joined || key('ct', f), null, text, null, true, null);
    });
    Object.keys(prevFp).sort().forEach(function (f) {
      if (own(nextFp, f)) return;
      var g = key('ct', f), x = prevFp[f];
      add('catalyst_gone', g, x, null, null, false, null);
    });

    // sources: a new domain is informational
    var prevDom = {};
    (Array.isArray(prev.sources) ? prev.sources : []).forEach(function (s) { if (isObj(s) && typeof s.domain === 'string') prevDom[s.domain] = true; });
    var doneDom = {};
    (Array.isArray(next.sources) ? next.sources : []).forEach(function (s) {
      if (!isObj(s) || typeof s.domain !== 'string' || own(prevDom, s.domain) || own(doneDom, s.domain)) return;
      doneDom[s.domain] = true;
      add('source_new', key('so', s.domain), null, s.domain, null, false, null);
    });
  }

  // assessment
  var pa = isObj(prev.assessment) ? prev.assessment : {}, na = isObj(next.assessment) ? next.assessment : {};
  var a = pa.action, b = na.action;
  if (known(a) && known(b) && a !== b) add('ai_action_change', key('ai', a + '>' + b), a, b, null, true, null);
  a = pa.technicalSetup; b = na.technicalSetup;
  if (known(a) && known(b) && a !== b) {
    var rule = { material: SETUP_GROUP[a] !== SETUP_GROUP[b] };
    add('setup_change', key('su', a + '>' + b), a, b, null, rule.material, null);
  }
  a = pa.sentiment; b = na.sentiment;
  if (known(a) && known(b) && a !== b) add('sentiment_change', key('se', a + '>' + b), a, b, null, (POLE[a] || 0) * (POLE[b] || 0) === -1, null);
  a = pa.catalystDirection; b = na.catalystDirection;
  if (known(a) && known(b) && a !== b) add('direction_change', key('di', a + '>' + b), a, b, null, (POLE[a] || 0) * (POLE[b] || 0) === -1, null);

  // price (same currency only)
  var pm = isObj(prev.market) ? prev.market : {}, nm = isObj(next.market) ? next.market : {};
  if (num(pm.price) && num(nm.price) && (pm.currency || null) === (nm.currency || null) && pm.price !== nm.price) {
    var mv = pct(pm.price, nm.price);
    add('price_move', key('px', 'price'), pm.price, nm.price, mv, Math.abs(mv) >= PRICE_PCT, null);
  }
  return changes;
}

function createChangeEngine(mem) {
  var validate = null;
  try { validate = (mem && typeof mem.validateSnapshot === 'function') ? mem.validateSnapshot : null; } catch (e) { validate = null; }
  function diff(validate, prev, next) {
    if (prev === null) return safeValid(validate, next) ? result('FIRST_SNAPSHOT', []) : fail('INVALID_NEXT');
    if (!safeValid(validate, prev)) return fail('INVALID_PREV');
    if (!safeValid(validate, next)) return fail('INVALID_NEXT');
    if (prev.ticker !== next.ticker) return fail('TICKER_MISMATCH');
    if (!(prev.capturedAt < next.capturedAt)) return fail('NOT_LATER');
    return result(null, compare(prev, next));
  }
  function diffSnapshots(prev, next) {
    if (!validate) return fail('NO_VALIDATOR');
    try { return diff(validate, prev, next); } catch (e) { return fail('INTERNAL'); }
  }
  return { diffSnapshots: diffSnapshots };
}

// Dual export guard: CommonJS for offline Node tests; skipped when the file is inlined as a plain script
// (matching services/evidence-memory.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    THRESHOLDS: { pricePct: PRICE_PCT, targetPct: TARGET_PCT, maxShown: MAX_SHOWN },
    createChangeEngine: createChangeEngine
  };
}
