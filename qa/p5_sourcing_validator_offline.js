'use strict';

/*
 * P-5 Research-on-Demand — Step 1 offline QA (sourcing validator).
 *
 * Pure Node, no network, no browser, no live services. Extracts the P-5
 * validator functions from index.html (brace-matching, read-only) and runs
 * the P5-3 §8 fixtures 1-7 + 11 plus the 2026-08-11 owner promotion-ruling
 * fixtures (missing-title rejection, strict ISO date parsing, last_updated
 * exclusion, direction dropped) and the LX-1 behavior pins (eight-key counts
 * lock, rejection order, index hygiene, model-smuggling displacement,
 * ordering, determinism, isolation scans with positive controls).
 * Fixture inputs are deep-frozen: any implementation mutation throws.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

function extractFunctionSource(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function deepKeyScan(obj, predicate, hits) {
  hits = hits || [];
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (predicate(k)) hits.push(k);
      deepKeyScan(obj[k], predicate, hits);
    }
  }
  return hits;
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');
const FN_NAMES = ['_p5NormalizeUrl', '_p5DomainFromUrl', '_p5UsableTitle', '_p5UsableDate',
  '_p5IndexSearchResults', '_p5ValidateItems', '_p5SynthesisPayload'];
const sources = {};
for (const n of FN_NAMES) {
  sources[n] = extractFunctionSource(content, n);
  if (!sources[n]) {
    console.log('  FAIL  could not extract ' + n + ' from index.html');
    process.exit(1);
  }
}

// eslint-disable-next-line no-new-func
const factory = new Function(
  '"use strict";\n' + FN_NAMES.map(n => sources[n]).join('\n') +
  '\nreturn { ' + FN_NAMES.map(n => n + ': ' + n).join(', ') + ' };'
);
const api = factory();

// ── F1: URL normalization ────────────────────────────────────────────────
(function () {
  const N = api._p5NormalizeUrl;
  check('host+scheme lowercased, www stripped', N('HTTPS://WWW.Example.com/News/Item') === 'https://example.com/News/Item');
  check('fragment dropped', N('https://a.com/x#frag') === 'https://a.com/x');
  check('trailing slash stripped', N('https://a.com/x/') === 'https://a.com/x');
  check('root path stable', N('https://a.com/') === N('https://a.com'));
  check('default port stripped', N('https://a.com:443/x') === 'https://a.com/x');
  check('explicit port kept', N('https://a.com:8443/x') === 'https://a.com:8443/x');
  check('userinfo dropped', N('https://user:pw@a.com/x') === 'https://a.com/x');
  check('query preserved with order', N('https://a.com/x?b=2&a=1') === 'https://a.com/x?b=2&a=1');
  check('query order NOT normalized', N('https://a.com/x?a=1&b=2') !== N('https://a.com/x?b=2&a=1'));
  check('path case preserved', N('https://a.com/X') !== N('https://a.com/x'));
  check('percent-encoding case not unified', N('https://a.com/a%2Fb') !== N('https://a.com/a%2fb'));
  check('space canonicalized symmetrically', N('https://a.com/a b') === N('https://a.com/a%20b'));
  check('IDN -> punycode', typeof N('https://müller.de/x') === 'string' && N('https://müller.de/x').indexOf('xn--') !== -1);
  check('scheme-less malformed', N('example.com/x') === null);
  check('ftp rejected', N('ftp://a.com/x') === null);
  check('non-string null', N(42) === null && N(null) === null && N(undefined) === null);
  check('empty null', N('') === null && N('   ') === null);
})();

// ── F2: strict ISO date parsing (owner promotion ruling 2) ───────────────
(function () {
  const D = (fields) => api._p5UsableDate(deepFreeze(fields));
  check('plain ISO date accepted', D({ date: '2026-08-11' }) === '2026-08-11');
  check('datetime T HH:MM accepted+truncated', D({ date: '2026-08-11T09:15' }) === '2026-08-11');
  check('datetime T HH:MM:SS accepted', D({ date: '2026-08-11T09:15:00' }) === '2026-08-11');
  check('datetime with millis+Z accepted', D({ date: '2026-08-11T09:15:00.123Z' }) === '2026-08-11');
  check('datetime with offset accepted', D({ date: '2026-08-11T09:15:00+03:00' }) === '2026-08-11');
  check('pseudo-datetime Tgarbage REJECTED', D({ date: '2026-08-11Tgarbage' }) === null);
  check('pseudo-datetime space-anything REJECTED', D({ date: '2026-08-11 anything' }) === null);
  check('space-separated valid time REJECTED (T only)', D({ date: '2026-08-11 09:15:00' }) === null);
  check('hour 25 rejected', D({ date: '2026-08-11T25:00' }) === null);
  check('minute 60 rejected', D({ date: '2026-08-11T09:60' }) === null);
  check('second 61 rejected', D({ date: '2026-08-11T09:15:61' }) === null);
  check('short offset rejected', D({ date: '2026-08-11T09:15+3:00' }) === null);
  check('invalid calendar 2026-02-30 rejected', D({ date: '2026-02-30' }) === null);
  check('month 13 rejected', D({ date: '2026-13-01' }) === null);
  check('leap day 2024 accepted', D({ date: '2024-02-29' }) === '2024-02-29');
  check('non-leap 2026-02-29 rejected', D({ date: '2026-02-29' }) === null);
  check('century non-leap 1900-02-29 rejected', D({ date: '1900-02-29' }) === null);
  check('prose date rejected', D({ date: 'August 11, 2026' }) === null);
  check('non-padded rejected', D({ date: '2026-8-1' }) === null);
  check('published_date fallback used', D({ published_date: '2026-08-10' }) === '2026-08-10');
  check('date wins over published_date', D({ date: '2026-08-09', published_date: '2026-08-10' }) === '2026-08-09');
  check('invalid date falls through to published_date', D({ date: 'yesterday', published_date: '2026-08-10' }) === '2026-08-10');
  check('last_updated NEVER used', D({ last_updated: '2026-08-11' }) === null);
  check('last_updated ignored even when only field', D({ date: 'n/a', last_updated: '2026-08-11' }) === null);
  check('title helper trims and rejects empty', api._p5UsableTitle({ title: '  x  ' }) === 'x' &&
    api._p5UsableTitle({ title: '   ' }) === null && api._p5UsableTitle({}) === null);
})();

// ── Shared fixture set (P5-2 live-verified shape) ────────────────────────
const SEARCH_RESULTS = deepFreeze([
  { title: 'NVIDIA announces Q2 results', url: 'https://www.example.com/news/nvda-q2', date: '2026-08-05', last_updated: '2026-08-09', snippet: 's1' },
  { title: 'Latest News - NVIDIA Newsroom', url: 'https://nvidianews.nvidia.com/', date: '2026-08-07' },
  { title: 'Chip sector overview', url: 'https://media.example.org/chips/overview/', published_date: '2026-08-06T11:30:00Z' },
  { title: 'Undated analysis piece', url: 'https://example.net/analysis/undated', last_updated: '2026-08-08' },
  { title: '', url: 'https://example.net/no-title', date: '2026-08-04' },
  'https://cite.example.com/bare-string-entry',
  { title: 'Dup shadow (first wins)', url: 'https://www.example.com/news/nvda-q2/', date: '2026-08-01' },
  12345,
  { title: 'Bad URL entry', url: 'not a url', date: '2026-08-03' }
]);

const MODEL_ITEMS = deepFreeze([
  { sourceUrl: 'HTTPS://WWW.Example.com/news/nvda-q2#top', title: 'FABRICATED TITLE', date: '2001-01-01', publisher: 'fake', direction: 'bullish', confidence: 0.99, summary: '  Q2 beat expectations.  ' },
  { sourceUrl: 'https://nvidianews.nvidia.com', summary: 'Newsroom index.' },
  { sourceUrl: 'https://media.example.org/chips/overview', summary: 'Sector overview.', direction: 'neutral' },
  { sourceUrl: 'https://example.com/news/hallucinated-path', summary: 'Made-up path, real host.' },
  { sourceUrl: 'https://example.net/analysis/undated', summary: 'No pub date.' },
  { sourceUrl: 'https://example.net/no-title', summary: 'Matched but titleless.' },
  { sourceUrl: 'https://cite.example.com/bare-string-entry', summary: 'Bare-string match.' },
  { sourceUrl: 'https://www.example.com/news/nvda-q2/', summary: 'Duplicate of item 0.' },
  { sourceUrl: 'https://example.net/analysis/undated', summary: 'Re-cites rejected URL.' },
  { summary: 'No sourceUrl at all.' },
  'not-an-object',
  { sourceUrl: 'nonsense-url', summary: 'Malformed URL.' }
]);

// ── F3: index construction + hygiene ─────────────────────────────────────
const INDEX = api._p5IndexSearchResults(SEARCH_RESULTS);
(function () {
  check('searchResultsCount = raw length', INDEX.searchResultsCount === 9);
  check('unindexable counted (non-object + bad URL)', INDEX.unindexable.length === 2);
  check('collision counted, first wins', INDEX.collisions.length === 1 &&
    INDEX.index['https://example.com/news/nvda-q2'].title === 'NVIDIA announces Q2 results');
  check('bare-string entry indexed URL-only (no fabricated metadata)',
    INDEX.index['https://cite.example.com/bare-string-entry'].title === null &&
    INDEX.index['https://cite.example.com/bare-string-entry'].date === null);
  check('empty-title entry indexed with null title', INDEX.index['https://example.net/no-title'].title === null);
  check('published_date fallback in index', INDEX.index['https://media.example.org/chips/overview'].date === '2026-08-06');
  check('last_updated-only entry has null date', INDEX.index['https://example.net/analysis/undated'].date === null);
})();

// ── F4-F9: the core validation fixtures ──────────────────────────────────
const RESULT = api._p5ValidateItems(MODEL_ITEMS, INDEX);
(function () {
  const c = RESULT.counts;
  check('counts key set locked (8 keys)', JSON.stringify(Object.keys(c).sort()) === JSON.stringify(
    ['accepted', 'rejectedDuplicate', 'rejectedMalformed', 'rejectedMissingDate',
      'rejectedMissingTitle', 'rejectedUnmatched', 'returned', 'searchResultsCount'].sort()));
  check('returned = 12', c.returned === 12);
  check('accepted = 3', c.accepted === 3);
  check('malformed = 3', c.rejectedMalformed === 3);
  check('unmatched = 1', c.rejectedUnmatched === 1);
  check('duplicate = 1', c.rejectedDuplicate === 1);
  check('missing-date = 3 (undated + bare-string + re-cite)', c.rejectedMissingDate === 3);
  check('missing-title = 1 (promotion ruling)', c.rejectedMissingTitle === 1);
  check('searchResultsCount carried', c.searchResultsCount === 9);
  check('arithmetic invariant', c.returned === c.accepted + c.rejectedMalformed + c.rejectedUnmatched +
    c.rejectedDuplicate + c.rejectedMissingDate + c.rejectedMissingTitle);

  const a0 = RESULT.accepted[0];
  check('accepted[0] is input 0', a0.inputIndex === 0);
  check('title from search entry, fabricated displaced', a0.title === 'NVIDIA announces Q2 results');
  check('date from search entry, fabricated displaced', a0.date === '2026-08-05');
  check('url is search entry original', a0.url === 'https://www.example.com/news/nvda-q2');
  check('publisher derived from normalized host', a0.publisher === 'example.com');
  check('summary is model-authored, trimmed', a0.summary === 'Q2 beat expectations.');
  check('summaryOrigin = model', a0.summaryOrigin === 'model');
  check('direction dropped (ruling 1)', deepKeyScan(RESULT, k => k === 'direction').length === 0);
  check('no score/rating/ranking/confidence key anywhere',
    deepKeyScan(RESULT, k => /score|rating|ranking|confidence/i.test(k)).length === 0);
  check('no model publisher leak', a0.publisher !== 'fake');

  const a1 = RESULT.accepted[1];
  check('landing page accepted', a1.inputIndex === 1 && a1.title === 'Latest News - NVIDIA Newsroom');
  check('no article-ness key exists', deepKeyScan(RESULT, k => /article/i.test(k)).length === 0);

  const rej = RESULT.rejected;
  const byIndex = {};
  for (const r of rej) byIndex[r.inputIndex] = r;
  check('host-only match rejected unmatched (real host, fake path)', byIndex[3] && byIndex[3].reason === 'unmatched');
  check('missing-date for last_updated-only entry', byIndex[4] && byIndex[4].reason === 'missing-date');
  check('missing-title rejection (promotion ruling)', byIndex[5] && byIndex[5].reason === 'missing-title');
  check('bare-string match fails missing-date naturally', byIndex[6] && byIndex[6].reason === 'missing-date');
  check('normalized-variant duplicate rejected', byIndex[7] && byIndex[7].reason === 'duplicate');
  check('re-cited rejected URL re-fails missing-date, not duplicate', byIndex[8] && byIndex[8].reason === 'missing-date');
  check('missing sourceUrl malformed', byIndex[9] && byIndex[9].reason === 'malformed');
  check('non-object item malformed', byIndex[10] && byIndex[10].reason === 'malformed');
  check('unparseable URL malformed', byIndex[11] && byIndex[11].reason === 'malformed');

  const asc = arr => arr.every((x, i) => i === 0 || arr[i - 1].inputIndex < x.inputIndex);
  check('accepted ascending inputIndex', asc(RESULT.accepted));
  check('rejected ascending inputIndex', asc(RESULT.rejected));
})();

// ── F10: empty / degenerate inputs ───────────────────────────────────────
(function () {
  const empty = api._p5ValidateItems(deepFreeze([]), INDEX);
  check('empty items: zero everything except searchResultsCount',
    empty.counts.returned === 0 && empty.counts.accepted === 0 && empty.counts.searchResultsCount === 9);
  const noIndex = api._p5ValidateItems(MODEL_ITEMS, api._p5IndexSearchResults(deepFreeze([])));
  check('empty index: nothing accepted, all 9 parseable items unmatched, 3 malformed',
    noIndex.counts.accepted === 0 && noIndex.counts.rejectedUnmatched === 9 && noIndex.counts.rejectedMalformed === 3);
  const nonArray = api._p5ValidateItems(deepFreeze({ not: 'array' }), INDEX);
  check('non-array items treated as zero returned', nonArray.counts.returned === 0);
})();

// ── F11: synthesis payload discipline ────────────────────────────────────
(function () {
  check('zero accepted -> null payload', api._p5SynthesisPayload(deepFreeze([])) === null);
  check('non-array -> null payload', api._p5SynthesisPayload(null) === null);
  const payload = api._p5SynthesisPayload(RESULT.accepted);
  check('payload itemCount matches accepted', payload.itemCount === 3 && payload.items.length === 3);
  check('payload items carry only title/date/url/summary', payload.items.every(it =>
    JSON.stringify(Object.keys(it).sort()) === JSON.stringify(['date', 'summary', 'title', 'url'])));
  check('payload derived from accepted only (titles are search-owned)',
    payload.items[0].title === 'NVIDIA announces Q2 results');
  check('no direction/sourceUrl leak into payload',
    deepKeyScan(payload, k => k === 'direction' || k === 'sourceUrl').length === 0);
})();

// ── F12: determinism ─────────────────────────────────────────────────────
(function () {
  const s1 = JSON.stringify(api._p5ValidateItems(MODEL_ITEMS, api._p5IndexSearchResults(SEARCH_RESULTS)));
  const s2 = JSON.stringify(api._p5ValidateItems(MODEL_ITEMS, api._p5IndexSearchResults(SEARCH_RESULTS)));
  const s3 = JSON.stringify(RESULT);
  check('triple serialization byte-identical', s1 === s2 && s2 === s3);
})();

// ── F13: isolation — forbidden-token scan with positive controls ─────────
(function () {
  const stripped = FN_NAMES.map(n => sources[n]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')).join('\n');
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/,
    /document\./, /window\./, /\bpt_/, /Date\.now/, /Math\.random/, /require\s*\(/, /process\./];
  const control = 'fetch( XMLHttpRequest localStorage sessionStorage document.x window.y pt_k Date.now Math.random require( process.env';
  for (const pat of forbidden) {
    check('positive control fires: ' + pat.source, pat.test(control));
    check('P5 sources clean of ' + pat.source, !pat.test(stripped));
  }
})();

console.log(failures === 0
  ? 'P5 VALIDATOR: PASS (' + asserts + ' asserts)'
  : 'P5 VALIDATOR: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
