/**
 * Netlify Serverless Function: perplexity-proxy
 * Path: netlify/functions/perplexity-proxy.js
 *
 * Proxies requests to api.perplexity.ai/chat/completions using a server-side key.
 * PERPLEXITY_API_KEY is never returned to the browser in any response body,
 * header, or log line.
 *
 * Normal use:  POST /.netlify/functions/perplexity-proxy
 *   Body: { model, messages, max_tokens }
 *   No Authorization header from client — key is added server-side only.
 *
 * Status ping: GET /.netlify/functions/perplexity-proxy?mode=ping
 *   Returns { ok: true, model, tokens } on success.
 *   Returns { ok: false, status: 'no_key' } when env var is absent.
 *   Returns { ok: false, status: 'auth_failed' | 'unreachable' } on error.
 */

'use strict';

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const TIMEOUT_MS     = 20000; // per-request timeout
const MAX_BODY_BYTES = 32768; // 32 KB — prevents open-relay abuse

// ── Entry point ───────────────────────────────────────────────────────────────
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

  const key = process.env.PERPLEXITY_API_KEY || '';
  if (!key) {
    return res(503, { error: 'Perplexity service not configured' });
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

  // Forward to Perplexity — Authorization added server-side, never from client
  try {
    const upstream = await timedFetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:      body.model      || 'sonar-pro',
        messages:   body.messages,
        max_tokens: Math.min(body.max_tokens || 1000, 2000),
      }),
    }, TIMEOUT_MS);

    if (!upstream.ok) {
      const status = upstream.status;
      // Consume body to avoid memory leak — do not forward (may contain key hints)
      await upstream.text().catch(() => {});
      if (status === 401 || status === 403) return res(502, { error: 'Authentication failed' });
      if (status === 429)                   return res(429, { error: 'Rate limit reached' });
      return res(502, { error: 'Upstream error ' + status });
    }

    const data = await upstream.json();
    return res(200, data);

  } catch (e) {
    console.error('[perplexity-proxy] fetch failed:', e.message);
    return res(502, { error: 'Upstream request failed' });
  }
};

// ── Ping handler ──────────────────────────────────────────────────────────────
async function handlePing() {
  const key = process.env.PERPLEXITY_API_KEY || '';
  if (!key) return res(200, { ok: false, status: 'no_key' });

  try {
    const r = await timedFetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:      'sonar',
        messages:   [{ role: 'user', content: 'Reply with only: {"status":"ok"}' }],
        max_tokens: 20,
      }),
    }, 15000);

    if (!r.ok) {
      await r.text().catch(() => {});
      return res(200, { ok: false, status: 'auth_failed' });
    }

    const d = await r.json();
    return res(200, {
      ok:     true,
      model:  d.model              || 'sonar',
      tokens: d.usage?.total_tokens || 0,
    });

  } catch (e) {
    console.error('[perplexity-proxy] ping failed:', e.message);
    return res(200, { ok: false, status: 'unreachable' });
  }
}

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── CORS headers ──────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

// ── Standard response builder ─────────────────────────────────────────────────
function res(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
