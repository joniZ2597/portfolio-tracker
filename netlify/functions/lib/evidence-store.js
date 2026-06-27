'use strict';

const STORE_NAME = 'sec-evidence-store';
const KEY_NAMESPACE = 'secstore:v1';

const DIRECTIONS = ['positive', 'neutral', 'negative'];
const SOURCE_TYPES = [
  'sec_filing', 'press_release', 'earnings_call', 'company_ir',
  'news', 'analyst_report', 'other'
];
const ALLOWED_CATEGORIES = ['sec10q'];
const MAX_EVIDENCE_ITEMS = 50;
const MAX_EVIDENCE_ID = 160;
const MAX_CLAIM = 1000;
const MAX_SOURCE_LABEL = 200;
const MAX_SOURCE_URL = 2048;

const INVALID = Symbol('invalid');

function cikKey(ticker)    { return KEY_NAMESPACE + ':cik:'     + ticker; }
function companyKey(cik)   { return KEY_NAMESPACE + ':company:' + cik;    }
function budgetKey(ticker) { return KEY_NAMESPACE + ':budget:'  + ticker; } // Slice 2+

// readRecord separates three outcomes that store.getJSON() cannot distinguish:
//   DEGRADED — store.get() throws (infrastructure failure)
//   MISSING  — null/undefined returned (key absent)
//   INVALID  — JSON.parse() fails or result is not a plain object (payload malformed)
//   OK       — valid parsed plain object
async function readRecord(store, key) {
  let raw;
  try {
    raw = await store.get(key);
  } catch (_) {
    return { state: 'DEGRADED' };
  }

  if (raw === null || raw === undefined) {
    return { state: 'MISSING' };
  }

  if (typeof raw === 'object') {
    return Array.isArray(raw) ? { state: 'INVALID' } : { state: 'OK', value: raw };
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch (_) {
    return { state: 'INVALID' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: 'INVALID' };
  }

  return { state: 'OK', value };
}

// Read-only store lookup.
// Returns { status: 'STORE_HIT', evidenceItems }
//       | { status: 'STORE_MISS'    }  — key absent
//       | { status: 'STORE_INVALID' }  — payload present but malformed
//       | { status: 'DEGRADED'      }  — infrastructure failure
// Never calls set / setJSON / delete / deleteJSON / fetch.
async function lookupEvidence(store, ticker, categories) {
  const mr = await readRecord(store, cikKey(ticker));
  if (mr.state === 'DEGRADED') return { status: 'DEGRADED' };
  if (mr.state === 'MISSING')  return { status: 'STORE_MISS' };
  if (mr.state === 'INVALID')  return { status: 'STORE_INVALID' };

  if (typeof mr.value.cik !== 'string' || !/^\d{10}$/.test(mr.value.cik)) {
    return { status: 'STORE_INVALID' };
  }

  const cik = mr.value.cik;

  const cr = await readRecord(store, companyKey(cik));
  if (cr.state === 'DEGRADED') return { status: 'DEGRADED' };
  if (cr.state === 'MISSING')  return { status: 'STORE_MISS' };
  if (cr.state === 'INVALID')  return { status: 'STORE_INVALID' };

  const projected = projectRecord(cr.value, categories);
  if (!projected.ok) return { status: 'STORE_INVALID' };

  return { status: 'STORE_HIT', evidenceItems: projected.items };
}

function projectRecord(company, categories) {
  if (!Array.isArray(company.evidenceItems) || company.evidenceItems.length > MAX_EVIDENCE_ITEMS) {
    return { ok: false };
  }
  const allowed = new Set(categories);
  const seenIds = new Set();
  const items   = [];
  for (const raw of company.evidenceItems) {
    const result = projectItem(raw, allowed, seenIds);
    if (result === null)  { return { ok: false }; }
    if (result === false) { continue; }
    seenIds.add(result.evidenceId);
    items.push(result);
  }
  return { ok: true, items };
}

function projectItem(raw, allowed, seenIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return null; }

  const evidenceId = boundedString(raw.evidenceId, MAX_EVIDENCE_ID);
  if (evidenceId === null || seenIds.has(evidenceId))        { return null; }

  const category = typeof raw.category === 'string' ? raw.category.trim() : null;
  if (category === null || ALLOWED_CATEGORIES.indexOf(category) === -1) { return null; }
  if (!allowed.has(category))                                { return false; }

  const claim = boundedString(raw.claim, MAX_CLAIM);
  if (claim === null)                                        { return null; }

  if (DIRECTIONS.indexOf(raw.direction) === -1)              { return null; }

  if (raw.confidence !== null || raw.requiresVerification !== true || raw.scoringImpact !== 'none') {
    return null;
  }

  const sourceLabel = optionalBoundedString(raw.sourceLabel, MAX_SOURCE_LABEL);
  const sourceUrl   = optionalHttpsUrl(raw.sourceUrl);
  const sourceDate  = optionalDate(raw.sourceDate);
  const sourceType  = optionalSourceType(raw.sourceType);

  if (sourceLabel === INVALID || sourceUrl === INVALID ||
      sourceDate  === INVALID || sourceType === INVALID) { return null; }

  return {
    evidenceId, category, claim, direction: raw.direction,
    confidence: null, sourceLabel, sourceUrl, sourceDate, sourceType,
    requiresVerification: true, scoringImpact: 'none'
  };
}

function boundedString(value, max) {
  if (typeof value !== 'string') { return null; }
  const t = value.trim();
  return (t.length >= 1 && t.length <= max) ? t : null;
}

function optionalBoundedString(value, max) {
  if (value === null || value === undefined) { return null; }
  const r = boundedString(value, max);
  return r === null ? INVALID : r;
}

function optionalHttpsUrl(value) {
  if (value === null || value === undefined) { return null; }
  if (typeof value !== 'string' || value.length > MAX_SOURCE_URL || /\s/.test(value)) { return INVALID; }
  let url;
  try { url = new URL(value); } catch (_) { return INVALID; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) { return INVALID; }
  return value;
}

function optionalDate(value) {
  if (value === null || value === undefined) { return null; }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { return INVALID; }
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) { return INVALID; }
  return value;
}

function optionalSourceType(value) {
  if (value === null || value === undefined) { return null; }
  if (typeof value !== 'string' || SOURCE_TYPES.indexOf(value) === -1) { return INVALID; }
  return value;
}

module.exports = { STORE_NAME, cikKey, companyKey, budgetKey, lookupEvidence };
