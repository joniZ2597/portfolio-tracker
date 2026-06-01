exports.handler = async function () {
  if (process.env.PT_ENABLE_FINANCE_SEARCH_SERVER !== 'true') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISABLED' })
    };
  }

  const deployUrl = process.env.DEPLOY_URL || '';
  const deployPrimeUrl = process.env.DEPLOY_PRIME_URL || '';
  const siteUrl = process.env.URL || '';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'OK',
      CONTEXT: process.env.CONTEXT || null,
      BRANCH: process.env.BRANCH || null,
      DEPLOY_URL_present: deployUrl.length > 0,
      DEPLOY_PRIME_URL_has_branch_dev: deployPrimeUrl.includes('branch-dev'),
      DEPLOY_URL_differs_from_URL: deployUrl.length > 0 && siteUrl.length > 0 && deployUrl !== siteUrl
    })
  };
};
