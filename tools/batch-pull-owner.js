'use strict';

/*
 * tools/batch-pull-owner.js
 *
 * EG-21D-1 — owner-run local batch pull CLI (Option 1a invocation surface).
 *
 * Composes the two shipped dormant libs — doc -> extractBatchTickers (EG-21B)
 * -> runBatchPull (EG-21C-1) — exactly per the composeBatchFromDoc policy
 * frozen by qa/batch_pull_wiring_offline.js: the driver runs ONLY on an
 * { ok: true } extraction; every failure is a stage-tagged union preserving
 * both fixed vocabularies verbatim; all pre-call failures fire with ZERO
 * requests. The script re-implements NO validation policy of its own — the
 * libs are the sole validators.
 *
 * Modes:
 *   DRY-RUN (default)  node tools/batch-pull-owner.js --doc <file>
 *     Prints the batch plan ({ stage: 'PLAN' }) and exits 0. Zero network;
 *     the token file is never read. The printed sorted ticker list is the
 *     exact PT_SEC_EVIDENCE_PULL_ALLOWED_TICKERS value the owner arms before
 *     any live window (EG-21E).
 *   LIVE               ... --live --token-file <file-outside-repo>
 *     Sequential single-ticker POSTs to <base>/.netlify/functions/
 *     sec-evidence-pull via runBatchPull. No retry, no parallelism, no
 *     client-side probes: the endpoint's own gate ordering is the safety
 *     boundary (a gates-OFF run stops after ONE inert 200 DISABLED response).
 *
 * SAFETY:
 *   - Reads NO process.env. All inputs are CLI flags; the token comes ONLY
 *     from --token-file (never argv value, never env), is newline-stripped
 *     once, held in memory, and never printed, logged, or echoed in errors.
 *   - The production host is rejected outright (PROD_TARGET_FORBIDDEN); only
 *     https origins are accepted. Default base = the branch-dev deploy.
 *   - No route/handler export, no @netlify/blobs, no storage, no scheduler:
 *     manual invocation + explicit --live + explicit --token-file are all
 *     required simultaneously for any network call.
 *
 * Exit codes: 0 = dry-run OK or batch complete; 2 = batch STOP (ledger
 * intact, printed); 1 = any pre-call failure (INPUT / CONFIG / EXTRACT and
 * the driver's LIST_* defenses — all zero-request).
 *
 * Contract frozen by qa/batch_owner_script_offline.js (OS-series).
 */

const fs = require('fs');

const { extractBatchTickers } = require('../netlify/functions/lib/portfolio-ticker-source');
const { runBatchPull } = require('../netlify/functions/lib/batch-pull-driver');

const DEFAULT_BASE = 'https://branch-dev--portfoliotrk.netlify.app';
const PROD_HOSTNAME = 'portfoliotrk.netlify.app';
const PULL_ROUTE = '/.netlify/functions/sec-evidence-pull';

function fail(stage, reason) {
  return { ok: false, stage: stage, reason: reason };
}

// Strict flag parser — the only accepted inputs. Unknown flags fail closed;
// no interactive prompts, no env fallback, no positional arguments.
function parseArgs(argv) {
  const args = { doc: undefined, live: false, tokenFile: undefined, base: DEFAULT_BASE, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--live') { args.live = true; continue; }
    if (flag === '--doc' || flag === '--token-file' || flag === '--base' || flag === '--out') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value.slice(0, 2) === '--') {
        return fail('CONFIG', 'FLAG_VALUE_MISSING');
      }
      if (flag === '--doc') { args.doc = value; }
      else if (flag === '--token-file') { args.tokenFile = value; }
      else if (flag === '--base') { args.base = value; }
      else { args.out = value; }
      i += 1;
      continue;
    }
    return fail('CONFIG', 'UNKNOWN_FLAG');
  }
  if (args.doc === undefined) {
    return fail('CONFIG', 'DOC_FLAG_MISSING');
  }
  if (args.live && args.tokenFile === undefined) {
    return fail('CONFIG', 'TOKEN_FILE_MISSING');
  }
  return { ok: true, args: args };
}

// Base origin validation — both modes (the base is part of the printed plan).
// https only; the production host is never a permitted target from this tool.
// The hostname is canonicalized (trailing root-dots stripped; WHATWG URL has
// already lowercased it) before the comparison so a trailing-dot spelling like
// portfoliotrk.netlify.app. — which DNS-resolves to the same host — cannot
// bypass the rejection.
function validateBase(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { return fail('CONFIG', 'BASE_URL_INVALID'); }
  if (url.protocol !== 'https:') {
    return fail('CONFIG', 'BASE_URL_INVALID');
  }
  if (url.hostname.replace(/\.+$/, '') === PROD_HOSTNAME) {
    return fail('CONFIG', 'PROD_TARGET_FORBIDDEN');
  }
  return { ok: true, base: url.origin };
}

// Doc file -> parsed JSON, passed VERBATIM to the extractor (the lib is the
// sole validator; D1/D2/D3, regex, dedupe, sort all come from it). The doc is
// never mutated, never persisted, never echoed in full.
function loadDoc(docPath) {
  let raw;
  try { raw = fs.readFileSync(docPath, 'utf8'); } catch (_) { return fail('INPUT', 'DOC_FILE_NOT_FOUND'); }
  let doc;
  try { doc = JSON.parse(raw); } catch (_) { return fail('INPUT', 'DOC_JSON_INVALID'); }
  return { ok: true, doc: doc };
}

// Token: read once, strip ONE trailing newline only (the endpoint preflight
// is an exact untrimmed Bearer match), held in memory. Errors carry fixed
// reasons only — never file contents.
function loadToken(tokenPath) {
  let raw;
  try { raw = fs.readFileSync(tokenPath, 'utf8'); } catch (_) { return fail('CONFIG', 'TOKEN_FILE_UNREADABLE'); }
  const token = raw.replace(/\r?\n$/, '');
  if (token === '') {
    return fail('CONFIG', 'TOKEN_EMPTY');
  }
  return { ok: true, token: token };
}

// The injected transport for runBatchPull: one POST per ticker. A throwing
// fetch or a non-JSON body becomes a synthetic non-continue outcome, so the
// driver STOPs with the ledger intact instead of losing it to an exception.
function makeLiveCallFn(fetchImpl, base, token) {
  return async function (ticker) {
    let response;
    try {
      response = await fetchImpl(base + PULL_ROUTE, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ ticker: ticker })
      });
    } catch (_) {
      return { statusCode: null, body: { status: 'TRANSPORT_ERROR', reason: 'FETCH_FAILED' } };
    }
    let body;
    try { body = await response.json(); } catch (_) {
      return { statusCode: null, body: { status: 'TRANSPORT_ERROR', reason: 'BODY_NOT_JSON' } };
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return { statusCode: null, body: { status: 'TRANSPORT_ERROR', reason: 'BODY_NOT_JSON' } };
    }
    return { statusCode: response.status, body: body };
  };
}

function progressLine(ticker, r) {
  const body = r && r.body;
  let line = ticker + ' ' + String(r ? r.statusCode : null) + ' ' + String(body ? body.status : undefined);
  if (body && body.reason !== undefined) { line += ' ' + String(body.reason); }
  if (body && body.writtenKeys !== undefined) { line += ' writtenKeys=' + JSON.stringify(body.writtenKeys); }
  return line;
}

// main(argv, io) — io = { fetchImpl, stdout, stderr } injected for offline QA.
// Returns { exitCode, result }; never calls process.exit itself.
async function main(argv, io) {
  const stdout = (io && io.stdout) || process.stdout;
  const stderr = (io && io.stderr) || process.stderr;
  const fetchImpl = (io && io.fetchImpl !== undefined) ? io.fetchImpl : globalThis.fetch;

  let outPath;
  function finish(result, exitCode) {
    const text = JSON.stringify(result, null, 2) + '\n';
    stdout.write(text);
    if (outPath !== undefined) {
      try { fs.writeFileSync(outPath, text); } catch (_) { stderr.write('WARN: --out write failed\n'); }
    }
    return { exitCode: exitCode, result: result };
  }

  const parsed = parseArgs(argv);
  if (parsed.ok !== true) {
    return finish(parsed, 1);
  }
  const args = parsed.args;
  outPath = args.out;

  const baseResult = validateBase(args.base);
  if (baseResult.ok !== true) {
    return finish(baseResult, 1);
  }
  const base = baseResult.base;

  // Live-only config completes BEFORE any doc work; dry-run never reads the
  // token file — not even to validate it.
  let token = null;
  if (args.live) {
    const tokenResult = loadToken(args.tokenFile);
    if (tokenResult.ok !== true) {
      return finish(tokenResult, 1);
    }
    token = tokenResult.token;
  }

  const docResult = loadDoc(args.doc);
  if (docResult.ok !== true) {
    return finish(docResult, 1);
  }

  const extraction = extractBatchTickers(docResult.doc);
  if (extraction.ok !== true) {
    if (extraction.reason === 'RAW_ENVELOPE') {
      stderr.write('RAW_ENVELOPE: the doc file holds a raw GET envelope; save only the .doc member ({ schemaVersion, holdings }) and retry.\n');
    }
    return finish({ ok: false, stage: 'EXTRACT', reason: extraction.reason, ledger: [] }, 1);
  }

  if (!args.live) {
    return finish({
      ok: true,
      stage: 'PLAN',
      dryRun: true,
      count: extraction.tickers.length,
      tickers: extraction.tickers,
      base: base,
      request: 'POST ' + PULL_ROUTE + ' {"ticker":"<T>"} x ' + extraction.tickers.length
    }, 0);
  }

  const callFn = makeLiveCallFn(fetchImpl, base, token);
  const batch = await runBatchPull(extraction.tickers, async function (ticker) {
    const r = await callFn(ticker);
    stdout.write(progressLine(ticker, r) + '\n');
    return r;
  });
  const result = Object.assign({ stage: 'BATCH' }, batch);
  const exitCode = result.ok !== true ? 1 : (result.complete === true ? 0 : 2);
  return finish(result, exitCode);
}

module.exports = { parseArgs, validateBase, loadDoc, loadToken, makeLiveCallFn, main };

if (require.main === module) {
  main(process.argv.slice(2), { fetchImpl: globalThis.fetch, stdout: process.stdout, stderr: process.stderr })
    .then(function (r) { process.exit(r.exitCode); })
    .catch(function (err) {
      process.stderr.write('FATAL: ' + (err && err.message ? err.message : String(err)) + '\n');
      process.exit(1);
    });
}
