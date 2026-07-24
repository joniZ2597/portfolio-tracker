'use strict';

const ALLOWED_CATEGORIES = ['earnings', 'guidance', 'valuation', 'sec10q'];
const DIRECTIONS = ['positive', 'neutral', 'negative'];
const SOURCE_TYPES = [
  'sec_filing',
  'press_release',
  'earnings_call',
  'company_ir',
  'news',
  'analyst_report',
  'other'
];

const MAX_RESULTS = 50;
const MAX_EVIDENCE_ID = 160;
const MAX_CLAIM = 1000;
const MAX_SOURCE_LABEL = 200;
const MAX_SOURCE_URL = 2048;
const MAX_RAW_CATEGORIES = 10;

const INVALID = Symbol('invalid');

// Deduplicate the requested categories and project them into the fixed
// canonical order. Returns null (=> INVALID_CATEGORIES) if the input is not a
// non-empty array (max MAX_RAW_CATEGORIES raw items, checked before dedupe) of
// allow-listed category strings (trimmed).
function normalizeCategories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RAW_CATEGORIES) {
    return null;
  }

  const selected = new Set();
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    const category = item.trim();
    if (ALLOWED_CATEGORIES.indexOf(category) === -1) {
      return null;
    }
    selected.add(category);
  }

  return ALLOWED_CATEGORIES.filter((category) => selected.has(category));
}

// Validate provider/cache evidence against the frozen contract and project each
// item to known fields only (unknown fields stripped). Returns
// { ok: true, results } on success or { ok: false } if any item — or the array
// shape / size — violates the contract. Does not mutate input.
function validateAndProject(rawResults, requestedCategories) {
  if (!Array.isArray(rawResults) || rawResults.length > MAX_RESULTS) {
    return { ok: false };
  }

  const allowed = new Set(requestedCategories);
  const seenIds = new Set();
  const projected = [];

  for (const raw of rawResults) {
    const item = projectItem(raw, allowed, seenIds);
    if (!item) {
      return { ok: false };
    }
    seenIds.add(item.evidenceId);
    projected.push(item);
  }

  return { ok: true, results: projected };
}

function projectItem(raw, allowed, seenIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const evidenceId = boundedString(raw.evidenceId, MAX_EVIDENCE_ID);
  if (evidenceId === null || seenIds.has(evidenceId)) {
    return null;
  }

  const category = typeof raw.category === 'string' ? raw.category.trim() : null;
  if (category === null || !allowed.has(category)) {
    return null;
  }

  const claim = boundedString(raw.claim, MAX_CLAIM);
  if (claim === null) {
    return null;
  }

  if (DIRECTIONS.indexOf(raw.direction) === -1) {
    return null;
  }

  if (raw.confidence !== null || raw.requiresVerification !== true || raw.scoringImpact !== 'none') {
    return null;
  }

  const sourceLabel = optionalBoundedString(raw.sourceLabel, MAX_SOURCE_LABEL);
  const sourceUrl = optionalHttpsUrl(raw.sourceUrl);
  const sourceDate = optionalDate(raw.sourceDate);
  const sourceType = optionalSourceType(raw.sourceType);
  if (sourceLabel === INVALID || sourceUrl === INVALID || sourceDate === INVALID || sourceType === INVALID) {
    return null;
  }

  return {
    evidenceId,
    category,
    claim,
    direction: raw.direction,
    confidence: null,
    sourceLabel,
    sourceUrl,
    sourceDate,
    sourceType,
    requiresVerification: true,
    scoringImpact: 'none'
  };
}

function boundedString(value, max) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function optionalBoundedString(value, max) {
  if (value === null || value === undefined) {
    return null;
  }
  const result = boundedString(value, max);
  return result === null ? INVALID : result;
}

function optionalHttpsUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || value.length > MAX_SOURCE_URL || /\s/.test(value)) {
    return INVALID;
  }
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    return INVALID;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
    return INVALID;
  }
  return value;
}

function optionalDate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return INVALID;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return INVALID;
  }
  return value;
}

function optionalSourceType(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || SOURCE_TYPES.indexOf(value) === -1) {
    return INVALID;
  }
  return value;
}

// Await the provider in every path, then validate/project. Maps failures to the
// frozen reasons without exposing exception text or provider payload.
async function resolveProviderOutput(readProvider, requestedCategories) {
  let raw;
  try {
    raw = await readProvider();
  } catch (_) {
    return { ok: false, reason: 'PROVIDER_FAILURE' };
  }

  const projected = validateAndProject(raw, requestedCategories);
  if (!projected.ok) {
    return { ok: false, reason: 'PROVIDER_INVALID_RESPONSE' };
  }

  return { ok: true, results: projected.results };
}

module.exports = {
  ALLOWED_CATEGORIES,
  DIRECTIONS,
  SOURCE_TYPES,
  MAX_RESULTS,
  normalizeCategories,
  validateAndProject,
  resolveProviderOutput,
  optionalHttpsUrl,
  optionalDate,
  INVALID
};
