/**
 * Netlify Serverless Function: anthropic-proxy
 * Path: netlify/functions/anthropic-proxy.js
 *
 * Proxies requests to api.anthropic.com/v1/messages using a server-side key.
 * ANTHROPIC_API_KEY is never returned to the browser in any response body,
 * header, or log line.
 *
 * Normal use:  POST /.netlify/functions/anthropic-proxy
 *   Body: { model, max_tokens, system, messages }
 *   No x-api-key header from client - key is added server-side only.
 *
 * Status ping: GET /.netlify/functions/anthropic-proxy?mode=ping
 *   Returns { ok: true, model, tokens } on success.
 *   Returns { ok: false, status: 'no_key' } when env var is absent.
 *   Returns { ok: false, status: 'auth_failed' | 'unreachable' } on error.
 */

'use strict';

const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS        = 25000; // reduced from 30s - stay under Netlify 26s function limit
const MAX_BODY_BYTES    = 65536; // 64 KB - covers system prompt + stock context + pplxData JSON

// -- Entry point ---------------------------------------------------------------
exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Ping / status-check mode (GET ?mode=ping)
  if ((event.queryStringParameters || {}).mode === 'ping') {
    return handlePing();
  }

  if (event.httpMethod !== 'POST') {
    return res(405, { error: 'Method not allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    return res(503, { error: 'Anthropic service not configured' });
  }

  // Validate body size before parsing
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return res(400, { error: 'Invalid request body' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return res(400, { error: 'Invalid JSON' });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res(400, { error: 'Missing messages array' });
  }

  // Build upstream payload - x-api-key added server-side, never from client
  const payload = {
    model:      body.model      || 'claude-sonnet-4-5',
    max_tokens: Math.min(body.max_tokens || 1000, 4000),
    messages:   body.messages,
  };
  if (typeof body.system === 'string') payload.system = body.system;

  try {
    const upstream = await timedFetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify(payload),
    }, TIMEOUT_MS);

    if (!upstream.ok) {
      const status = upstream.status;
      // Consume body to avoid memory leak - do not forward (may contain key hints)
      await upstream.text().catch(() => {});
      if (status === 401 || status === 403) return res(502, { error: 'Authentication failed' });
      if (status === 429)                   return res(429, { error: 'Rate limit reached' });
      return res(502, { error: 'Upstream error ' + status });
    }

    const data = await upstream.json();
    return res(200, data);

  } catch (e) {
    console.error('[anthropic-proxy] fetch failed:', e.message);
    return res(502, { error: 'Upstream request failed' });
  }
};

// -- Ping handler --------------------------------------------------------------
async function handlePing() {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) return res(200, { ok: false, status: 'no_key' });

  try {
    const r = await timedFetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages:   [{ role: 'user', content: 'Reply only: ok' }],
      }),
    }, 15000);

    if (!r.ok) {
      await r.text().catch(() => {});
      return res(200, { ok: false, status: 'auth_failed' });
    }

    const d = await r.json();
    return res(200, {
      ok:     true,
      model:  d.model               || 'claude-haiku-4-5-20251001',
      tokens: d.usage?.input_tokens || 0,
    });

  } catch (e) {
    console.error('[anthropic-proxy] ping failed:', e.message);
    return res(200, { ok: false, status: 'unreachable' });
  }
}

// -- Fetch with timeout --------------------------------------------------------
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// -- CORS headers --------------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

// -- Standard response builder -------------------------------------------------
function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
