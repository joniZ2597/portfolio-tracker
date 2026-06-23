'use strict';

/**
 * services/research-evidence-source-renderer.js
 *
 * Pure, inert helper for EG-20F-2: turns an evidence item's source metadata
 * (sourceLabel / sourceUrl / sourceDate / sourceType) into safe, STRUCTURED
 * render data, and assembles an escaped HTML fragment from that structure.
 *
 * Boundaries: no DOM, no network, no storage, no app state, no scoring path,
 * no listeners, no auto-invocation at load. `buildResearchSourceMeta` returns
 * structured data only (never raw HTML). `renderResearchSourceMeta` assembles
 * the HTML using an injected escape function (the app passes _edgarEsc); it
 * never trusts or raw-renders invalid input, and emits an anchor only for a
 * fully validated https URL.
 *
 * Future call site (EG-20E-2A panel) guards rendering behind the existing
 * client gate; this module stays environment-free and is inlined verbatim
 * (minus the leading 'use strict') into index.html.
 */

var RE_SOURCE_TYPE_LABELS = {
  sec_filing: 'SEC filing',
  press_release: 'Press release',
  earnings_call: 'Earnings call',
  company_ir: 'Company IR',
  news: 'News',
  analyst_report: 'Analyst report',
  other: 'Other source'
};

var RE_SOURCE_MAX_URL = 2048;
var RE_SOURCE_MAX_LABEL = 200;
var RE_SOURCE_MOCK_HOST = 'example.com';

// Known source type => display label, or null for unknown/invalid (suppressed).
function _reSrcType(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(RE_SOURCE_TYPE_LABELS, value)
    ? RE_SOURCE_TYPE_LABELS[value]
    : null;
}

// Strict YYYY-MM-DD real UTC calendar date, or null.
function _reSrcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  var year = Number(value.slice(0, 4));
  var month = Number(value.slice(5, 7));
  var day = Number(value.slice(8, 10));
  var date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}

// Trimmed non-empty label, max 200 chars, or null.
function _reSrcLabel(value) {
  if (typeof value !== 'string') {
    return null;
  }
  var trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > RE_SOURCE_MAX_LABEL) {
    return null;
  }
  return trimmed;
}

// Validate a source URL and return structured link data, or null. Only an
// absolute https URL (<=2048, no whitespace, no credentials, non-empty host)
// is accepted. example.com is rendered but marked non-clickable (mock rule).
function _reSrcLink(value) {
  if (typeof value !== 'string' || value.length > RE_SOURCE_MAX_URL || /\s/.test(value)) {
    return null;
  }
  var url;
  try {
    url = new URL(value);
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
    return null;
  }
  var domain = url.hostname.replace(/^www\./, '');
  if (!domain) {
    return null;
  }
  return {
    href: value,
    domain: domain,
    ariaLabel: 'Open source from ' + domain + ' in a new tab',
    clickable: domain !== RE_SOURCE_MOCK_HOST
  };
}

// Safe internal HTML escape (escapes & < > and double quotes). Used as the
// fallback when the caller supplies no escape function — never identity.
function _reSrcEscape(value) {
  return value == null ? '' : String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * buildResearchSourceMeta(item) -> structured render data (never raw HTML):
 *   { hasMeta, typeLabel, link, dateText, label }
 * hasMeta is false when every source field is null/missing/invalid, in which
 * case the caller suppresses the metadata line entirely.
 */
function buildResearchSourceMeta(item) {
  var src = (item && typeof item === 'object') ? item : {};
  var typeLabel = _reSrcType(src.sourceType);
  var link = _reSrcLink(src.sourceUrl);
  var dateText = _reSrcDate(src.sourceDate);
  var label = _reSrcLabel(src.sourceLabel);
  return {
    hasMeta: Boolean(typeLabel || link || dateText || label),
    typeLabel: typeLabel,
    link: link,
    dateText: dateText,
    label: label
  };
}

/**
 * renderResearchSourceMeta(item, esc) -> escaped HTML string ('' when
 * suppressed). `esc` must HTML-escape & < > and double quotes (the app passes
 * _edgarEsc). Every interpolated value is escaped; anchors carry fixed safe
 * attributes and no click handlers.
 */
function renderResearchSourceMeta(item, esc) {
  var escape = (typeof esc === 'function') ? esc : _reSrcEscape;

  var meta = buildResearchSourceMeta(item);
  if (!meta.hasMeta) {
    return '';
  }

  var parts = [];
  if (meta.typeLabel) {
    parts.push('<span class="re-src-type">' + escape(meta.typeLabel) + '</span>');
  }
  if (meta.link) {
    if (meta.link.clickable) {
      parts.push(
        '<a class="re-src-link" href="' + escape(meta.link.href) + '"'
        + ' target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"'
        + ' aria-label="' + escape(meta.link.ariaLabel) + '">'
        + escape(meta.link.domain)
        + '</a>'
      );
    } else {
      parts.push('<span class="re-src-domain">' + escape(meta.link.domain) + '</span>');
    }
  }
  if (meta.dateText) {
    parts.push('<span class="re-src-date">' + escape(meta.dateText) + '</span>');
  }
  if (meta.label) {
    parts.push('<span class="re-src-label">' + escape(meta.label) + '</span>');
  }

  return '<span class="re-src" style="display:block;margin-top:3px;font-family:var(--mono);font-size:9px;color:var(--text3)">'
    + parts.join('<span class="re-src-sep"> · </span>')
    + '</span>';
}

// Dual-export guard: CommonJS for offline Node tests; skipped in the browser
// (module is undefined) when this file is inlined into index.html, matching the
// services/research-evidence-client.js inlining pattern.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SOURCE_TYPE_LABELS: RE_SOURCE_TYPE_LABELS,
    MAX_SOURCE_URL: RE_SOURCE_MAX_URL,
    MAX_SOURCE_LABEL: RE_SOURCE_MAX_LABEL,
    MOCK_HOSTNAME: RE_SOURCE_MOCK_HOST,
    buildSourceMeta: buildResearchSourceMeta,
    renderSourceMeta: renderResearchSourceMeta
  };
}
