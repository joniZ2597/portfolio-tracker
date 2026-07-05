'use strict';

/**
 * netlify/functions/lib/evidence-provider-sec10q-fixture.js
 *
 * EG-20F-3 — sec10q Fixture Provider (network-inert).
 *
 * Static, deterministic fixture provider for the dormant research-evidence
 * function. It is pure and inert:
 *   - it performs NO network/fetch, NO fs, NO Blob, and reads NO env
 *   - it returns only hand-authored items shaped to the frozen evidence
 *     contract (see netlify/functions/lib/evidence-contract.js); the contract
 *     is the single source of truth and validates/projects every item before
 *     it is ever served, regardless of which provider produced it
 *
 * Provider shape (matches evidence-provider-mock.js):
 *   getEvidence({ ticker, categories }) -> raw evidence array
 *
 * Category handling: this provider only emits the 'sec10q' category. If the
 * requested categories do not include 'sec10q' it returns [] (the handler has
 * already normalized + allow-listed categories before calling here).
 *
 * Host policy (EG-20F-3): primary SEC examples use realistic https sec.gov
 * URLs (rendered clickable by the EG-20F-2 source renderer); one item uses an
 * example.com URL to preserve the non-clickable mock-host render path; one item
 * carries fully null source metadata to exercise the renderer's suppression
 * (hasMeta === false) path. All URLs are fixed literals — none is fetched.
 */

var SEC10Q_CATEGORY = 'sec10q';

// Deterministic fixture rows. `ticker` is interpolated into evidenceId/claim
// only; source URLs are fixed literals. Every row already satisfies the frozen
// contract (confidence null, requiresVerification true, scoringImpact 'none').
function buildFixtures(ticker) {
  return [
    // sec.gov, clickable, full metadata, direction: positive
    {
      evidenceId: 'sec10q_fixture:' + ticker + ':1',
      category: SEC10Q_CATEGORY,
      claim: ticker + ' Form 10-Q reported higher quarterly revenue versus the prior-year period.',
      direction: 'positive',
      confidence: null,
      sourceLabel: 'Form 10-Q — Quarterly Report',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-Q&owner=include&count=40',
      sourceDate: '2026-02-12',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    },
    // sec.gov, clickable, full metadata, direction: neutral
    {
      evidenceId: 'sec10q_fixture:' + ticker + ':2',
      category: SEC10Q_CATEGORY,
      claim: ticker + ' Form 10-Q disclosed liquidity and capital-resources commentary in Item 2 (MD&A).',
      direction: 'neutral',
      confidence: null,
      sourceLabel: 'Form 10-Q — MD&A (Item 2)',
      sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-Q&owner=include&count=10',
      sourceDate: '2026-02-12',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    },
    // example.com, NON-clickable mock host, full metadata, direction: negative
    {
      evidenceId: 'sec10q_fixture:' + ticker + ':3',
      category: SEC10Q_CATEGORY,
      claim: ticker + ' Form 10-Q noted a risk factor regarding margin pressure (fixture mock host).',
      direction: 'negative',
      confidence: null,
      sourceLabel: 'Form 10-Q — Risk Factors (mock host)',
      sourceUrl: 'https://example.com/' + ticker + '/sec10q/10-q',
      sourceDate: '2026-02-12',
      sourceType: 'sec_filing',
      requiresVerification: true,
      scoringImpact: 'none'
    },
    // Fully null source metadata: exercises the renderer suppression path
    // (typeLabel/link/dateText/label all falsy => hasMeta === false).
    {
      evidenceId: 'sec10q_fixture:' + ticker + ':4',
      category: SEC10Q_CATEGORY,
      claim: ticker + ' Form 10-Q referenced without source metadata (suppression-path fixture).',
      direction: 'neutral',
      confidence: null,
      sourceLabel: null,
      sourceUrl: null,
      sourceDate: null,
      sourceType: null,
      requiresVerification: true,
      scoringImpact: 'none'
    }
  ];
}

function getEvidence(request) {
  var src = (request && typeof request === 'object') ? request : {};
  var ticker = (typeof src.ticker === 'string') ? src.ticker : '';
  var categories = src.categories;

  if (!Array.isArray(categories) || categories.indexOf(SEC10Q_CATEGORY) === -1) {
    return [];
  }

  return buildFixtures(ticker);
}

// Pull-path CIK seam (Real Portfolio Evidence Pull — Phase 1).
// Surfaces a CIK EXPLICITLY from the fixture pull path so an orchestrator can
// build a writer payload without parsing sourceUrl and without a live SEC
// lookup. This is a deterministic, SYNTHETIC 10-digit CIK for the fixture
// ticker — NOT a real EDGAR CIK. It is network-, env-, fs- and Blob-inert
// (pure string arithmetic), mirroring the rest of this fixture provider.
// The live provider (evidence-provider-sec10q-live.js) resolves the REAL CIK
// from SEC structured data; that provider's explicit-CIK seam is a later,
// separately-approved phase.
function resolveCik(ticker) {
  var t = (typeof ticker === 'string') ? ticker.trim().toUpperCase() : '';
  if (!/^[A-Z]{1,10}$/.test(t)) {
    return null;
  }
  var h = 5381; // djb2, deterministic; masked to uint32 each step
  for (var i = 0; i < t.length; i++) {
    h = ((h * 33) + t.charCodeAt(i)) >>> 0;
  }
  return String(h).padStart(10, '0').slice(-10);
}

module.exports = { getEvidence, resolveCik };
