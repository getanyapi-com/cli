import { AnyApiClient } from '../dist/api.js';
import { readDiscoveryApi } from '../dist/discovery.js';

const origin = (process.env.ANYAPI_API_ORIGIN ?? 'https://api.getanyapi.com').replace(/\/$/, '');
const fetchImpl = async (input, init) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(10_000),
      });
      if (response.status !== 429 && response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AnyAPI live discovery request failed.');
};

const client = new AnyApiClient({
  fetchImpl,
  catalogUrl: `${origin}/catalog`,
  restBaseUrl: `${origin}/v1`,
});

const catalog = await client.catalog();
assert(catalog.apis.length > 0, 'catalog returned no APIs');

const search = await client.search({ query: 'web', limit: 1 });
assert(search.results.length > 0, 'search returned no APIs');

const candidate = catalog.apis.find((api) => api.tryEligible === true);
assert(candidate, 'catalog returned no try-eligible API');

const detailResponse = await fetchImpl(
  `${origin}/public/try/${encodeURIComponent(candidate.slug)}/schema`,
);
assert(detailResponse.ok, `public schema returned HTTP ${detailResponse.status}`);
const detail = readDiscoveryApi(await detailResponse.json());
assert(detail.slug === candidate.slug, 'public schema slug did not match the selected catalog API');
assert(isRecord(detail.inputSchema), 'public schema had no usable input schema');
assert(isRecord(detail.outputSchema), 'public schema had no usable output schema');

console.log(
  `Live discovery canary passed: ${catalog.apis.length} catalog APIs, `
  + `${search.results.length} search result, ${detail.slug} public schema.`,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Live discovery canary failed: ${message}.`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
