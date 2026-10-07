'use strict';

/*
 * tools/ath-verify-owner.js
 *
 * R-1 Slice B (B3) — owner-run ATH verification CLI.
 *
 * For each ticker of ONE explicit snapshot (a JSON file supplied at run time, outside the repo)
 * it fetches Yahoo DAILY history, asks the operator for the TradingView `All` -> `High` reading,
 * identifies the matching Yahoo bar and every higher bar, collects independent evidence only when
 * a higher bar predates TradingView's history, shows the recomputed outcome and — only with
 * --write — posts the attempt to the gated writer, which recomputes it again server-side.
 *
 * Modes (strict flags; no env reads; no interactive default):
 *   PLAN (default)   --snapshot <file> [--allowed <list>]
 *       Zero network. Validates the snapshot and prints the PT_ATH_ALLOWED_TICKERS value to arm.
 *   VERIFY (dry-run) --snapshot <file> --allowed <list> --verify
 *       Fetches Yahoo (network), prompts the operator, prints the outcome. WRITES NOTHING.
 *   WRITE            ... --verify --write [--base <https origin>]   (PT_ATH_WRITE_TOKEN in the environment)
 *       Also posts each recomputable attempt to <base>/.netlify/functions/ath-write.
 *   TEARDOWN         --snapshot <file> --allowed <list> --teardown [--base ...]   (PT_ATH_WRITE_TOKEN in the environment)
 *       Deletes the snapshot tickers' records through the writer. Never combined with --verify.
 *
 * SAFETY:
 *   - The ONLY environment value read is PT_ATH_WRITE_TOKEN, and only in WRITE and TEARDOWN mode
 *     (never in PLAN or a dry-run). The token is never a flag and never read from a file, is held
 *     in memory and is never printed. The environment is injected as io.env (the entry point passes
 *     process.env).
 *   - The token is only ever sent to this project's DEV branch deploy (branch-dev--portfoliotrk
 *     .netlify.app). Production, look-alike hosts, other deploys and any other HTTPS site are
 *     refused before any request (BASE_HOST_NOT_APPROVED / PROD_TARGET_FORBIDDEN).
 *   - TRUST BOUNDARY (B1+B3): the Yahoo series this tool submits is operator-supplied; the writer
 *     derives everything from it but does not fetch Yahoo. See brief section 4.
 *   - No plausibility logic: it prints what Yahoo returned and which bars are higher than the
 *     matched one; it never ranks, flags or discards a bar. Dispositions are decided by the
 *     shared rule in ath-record (and re-decided by the writer), not by this tool.
 *   - Live use of any mode other than PLAN needs explicit Owner approval (brief section 7).
 *
 * Exit codes: 0 = done; 1 = pre-call failure (CONFIG / INPUT, zero requests); 2 = a run stop.
 */

const fs = require('fs');

const { parseAthAllowedTickers } = require('../netlify/functions/lib/ath-preflight');
const ath = require('../netlify/functions/lib/ath-record');

// The ONLY hosts the write token may ever be sent to: this project's DEV branch deploy. Production
// and every other host (including look-alikes, other deploys and any other HTTPS site) are refused.
const DEV_HOST = 'branch-dev--portfoliotrk.netlify.app';
const DEV_HOSTS = Object.freeze([DEV_HOST]);
const DEFAULT_BASE = 'https://' + DEV_HOST;
const PROD_HOSTNAME = 'portfoliotrk.netlify.app';
const WRITE_ROUTE = '/.netlify/functions/ath-write';
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const MAX_SNAPSHOT_TICKERS = 100;
const TOP_BARS_LISTED = 5;

function fail(stage, reason) { return { ok: false, stage: stage, reason: reason }; }

// ── arguments ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { snapshot: undefined, allowed: undefined, base: DEFAULT_BASE, verify: false, write: false, teardown: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--verify') { args.verify = true; continue; }
    if (flag === '--write') { args.write = true; continue; }
    if (flag === '--teardown') { args.teardown = true; continue; }
    if (flag === '--snapshot' || flag === '--allowed' || flag === '--base') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value.slice(0, 2) === '--') { return fail('CONFIG', 'FLAG_VALUE_MISSING'); }
      if (flag === '--snapshot') { args.snapshot = value; }
      else if (flag === '--allowed') { args.allowed = value; }
      else { args.base = value; }
      i += 1;
      continue;
    }
    return fail('CONFIG', 'UNKNOWN_FLAG');
  }
  if (args.snapshot === undefined) { return fail('CONFIG', 'SNAPSHOT_FLAG_MISSING'); }
  if (args.write && !args.verify) { return fail('CONFIG', 'WRITE_REQUIRES_VERIFY'); }
  if (args.teardown && (args.verify || args.write)) { return fail('CONFIG', 'MODE_CONFLICT'); }
  return { ok: true, args: args };
}

function validateBase(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { return fail('CONFIG', 'BASE_URL_INVALID'); }
  // An origin and nothing else: https, no credentials, no port, no path, no query, no fragment.
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' ||
      url.pathname !== '/' || url.search !== '' || url.hash !== '') { return fail('CONFIG', 'BASE_URL_INVALID'); }
  // Production is refused even in a trailing-dot spelling; the DEV host must match EXACTLY (the URL
  // parser has already lower-cased it), so a trailing-dot or any other spelling is not approved.
  if (url.hostname.replace(/\.+$/, '') === PROD_HOSTNAME) { return fail('CONFIG', 'PROD_TARGET_FORBIDDEN'); }
  if (DEV_HOSTS.indexOf(url.hostname) === -1) { return fail('CONFIG', 'BASE_HOST_NOT_APPROVED'); }
  // The string the operator typed must be that origin exactly (optionally with one trailing slash):
  // no upper-case, whitespace or other alternative spelling of the approved host.
  if (raw !== 'https://' + url.hostname && raw !== 'https://' + url.hostname + '/') { return fail('CONFIG', 'BASE_URL_INVALID'); }
  return { ok: true, base: 'https://' + url.hostname };
}

// ── snapshot ──────────────────────────────────────────────────────────────────
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function hasExactKeys(obj, keys) {
  const actual = Object.keys(obj);
  return actual.length === keys.length && keys.every(function (k) { return Object.prototype.hasOwnProperty.call(obj, k); });
}

function loadSnapshot(snapshotPath) {
  let raw;
  try { raw = fs.readFileSync(snapshotPath, 'utf8'); } catch (_) { return fail('INPUT', 'SNAPSHOT_FILE_NOT_FOUND'); }
  let doc;
  try { doc = JSON.parse(raw); } catch (_) { return fail('INPUT', 'SNAPSHOT_JSON_INVALID'); }
  if (!isPlainObject(doc) || !hasExactKeys(doc, ['schemaVersion', 'tickers']) || doc.schemaVersion !== 1 ||
      !Array.isArray(doc.tickers) || doc.tickers.length < 1 || doc.tickers.length > MAX_SNAPSHOT_TICKERS) {
    return fail('INPUT', 'SNAPSHOT_SHAPE_INVALID');
  }
  const seen = new Set();
  const entries = [];
  for (const e of doc.tickers) {
    if (!isPlainObject(e) || !hasExactKeys(e, ['ticker', 'tradingViewSymbol', 'currency', 'unit'])) { return fail('INPUT', 'SNAPSHOT_SHAPE_INVALID'); }
    if (typeof e.ticker !== 'string' || !ath.TICKER_RE.test(e.ticker)) { return fail('INPUT', 'SNAPSHOT_TICKER_INVALID'); }
    if (typeof e.tradingViewSymbol !== 'string' || !ath.TV_SYMBOL_RE.test(e.tradingViewSymbol)) { return fail('INPUT', 'SNAPSHOT_TV_SYMBOL_INVALID'); }
    if (!ath.currencyUnitOk(e.currency, e.unit)) { return fail('INPUT', 'SNAPSHOT_UNIT_INVALID'); }
    if (seen.has(e.ticker)) { return fail('INPUT', 'SNAPSHOT_DUPLICATE_TICKER'); }
    seen.add(e.ticker);
    entries.push({ ticker: e.ticker, tradingViewSymbol: e.tradingViewSymbol, currency: e.currency, unit: e.unit });
  }
  entries.sort(function (a, b) { return a.ticker < b.ticker ? -1 : (a.ticker > b.ticker ? 1 : 0); });
  return { ok: true, entries: entries };
}

// The write token comes from the environment only (never a flag, never a file). It is read in
// WRITE and TEARDOWN mode and nowhere else.
function loadToken(env) {
  const token = env && typeof env === 'object' ? env.PT_ATH_WRITE_TOKEN : undefined;
  if (typeof token !== 'string' || token === '') { return fail('CONFIG', 'TOKEN_ENV_MISSING'); }
  return { ok: true, token: token };
}

// ── Yahoo daily history ───────────────────────────────────────────────────────
// Daily bars from the beginning to now (period1/period2). A "max range" request silently returns
// coarse bars, which loses the true date of the high.
async function fetchYahooBars(fetchImpl, ticker, nowMs) {
  const url = YAHOO_BASE + encodeURIComponent(ticker) + '?interval=1d&period1=0&period2=' + Math.floor(nowMs / 1000);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json'
      }
    });
  } catch (_) { return fail('YAHOO', 'YAHOO_FETCH_FAILED'); }
  if (!response || response.status !== 200) { return fail('YAHOO', 'YAHOO_FETCH_FAILED'); }
  let body;
  try { body = await response.json(); } catch (_) { return fail('YAHOO', 'YAHOO_BODY_INVALID'); }
  const result = body && body.chart && Array.isArray(body.chart.result) ? body.chart.result[0] : null;
  const quote = result && result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
  if (!result || !result.meta || typeof result.meta.currency !== 'string' || !Array.isArray(result.timestamp) || !quote || !Array.isArray(quote.high) ||
      quote.high.length !== result.timestamp.length) {
    return fail('YAHOO', 'YAHOO_BODY_INVALID');
  }
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const high = quote.high[i];
    const ts = result.timestamp[i];
    // A bar with no high (a halted or empty day) carries no information: it is skipped, not judged.
    if (typeof high === 'number' && isFinite(high) && high > 0 && typeof ts === 'number' && isFinite(ts)) {
      bars.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), high: high });
    }
  }
  if (bars.length === 0) { return fail('YAHOO', 'YAHOO_NO_BARS'); }
  bars.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return { ok: true, currency: result.meta.currency, bars: bars, count: bars.length, firstBarDate: bars[0].date };
}

// ── prompts ───────────────────────────────────────────────────────────────────
function parsePositive(text) {
  const n = Number(String(text).trim().replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

function say(io, line) { io.stdout.write(line + '\n'); }

async function askTradingView(io, entry) {
  const high = parsePositive(await io.ask('tradingViewHigh (All range, right-side High, ' + entry.unit + '): '));
  if (high === null) { return fail('ANSWER', 'ANSWER_INVALID'); }
  const unitAnswer = String(await io.ask('tradingViewUnit [' + entry.unit + ']: ')).trim();
  const unit = unitAnswer === '' ? entry.unit : unitAnswer;
  let factor;
  if (unit === entry.unit) { factor = 1; }
  else if (unit === 'ILS' && entry.unit === 'ILA') { factor = 100; }
  else if (unit === 'ILA' && entry.unit === 'ILS') { factor = 0.01; }
  else { return fail('UNIT', 'UNIT_INCOMPATIBLE'); }
  const firstBar = String(await io.ask('tradingViewFirstBarDate (YYYY-MM-DD, first bar shown): ')).trim();
  if (!ath.isIsoDay(firstBar)) { return fail('ANSWER', 'ANSWER_INVALID'); }
  const adj = String(await io.ask('tradingViewAdjSetting (on|off): ')).trim();
  if (adj !== 'on' && adj !== 'off') { return fail('ANSWER', 'ANSWER_INVALID'); }
  return { ok: true, high: round6(high * factor), firstBar: firstBar, adj: adj };
}

async function askIndependent(io, nowIso) {
  const kind = String(await io.ask('independentKind (bar-level|ath-claim|skip): ')).trim();
  if (kind === '' || kind === 'skip') { return { ok: true, independent: null }; }
  if (kind !== 'bar-level' && kind !== 'ath-claim') { return fail('ANSWER', 'ANSWER_INVALID'); }
  const source = String(await io.ask('independentSource (name of the source): ')).trim();
  const url = String(await io.ask('independentUrl (https page): ')).trim();
  const retrievedAnswer = String(await io.ask('independentRetrievedAt [' + nowIso + ']: ')).trim();
  const quotedValue = parsePositive(await io.ask('independentQuotedValue: '));
  const quotedDate = String(await io.ask('independentQuotedDate (YYYY-MM-DD): ')).trim();
  const coverageStart = String(await io.ask('independentCoverageStart (YYYY-MM-DD, start of the source history): ')).trim();
  return {
    ok: true,
    independent: {
      kind: kind,
      source: source,
      url: url,
      retrievedAt: retrievedAnswer === '' ? nowIso : retrievedAnswer,
      quotedValue: quotedValue === null ? NaN : quotedValue,
      quotedDate: quotedDate,
      coverageStart: coverageStart
    }
  };
}

async function askSearch(io) {
  const answer = String(await io.ask('searchValue (published ATH, blank to skip): ')).trim();
  if (answer === '') { return { ok: true, searchValue: null }; }
  const value = parsePositive(answer);
  const date = String(await io.ask('searchDate (YYYY-MM-DD): ')).trim();
  const citation = String(await io.ask('searchCitation (url or title): ')).trim();
  return { ok: true, searchValue: { value: value === null ? NaN : value, date: date, citation: citation } };
}

// ── network writes ────────────────────────────────────────────────────────────
async function postWriter(fetchImpl, base, token, payload) {
  let response;
  try {
    response = await fetchImpl(base + WRITE_ROUTE, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) { return { status: null, body: { status: 'TRANSPORT_ERROR' } }; }
  let body;
  try { body = await response.json(); } catch (_) { return { status: response ? response.status : null, body: { status: 'BODY_NOT_JSON' } }; }
  return { status: response.status, body: body && typeof body === 'object' ? body : { status: 'BODY_NOT_JSON' } };
}

// ── main ──────────────────────────────────────────────────────────────────────
function done(io, exitCode, result) {
  say(io, JSON.stringify(result));
  return { exitCode: exitCode, result: result };
}

async function main(argv, io) {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) { return done(io, 1, parsedArgs); }
  const args = parsedArgs.args;

  const base = validateBase(args.base);
  if (!base.ok) { return done(io, 1, base); }

  const snapshot = loadSnapshot(args.snapshot);
  if (!snapshot.ok) { return done(io, 1, snapshot); }
  const entries = snapshot.entries;

  const needsAllowed = args.verify || args.teardown;
  if (needsAllowed && args.allowed === undefined) { return done(io, 1, fail('CONFIG', 'ALLOWED_FLAG_MISSING')); }
  if (args.allowed !== undefined) {
    const allow = parseAthAllowedTickers(args.allowed);
    if (!allow.ok) { return done(io, 1, fail('CONFIG', 'ALLOWED_INVALID')); }
    for (const entry of entries) {
      if (!allow.tickers.has(entry.ticker)) { return done(io, 1, fail('CONFIG', 'SYMBOL_NOT_IN_ALLOWLIST')); }
    }
  }

  const tickers = entries.map(function (e) { return e.ticker; });
  const allowedValue = tickers.join(',');

  if (!args.verify && !args.teardown) {
    say(io, 'PLAN tickers=' + allowedValue + ' count=' + tickers.length + ' base=' + base.base);
    say(io, 'ARM PT_ATH_ALLOWED_TICKERS=' + allowedValue);
    return done(io, 0, { ok: true, stage: 'PLAN', mode: 'plan', tickers: tickers, allowedValue: allowedValue, base: base.base });
  }

  let token = null;
  if (args.write || args.teardown) {
    const t = loadToken(io.env);
    if (!t.ok) { return done(io, 1, t); }
    token = t.token;
  }

  const nowMs = typeof io.nowMs === 'number' ? io.nowMs : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const results = [];

  if (args.teardown) {
    for (const entry of entries) {
      const r = await postWriter(io.fetchImpl, base.base, token, { ticker: entry.ticker, action: 'DELETE' });
      const status = r.body && r.body.status;
      say(io, 'TEARDOWN ' + entry.ticker + ' ' + String(status));
      if (status !== 'DELETED' && status !== 'NOT_AVAILABLE') {
        return done(io, 2, { ok: false, stage: 'TEARDOWN', reason: String(status), results: results });
      }
      results.push({ ticker: entry.ticker, status: status });
    }
    return done(io, 0, { ok: true, stage: 'DONE', mode: 'teardown', results: results });
  }

  for (const entry of entries) {
    const y = await fetchYahooBars(io.fetchImpl, entry.ticker, nowMs);
    if (!y.ok) { return done(io, 2, { ok: false, stage: y.stage, reason: y.reason, results: results }); }
    if (y.currency !== entry.unit) { return done(io, 2, { ok: false, stage: 'UNIT', reason: 'UNIT_MISMATCH', results: results }); }
    say(io, 'TICKER ' + entry.ticker + ' bars=' + y.count + ' first=' + y.firstBarDate + ' unit=' + entry.unit);

    const tv = await askTradingView(io, entry);
    if (!tv.ok) { return done(io, 2, { ok: false, stage: tv.stage, reason: tv.reason, results: results }); }

    const sel = ath.selectMatchedBar(y.bars, tv.high);
    const matched = sel.matchedBar;
    let uncoveredCount = 0;
    if (matched !== null) {
      say(io, 'MATCH ' + matched.date + ' ' + matched.high);
      sel.higherBars.map(function (h) { return { date: h.date, high: h.high, covered: h.date >= tv.firstBar }; }).forEach(function (b) {
        if (!b.covered) { uncoveredCount += 1; }
        say(io, 'HIGHER ' + b.date + ' ' + b.high + ' ' + (b.covered ? 'covered' : 'uncovered'));
      });
    } else {
      say(io, 'NO_CLEAN_MATCH');
      y.bars.slice().sort(function (a, b) { return b.high - a.high; }).slice(0, TOP_BARS_LISTED).forEach(function (b) {
        say(io, 'TOP ' + b.date + ' ' + b.high);
      });
    }

    let independent = null;
    if (uncoveredCount > 0) {
      const ind = await askIndependent(io, nowIso);
      if (!ind.ok) { return done(io, 2, { ok: false, stage: ind.stage, reason: ind.reason, results: results }); }
      independent = ind.independent;
    }
    const search = await askSearch(io);

    // The attempt carries the FULL Yahoo daily series. The writer derives the matched bar, every
    // higher bar and the covered / uncovered split itself; this tool sends no verdict of its own.
    const attempt = {
      tradingViewSymbol: entry.tradingViewSymbol,
      currency: entry.currency,
      unit: entry.unit,
      tradingViewHigh: tv.high,
      tradingViewFirstBarDate: tv.firstBar,
      tradingViewAdjSetting: tv.adj,
      bars: y.bars,
      independent: independent,
      searchValue: search.searchValue
    };

    const cls = ath.classifyVerification(attempt, nowIso);
    const item = { ticker: entry.ticker, status: null, reason: null, matchedHigh: matched === null ? null : matched.high, written: false };
    if (!cls.ok) {
      item.status = 'invalid';
      item.reason = cls.reason;
      say(io, 'RESULT ' + entry.ticker + ' invalid ' + cls.reason);
      results.push(item);
      continue;
    }
    item.status = cls.status;
    item.reason = cls.reason;
    say(io, 'RESULT ' + entry.ticker + ' ' + cls.status + (cls.reason === null ? '' : ' ' + cls.reason));

    if (args.write) {
      const w = await postWriter(io.fetchImpl, base.base, token, { ticker: entry.ticker, attempt: attempt });
      const status = w.body && w.body.status;
      say(io, 'WRITE ' + entry.ticker + ' ' + String(status));
      if (status !== 'WRITE' && status !== 'REFRESH_RECORDED') {
        results.push(item);
        return done(io, 2, { ok: false, stage: 'WRITE', reason: String(status), results: results });
      }
      item.written = true;
      item.writeStatus = status;
    }
    results.push(item);
  }
  return done(io, 0, { ok: true, stage: 'DONE', mode: 'verify', results: results });
}

// Operator prompts read lines from stdin without any extra module.
function makeStdinAsk() {
  let buffer = '';
  let ended = false;
  const waiters = [];
  function flush() {
    while (waiters.length > 0) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) {
        if (ended) { waiters.shift().reject(new Error('STDIN_CLOSED')); continue; }
        break;
      }
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      waiters.shift().resolve(line);
    }
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) { buffer += chunk; flush(); });
  process.stdin.on('end', function () { ended = true; flush(); });
  return function ask(question) {
    process.stdout.write(question);
    return new Promise(function (resolve, reject) { waiters.push({ resolve: resolve, reject: reject }); flush(); });
  };
}

module.exports = { main, parseArgs, validateBase, loadSnapshot, fetchYahooBars };

if (require.main === module) {
  main(process.argv.slice(2), {
    fetchImpl: function (url, options) { return globalThis.fetch(url, options); },
    env: process.env,
    ask: makeStdinAsk(),
    stdout: process.stdout,
    stderr: process.stderr,
    nowMs: Date.now()
  }).then(function (r) {
    process.exitCode = r.exitCode;
    process.stdin.pause();
  }).catch(function (err) {
    process.stderr.write('FATAL: ' + (err && err.message ? err.message : String(err)) + '\n');
    process.exitCode = 2;
    process.stdin.pause();
  });
}
