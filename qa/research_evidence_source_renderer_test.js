'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const renderer = require('../services/research-evidence-source-renderer');

// Mirror of index.html's _edgarEsc (escapes & < > and double quotes).
function esc(s) {
  return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
}

function item(overrides) {
  return Object.assign({
    sourceLabel: null,
    sourceUrl: null,
    sourceDate: null,
    sourceType: null
  }, overrides || {});
}

function testBuild() {
  // Valid all fields.
  let m = renderer.buildSourceMeta(item({
    sourceType: 'sec_filing',
    sourceUrl: 'https://www.sec.gov/x',
    sourceDate: '2026-01-15',
    sourceLabel: '  10-Q  '
  }));
  assert.strictEqual(m.hasMeta, true);
  assert.strictEqual(m.typeLabel, 'SEC filing');
  assert.strictEqual(m.dateText, '2026-01-15');
  assert.strictEqual(m.label, '10-Q');
  assert.deepStrictEqual(m.link, {
    href: 'https://www.sec.gov/x',
    domain: 'sec.gov',
    ariaLabel: 'Open source from sec.gov in a new tab',
    clickable: true
  });

  // URL-only.
  m = renderer.buildSourceMeta(item({ sourceUrl: 'https://a.com/p' }));
  assert.deepStrictEqual([m.hasMeta, m.typeLabel, m.dateText, m.label], [true, null, null, null]);
  assert.strictEqual(m.link.domain, 'a.com');

  // Label-only.
  m = renderer.buildSourceMeta(item({ sourceLabel: 'Press kit' }));
  assert.strictEqual(m.label, 'Press kit');
  assert.strictEqual(m.link, null);

  // Type + date only.
  m = renderer.buildSourceMeta(item({ sourceType: 'news', sourceDate: '2026-12-31' }));
  assert.deepStrictEqual([m.typeLabel, m.dateText, m.link, m.label], ['News', '2026-12-31', null, null]);

  // All null => suppressed.
  assert.strictEqual(renderer.buildSourceMeta(item()).hasMeta, false);
  assert.strictEqual(renderer.renderSourceMeta(item(), esc), '');

  // Unknown / non-canonical type suppressed.
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceType: 'tweet' })).typeLabel, null);
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceType: 'SEC_FILING' })).typeLabel, null);

  // Invalid date suppressed.
  for (const bad of ['2026-13-01', '2026-02-30', '2026/01/15', '20260115', '2026-1-5', '2026-01-15T00:00:00Z']) {
    assert.strictEqual(renderer.buildSourceMeta(item({ sourceDate: bad })).dateText, null, 'date ' + bad);
  }

  // Label bounds.
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceLabel: 'x'.repeat(201) })).label, null);
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceLabel: 'x'.repeat(200) })).label.length, 200);
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceLabel: '   ' })).label, null);
}

function testUrlSafety() {
  // HTTPS 2048 accepted, 2049 rejected.
  const base = 'https://a.com/';
  const url2048 = base + 'x'.repeat(2048 - base.length);
  assert.strictEqual(url2048.length, 2048);
  assert.ok(renderer.buildSourceMeta(item({ sourceUrl: url2048 })).link);
  const url2049 = base + 'x'.repeat(2049 - base.length);
  assert.strictEqual(url2049.length, 2049);
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceUrl: url2049 })).link, null);

  // http / relative / malformed / javascript / data / credentials / whitespace / non-string => no link.
  for (const bad of [
    'http://a.com',
    'ftp://a.com',
    '/relative',
    'a.com',
    'notaurl',
    'javascript:alert(1)',
    'data:text/html,x',
    'https://user:pass@a.com',
    'https://a.com/ space',
    'https://a.com/\tx',
    123,
    null,
    undefined
  ]) {
    assert.strictEqual(renderer.buildSourceMeta(item({ sourceUrl: bad })).link, null, 'url ' + String(bad));
  }
}

function testRender() {
  // HTML/script label escaped, never raw.
  let html = renderer.renderSourceMeta(item({ sourceLabel: '<script>alert(1)</script>' }), esc);
  assert.strictEqual(html.indexOf('<script>'), -1);
  assert.ok(html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') !== -1);

  // Quote/attribute URL payload safe (no raw breakout; quotes escaped in href).
  const payloadUrl = 'https://a.com/x"onmouseover="y';
  assert.ok(renderer.buildSourceMeta(item({ sourceUrl: payloadUrl })).link, 'payload url parses as https');
  html = renderer.renderSourceMeta(item({ sourceUrl: payloadUrl }), esc);
  assert.strictEqual(html.indexOf('"onmouseover="'), -1);
  assert.ok(html.indexOf('&quot;onmouseover=&quot;') !== -1);

  // Unknown fields ignored.
  const m = renderer.buildSourceMeta(item({ sourceType: 'news', surprise: 'x' }));
  assert.strictEqual(m.typeLabel, 'News');
  assert.ok(!('surprise' in m));

  // Exact anchor attributes + ordering (type · domain · date).
  html = renderer.renderSourceMeta(item({ sourceType: 'sec_filing', sourceUrl: 'https://www.sec.gov/abc', sourceDate: '2026-01-15' }), esc);
  assert.ok(html.indexOf('<a class="re-src-link" href="https://www.sec.gov/abc" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Open source from sec.gov in a new tab">sec.gov</a>') !== -1, 'exact anchor: ' + html);
  assert.strictEqual(html.indexOf('onclick'), -1);
  assert.ok(html.indexOf('SEC filing') < html.indexOf('sec.gov'));
  assert.ok(html.indexOf('sec.gov') < html.indexOf('2026-01-15'));

  // Mock example.com: rendered but NOT clickable.
  const mockMeta = renderer.buildSourceMeta(item({ sourceUrl: 'https://example.com/FROG/earnings/1' }));
  assert.strictEqual(mockMeta.link.clickable, false);
  assert.strictEqual(mockMeta.link.domain, 'example.com');
  html = renderer.renderSourceMeta(item({ sourceUrl: 'https://example.com/FROG/earnings/1' }), esc);
  assert.strictEqual(html.indexOf('<a '), -1, 'mock url must not be an anchor');
  assert.ok(html.indexOf('<span class="re-src-domain">example.com</span>') !== -1);

  // Real fixture clickable (www stripped).
  const realMeta = renderer.buildSourceMeta(item({ sourceUrl: 'https://www.businesswire.com/news/123' }));
  assert.strictEqual(realMeta.link.clickable, true);
  assert.strictEqual(realMeta.link.domain, 'businesswire.com');
}

// Blocker 1 regression: with no esc argument the renderer must still escape
// (safe internal fallback, never identity).
function testSafeFallbackEscaping() {
  const html = renderer.renderSourceMeta(item({ sourceLabel: '<script>alert(1)</script>' }));
  assert.strictEqual(html.indexOf('<script>'), -1, 'no raw <script> without esc');
  assert.ok(html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') !== -1, 'escaped text without esc');
  assert.ok(renderer.renderSourceMeta(item({ sourceLabel: 'a"b' })).indexOf('a&quot;b') !== -1, 'quote escaped without esc');
}

// Blocker 2 regression: both example.com and www.example.com are non-clickable.
function testMockNonClickable() {
  for (const url of ['https://example.com/x', 'https://www.example.com/x']) {
    const meta = renderer.buildSourceMeta(item({ sourceUrl: url }));
    assert.ok(meta.link, 'link built for ' + url);
    assert.strictEqual(meta.link.domain, 'example.com', 'domain for ' + url);
    assert.strictEqual(meta.link.clickable, false, 'non-clickable for ' + url);
    const html = renderer.renderSourceMeta(item({ sourceUrl: url }), esc);
    assert.strictEqual(html.indexOf('<a '), -1, 'no anchor for ' + url);
    assert.ok(html.indexOf('<span class="re-src-domain">example.com</span>') !== -1);
  }
  // Real https hosts remain clickable (www stripped from the visible domain).
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceUrl: 'https://www.sec.gov/x' })).link.clickable, true);
  assert.strictEqual(renderer.buildSourceMeta(item({ sourceUrl: 'https://businesswire.com/y' })).link.clickable, true);
}

function _sliceFunction(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start !== -1, 'missing ' + signature);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  return src.slice(start, i);
}

// Blocker 3 regression: the rendered footer text contains the literal
// "provider: … · cache: …" separator. Extracts the footer expression and
// _reCacheBadge from index.html and evaluates them with a stub esc + provider.
function testFooterSeparator() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const cacheBadgeSrc = _sliceFunction(html, 'function _reCacheBadge(');
  const fStart = html.indexOf('var footer =');
  assert.ok(fStart !== -1, 'footer expression present');
  const fEnd = html.indexOf("'</div>';", fStart) + "'</div>';".length;
  const footerExpr = html.slice(fStart, fEnd);

  function renderFooter(cacheStatus) {
    const harness = ''
      + 'function _edgarEsc(s){ return s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }\n'
      + cacheBadgeSrc + '\n'
      + 'var provider = "mock", cache = ' + JSON.stringify(cacheStatus) + ';\n'
      + footerExpr + '\n'
      + 'return footer;';
    return new Function(harness)().replace(/<[^>]*>/g, '');
  }

  assert.ok(renderFooter('BYPASS').indexOf('provider: mock · cache: BYPASS') !== -1, 'bypass footer: ' + renderFooter('BYPASS'));
  assert.ok(renderFooter('DEGRADED').indexOf('provider: mock · cache: ') !== -1, 'degraded footer: ' + renderFooter('DEGRADED'));
}

// Evaluate the inlined copy in index.html and confirm it behaves identically to
// the source module (parity / sync guard).
function testParity() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const startIdx = html.indexOf('var RE_SOURCE_TYPE_LABELS');
  const endMarkerIdx = html.indexOf('end services/research-evidence-source-renderer.js');
  assert.ok(startIdx !== -1 && endMarkerIdx > startIdx, 'inline source-renderer block delimiters present');
  const blockEnd = html.lastIndexOf('}', endMarkerIdx);
  const block = html.slice(startIdx, blockEnd + 1);

  // `module` is undeclared in this scope, so the dual-export guard is skipped
  // (typeof module === 'undefined'), matching the browser.
  const factory = new Function(block + '\nreturn { buildSourceMeta: buildResearchSourceMeta, renderSourceMeta: renderResearchSourceMeta };');
  const inline = factory();

  const fixtures = [
    item(),
    item({ sourceType: 'sec_filing', sourceUrl: 'https://www.sec.gov/x', sourceDate: '2026-01-15', sourceLabel: '10-Q' }),
    item({ sourceUrl: 'https://example.com/a/b/1' }),
    item({ sourceUrl: 'https://www.example.com/a/b/1' }),
    item({ sourceUrl: 'http://a.com' }),
    item({ sourceUrl: 'javascript:alert(1)' }),
    item({ sourceLabel: '<script>x</script>' }),
    item({ sourceType: 'tweet', sourceDate: '2026-02-30' }),
    item({ sourceUrl: 'https://user:pass@a.com' }),
    item({ sourceUrl: 'https://a.com/x"onmouseover="y' })
  ];

  for (const fx of fixtures) {
    assert.deepStrictEqual(inline.buildSourceMeta(fx), renderer.buildSourceMeta(fx), 'buildSourceMeta parity: ' + JSON.stringify(fx));
    assert.strictEqual(inline.renderSourceMeta(fx, esc), renderer.renderSourceMeta(fx, esc), 'renderSourceMeta parity: ' + JSON.stringify(fx));
    assert.strictEqual(inline.renderSourceMeta(fx), renderer.renderSourceMeta(fx), 'renderSourceMeta no-esc parity: ' + JSON.stringify(fx));
  }
}

function run() {
  testBuild();
  testUrlSafety();
  testRender();
  testSafeFallbackEscaping();
  testMockNonClickable();
  testFooterSeparator();
  testParity();
  console.log('research_evidence_source_renderer_test: PASS');
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
