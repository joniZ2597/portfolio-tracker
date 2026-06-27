'use strict';

const SUPPORTED_CATEGORIES = ['sec10q'];

exports.handler = async function (event) {
  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  if (process.env.PT_ENABLE_SEC_EVIDENCE_STORE_SERVER !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  if (method !== 'POST') {
    return res(405, { status: 'METHOD_NOT_ALLOWED', reason: 'METHOD_NOT_ALLOWED' });
  }

  const body = parseBody(event && event.body);
  if (!body.ok) {
    return res(400, { status: 'INVALID_JSON', reason: 'INVALID_JSON' });
  }

  const ticker = normalizeTicker(body.value.ticker);
  if (!ticker) {
    return res(400, { status: 'INVALID_TICKER', reason: 'INVALID_TICKER' });
  }

  const categories = normalizeCategories(body.value.categories);
  if (!categories) {
    return res(400, { status: 'INVALID_CATEGORIES', reason: 'INVALID_CATEGORIES' });
  }

  let store;
  try {
    store = acquireStore(event);
  } catch (_) {
    return res(200, { status: 'DEGRADED', reason: 'STORE_UNAVAILABLE' });
  }

  const evidenceStore = require('./lib/evidence-store');
  const outcome = await evidenceStore.lookupEvidence(store, ticker, categories);

  if (outcome.status === 'STORE_HIT') {
    return res(200, {
      status: 'STORE_HIT',
      provider: 'sec_evidence_store',
      cacheStatus: 'STORE_HIT',
      ticker,
      categories,
      evidenceItems: outcome.evidenceItems,
      scoringImpact: 'none'
    });
  }

  if (outcome.status === 'STORE_MISS') {
    return res(200, { status: 'STORE_MISS', ticker, categories });
  }

  if (outcome.status === 'STORE_INVALID') {
    return res(200, { status: 'STORE_INVALID', ticker, categories });
  }

  return res(200, { status: 'DEGRADED', reason: 'STORE_READ_FAILURE' });
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body)
  };
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string') {
    return { ok: false };
  }

  if (rawBody.trim() === '') {
    return { ok: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (_) {
    return { ok: false };
  }

  if (parsed === null) {
    return { ok: false };
  }

  if (typeof parsed !== 'object') {
    return { ok: false };
  }

  if (Array.isArray(parsed)) {
    return { ok: false };
  }

  return { ok: true, value: parsed };
}

function normalizeTicker(value) {
  if (typeof value !== 'string') { return null; }
  const t = value.trim().toUpperCase();
  return /^[A-Z]{1,10}$/.test(t) ? t : null;
}

function normalizeCategories(value) {
  if (!Array.isArray(value) || value.length < 1) { return null; }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') { return null; }
    const cat = item.trim();
    if (SUPPORTED_CATEGORIES.indexOf(cat) === -1) { return null; }
    seen.add(cat);
  }
  return SUPPORTED_CATEGORIES.filter(function (c) { return seen.has(c); });
}

function acquireStore(event) {
  if (event && event._testStore) { return event._testStore; }
  const evidenceStore = require('./lib/evidence-store');
  const { connectLambda, getStore } = require('@netlify/blobs');
  connectLambda(event);
  return getStore(evidenceStore.STORE_NAME);
}
