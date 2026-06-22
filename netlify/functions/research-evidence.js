'use strict';

const SERVER_GATE = 'PT_ENABLE_RESEARCH_EVIDENCE_SERVER';
const PROVIDER_SELECTOR = 'PT_EVIDENCE_PROVIDER';
const CACHE_GATE = 'PT_EVIDENCE_CACHE';

exports.handler = async function (event) {
  if (process.env[SERVER_GATE] !== 'true') {
    return res(200, { status: 'DISABLED', reason: 'SERVER_DISABLED' });
  }

  const method = event && event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  if (method === 'GET') {
    return res(200, { status: 'NOT_INVOKED', reason: 'SCAFFOLD_ONLY' });
  }

  if (method === 'POST') {
    return handlePost(event);
  }

  return res(405, { status: 'ERROR', reason: 'METHOD_NOT_ALLOWED' });
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body)
  };
}

async function handlePost(event) {
  const body = parseBody(event && event.body);
  if (!body.ok) {
    return error('INVALID_JSON');
  }

  const ticker = normalizeTicker(body.value.ticker);
  if (!ticker) {
    return error('INVALID_TICKER');
  }

  const categories = normalizeCategories(body.value.categories);
  if (!categories) {
    return error('INVALID_CATEGORIES');
  }

  const providerName = process.env[PROVIDER_SELECTOR];
  if (providerName !== 'mock') {
    return res(500, { status: 'ERROR', reason: 'CONFIGURATION_MISSING' });
  }

  const provider = require('./lib/evidence-provider-mock');
  const evidence = await getEvidence({
    event,
    provider,
    providerName,
    ticker,
    categories
  });

  return res(200, okBody({
    ticker,
    categories,
    results: evidence.results,
    providerName,
    cacheStatus: evidence.cacheStatus
  }));
}

function getEvidence(params) {
  const readProvider = () => params.provider.getEvidence({
    ticker: params.ticker,
    categories: params.categories
  });

  if (process.env[CACHE_GATE] !== 'true' || !(params.event && params.event.blobs)) {
    return { results: readProvider(), cacheStatus: 'BYPASS' };
  }

  const cache = require('./lib/evidence-cache');
  return cache.resolveEvidence({
    event: params.event,
    provider: params.providerName,
    ticker: params.ticker,
    categories: params.categories,
    readProvider,
    now: Date.now
  });
}

function okBody(payload) {
  return {
    status: 'OK',
    schemaVersion: 1,
    ticker: payload.ticker,
    categories: payload.categories,
    requestId: makeRequestId(),
    cacheStatus: payload.cacheStatus,
    results: payload.results,
    provenance: {
      evidenceClass: 'non_scoring_sidecar',
      scoringImpact: 'none',
      requiresVerification: true,
      provider: payload.providerName,
      confidence: null
    },
    servedAt: new Date().toISOString()
  };
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') {
    return { ok: false };
  }

  try {
    const value = JSON.parse(rawBody);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false };
    }
    return { ok: true, value };
  } catch (_) {
    return { ok: false };
  }
}

function normalizeTicker(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const ticker = value.trim().toUpperCase();
  return /^[A-Z]{1,10}$/.test(ticker) ? ticker : null;
}

function normalizeCategories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    return null;
  }

  const categories = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }

    const category = item.trim();
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(category)) {
      return null;
    }
    categories.push(category);
  }

  return categories;
}

function makeRequestId() {
  return `re_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function error(reason) {
  return res(400, { status: 'ERROR', reason });
}
