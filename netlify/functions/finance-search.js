/**
 * Netlify Serverless Function: finance-search   (Phase 7B-6F-x — DEV-ONLY probe)
 * Path: netlify/functions/finance-search.js
 *
 * Isolated DEV-only Perplexity Agent API /v1/agent Finance Search probe.
 * Single-invocation (max_steps: 1); retrieves structured catalyst evidence for
 * one ticker + approved category set. NOT the chat-completions path used by perplexity-proxy.
 *
 * Server-side dormancy gate — checked FIRST, before OPTIONS and all processing:
 *   PT_ENABLE_FINANCE_SEARCH_SERVER must equal "true".
 *   If unset/!= "true", returns DISABLED and makes NO upstream request.
 *   Production must NOT set this variable.
 *
 * Required environment variable (NOT stored in source):
 *   PERPLEXITY_API_KEY. Checked after the server gate passes.
 *   If missing, returns CONFIGURATION_MISSING and makes NO upstream request.
 *
 * Request: POST /.netlify/functions/finance-search
 *   Body: { ticker, categories?: string[] }
 *   categories filtered to ALLOWED_CATEGORIES; defaults to ['earnings_history'].
 *
 * Response statuses:
 *   DISABLED | OK | EMPTY | NOT_INVOKED | CONFIGURATION_MISSING | TIMEOUT | ERROR
 *
 * Boundaries: memory-only; does not touch edgar-form4, perplexity-proxy, normal scan,
 * scoring, Actionable Take, pt_results, localStorage, UI, or any production path.
 */

'use strict';

const PPLX_AGENT_URL = 'https://api.perplexity.ai/v1/agent';
const TIMEOUT_MS = 30000;

const ALLOWED_CATEGORIES = new Set([
  'earnings_history',
  'forward_guidance',
  'capital_returns'
]);

exports.handler = async function (event) {
  // Server-side dormancy gate — first, before OPTIONS and any upstream request.
  if (process.env.PT_ENABLE_FINANCE_SEARCH_SERVER !== 'true') {
    return res(200, {
      status: 'DISABLED',
      reason: 'SERVER_DISABLED',
      detail: 'finance-search is disabled on this deployment; no upstream request made.',
      evidence: [],
      errors: ['SERVER_DISABLED']
    });
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return res(405, { error: 'Method not allowed' });
  }

  const apiKey = (process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) {
    return res(200, {
      status: 'CONFIGURATION_MISSING',
      reason: 'CONFIGURATION_MISSING',
      detail: 'PERPLEXITY_API_KEY environment variable is not set; refusing to contact Perplexity.',
      evidence: [],
      errors: ['CONFIGURATION_MISSING']
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return res(400, { error: 'Invalid JSON' });
  }

  const rawTicker = String(body.ticker || '').trim().toUpperCase();
  if (!rawTicker || !/^[A-Za-z0-9.-]{1,12}$/.test(rawTicker)) {
    return res(400, { error: 'Invalid ticker' });
  }
  const ticker = rawTicker;

  const requested = Array.isArray(body.categories) ? body.categories : [];
  const filtered = requested
    .filter(c => typeof c === 'string')
    .map(c => c.trim())
    .filter(c => ALLOWED_CATEGORIES.has(c));
  const categories = filtered.length > 0 ? [...new Set(filtered)] : ['earnings_history'];

  const t0 = Date.now();

  let agentResp;
  try {
    agentResp = await timedFetch(
      PPLX_AGENT_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'perplexity/sonar',
          input: `Retrieve Finance Search data for ${ticker}. Return structured results for categories: ${categories.join(', ')}.`,
          max_steps: 1,
          tools: [{ type: 'finance_search' }]
        })
      },
      TIMEOUT_MS
    );
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res(200, {
      status: isTimeout ? 'TIMEOUT' : 'ERROR',
      ticker,
      categories,
      evidence: [],
      invocations: 0,
      latencyMs: Date.now() - t0,
      errors: [(isTimeout ? 'TIMEOUT' : 'ERROR') + ':' + (err.message || String(err))]
    });
  }

  if (!agentResp.ok) {
    return res(200, {
      status: 'ERROR',
      ticker,
      categories,
      evidence: [],
      invocations: 0,
      latencyMs: Date.now() - t0,
      errors: ['upstream:' + agentResp.status]
    });
  }

  let agentData;
  try {
    agentData = await agentResp.json();
  } catch (err) {
    return res(200, {
      status: 'ERROR',
      ticker,
      categories,
      evidence: [],
      invocations: 0,
      latencyMs: Date.now() - t0,
      errors: ['json-parse:' + (err.message || String(err))]
    });
  }

  const outputItems = Array.isArray(agentData.output) ? agentData.output
    : Array.isArray(agentData.output_items) ? agentData.output_items
    : Array.isArray(agentData.outputItems) ? agentData.outputItems
    : [];

  const financeResultItems = outputItems.filter(item => item?.type === 'finance_results');
  const rawResults = financeResultItems
    .flatMap(item => Array.isArray(item.results) ? item.results : [])
    .filter(result => result && typeof result === 'object');

  const evidence = rawResults.map(result => {
    const sources = Array.isArray(result.sources)
      ? result.sources.filter(url => typeof url === 'string' && url.startsWith('http'))
      : [];
    const sourceDomains = [];
    for (const url of sources) {
      try {
        sourceDomains.push(new URL(url).hostname);
      } catch (_) {
        // Skip malformed source URL.
      }
    }
    return {
      ...result,
      sources,
      sourceDomains: [...new Set(sourceDomains)],
      provenance: 'retrieval_only',
      requiresVerification: true
    };
  });

  const rawInvocations = agentData?.usage?.tool_calls_details?.finance_search?.invocation;
  const telemetryInvocations = Number.isFinite(rawInvocations) ? rawInvocations : null;
  const outputProvesInvocation = financeResultItems.length > 0;
  const invocations = outputProvesInvocation
    ? Math.max(1, telemetryInvocations ?? 0)
    : (telemetryInvocations ?? 0);
  const invocationObserved = invocations > 0;

  let status;
  if (!invocationObserved) status = 'NOT_INVOKED';
  else if (evidence.length > 0) status = 'OK';
  else status = 'EMPTY';

  return res(200, {
    status,
    ticker,
    categories,
    evidence,
    invocations,
    latencyMs: Date.now() - t0,
    model: agentData.model || 'perplexity/sonar',
    errors: []
  });
};

async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
