'use strict';

/*
 * anthropic-proxy-timeout-1 - offline QA.
 *
 * Drives the REAL netlify/functions/anthropic-proxy.js handler in-process with a
 * counterfeit fetch / setTimeout / clearTimeout. No network, no live services.
 * A test key value only.
 *
 * SCOPE LIMIT: AT-2 is arithmetic against the DOCUMENTED Netlify 60 s synchronous
 * limit. It is not a platform test; the platform limit is proven only by the
 * post-deploy long-duration DEV check named in the brief (section 4).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROXY_PATH = path.resolve(__dirname, '..', 'netlify', 'functions', 'anthropic-proxy.js');
const EXPECTED_TIMEOUT_MS = 50000;
const DOCUMENTED_LIMIT_MS = 60000;
const MIN_MARGIN_MS = 10000;

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

function timeoutLine(src) {
  const m = /^const TIMEOUT_MS\b.*$/m.exec(src);
  return m ? m[0] : '';
}
function timeoutLiteral(src) {
  const m = /^const TIMEOUT_MS\s*=\s*(\d+)\s*;/m.exec(src);
  return m ? Number(m[1]) : NaN;
}

// Run one POST through the handler at `handlerPath` with counterfeit globals.
// opts.upstream: function(url, init) -> Promise<response-like>   (default: 200 ok)
// opts.fireTimer: when true, fire the captured abort timer once the handler is awaiting upstream
async function drive(handlerPath, body, opts) {
  opts = opts || {};
  const saved = {
    key: process.env.ANTHROPIC_API_KEY,
    gate: process.env.PT_ENABLE_P5_CALL2_TOOL_USE,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    log: console.log,
    error: console.error
  };
  const timers = [];
  const cleared = [];
  const calls = [];
  try {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    delete process.env.PT_ENABLE_P5_CALL2_TOOL_USE;
    globalThis.setTimeout = function (fn, ms) { const h = { fn: fn, ms: ms }; timers.push(h); return h; };
    globalThis.clearTimeout = function (h) { cleared.push(h); };
    globalThis.fetch = function (url, init) {
      calls.push({ url: url, init: init });
      if (opts.upstream) return opts.upstream(url, init);
      return Promise.resolve({
        ok: true, status: 200,
        json: function () { return Promise.resolve({ id: 'msg_test', content: [{ type: 'text', text: 'ok' }], usage: { output_tokens: 3 } }); },
        text: function () { return Promise.resolve(''); }
      });
    };
    console.log = function () {};
    console.error = function () {};
    delete require.cache[require.resolve(handlerPath)];
    const mod = require(handlerPath);
    const pending = mod.handler({ httpMethod: 'POST', body: JSON.stringify(body), queryStringParameters: null });
    if (opts.fireTimer && timers.length > 0) timers[0].fn();
    const response = await pending;
    return { response: response, timers: timers, cleared: cleared, calls: calls };
  } finally {
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.gate === undefined) delete process.env.PT_ENABLE_P5_CALL2_TOOL_USE; else process.env.PT_ENABLE_P5_CALL2_TOOL_USE = saved.gate;
    globalThis.fetch = saved.fetch;
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
    console.log = saved.log;
    console.error = saved.error;
  }
}

// A fetch that never settles until its AbortSignal fires, then rejects like the real one.
function hangingUpstream(url, init) {
  return new Promise(function (resolve, reject) {
    init.signal.addEventListener('abort', function () {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
}

const BASE_BODY = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1800,
  system: 'SYSTEM-AS-SENT',
  messages: [{ role: 'user', content: 'hi' }]
};

// AT-1 + AT-4 on a given handler path (shared with the planted negative).
async function timeoutChecks(handlerPath, srcText) {
  const literal = timeoutLiteral(srcText);
  const run = await drive(handlerPath, BASE_BODY);
  const armed = run.timers.length > 0 ? run.timers[0].ms : null;
  return { at1: literal === EXPECTED_TIMEOUT_MS, at4: armed === EXPECTED_TIMEOUT_MS };
}

async function main() {
  const src = fs.readFileSync(PROXY_PATH, 'utf8');

  // AT-1 / AT-2 / AT-3 - source text
  const literal = timeoutLiteral(src);
  const line = timeoutLine(src);
  check('AT-1 TIMEOUT_MS literal is 50000', literal === EXPECTED_TIMEOUT_MS);
  check('AT-2 documented 60 s limit minus TIMEOUT_MS leaves >= 10 s margin (arithmetic on external docs, not a platform test)',
    Number.isFinite(literal) && DOCUMENTED_LIMIT_MS - literal >= MIN_MARGIN_MS);
  check('AT-3 outdated "26s function limit" comment is gone', line !== '' && !/26\s*s\b/i.test(line) && src.indexOf('26s function limit') === -1);
  check('AT-3 new comment names 60 s', /60 s/.test(line));

  // AT-4 - abort timer armed with the exact value; the timer is the only one the handler arms
  const ok = await drive(PROXY_PATH, BASE_BODY);
  check('AT-4 handler arms exactly one abort timer', ok.timers.length === 1);
  check('AT-4 abort timer armed with exactly 50000 ms', ok.timers.length === 1 && ok.timers[0].ms === EXPECTED_TIMEOUT_MS);

  // AT-5 - firing the timer still yields 504 "Upstream timeout"
  const hung = await drive(PROXY_PATH, BASE_BODY, { upstream: hangingUpstream, fireTimer: true });
  check('AT-5 abort -> 504', hung.response.statusCode === 504);
  check('AT-5 abort body is {"error":"Upstream timeout"}', hung.response.body === JSON.stringify({ error: 'Upstream timeout' }));

  // AT-6 - success path unchanged
  check('AT-6 success -> 200', ok.response.statusCode === 200);
  check('AT-6 upstream JSON passed through', ok.response.body === JSON.stringify({ id: 'msg_test', content: [{ type: 'text', text: 'ok' }], usage: { output_tokens: 3 } }));
  check('AT-6 exactly one upstream call', ok.calls.length === 1);
  const sent = ok.calls.length ? JSON.parse(ok.calls[0].init.body) : {};
  check('AT-6 payload keys are exactly model / max_tokens / messages / system',
    JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(['max_tokens', 'messages', 'model', 'system']));
  check('AT-6 max_tokens and system sent as given', sent.max_tokens === 1800 && sent.system === 'SYSTEM-AS-SENT');
  const gated = await drive(PROXY_PATH, Object.assign({ p5ToolUse: true }, BASE_BODY));
  const gatedSent = gated.calls.length ? JSON.parse(gated.calls[0].init.body) : { tools: 'missing-call' };
  check('AT-6 no tools / tool_choice while the P-5 gate is off (even with p5ToolUse true)',
    gatedSent.tools === undefined && gatedSent.tool_choice === undefined);

  // AT-7 - clamp
  const big = await drive(PROXY_PATH, Object.assign({}, BASE_BODY, { max_tokens: 99999 }));
  const bigSent = big.calls.length ? JSON.parse(big.calls[0].init.body) : {};
  check('AT-7 max_tokens clamp is still 4000', bigSent.max_tokens === 4000);

  // AT-8 - upstream error mapping
  function errUpstream(status) {
    return function () {
      return Promise.resolve({ ok: false, status: status, text: function () { return Promise.resolve('secret-hint'); } });
    };
  }
  const expectErr = [
    [401, 502, 'Authentication failed'],
    [403, 502, 'Authentication failed'],
    [429, 429, 'Rate limit reached'],
    [500, 502, 'Upstream error 500']
  ];
  for (const e of expectErr) {
    const r = await drive(PROXY_PATH, BASE_BODY, { upstream: errUpstream(e[0]) });
    check('AT-8 upstream ' + e[0] + ' -> ' + e[1] + ' ' + e[2],
      r.response.statusCode === e[1] && r.response.body === JSON.stringify({ error: e[2] }));
  }

  // AT-N1 - planted negative on a temp copy: 25000 restored -> AT-1 and AT-4 must fail
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-anthropic-proxy-timeout-1-'));
  try {
    const tmpFile = path.join(tmpDir, 'anthropic-proxy.js');
    const mutated = src.replace(/^(const TIMEOUT_MS\s*=\s*)\d+(\s*;)/m, '$125000$2');
    check('AT-N1 mutation applied to the temp copy', mutated !== src && timeoutLiteral(mutated) === 25000);
    fs.writeFileSync(tmpFile, mutated);
    const neg = await timeoutChecks(tmpFile, mutated);
    check('AT-N1 with 25000, AT-1 fails', neg.at1 === false);
    check('AT-N1 with 25000, AT-4 fails', neg.at4 === false);
    const pos = await timeoutChecks(PROXY_PATH, src);
    check('AT-N1 control: unmutated source passes AT-1 and AT-4', pos.at1 === true && pos.at4 === true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('anthropic_proxy_timeout_offline: ' + asserts + ' asserts, ' + failures + ' failures');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.log('  FAIL  suite crashed: ' + (e && e.stack || e));
  process.exit(1);
});
