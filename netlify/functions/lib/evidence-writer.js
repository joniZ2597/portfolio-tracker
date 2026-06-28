'use strict';

const ALLOWED_CATEGORIES = ['sec10q'];
const DIRECTIONS = ['positive', 'neutral', 'negative'];
const SOURCE_TYPES = [
  'sec_filing', 'press_release', 'earnings_call', 'company_ir',
  'news', 'analyst_report', 'other'
];
const MAX_EVIDENCE_ITEMS = 50;
const MAX_EVIDENCE_ID = 160;
const MAX_CLAIM = 1000;
const MAX_SOURCE_LABEL = 200;
const MAX_SOURCE_URL = 2048;

const INVALID = Symbol('invalid');

// validateWritePayload validates the parsed inbound request body with strict
// (no-normalization) rules and projects evidenceItems to the canonical shape.
// Returns { ok: true, ticker, cik, projectedItems } or { ok: false, reason }.
function validateWritePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'INVALID_TICKER' };
  }

  const ticker = body.ticker;
  if (typeof ticker !== 'string' || !/^[A-Z]{1,10}$/.test(ticker)) {
    return { ok: false, reason: 'INVALID_TICKER' };
  }

  const cik = body.cik;
  if (typeof cik !== 'string' || !/^\d{10}$/.test(cik)) {
    return { ok: false, reason: 'INVALID_CIK' };
  }

  const projectedItems = projectEvidenceItems(body.evidenceItems);
  if (!projectedItems) {
    return { ok: false, reason: 'INVALID_EVIDENCE_ITEMS' };
  }

  return { ok: true, ticker, cik, projectedItems };
}

// buildCanonicalCompanyJSON returns the canonical company record JSON.
// Exact field order: { evidenceItems }  — no top-level cik.
function buildCanonicalCompanyJSON(projectedItems) {
  return JSON.stringify({ evidenceItems: projectedItems });
}

// buildCanonicalMappingJSON returns the canonical CIK-mapping record JSON.
// Exact field order: { cik }  — no ticker field.
function buildCanonicalMappingJSON(cik) {
  return JSON.stringify({ cik });
}

// isIdentical compares a readRecord result against the canonical JSON we tried
// to write using accepted-shape projection only (no extra fields).
// type must be 'company' or 'mapping'.
function isIdentical(storedRecord, canonicalJSON, type) {
  if (!storedRecord || storedRecord.state !== 'OK') return false;
  const v = storedRecord.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  try {
    if (type === 'company') {
      return JSON.stringify({ evidenceItems: v.evidenceItems }) === canonicalJSON;
    }
    if (type === 'mapping') {
      return JSON.stringify({ cik: v.cik }) === canonicalJSON;
    }
  } catch (_) {
    return false;
  }
  return false;
}

// --- internal helpers (not exported) ---

function projectEvidenceItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_EVIDENCE_ITEMS) {
    return null;
  }
  const seenIds = new Set();
  const projected = [];
  for (const raw of items) {
    const item = projectItem(raw, seenIds);
    if (item === null) return null;
    seenIds.add(item.evidenceId);
    projected.push(item);
  }
  return projected;
}

function projectItem(raw, seenIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const evidenceId = boundedString(raw.evidenceId, MAX_EVIDENCE_ID);
  if (evidenceId === null || seenIds.has(evidenceId)) return null;

  const category = typeof raw.category === 'string' ? raw.category.trim() : null;
  if (!category || ALLOWED_CATEGORIES.indexOf(category) === -1) return null;

  const claim = boundedString(raw.claim, MAX_CLAIM);
  if (claim === null) return null;

  if (DIRECTIONS.indexOf(raw.direction) === -1) return null;

  if (raw.confidence !== null || raw.requiresVerification !== true || raw.scoringImpact !== 'none') {
    return null;
  }

  const sourceLabel = optionalBoundedString(raw.sourceLabel, MAX_SOURCE_LABEL);
  const sourceUrl   = optionalHttpsUrl(raw.sourceUrl);
  const sourceDate  = optionalDate(raw.sourceDate);
  const sourceType  = optionalSourceType(raw.sourceType);

  if (sourceLabel === INVALID || sourceUrl === INVALID ||
      sourceDate  === INVALID || sourceType === INVALID) return null;

  return {
    evidenceId, category, claim, direction: raw.direction,
    confidence: null, sourceLabel, sourceUrl, sourceDate, sourceType,
    requiresVerification: true, scoringImpact: 'none'
  };
}

function boundedString(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return (t.length >= 1 && t.length <= max) ? t : null;
}

function optionalBoundedString(value, max) {
  if (value === null || value === undefined) return null;
  const r = boundedString(value, max);
  return r === null ? INVALID : r;
}

function optionalHttpsUrl(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > MAX_SOURCE_URL || /\s/.test(value)) return INVALID;
  let url;
  try { url = new URL(value); } catch (_) { return INVALID; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return INVALID;
  return value;
}

function optionalDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return INVALID;
  const year  = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day   = Number(value.slice(8, 10));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return INVALID;
  }
  return value;
}

function optionalSourceType(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || SOURCE_TYPES.indexOf(value) === -1) return INVALID;
  return value;
}

module.exports = {
  validateWritePayload,
  buildCanonicalCompanyJSON,
  buildCanonicalMappingJSON,
  isIdentical
};
