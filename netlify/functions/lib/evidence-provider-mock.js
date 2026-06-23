'use strict';

const DIRECTIONS = ['positive', 'neutral', 'negative'];
const SOURCE_TYPES = ['sec_filing', 'press_release', 'earnings_call'];

function getEvidence(request) {
  const ticker = request.ticker;
  const categories = request.categories;
  const results = [];

  categories.forEach((category, categoryIndex) => {
    const count = (category.length % 3) + 1;
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      results.push(makeEvidenceItem(ticker, category, categoryIndex, itemIndex));
    }
  });

  return results;
}

function makeEvidenceItem(ticker, category, categoryIndex, itemIndex) {
  const ordinal = itemIndex + 1;
  return {
    evidenceId: `mock:${ticker}:${category}:${ordinal}`,
    category,
    claim: `${ticker} mock ${category} evidence ${ordinal}`,
    direction: DIRECTIONS[(categoryIndex + itemIndex) % DIRECTIONS.length],
    confidence: null,
    sourceLabel: null,
    sourceUrl: `https://example.com/${ticker}/${category}/${ordinal}`,
    sourceDate: null,
    sourceType: SOURCE_TYPES[(categoryIndex + itemIndex) % SOURCE_TYPES.length],
    requiresVerification: true,
    scoringImpact: 'none'
  };
}

module.exports = { getEvidence };
