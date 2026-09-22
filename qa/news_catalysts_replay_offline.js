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
 * in original order. The only extra predicate applied is the same
 * syntax-only https check the D-M2 reconstruction already uses, to split the
 * single INVALID_SOURCE_URL reason string into its two real emission sites
 * (provider :641 malformed vs :646 grounding-miss) — never a re-run of the
 * ladder itself.
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
function appendEvidenceEntry(entries, seenNormalized, raw, evidenceKind) {
  if (!raw || typeof raw !== 'object') { return; }
  var rawUrl = typeof raw.url === 'string' ? raw.url : null;
  if (!rawUrl) { return; }
  var norm = tryNormalizeUrl(rawUrl);
  if (!norm) { return; }
  if (seenNormalized.has(norm.normalized)) { return; } // D-M2 first-occurrence-wins
  seenNormalized.add(norm.normalized);
  entries.push({ normalized: norm.normalized, domain: norm.domain, evidenceKind: evidenceKind });
}
// D-M2 order: search_results.results[] (array order), then
// fetch_url_results.contents[] (array order), then url_citation annotations
// on the output_text content entry (array order). First occurrence wins.
function reconstructEvidenceSet(rawParsedEnvelope) {
  var byKind = { search_result: 0, fetch_url_result: 0, url_citation: 0 };
  var entries = [];
  if (!rawParsedEnvelope || typeof rawParsedEnvelope !== 'object' || rawParsedEnvelope.status !== 'completed') {
    return { total: 0, byKind: byKind, entries: entries };
  }
  var output = Array.isArray(rawParsedEnvelope.output) ? rawParsedEnvelope.output : [];
  var seen = new Set();
  var i, j;
  for (i = 0; i < output.length; i++) {
    var s = output[i];
    if (s && s.type === 'search_results' && Array.isArray(s.results)) {
      for (j = 0; j < s.results.length; j++) { appendEvidenceEntry(entries, seen, s.results[j], 'search_result'); }
    }
  }
  for (i = 0; i < output.length; i++) {
    var f = output[i];
    if (f && f.type === 'fetch_url_results' && Array.isArray(f.contents)) {
      for (j = 0; j < f.contents.length; j++) { appendEvidenceEntry(entries, seen, f.contents[j], 'fetch_url_result'); }
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
      appendEvidenceEntry(entries, seen, raw, 'url_citation');
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
    if (reason === 'INVALID_SOURCE_URL') {
      if (isAcceptableSourceUrl(unmatchedRaw[k].sourceUrl)) {
        buckets.Q3_UNRETRIEVED_SOURCE_URL++;
        q3Candidates.push(unmatchedRaw[k]);
      } else {
        buckets.MALFORMED_CANDIDATE++;
      }
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
  return { items: result.envelope.items, skippedItems: result.envelope.skippedItems.map(function (s) { return { reason: s.reason }; }) };
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
    // sufficient to catch an ambient-state dependency).
    var repFixture = loadCase('p4-20260921T2312Z-FROG');
    var inProcess = await replay(repFixture);
    var script = 'const provider = require(' + JSON.stringify(PROVIDER_PATH) + ');' +
      'const fixture = JSON.parse(require("fs").readFileSync(' + JSON.stringify(path.join(FIXTURES_DIR, 'p4-20260921T2312Z-FROG.json')) + ', "utf8"));' +
      'async function fetchImpl(){ return { status: 200, headers: { get: () => null }, text: async () => fixture.input.rawResponseBody }; }' +
      'provider.getNewsCatalysts({ ticker: fixture.input.ticker }, { fetchImpl, apiKey: "x", nowIso: fixture.input.nowIso })' +
      '.then(r => { process.stdout.write(JSON.stringify({ items: r.envelope.items, skippedItems: r.envelope.skippedItems.map(s => ({reason: s.reason})) })); });';
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
    assert.deepStrictEqual(resultA.envelope.skippedItems.map(function (s) { return s.reason; }), ['INVALID_SOURCE_URL'], 'synthetic Q-3 candidate must be skipped INVALID_SOURCE_URL');
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
    // reconstruction (they were skipped INVALID_SOURCE_URL by grounding-miss).
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

  global.fetch = _origFetch;

  var result = failed === 0 ? 'ALL PASS' : 'FAILURES: ' + failed;
  process.stdout.write('\n  ' + result + ' (' + passed + ' passed, ' + failed + ' failed)\n\n');
  if (failed > 0) { process.exit(1); }
}

runTests().catch(function (err) {
  process.stderr.write('FATAL: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
