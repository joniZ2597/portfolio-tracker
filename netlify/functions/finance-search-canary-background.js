const PPLX_AGENT_URL = 'https://api.perplexity.ai/v1/agent';

export const handler = async (event) => {
  if (process.env.PT_ENABLE_FINANCE_SEARCH_SERVER !== 'true') {
    console.log('Finance Search Canary is DISABLED via Gate.');
    return { statusCode: 202 };
  }

  const apiKey = (process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) {
    console.error('Missing PERPLEXITY_API_KEY environment variable.');
    return { statusCode: 202 };
  }

  console.log('Starting slow Perplexity Finance Search Canary for NVDA (earnings_history)...');
  const t0 = Date.now();

  try {
    const response = await fetch(PPLX_AGENT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        input: 'Retrieve Finance Search data for NVDA. Return structured results for categories: earnings_history.',
        max_steps: 1,
        tools: [{ type: 'finance_search' }]
      })
    });

    if (!response.ok) {
      console.error(`API returned error status: ${response.status}`);
      const errText = await response.text();
      console.error('Error body:', errText);
      return { statusCode: 202 };
    }

    const data = await response.json();

    console.log('=== TEST CANARY SUCCESS ===');
    console.log(`Latency: ${Date.now() - t0}ms`);
    console.log(JSON.stringify(data, null, 2));
    console.log('===========================');

  } catch (err) {
    console.error('=== TEST CANARY FAILED WITH EXCEPTION ===', err.message || String(err));
  }

  return { statusCode: 202 };
};
