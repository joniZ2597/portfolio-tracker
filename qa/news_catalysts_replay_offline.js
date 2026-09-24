'use strict';

/*
 * qa/news_catalysts_replay_offline.js
 *
 * S2-A1 — evidence replay corpus (work/s2-evidence-replay-corpus/brief.md).
 *
 * Replays the nine verified Pilot 3/4 Agent envelopes in
 * qa/fixtures/replay/*.json through the REAL
 * netlify/functions/lib/news-catalysts-provider.js#getNewsCatalysts, with an
 * injected fetchImpl returning each fixture's captured rawResponseBody, and
 * classifies every raw candidate into exactly one of the six §4 buckets.
 *
 * No reimplementation of provider normalization, validation, the ladder or
 * identity (brief §6, STOP-1). The one declared, checked duplication is the
 * D-M2 Evidence Set reconstruction (ported from the Pilot 3/4 harness
 * lib/capture.js, R-7 checks it agrees with real provider grounding
 * behaviour). Candidate-level attribution itself uses ZERO ladder
 * reimplementation: it matches each raw candidate to its surviving item by
 * shared original fields, and — because the provider's single forward pass
 * never reorders either output array — zips the REMAINING (unmatched) raw
 * candidates, in original order, against the REAL skippedItems array, also
 * in original order. S2-M1 made the provider itself emit distinct reasons at
 * its two INVALID_SOURCE_URL emission sites (provider :649 malformed vs :654
 * grounding-miss, now UNRETRIEVED_SOURCE_URL) — the classifier reads that
 * production reason directly, never a re-run of the ladder itself.
 *
 * R-1..R-8 are INVARIANT. R-9/R-10 are SNAPSHOT (labelled with
 * providerVersion) and curated respectively — never presented with
 * candidate-level authority.
 *
 * No network. No live call. No API key needed to run the suite.
 *
 * Run: node qa/news_catalysts_replay_offline.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROVIDER_PATH = path.join(ROOT, 'netlify/functions/lib/news-catalysts-provider.js');
const FIXTURES_DIR = path.join(ROOT, 'qa/fixtures/replay');

const provider = require(PROVIDER_PATH);

const ITEM_FIELD_ORDER = [
  'ticker', 'eventDate', 'category', 'direction', 'sourceUrl',
  'normalizedSourceUrl', 'sourceDomain', 'provider', 'retrievedAt',
  'identityHash', 'provenance', 'confidence', 'requiresVerification', 'scoringImpact',
  'eventType', 'relevanceScope', 'subType'
];

// ── D-M2 Evidence Set reconstruction — ported verbatim (brief §6 declared
// duplication) from pt-pilot3-harness/lib/capture.js and
// pt-pilot4-harness/lib/capture.js (identical in both). Mirrors the
// REVIEWED production URL-acceptance rule exactly; never fed back into the
// provider, used here for telemetry/classification only. ──────────────────
const MAX_SOURCE_URL = 2048;
function isAcceptableSourceUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_SOURCE_URL || /\s/.test(value)) { return false; }
  var u;
  try { u = new URL(value); } catch (_) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) { return false; }
  return true;
}
function tryNormalizeUrl(value) {
  if (!isAcceptableSourceUrl(value)) { return null; }
  var u = new URL(value);
  return { normalized: 'https://' + u.hostname + (u.port ? ':' + u.port : '') + u.pathname + u.search, domain: u.hostname };
}
function appendEvidenceEntry(entries, raw, evidenceKind) {
  if (!raw || typeof raw !== 'object') { return; }
  var rawUrl = typeof raw.url === 'string' ? raw.url : null;
  if (!rawUrl) { return; }
  var norm = tryNormalizeUrl(rawUrl);
  if (!norm) { return; }
  // S2-A2 (§D.2): no insertion-time dedup — production performs none
  // (provider.js appendEvidenceEntry:794 has no `seen` set), so this
  // reconstruction must preserve duplicate entries and production's exact
  // cardinality for evidenceIndex to be canonical (brief §C.1/§C.2).
  // S2-A2 (Owner-ruled, narrow STOP 7a exception): `raw` is the exact
  // candidate URL string this entry was built from — production's own
  // contract.optionalHttpsUrl (evidence-contract.js:143-159) returns the
  // input `value` unchanged on success, never a reparsed/reconstructed
  // form, and isAcceptableSourceUrl above enforces the identical https/
  // no-userinfo/hostname/length/whitespace gate — so `rawUrl` here is
  // byte-identical to what provider.js would store as `.raw`. Added for
  // B-2's raw-URL invariant only; no traversal, dedup, normalization,
  // acceptance, or survival-rule change, and still exactly one
  // reconstruction (STOP 7b unchanged).
  // S2-M2 (narrow extension of the existing STOP-7a-style exception): `date`
  // is carried through unchanged, exactly as production's own
  // appendEvidenceEntry (provider.js) retains raw.date, so DP-2 can
  // independently re-derive dateProvenance from this reconstruction rather
  // than trusting the provider's own classification. No traversal, dedup,
  // normalization, acceptance, or survival-rule change; still one
  // reconstruction.
  entries.push({ raw: rawUrl, normalized: norm.normalized, domain: norm.domain, evidenceKind: evidenceKind, date: raw.date });
}
// D-M2 order: search_results.results[] (array order), then
// fetch_url_results.contents[] (array order), then url_citation annotations
// on the output_text content entry (array order). First occurrence wins
// (unchanged — D-A2-3): duplicates are retained, never collapsed.
function reconstructEvidenceSet(rawParsedEnvelope) {
  var byKind = { search_result: 0, fetch_url_result: 0, url_citation: 0 };
  var entries = [];
  if (!rawParsedEnvelope || typeof rawParsedEnvelope !== 'object' || rawParsedEnvelope.status !== 'completed') {
    return { total: 0, byKind: byKind, entries: entries };
  }
  var output = Array.isArray(rawParsedEnvelope.output) ? rawParsedEnvelope.output : [];
  var i, j;
  for (i = 0; i < output.length; i++) {
    var s = output[i];
    if (s && s.type === 'search_results' && Array.isArray(s.results)) {
      for (j = 0; j < s.results.length; j++) { appendEvidenceEntry(entries, s.results[j], 'search_result'); }
    }
  }
  for (i = 0; i < output.length; i++) {
    var f = output[i];
    if (f && f.type === 'fetch_url_results' && Array.isArray(f.contents)) {
      for (j = 0; j < f.contents.length; j++) { appendEvidenceEntry(entries, f.contents[j], 'fetch_url_result'); }
    }
  }
  var messageItem = output.find(function (item) { return item && item.type === 'message'; });
  var textEntry = messageItem && Array.isArray(messageItem.content)
    ? messageItem.content.find(function (c) { return c && c.type === 'output_text'; })
    : null;
  var annotations = textEntry && Array.isArray(textEntry.annotations) ? textEntry.annotations : [];
  for (i = 0; i < annotations.length; i++) {
    var ann = annotations[i];
    if (ann && ann.type === 'url_citation') {
      var raw = ann.url_citation && typeof ann.url_citation === 'object' ? ann.url_citation : ann;
      appendEvidenceEntry(entries, raw, 'url_citation');
    }
  }
  for (i = 0; i < entries.length; i++) { byKind[entries[i].evidenceKind]++; }
  return { total: entries.length, byKind: byKind, entries: entries };
}
function evidenceSetHasUrl(evidenceSet, url) {
  var norm = tryNormalizeUrl(url);
  if (!norm) { return false; }
  return evidenceSet.entries.some(function (e) { return e.normalized === norm.normalized; });
}

// ── raw candidate extraction — same technique as
// pt-pilot3/4-harness/lib/checks.js#extractRawCandidates (a declared,
// independent "second opinion" pattern already used in this programme for
// M-7; never throws, never fabricates). ─────────────────────────────────────
function extractRawCandidates(rawResponseBody) {
  var envelope;
  try { envelope = JSON.parse(rawResponseBody); } catch (_) { return []; }
  if (!envelope || envelope.status !== 'completed' || !Array.isArray(envelope.output)) { return []; }
  var messageItem = envelope.output.find(function (i) { return i && i.type === 'message'; });
  var textEntry = messageItem && Array.isArray(messageItem.content)
    ? messageItem.content.find(function (c) { return c && c.type === 'output_text'; }) : null;
  if (!textEntry || typeof textEntry.text !== 'string') { return []; }
  var parsed;
  try { parsed = JSON.parse(textEntry.text); } catch (_) { return []; }
  return (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
}

// ── order-zip candidate attribution — zero ladder reimplementation. ────────
var CANDIDATE_FIELDS = ['eventDate', 'category', 'direction', 'sourceUrl', 'eventType', 'relevanceScope', 'subType'];
function candidateMatchesItem(raw, item) {
  return CANDIDATE_FIELDS.every(function (f) { return raw[f] === item[f]; });
}
var MALFORMED_REASONS = ['MISSING_EVENT_DATE', 'INVALID_EVENT_DATE', 'MISSING_SOURCE_URL', 'UNKNOWN_CATEGORY', 'INVALID_DIRECTION', 'UNKNOWN_EVENT_TYPE', 'INVALID_RELEVANCE_SCOPE', 'INVALID_SUB_TYPE'];
function attributeCandidates(rawCandidates, items, skippedItems) {
  var itemPool = items.slice();
  var unmatchedRaw = [];
  for (var i = 0; i < rawCandidates.length; i++) {
    var raw = rawCandidates[i];
    var matchIdx = itemPool.findIndex(function (it) { return candidateMatchesItem(raw, it); });
    if (matchIdx !== -1) { itemPool.splice(matchIdx, 1); } else { unmatchedRaw.push(raw); }
  }
  assert.strictEqual(unmatchedRaw.length, skippedItems.length, 'order-zip: unmatched raw candidate count must equal skippedItems length');

  var buckets = {
    SURVIVED: items.length,
    MALFORMED_CANDIDATE: 0,
    Q3_UNRETRIEVED_SOURCE_URL: 0,
    GROUNDING_REJECTION: 0,
    DETERMINISTIC_VALIDATION_REJECTION: 0,
    DUPLICATE_IN_BATCH: 0
  };
  var q3Candidates = [];
  for (var k = 0; k < unmatchedRaw.length; k++) {
    var reason = skippedItems[k].reason;
    if (reason === 'UNRETRIEVED_SOURCE_URL') {
      buckets.Q3_UNRETRIEVED_SOURCE_URL++;
      q3Candidates.push(unmatchedRaw[k]);
    } else if (reason === 'INVALID_SOURCE_URL') {
      buckets.MALFORMED_CANDIDATE++;
    } else if (reason === 'GENERIC_SOURCE_URL') {
      buckets.GROUNDING_REJECTION++;
    } else if (reason === 'FUTURE_DATED_CATALYST') {
      buckets.DETERMINISTIC_VALIDATION_REJECTION++;
    } else if (reason === 'DUPLICATE_IN_BATCH') {
      buckets.DUPLICATE_IN_BATCH++;
    } else if (MALFORMED_REASONS.indexOf(reason) !== -1) {
      buckets.MALFORMED_CANDIDATE++;
    } else {
      throw new Error('unrecognized skip reason during attribution: ' + reason);
    }
  }
  return { buckets: buckets, q3Candidates: q3Candidates };
}

// ── fixture loading ──────────────────────────────────────────────────────
const index = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'index.json'), 'utf8'));
function loadCaseRaw(caseId) {
  return fs.readFileSync(path.join(FIXTURES_DIR, caseId + '.json'), 'utf8');
}
function loadCase(caseId) {
  return JSON.parse(loadCaseRaw(caseId));
}
function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeFetchStub(rawBody) {
  return async function fetchImpl() {
    return { status: 200, headers: { get: function () { return null; } }, text: async function () { return rawBody; } };
  };
}

async function replay(fixture) {
  var result = await provider.getNewsCatalysts(
    { ticker: fixture.input.ticker },
    { fetchImpl: makeFetchStub(fixture.input.rawResponseBody), apiKey: 'offline-replay-key', nowIso: fixture.input.nowIso }
  );
  if (!result.ok) { throw new Error('replay did not succeed: ' + JSON.stringify(result)); }
  return {
    items: result.envelope.items,
    skippedItems: result.envelope.skippedItems.map(function (s) { return { reason: s.reason }; }),
    evidenceBindings: result.envelope.evidenceBindings,
    evidenceSetSize: result.envelope.evidenceSetSize
  };
}

// ── runner (mirrors qa/fund_facts_provider_offline.js) ───────────────────
var passed = 0;
var failed = 0;
async function test(label, fn) {
  try {
    await fn();
    process.stdout.write('  PASS  ' + label + '\n');
    passed += 1;
  } catch (err) {
    process.stdout.write('  FAIL  ' + label + '\n');
    process.stdout.write('         ' + (err && err.message ? err.message : err) + '\n');
    failed += 1;
  }
}

async function runTests() {
  process.stdout.write('\n=== S2-A1 — news-catalysts evidence replay corpus (offline) ===\n\n');

  var _origFetch = global.fetch;
  global.fetch = function () { throw new Error('LIVE_NETWORK_FORBIDDEN'); };

  // ── R-1: byte-identical replay, same process + separate process ────────
  await test('R-1 replay is byte-identical across two in-process runs for every case, and against a separate process for one representative case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var r1 = await replay(fixture);
      var r2 = await replay(fixture);
      assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'in-process replay not deterministic for ' + fixture.caseId);
    }

    // Cross-process: one representative case (spawning a process per case
    // would be slow; determinism within-process for all 9 plus one
    // cross-process check on a case with both survivors and skips is
    // sufficient to catch an ambient-state dependency). S2 A5: re-pointed
    // from FROG to NVDA — Rule S makes FROG a 0-item/all-skip case, which
    // would no longer exercise items, bindings or evidenceSetSize; NVDA
    // retains both survivors (5 items) and a skip (1 UNRETRIEVED_SOURCE_URL)
    // and is unaffected by Rule S.
    var repFixture = loadCase('p4-20260921T2312Z-NVDA');
    var inProcess = await replay(repFixture);
    var script = 'const provider = require(' + JSON.stringify(PROVIDER_PATH) + ');' +
      'const fixture = JSON.parse(require("fs").readFileSync(' + JSON.stringify(path.join(FIXTURES_DIR, 'p4-20260921T2312Z-NVDA.json')) + ', "utf8"));' +
      'async function fetchImpl(){ return { status: 200, headers: { get: () => null }, text: async () => fixture.input.rawResponseBody }; }' +
      'provider.getNewsCatalysts({ ticker: fixture.input.ticker }, { fetchImpl, apiKey: "x", nowIso: fixture.input.nowIso })' +
      '.then(r => { process.stdout.write(JSON.stringify({ items: r.envelope.items, skippedItems: r.envelope.skippedItems.map(s => ({reason: s.reason})), evidenceBindings: r.envelope.evidenceBindings, evidenceSetSize: r.envelope.evidenceSetSize })); });';
    var child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.strictEqual(child.status, 0, 'child process failed: ' + child.stderr);
    var crossProcess = JSON.parse(child.stdout);
    assert.strictEqual(JSON.stringify(inProcess), JSON.stringify(crossProcess), 'cross-process replay diverged from in-process replay');
  });

  // ── R-2: replay reproduces the recorded provider output, every case ────
  await test('R-2 replay output equals the provider output recorded in the original capture, every case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      assert.strictEqual(JSON.stringify(replayed.items), JSON.stringify(fixture.expected.items), fixture.caseId + ': items diverge from recorded capture');
      assert.strictEqual(JSON.stringify(replayed.skippedItems), JSON.stringify(fixture.expected.skippedItems), fixture.caseId + ': skippedItems diverge from recorded capture');
    }
  });

  // ── R-3: candidate reconciliation ───────────────────────────────────────
  await test('R-3 rawCandidates == items.length + skippedItems.length, every case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var rawCandidates = extractRawCandidates(fixture.input.rawResponseBody);
      var replayed = await replay(fixture);
      assert.strictEqual(rawCandidates.length, replayed.items.length + replayed.skippedItems.length, fixture.caseId + ': reconciliation failed');
    }
  });

  // ── R-4: 17-field contract on every surviving item ──────────────────────
  await test('R-4 every surviving item: 17 fields in order, enums, A-1 direction rule, key matches NEWS_KEY_RE', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var item = replayed.items[j];
        var keys = Object.keys(item);
        assert.deepStrictEqual(keys, ITEM_FIELD_ORDER, fixture.caseId + ' item ' + j + ': field order/shape mismatch');
        assert.ok(provider.CATEGORIES.indexOf(item.category) !== -1, fixture.caseId + ' item ' + j + ': unknown category');
        assert.ok(provider.EVENT_TYPES.indexOf(item.eventType) !== -1, fixture.caseId + ' item ' + j + ': unknown eventType');
        assert.ok(provider.RELEVANCE_SCOPES.indexOf(item.relevanceScope) !== -1, fixture.caseId + ' item ' + j + ': unknown relevanceScope');
        if (item.eventType === 'catalyst') {
          assert.ok(provider.DIRECTIONS.indexOf(item.direction) !== -1, fixture.caseId + ' item ' + j + ': A-1 catalyst direction violation');
        } else {
          assert.strictEqual(item.direction, null, fixture.caseId + ' item ' + j + ': A-1 upcoming_event direction must be null');
        }
        var key = provider.buildNewsKey(item);
        assert.ok(provider.NEWS_KEY_RE.test(key), fixture.caseId + ' item ' + j + ': key does not match NEWS_KEY_RE');
      }
    }
  });

  // ── R-5: attribution total and disjoint ─────────────────────────────────
  await test('R-5 attribution is total and disjoint — every candidate in exactly one bucket; bucket counts sum to rawCandidates, every case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var rawCandidates = extractRawCandidates(fixture.input.rawResponseBody);
      var replayed = await replay(fixture);
      var attribution = attributeCandidates(rawCandidates, replayed.items, replayed.skippedItems);
      var sum = Object.keys(attribution.buckets).reduce(function (acc, k) { return acc + attribution.buckets[k]; }, 0);
      assert.strictEqual(sum, rawCandidates.length, fixture.caseId + ': bucket sum != rawCandidates');
      assert.strictEqual(attribution.buckets.SURVIVED, replayed.items.length, fixture.caseId + ': SURVIVED bucket != items.length');
    }
  });

  // ── R-6: Q-3 correctness on synthetic cases, plus full classifier
  // bucket coverage (Owner-review correction: every §4 bucket the real 9
  // cases never happen to exercise must still be proven on a synthetic
  // case). This tests the ATTRIBUTION CLASSIFIER only (attributeCandidates,
  // which never reimplements or re-runs the provider's validation ladder —
  // it only zips two arrays the REAL provider already produced). Every
  // synthetic candidate below is still validated by the REAL provider; the
  // suite never fabricates a skip reason. ───────────────────────────────
  await test('R-6 Q-3 correct on a synthetic valid-but-unretrieved case, and correct-by-absence on a case with none', async function () {
    var NOW_ISO = '2026-09-21T20:45:00.320Z';
    function syntheticEnvelope(items, searchResults) {
      return {
        status: 'completed', error: null,
        output: [
          { type: 'search_results', results: searchResults, queries: [] },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: items }) }] }
        ]
      };
    }
    var groundedUrl = 'https://example-news.test/press-release-about-widgets';
    var ungroundedUrl = 'https://example-news.test/press-release-never-retrieved';
    var candidate = function (url) {
      return { eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: url };
    };

    // Case A: one candidate whose URL is well-formed but never retrieved.
    var envA = syntheticEnvelope([candidate(ungroundedUrl)], [{ url: groundedUrl, title: 'unrelated' }]);
    var resultA = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envA)), apiKey: 'x', nowIso: NOW_ISO });
    assert.strictEqual(resultA.ok, true);
    assert.deepStrictEqual(resultA.envelope.skippedItems.map(function (s) { return s.reason; }), ['UNRETRIEVED_SOURCE_URL'], 'synthetic Q-3 candidate must be skipped UNRETRIEVED_SOURCE_URL');
    var rawA = extractRawCandidates(JSON.stringify(envA));
    var attrA = attributeCandidates(rawA, resultA.envelope.items, resultA.envelope.skippedItems.map(function (s) { return { reason: s.reason }; }));
    assert.strictEqual(attrA.buckets.Q3_UNRETRIEVED_SOURCE_URL, 1, 'synthetic well-formed-but-unretrieved candidate must attribute to Q3');
    assert.strictEqual(attrA.buckets.MALFORMED_CANDIDATE, 0, 'synthetic Q-3 candidate must not be counted as MALFORMED');

    // Case B: same candidate, now actually retrieved — Q-3 correct-by-absence.
    var envB = syntheticEnvelope([candidate(ungroundedUrl)], [{ url: ungroundedUrl, title: 'now retrieved' }]);
    var resultB = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envB)), apiKey: 'x', nowIso: NOW_ISO });
    assert.strictEqual(resultB.ok, true);
    var rawB = extractRawCandidates(JSON.stringify(envB));
    var attrB = attributeCandidates(rawB, resultB.envelope.items, resultB.envelope.skippedItems.map(function (s) { return { reason: s.reason }; }));
    assert.strictEqual(attrB.buckets.Q3_UNRETRIEVED_SOURCE_URL, 0, 'no Q-3 candidate present ⇒ Q3 bucket must be 0, not inferred');
    assert.strictEqual(attrB.buckets.SURVIVED, 1, 'once retrieved, the identical candidate survives');

    // Case C: one combined synthetic envelope exercising every remaining
    // §4 bucket the real 9 cases never happen to trigger — each candidate
    // is validated by the REAL provider; only the CLASSIFIER's bucket
    // assignment is under test here.
    var groundedNonGeneric = 'https://example-news.test/press-release-widgets-2026';
    var groundedGeneric = 'https://example-news.test/news'; // matches GENERIC_SOURCE_PATH_RE exactly
    var groundedDuplicate = 'https://example-news.test/press-release-duplicate-event';

    var futureDated = { eventDate: '2099-01-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: groundedNonGeneric };
    var unknownCategory = { eventDate: '2026-09-01', category: 'not_a_real_category', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: groundedNonGeneric };
    var malformedSyntax = { eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: 'http://example-news.test/insecure-not-https' };
    var duplicateFirst = { eventDate: '2026-09-05', category: 'product_customer_partnership', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: groundedDuplicate };
    var duplicateSecond = Object.assign({}, duplicateFirst); // byte-identical raw candidate ⇒ provider's own identity-hash dedup fires
    var genericPath = { eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: groundedGeneric };

    var envC = syntheticEnvelope(
      [futureDated, unknownCategory, malformedSyntax, duplicateFirst, duplicateSecond, genericPath],
      [{ url: groundedNonGeneric, title: 'widgets' }, { url: groundedDuplicate, title: 'dup event' }, { url: groundedGeneric, title: 'generic index' }]
    );
    var resultC = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envC)), apiKey: 'x', nowIso: NOW_ISO });
    assert.strictEqual(resultC.ok, true);
    assert.deepStrictEqual(
      resultC.envelope.skippedItems.map(function (s) { return s.reason; }),
      ['FUTURE_DATED_CATALYST', 'UNKNOWN_CATEGORY', 'INVALID_SOURCE_URL', 'DUPLICATE_IN_BATCH', 'GENERIC_SOURCE_URL'],
      'real provider must produce exactly these 5 skip reasons, in raw-candidate order, for the 6 synthetic candidates'
    );
    assert.strictEqual(resultC.envelope.items.length, 1, 'exactly the first duplicate survives');

    var rawC = extractRawCandidates(JSON.stringify(envC));
    var attrC = attributeCandidates(rawC, resultC.envelope.items, resultC.envelope.skippedItems.map(function (s) { return { reason: s.reason }; }));
    assert.deepStrictEqual(attrC.buckets, {
      SURVIVED: 1,
      MALFORMED_CANDIDATE: 2, // unknownCategory (a MALFORMED_REASONS member) + malformedSyntax (INVALID_SOURCE_URL, syntax-invalid)
      Q3_UNRETRIEVED_SOURCE_URL: 0,
      GROUNDING_REJECTION: 1, // genericPath -> GENERIC_SOURCE_URL
      DETERMINISTIC_VALIDATION_REJECTION: 1, // futureDated -> FUTURE_DATED_CATALYST
      DUPLICATE_IN_BATCH: 1 // duplicateSecond
    }, 'classifier must place each of the 6 synthetic candidates in its correct §4 bucket');
  });

  // ── R-7: Evidence Set reconstruction agrees with provider grounding ────
  await test('R-7 suite Evidence Set reconstruction agrees with provider grounding behaviour on a known case', async function () {
    var fixture = loadCase('p3-20260921T2045Z-NVDA');
    var envelope = JSON.parse(fixture.input.rawResponseBody);
    var evidenceSet = reconstructEvidenceSet(envelope);
    var replayed = await replay(fixture);

    // Every survivor's normalizedSourceUrl must be present in the
    // reconstruction (it was grounded by the real provider).
    for (var i = 0; i < replayed.items.length; i++) {
      assert.ok(evidenceSetHasUrl(evidenceSet, replayed.items[i].sourceUrl), 'survivor sourceUrl absent from reconstructed Evidence Set: ' + replayed.items[i].sourceUrl);
    }

    // The three known Q-3 candidates from this case must be ABSENT from the
    // reconstruction (they were skipped UNRETRIEVED_SOURCE_URL by grounding-miss).
    var rawCandidates = extractRawCandidates(fixture.input.rawResponseBody);
    var attribution = attributeCandidates(rawCandidates, replayed.items, replayed.skippedItems);
    assert.strictEqual(attribution.q3Candidates.length, 3, 'expected 3 known Q-3 candidates in this case');
    for (var j = 0; j < attribution.q3Candidates.length; j++) {
      assert.ok(!evidenceSetHasUrl(evidenceSet, attribution.q3Candidates[j].sourceUrl), 'Q-3 candidate unexpectedly present in reconstructed Evidence Set: ' + attribution.q3Candidates[j].sourceUrl);
    }
  });

  // ── R-8: no secret/header/init material in any fixture ──────────────────
  await test('R-8 no fixture contains an API key, Authorization, Bearer, or any request header', async function () {
    var SECRET_PATTERNS = [/sk-[A-Za-z0-9]{10,}/, /Bearer\s+[A-Za-z0-9._-]{10,}/, /Authorization["']?\s*[:=]/i, /AIza[0-9A-Za-z_-]{20,}/, /"init"\s*:/];
    var files = fs.readdirSync(FIXTURES_DIR).filter(function (f) { return f.endsWith('.json'); });
    for (var i = 0; i < files.length; i++) {
      var text = fs.readFileSync(path.join(FIXTURES_DIR, files[i]), 'utf8');
      for (var p = 0; p < SECRET_PATTERNS.length; p++) {
        assert.ok(!SECRET_PATTERNS[p].test(text), files[i] + ' matched forbidden pattern ' + SECRET_PATTERNS[p]);
      }
    }
  });

  // ── R-9: per-case SNAPSHOT recorded, labelled with providerVersion ──────
  // Also makes the §8 fixture hash chain executable: for every case, the
  // fixture's ON-DISK bytes (this repo's runtime integrity boundary — the
  // external Pilot harness trees are never re-read at suite runtime) must
  // hash to exactly the fixtureSha256 index.json recorded at extraction. A
  // mismatch here means the fixture was altered since extraction and is a
  // hard failure, not a warning.
  await test('R-9 per-case {items, skippedItems, attribution} recorded as SNAPSHOT, labelled with providerVersion, every case; on-disk fixture bytes hash to the fixtureSha256 recorded in index.json', async function () {
    var fixtureShaByCase = {};
    for (var c = 0; c < index.cases.length; c++) { fixtureShaByCase[index.cases[c].caseId] = index.cases[c].fixtureSha256; }

    for (var i = 0; i < index.cases.length; i++) {
      var caseId = index.cases[i].caseId;
      var raw = loadCaseRaw(caseId);
      var actualSha256 = sha256Hex(raw);
      var recordedSha256 = fixtureShaByCase[caseId];
      assert.strictEqual(typeof recordedSha256, 'string', caseId + ': index.json has no recorded fixtureSha256');
      assert.strictEqual(actualSha256, recordedSha256, caseId + ': on-disk fixture bytes do not hash to the fixtureSha256 recorded in index.json — fixture altered since extraction');

      var fixture = JSON.parse(raw);
      assert.strictEqual(fixture.expected.kind, 'SNAPSHOT', fixture.caseId + ': expected.kind must be SNAPSHOT');
      assert.strictEqual(typeof fixture.expected.providerVersion, 'string', fixture.caseId + ': providerVersion must be a labelled string');
      assert.ok(Array.isArray(fixture.expected.items), fixture.caseId + ': expected.items missing');
      assert.ok(Array.isArray(fixture.expected.skippedItems), fixture.caseId + ': expected.skippedItems missing');
      assert.ok(fixture.expected.attribution && typeof fixture.expected.attribution === 'object', fixture.caseId + ': expected.attribution missing');
    }
  });

  // ── R-10: curated reference-case outcomes, per run, lower authority ────
  await test('R-10 reference-case outcomes per run, from the curated manifest, internally consistent with replay — curated, not candidate-level, authority; every configured mapping is visited, none silently skipped', async function () {
    var knownCaseIds = {};
    for (var i = 0; i < index.cases.length; i++) { knownCaseIds[index.cases[i].caseId] = true; }

    assert.strictEqual(index.referenceManifest.length, 5, 'exactly 5 curated reference cases (brief §5) — none invented, none dropped');

    var expectedVisits = 0;
    for (var r0 = 0; r0 < index.referenceManifest.length; r0++) { expectedVisits += Object.keys(index.referenceManifest[r0].perRun).length; }
    var actualVisits = 0;

    for (var r = 0; r < index.referenceManifest.length; r++) {
      var ref = index.referenceManifest[r];
      var runKeys = Object.keys(ref.perRun);
      for (var k = 0; k < runKeys.length; k++) {
        var runKey = runKeys[k];
        var obs = ref.perRun[runKey];
        // Exact curated mapping only — no fuzzy matching. Every configured
        // (refId, runKey) pair MUST resolve to a known replay case; an
        // unresolvable mapping is a hard failure, never a silent skip.
        var caseId = runKey + '-' + ref.ticker; // e.g. "p3-20260921T2045Z" + "-" + "MRNA"
        assert.ok(knownCaseIds[caseId], ref.refId + '/' + runKey + ': reference manifest run key does not resolve to a known case id (' + caseId + ')');
        var fixture = loadCase(caseId);
        var replayed = await replay(fixture);

        if (obs.outcome === 'RESOLVED_EMITTED' && obs.matchedItemSourceUrl) {
          assert.ok(replayed.items.some(function (it) { return it.sourceUrl === obs.matchedItemSourceUrl; }), ref.refId + '/' + runKey + ': RESOLVED_EMITTED but matched URL not found among survivors');
        } else if (obs.outcome === 'Q-1' && obs.matchedEvidenceUrl) {
          var envelope = JSON.parse(fixture.input.rawResponseBody);
          var es = reconstructEvidenceSet(envelope);
          assert.ok(evidenceSetHasUrl(es, obs.matchedEvidenceUrl), ref.refId + '/' + runKey + ': Q-1 but matched URL not found in reconstructed Evidence Set');
          assert.ok(!replayed.items.some(function (it) { return it.sourceUrl === obs.matchedEvidenceUrl; }), ref.refId + '/' + runKey + ': Q-1 but matched URL unexpectedly emitted');
        } else if (obs.outcome === 'Q-2') {
          // absence-based — nothing further to cross-check beyond the
          // curatorial note; never inferred by the suite itself.
        }
        // C-1_OBSERVED / C-1_NOT_OBSERVED / NOT_ASSESSED: reference
        // measurements or explicit non-assessment — never asserted as
        // Q-1/Q-2, and never inferred.
        actualVisits += 1;
      }
    }

    // Reconciliation: every configured reference/run mapping was actually
    // evaluated above — none silently skipped by a falsy caseId or an
    // early loop exit.
    assert.strictEqual(actualVisits, expectedVisits, 'reference-manifest reconciliation failed: visited ' + actualVisits + ' of ' + expectedVisits + ' configured (refId, runKey) mappings');
    assert.strictEqual(actualVisits, 15, 'expected exactly 5 refIds × 3 runs = 15 configured mappings');
  });

  // ── S2-A2 — evidence-index binding (work/s2-evidence-index-binding/brief.md) ─
  // B-1..B-11 below never reimplement provider grounding (brief §D.2/§M
  // idiom, matching R-1..R-10 above): they replay through the REAL provider
  // and cross-check its evidenceBindings/evidenceSetSize sidecar against
  // reconstructEvidenceSet — the same duplicate-preserving, production-order
  // reconstruction R-7/R-10 already use, now corrected by §D.2 to retain
  // duplicates. §C.1: the production Evidence Set is the singular
  // definition; this reconstruction is a check against it. The combined
  // B-4/B-10/B-11 checks validate the ordering properties that are
  // load-bearing for A2 binding: first-occurrence selection, the four known
  // duplicate-divergence cases, and total cardinality. They do not claim
  // full entry-by-entry equivalence of the entire Evidence Set.
  var APPROVED_EVIDENCE_KINDS = ['search_result', 'fetch_url_result', 'url_citation'];
  var BINDING_FIELD_ORDER = ['itemIndex', 'evidenceIndex', 'evidenceKind', 'normalizedSourceUrl'];
  // S2-M2 (A3a, O-5): dateProvenance is appended last, and only for a
  // surviving CATALYST binding — never for upcoming_event, which carries
  // none by construction.
  var BINDING_FIELD_ORDER_WITH_DATE_PROVENANCE = BINDING_FIELD_ORDER.concat(['dateProvenance']);
  var DATE_PROVENANCE_VALUES = ['equal', 'evidence-later', 'evidence-earlier', 'no-evidence-date'];

  // Full (unmapped) provider envelope — used only where a test needs the
  // provider's OWN skippedItems shape (B-6) rather than the suite's
  // {reason}-only projection that `replay()` returns for R-1..R-10 parity.
  async function replayEnvelope(fixture) {
    var result = await provider.getNewsCatalysts(
      { ticker: fixture.input.ticker },
      { fetchImpl: makeFetchStub(fixture.input.rawResponseBody), apiKey: 'offline-replay-key', nowIso: fixture.input.nowIso }
    );
    if (!result.ok) { throw new Error('replay did not succeed: ' + JSON.stringify(result)); }
    return result.envelope;
  }

  // ── B-1: cardinality + itemIndex shape ──────────────────────────────────
  await test('B-1 evidenceBindings.length === items.length every case; itemIndex is 0..n-1, ascending, no gaps, no repeats', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      assert.strictEqual(replayed.evidenceBindings.length, replayed.items.length, fixture.caseId + ': evidenceBindings.length must equal items.length');
      for (var k = 0; k < replayed.evidenceBindings.length; k++) {
        assert.strictEqual(replayed.evidenceBindings[k].itemIndex, k, fixture.caseId + ': itemIndex ' + k + ' out of order');
      }
    }
  });

  // ── B-2: binding shape + binding agrees with the reconstruction at that
  // exact index (§C.7 invariant #4, in full). The Owner-approved narrow
  // STOP 7a exception adds `raw` to the QA reconstruction specifically so
  // this suite can independently verify the raw-URL half of §C.7 invariant
  // #4 (item.sourceUrl === evidenceSet[evidenceIndex].raw), not just the
  // normalized half. ─────────────────────────────────────────────────────
  await test('B-2 exact §C.8 binding shape; binding.normalizedSourceUrl === item.normalizedSourceUrl === evidenceSet[evidenceIndex].normalized; item.sourceUrl === evidenceSet[evidenceIndex].raw, every surviving item, every case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var binding = replayed.evidenceBindings[j];
        var expectedBindingKeys = replayed.items[j].eventType === 'upcoming_event' ? BINDING_FIELD_ORDER : BINDING_FIELD_ORDER_WITH_DATE_PROVENANCE;
        assert.deepStrictEqual(Object.keys(binding), expectedBindingKeys, fixture.caseId + ' item ' + j + ': binding must carry exactly the §C.8 sidecar shape (plus dateProvenance for a catalyst, S2-M2)');
        var entry = evidenceSet.entries[binding.evidenceIndex];
        assert.ok(entry, fixture.caseId + ' item ' + j + ': evidenceIndex ' + binding.evidenceIndex + ' out of range of the reconstruction');
        assert.strictEqual(binding.normalizedSourceUrl, replayed.items[j].normalizedSourceUrl, fixture.caseId + ' item ' + j + ': binding.normalizedSourceUrl must equal the item\'s normalizedSourceUrl');
        assert.strictEqual(binding.normalizedSourceUrl, entry.normalized, fixture.caseId + ' item ' + j + ': binding.normalizedSourceUrl must equal the reconstruction entry at evidenceIndex');
        assert.strictEqual(replayed.items[j].sourceUrl, entry.raw, fixture.caseId + ' item ' + j + ': item.sourceUrl must equal the reconstruction entry\'s raw text at evidenceIndex (§C.7 invariant #4)');
      }
    }
  });

  // ── B-3: evidenceKind matches the entry AT THAT EXACT INDEX ────────────
  await test('B-3 evidenceKind is one of the three approved literals and equals the reconstruction entry\'s kind at that exact evidenceIndex — not merely a kind present somewhere for the URL', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.evidenceBindings.length; j++) {
        var binding = replayed.evidenceBindings[j];
        assert.ok(APPROVED_EVIDENCE_KINDS.indexOf(binding.evidenceKind) !== -1, fixture.caseId + ' binding ' + j + ': evidenceKind outside the approved vocabulary');
        assert.strictEqual(binding.evidenceKind, evidenceSet.entries[binding.evidenceIndex].evidenceKind, fixture.caseId + ' binding ' + j + ': evidenceKind does not match the reconstruction entry at that exact index');
      }
    }
  });

  // ── B-4: evidenceIndex is independently re-derivable as first-occurrence ─
  await test('B-4 evidenceIndex equals the first index in the duplicate-preserving reconstruction whose normalized matches — independently re-derived, proving first-occurrence-wins actually happened', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var binding = replayed.evidenceBindings[j];
        var expectedIndex = evidenceSet.entries.findIndex(function (e) { return e.normalized === replayed.items[j].normalizedSourceUrl; });
        assert.strictEqual(binding.evidenceIndex, expectedIndex, fixture.caseId + ' item ' + j + ': evidenceIndex is not the first occurrence in the reconstruction');
      }
    }
  });

  // ── B-5: binding determinism ────────────────────────────────────────────
  await test('B-5 replaying a case twice yields identical binding records (extends R-1 determinism to bindings)', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var r1 = await replay(fixture);
      var r2 = await replay(fixture);
      assert.strictEqual(JSON.stringify(r1.evidenceBindings), JSON.stringify(r2.evidenceBindings), fixture.caseId + ': evidenceBindings not deterministic across replays');
      assert.strictEqual(r1.evidenceSetSize, r2.evidenceSetSize, fixture.caseId + ': evidenceSetSize not deterministic across replays');
    }
  });

  // ── B-6: no partial/placeholder binding; skippedItems shape untouched ──
  await test('B-6 no item survives without a binding; no skippedItems entry carries one; skippedItems keeps its {reason}-only shape', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = await replayEnvelope(fixture);
      assert.strictEqual(envelope.evidenceBindings.length, envelope.items.length, fixture.caseId + ': every surviving item must carry exactly one binding');
      for (var k = 0; k < envelope.evidenceBindings.length; k++) {
        var b = envelope.evidenceBindings[k];
        assert.notStrictEqual(b.evidenceIndex, null, fixture.caseId + ' binding ' + k + ': evidenceIndex must not be null');
        assert.notStrictEqual(b.evidenceIndex, -1, fixture.caseId + ' binding ' + k + ': evidenceIndex must not be -1');
        assert.ok(b.evidenceIndex >= 0, fixture.caseId + ' binding ' + k + ': evidenceIndex must not be a placeholder');
      }
      for (var s = 0; s < envelope.skippedItems.length; s++) {
        assert.deepStrictEqual(Object.keys(envelope.skippedItems[s]), ['reason'], fixture.caseId + ' skippedItems[' + s + ']: must carry only { reason }, never a binding');
      }
    }
  });

  // ── B-7: synthetic — search_results outranks fetch_url_results ─────────
  await test('B-7 same URL in search_results and fetch_url_results binds to the search_results index, evidenceKind search_result — pins the ordering rule with a minimal deterministic synthetic case', async function () {
    var url = 'https://example-news.test/press-release-both-sources';
    var envelope = {
      status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [{ url: url, title: 'search hit' }], queries: [] },
        { type: 'fetch_url_results', contents: [{ url: url, title: 'fetched page' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [{ eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: url }] }) }] }
      ]
    };
    var result = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envelope)), apiKey: 'x', nowIso: '2026-09-01T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.items.length, 1);
    assert.strictEqual(result.envelope.evidenceBindings[0].evidenceIndex, 0, 'search_results is traversed first — index 0');
    assert.strictEqual(result.envelope.evidenceBindings[0].evidenceKind, 'search_result', 'search_results outranks fetch_url_results (D-A2-3: unchanged)');
  });

  // ── B-8: synthetic — url_citation-only binding ──────────────────────────
  await test('B-8 an envelope whose only occurrence of the URL is a url_citation binds with evidenceKind url_citation — documents current behaviour, never endorses it (brief §J R-2)', async function () {
    var url = 'https://example-news.test/press-release-citation-only';
    var envelope = {
      status: 'completed', error: null,
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [{ eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: url }] }), annotations: [{ type: 'url_citation', url: url }] }] }
      ]
    };
    var result = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envelope)), apiKey: 'x', nowIso: '2026-09-01T00:00:00.000Z' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.items.length, 1);
    assert.strictEqual(result.envelope.evidenceBindings[0].evidenceKind, 'url_citation');
  });

  // ── B-9: multi-binding is observational, never a failure ───────────────
  await test('B-9 multi-binding (several items sharing one evidenceIndex) is counted and reported, never a failure', async function () {
    var totalGroups = 0;
    var perCase = {};
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      var byIndex = {};
      for (var k = 0; k < replayed.evidenceBindings.length; k++) {
        var idx = replayed.evidenceBindings[k].evidenceIndex;
        byIndex[idx] = (byIndex[idx] || 0) + 1;
        assert.ok(idx >= 0, fixture.caseId + ': grouped binding has an invalid evidenceIndex');
      }
      var groupsHere = Object.keys(byIndex).filter(function (key) { return byIndex[key] > 1; }).length;
      if (groupsHere > 0) { perCase[fixture.caseId] = groupsHere; }
      totalGroups += groupsHere;
    }
    // OBSERVATIONAL ONLY (brief §E B-9, §C.8): multi-binding is valid and
    // expected. Measured and reported for visibility, deliberately never
    // asserted against a fixed baseline.
    process.stdout.write('    (multi-binding groups observed: ' + totalGroups + ' — ' + JSON.stringify(perCase) + ')\n');
  });

  // ── B-10: the duplicate-divergence acceptance test (load-bearing) ──────
  // Genuinely depends on §D.2's correction: the expected index below is
  // derived from THIS test's own reconstructEvidenceSet call on the raw
  // fixture, not hardcoded from the brief alone — so reverting §D.2 (the
  // seenNormalized dedup) makes the reconstruction itself regress to the
  // deduplicated index, which this test would then catch directly.
  await test('B-10 the four known duplicate-divergence items record the PRODUCTION evidenceIndex, not the deduplicated one — fails against the pre-correction reconstruction by design', async function () {
    var DIVERGENT_CASES = [
      { caseId: 'p4-20260921T2307Z-MRNA', urlPattern: /fda\.gov\/media\/194510\/download/, productionIndex: 35, deduplicatedIndex: 34 },
      { caseId: 'p4-20260921T2312Z-NVDA', urlPattern: /aws-and-nvidia-to-deliver/, productionIndex: 50, deduplicatedIndex: 38 },
      { caseId: 'p4-20260921T2312Z-NVDA', urlPattern: /nvidia-expands-ai-infrast/, productionIndex: 32, deduplicatedIndex: 28 },
      { caseId: 'p4-20260921T2312Z-MRNA', urlPattern: /sec\.gov\/Archives\/edgar\/data\/1682852/, productionIndex: 45, deduplicatedIndex: 41 }
    ];
    var found = 0;
    for (var d = 0; d < DIVERGENT_CASES.length; d++) {
      var spec = DIVERGENT_CASES[d];
      var fixture = loadCase(spec.caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      var matched = false;
      for (var j = 0; j < replayed.items.length; j++) {
        if (spec.urlPattern.test(replayed.items[j].sourceUrl)) {
          matched = true;
          found += 1;
          var reconstructedIndex = evidenceSet.entries.findIndex(function (e) { return e.normalized === replayed.items[j].normalizedSourceUrl; });
          assert.strictEqual(reconstructedIndex, spec.productionIndex, spec.caseId + ' ' + spec.urlPattern + ': THIS SUITE\'S OWN reconstruction must independently derive the production index ' + spec.productionIndex + ' — a regressed (dedup) reconstruction would derive ' + spec.deduplicatedIndex + ' instead');
          assert.notStrictEqual(reconstructedIndex, spec.deduplicatedIndex, spec.caseId + ' ' + spec.urlPattern + ': reconstruction must not regress to the deduplicated index — this is the defect §D.2 corrects');
          var binding = replayed.evidenceBindings[j];
          assert.strictEqual(binding.evidenceIndex, spec.productionIndex, spec.caseId + ' ' + spec.urlPattern + ': provider binding must record the PRODUCTION index ' + spec.productionIndex);
          assert.notStrictEqual(binding.evidenceIndex, spec.deduplicatedIndex, spec.caseId + ' ' + spec.urlPattern + ': provider binding must NOT record the deduplicated index ' + spec.deduplicatedIndex);
        }
      }
      assert.ok(matched, spec.caseId + ': known divergent item not found in this case\'s surviving items — corpus drift');
    }
    assert.strictEqual(found, 4, 'expected exactly the four known duplicate-divergence items');
  });

  // ── B-11: reconstruction cardinality equals production evidenceSetSize ─
  await test('B-11 evidenceSetSize from the envelope equals the reconstruction\'s entry count, every case — retires A1\'s declared-duplication assumption', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      assert.strictEqual(replayed.evidenceSetSize, evidenceSet.total, fixture.caseId + ': evidenceSetSize does not equal the reconstruction\'s entry count');
    }
  });

  // S2-M2 (A3a, work/s2-date-provenance-observability/brief.md) — DP-1..DP-8.
  // Observation only: dateProvenance is a sidecar field on evidenceBindings,
  // never read by any decision path. O-4/O-5: upcoming_event is excluded by
  // construction, never enforcement, and A3b (any rule) is out of scope here.
  // DATE_PROVENANCE_VALUES is declared once, above, alongside BINDING_FIELD_ORDER.

  // ── DP-1: every surviving catalyst carries exactly one classification; every upcoming_event carries none ──
  await test('DP-1 every surviving catalyst binding carries exactly one dateProvenance classification; every upcoming_event binding carries none (O-5)', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var item = replayed.items[j];
        var binding = replayed.evidenceBindings[j];
        if (item.eventType === 'upcoming_event') {
          assert.strictEqual(binding.dateProvenance, undefined, fixture.caseId + ' item ' + j + ': upcoming_event binding must carry no dateProvenance (O-5)');
        } else {
          assert.ok(Object.prototype.hasOwnProperty.call(binding, 'dateProvenance'), fixture.caseId + ' item ' + j + ': surviving catalyst binding must carry exactly one dateProvenance classification');
        }
      }
    }
  });

  // ── DP-2: classification is one of the four defined values; derivable from the bound entry alone ──
  await test('DP-2 dateProvenance is always one of the four defined values, and is independently re-derivable from the reconstruction entry at evidenceIndex alone (never a re-implementation of production, just a comparison against it)', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var envelope = JSON.parse(fixture.input.rawResponseBody);
      var evidenceSet = reconstructEvidenceSet(envelope);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var item = replayed.items[j];
        var binding = replayed.evidenceBindings[j];
        if (item.eventType === 'upcoming_event') { continue; }
        assert.ok(DATE_PROVENANCE_VALUES.indexOf(binding.dateProvenance) !== -1, fixture.caseId + ' item ' + j + ': dateProvenance outside the defined vocabulary');
        var entry = evidenceSet.entries[binding.evidenceIndex];
        var expected;
        if (entry.date === undefined || entry.date === null) {
          expected = 'no-evidence-date';
        } else if (entry.date === item.eventDate) {
          expected = 'equal';
        } else if (entry.date > item.eventDate) {
          expected = 'evidence-later';
        } else {
          expected = 'evidence-earlier';
        }
        assert.strictEqual(binding.dateProvenance, expected, fixture.caseId + ' item ' + j + ': dateProvenance does not match what the bound entry\'s own date independently derives');
      }
    }
  });

  // ── DP-3: items[] and skippedItems[] byte-identical to the tracked baseline in all 9 cases — zero survival change ──
  await test('DP-3 items[] and skippedItems[] are byte-identical to each fixture\'s tracked expected values, every case — S2-M2 observes without changing a single survivor', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      assert.deepStrictEqual(replayed.items, fixture.expected.items, fixture.caseId + ': items[] diverged from the tracked baseline — S2-M2 must be observation-only');
      assert.deepStrictEqual(replayed.skippedItems, fixture.expected.skippedItems, fixture.caseId + ': skippedItems[] diverged from the tracked baseline — S2-M2 must be observation-only');
    }
  });

  // ── DP-4: all 9 fixtureSha256 values unchanged ──────────────────────────
  await test('DP-4 all 9 fixtureSha256 values in index.json are unchanged — S2-M2 touches no fixture file', function () {
    for (var i = 0; i < index.cases.length; i++) {
      var caseId = index.cases[i].caseId;
      var raw = loadCaseRaw(caseId);
      assert.strictEqual(sha256Hex(raw), index.cases[i].fixtureSha256, caseId + ': fixtureSha256 moved — S2-M2 must not touch any fixture file (§7.3 STOP)');
    }
  });

  // ── DP-5: determinism — replaying a case twice yields identical classifications ──
  await test('DP-5 replaying a case twice yields identical dateProvenance classifications, every case', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var r1 = await replay(fixture);
      var r2 = await replay(fixture);
      var dp1 = r1.evidenceBindings.map(function (b) { return b.dateProvenance; });
      var dp2 = r2.evidenceBindings.map(function (b) { return b.dateProvenance; });
      assert.deepStrictEqual(dp1, dp2, fixture.caseId + ': dateProvenance not deterministic across replays');
    }
  });

  // ── DP-6: SNAPSHOT — corpus totals, never presented as a rule ───────────
  // S2-M2 revalidation (brief §10): the brief's §2 "26 equal · 3 differ ·
  // 2 no-evidence-date over 31 catalysts" baseline was measured against a
  // stale survivor count. Independently re-measured against the current,
  // tracked corpus (same 9 fixtures, unchanged — DP-4) both at the brief's
  // stated preparation commit (aa62aea) and at the current HEAD: 29
  // catalysts survive (not 31), because 2 fewer items are present than the
  // brief assumed — not a regression, a correction of the brief's own
  // original count. This test pins the CORRECTED measured distribution as a
  // SNAPSHOT (a drift detector, never a rule): a future change to this
  // corpus or to the classification logic that moves these numbers is
  // expected to retrigger this test and prompt re-measurement, exactly as
  // the brief's own "any drift... updates §2" clause anticipates.
  await test('DP-6 SNAPSHOT: the corpus totals over 29 non-upcoming (catalyst) survivors are reported — 25 equal / 1 evidence-later / 1 evidence-earlier / 2 no-evidence-date (corrected from the brief\'s stale 26/3/2-over-31 baseline; see review.md)', async function () {
    var counts = { equal: 0, 'evidence-later': 0, 'evidence-earlier': 0, 'no-evidence-date': 0 };
    var catalysts = 0, upcoming = 0;
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        var item = replayed.items[j];
        var binding = replayed.evidenceBindings[j];
        if (item.eventType === 'upcoming_event') { upcoming++; continue; }
        catalysts++;
        counts[binding.dateProvenance]++;
      }
    }
    var sum = counts.equal + counts['evidence-later'] + counts['evidence-earlier'] + counts['no-evidence-date'];
    assert.strictEqual(sum, catalysts, 'the four buckets must sum to the total catalyst count — internal consistency, independent of the exact SNAPSHOT numbers');
    process.stdout.write('    (DP-6 SNAPSHOT: ' + catalysts + ' catalysts, ' + upcoming + ' upcoming_event excluded (O-5); ' + JSON.stringify(counts) + ')\n');
    assert.deepStrictEqual(counts, { equal: 25, 'evidence-later': 1, 'evidence-earlier': 1, 'no-evidence-date': 2 }, 'SNAPSHOT drifted from the corrected measured baseline — re-measure and update review.md/brief §2 before treating this as a failure, per the brief\'s own revalidation clause');
    assert.strictEqual(catalysts, 29, 'SNAPSHOT catalyst-count drifted from the corrected measured baseline (29, not the brief\'s stale 31)');
    assert.strictEqual(upcoming, 6, 'upcoming_event count unchanged from the brief\'s §2 baseline');
  });

  // ── DP-7: SYNTHETIC — lastUpdated present, date absent ⇒ no-evidence-date, never substituted ──
  await test('DP-7 SYNTHETIC: an evidence entry carrying lastUpdated but no date classifies no-evidence-date — lastUpdated is never substituted as a publication date', async function () {
    var NOW_ISO = '2026-09-24T12:00:00.000Z';
    var candidateUrl = 'https://example-news.test/dp7-no-date';
    var candidate = { eventDate: '2026-09-01', category: 'corporate_action', direction: 'positive', eventType: 'catalyst', relevanceScope: 'company', subType: null, sourceUrl: candidateUrl };
    var envelope = {
      status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [{ url: candidateUrl, last_updated: '2026-09-20' }], queries: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ items: [candidate] }), annotations: [] }] }
      ]
    };
    var result = await provider.getNewsCatalysts({ ticker: 'ZZZZ' }, { fetchImpl: makeFetchStub(JSON.stringify(envelope)), apiKey: 'x', nowIso: NOW_ISO });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.envelope.items.length, 1, 'the candidate survives (lastUpdated does not affect grounding)');
    assert.strictEqual(result.envelope.evidenceBindings[0].dateProvenance, 'no-evidence-date', 'lastUpdated-only entry must classify no-evidence-date, never be substituted as a date');
  });

  // ── DP-8: NEGATIVE — no persistence, no store write, no pt_* reference ──
  await test('DP-8 NEGATIVE: dateProvenance never reaches a persisted field — items[] carries exactly the 17 ITEM_FIELDS, no pt_* reference or store write appears anywhere in the provider source', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      for (var j = 0; j < replayed.items.length; j++) {
        assert.ok(!Object.prototype.hasOwnProperty.call(replayed.items[j], 'dateProvenance'), fixture.caseId + ' item ' + j + ': dateProvenance must never appear on a persisted item');
      }
    }
    var providerSource = fs.readFileSync(PROVIDER_PATH, 'utf8');
    assert.strictEqual(/pt_[A-Za-z0-9_]*/.test(providerSource), false, 'no pt_* localStorage-style reference in the provider source');
    assert.strictEqual(/\bfetch\s*\(\s*['"]https:\/\/[^'"]*blob/i.test(providerSource), false, 'no Blob/store write call introduced');
  });

  // S2 A5 (Rule S) — R-12..R-15 verify the measured, single-case survivor
  // delta against the 52c322b baseline (brief §4). The baseline is read via
  // `git show 52c322b:<path>` rather than hardcoded, so these tests fail
  // honestly if the actual pre-A5 fixture differs from what the brief
  // measured.
  function toLf(text) {
    return text.replace(/\r\n/g, '\n');
  }
  function baselineFixture(caseId) {
    var relPath = 'qa/fixtures/replay/' + caseId + '.json';
    var child = spawnSync('git', ['show', '52c322b:' + relPath], { cwd: ROOT, encoding: 'utf8' });
    assert.strictEqual(child.status, 0, 'git show 52c322b:' + relPath + ' failed: ' + child.stderr);
    return JSON.parse(child.stdout);
  }
  function baselineFixtureRaw(caseId) {
    var relPath = 'qa/fixtures/replay/' + caseId + '.json';
    var child = spawnSync('git', ['show', '52c322b:' + relPath], { cwd: ROOT, encoding: 'utf8' });
    assert.strictEqual(child.status, 0, 'git show 52c322b:' + relPath + ' failed: ' + child.stderr);
    return child.stdout;
  }

  // S2-M1 additionally relabels the Site-B (grounding-miss) skips in these
  // two cases from INVALID_SOURCE_URL to UNRETRIEVED_SOURCE_URL (brief §4) —
  // the 52c322b baseline predates that split, so these two now also diverge
  // from it on {items, skippedItems}, alongside the pre-existing Rule S
  // (A5) FROG divergence. R-16 below pins that this is the ONLY difference.
  var S2_M1_RELABELED_CASES = ['p3-20260921T2045Z-NVDA', 'p4-20260921T2312Z-NVDA'];

  // ── R-12: exactly three cases differ from the 52c322b baseline — Rule S's FROG case plus S2-M1's two relabeled NVDA cases ──
  await test('R-12 exactly three cases\' expected {items, skippedItems} differ from the 52c322b baseline: p4-20260921T2312Z-FROG (Rule S) and the two S2-M1 relabeled NVDA cases', function () {
    var diverged = [];
    for (var i = 0; i < index.cases.length; i++) {
      var caseId = index.cases[i].caseId;
      var current = loadCase(caseId);
      var baseline = baselineFixture(caseId);
      var currentSnapshot = JSON.stringify({ items: current.expected.items, skippedItems: current.expected.skippedItems });
      var baselineSnapshot = JSON.stringify({ items: baseline.expected.items, skippedItems: baseline.expected.skippedItems });
      if (currentSnapshot !== baselineSnapshot) { diverged.push(caseId); }
    }
    assert.deepStrictEqual(diverged.slice().sort(), S2_M1_RELABELED_CASES.concat(['p4-20260921T2312Z-FROG']).sort(), 'exactly three cases must diverge from baseline: the FROG hub case and the two S2-M1 relabeled NVDA cases');
  });

  // ── R-13: p4-2312-FROG is 0 items / 5 × GENERIC_SOURCE_URL ─────────────
  await test('R-13 p4-20260921T2312Z-FROG replays to 0 items and exactly 5 GENERIC_SOURCE_URL skips', async function () {
    var fixture = loadCase('p4-20260921T2312Z-FROG');
    var replayed = await replay(fixture);
    assert.strictEqual(replayed.items.length, 0, 'the hub case is now a zero-item case');
    assert.strictEqual(replayed.skippedItems.length, 5, 'all five candidates are skipped');
    replayed.skippedItems.forEach(function (s) {
      assert.strictEqual(s.reason, 'GENERIC_SOURCE_URL', 'every skip on this case is GENERIC_SOURCE_URL, not DUPLICATE_IN_BATCH — the generic check now runs first in the ladder');
    });
  });

  // ── R-14: the other six fixture files are unchanged from the 52c322b baseline ──
  await test('R-14 the six non-FROG, non-S2-M1 fixture files are unchanged from the 52c322b baseline (content compared with CRLF normalized to LF, so a checkout line-ending difference is never reported as a divergence)', function () {
    var EXCLUDED = ['p4-20260921T2312Z-FROG'].concat(S2_M1_RELABELED_CASES);
    for (var i = 0; i < index.cases.length; i++) {
      var caseId = index.cases[i].caseId;
      if (EXCLUDED.indexOf(caseId) !== -1) { continue; }
      var currentRaw = fs.readFileSync(path.join(FIXTURES_DIR, caseId + '.json'), 'utf8');
      var baselineRaw = baselineFixtureRaw(caseId);
      assert.strictEqual(toLf(currentRaw), toLf(baselineRaw), caseId + ': fixture file content diverged from the 52c322b baseline');
    }
  });

  // ── R-16: the two S2-M1 relabeled NVDA cases diverge from the 52c322b baseline in EXACTLY the reason values, nothing else ──
  // Codex review (S2-M1, round 1): a hand-picked subset of field-by-field
  // checks (items/attribution/input/provenance) closes most of the gap R-14's
  // exclusion of these two cases opens, but not all of it — it silently
  // permits drift in fields it doesn't name (caseId, expected.kind,
  // expected.providerVersion, any future added key). Fixed by reverting the
  // current fixture's skippedItems reasons to their baseline value and then
  // deep-comparing the ENTIRE fixture object against baseline — every key is
  // covered, not just the ones this test happens to enumerate.
  await test('R-16 the two S2-M1 relabeled NVDA cases diverge from the 52c322b baseline in exactly their skippedItems[].reason values — with those reasons reverted, the WHOLE fixture object is deep-equal to baseline, in every field', function () {
    S2_M1_RELABELED_CASES.forEach(function (caseId) {
      var current = loadCase(caseId);
      var baseline = baselineFixture(caseId);
      assert.strictEqual(current.expected.skippedItems.length, baseline.expected.skippedItems.length, caseId + ': skippedItems length must be unchanged');
      var baselineReasons = baseline.expected.skippedItems.map(function (s) { return s.reason; });
      assert.ok(baselineReasons.every(function (r) { return r === 'INVALID_SOURCE_URL'; }), caseId + ': baseline reasons expected all INVALID_SOURCE_URL (pre-S2-M1)');
      var currentReasons = current.expected.skippedItems.map(function (s) { return s.reason; });
      assert.ok(currentReasons.every(function (r) { return r === 'UNRETRIEVED_SOURCE_URL'; }), caseId + ': current reasons expected all UNRETRIEVED_SOURCE_URL (post-S2-M1 Site-B relabel)');
      var reconstructed = JSON.parse(JSON.stringify(current));
      reconstructed.expected.skippedItems.forEach(function (item, idx) {
        assert.deepStrictEqual(Object.keys(item), ['reason'], caseId + ': skippedItems[' + idx + '] must carry only { reason } — nothing else to revert or miss');
        item.reason = 'INVALID_SOURCE_URL'; // mutate the existing object in place — never replace it, or an unexpected extra property on this entry would be silently erased rather than caught below
      });
      assert.deepStrictEqual(reconstructed, baseline, caseId + ': with skippedItems reasons reverted to their baseline value, the fixture must be deep-equal to the 52c322b baseline in EVERY other field, including caseId, expected.kind and expected.providerVersion');
    });
  });

  // ── R-15: rule and corpus agree — no surviving item binds a hub index-document path ──
  var HUB_INDEX_DOC_RE = /\/(news|press-release|press-releases|investors|investor-relations|newsroom|media)\/(?:default|index)\.(?:aspx|html?|php)$/i;
  await test('R-15 no surviving item in any case binds a source URL whose path is a generic hub segment plus an index-document leaf — rule and corpus agree', async function () {
    for (var i = 0; i < index.cases.length; i++) {
      var fixture = loadCase(index.cases[i].caseId);
      var replayed = await replay(fixture);
      replayed.items.forEach(function (item) {
        var p = new URL(item.normalizedSourceUrl).pathname;
        assert.ok(!HUB_INDEX_DOC_RE.test(p), fixture.caseId + ': surviving item binds a hub index-document path Rule S should have rejected: ' + item.normalizedSourceUrl);
      });
    }
  });

  global.fetch = _origFetch;

  var result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
