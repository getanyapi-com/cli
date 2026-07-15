import { describe, expect, it } from 'vitest';
import { AnyApiClient } from '../src/api.js';
import { formatCatalogPrice } from '../src/format.js';
import type { FetchLike } from '../src/types.js';

const catalogResponse = {
  apis: [{
    id: 'reddit.search',
    slug: 'reddit.search',
    category: 'social',
    name: 'Reddit Search',
    description: 'Search Reddit',
    provider: 'AnyAPI',
    pricing: {
      from: { model: 'linear', unit: 'result', baseUsd: 0.00005, perUnitUsd: 0.0001, maxUsd: 0.004 },
      failoverMaxUsd: 0.005,
    },
    lanes: [{
      pricing: { model: 'linear', unit: 'result', baseUsd: 0.00005, perUnitUsd: 0.0001, maxUsd: 0.004 },
      health: { window: '30d', uptimePct: 99.5, latencyP50Ms: 240, requests: 80 },
    }],
    tryEligible: true,
  }],
};

describe('customer-safe discovery reader', () => {
  it('reads browse responses with discriminated nested USD pricing', async () => {
    let requested = '';
    const client = clientFor(catalogResponse, (url) => { requested = url; });
    const response = await client.catalog({ category: 'social' });

    const url = new URL(requested);
    expect(url.pathname).toBe('/catalog');
    expect(Object.fromEntries(url.searchParams)).toEqual({ category: 'social' });
    expect(response).toEqual(catalogResponse);
    expect(formatCatalogPrice(response.apis[0]!)).toBe(
      'from USD 0.00005 + USD 0.0001/result (max USD 0.0040/request)',
    );
    expectCustomerSafe(response);
  });

  it('uses dedicated ranked search and accepts only relevance and ranking', async () => {
    let requested = '';
    const client = clientFor({
      results: [{
        slug: 'amazon.product',
        platformId: 'amazon',
        name: 'Amazon Product',
        description: 'Get product details',
        category: 'shopping',
        provider: 'AnyAPI',
        pricing: {
          from: { model: 'flat', unit: 'request', maxUsd: 0.005 },
          failoverMaxUsd: 0.006,
        },
        relevance: 0.92,
        highlightFields: [{ path: 'items[].price', type: 'number' }],
      }],
      total: 1,
      ranking: 'semantic',
    }, (url) => { requested = url; });

    const response = await client.search({
      query: 'wireless headphones', category: 'shopping', platform: 'amazon', limit: 10,
    });

    const url = new URL(requested);
    expect(url.pathname).toBe('/catalog/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'wireless headphones',
      category: 'shopping',
      platform: 'amazon',
      limit: '10',
    });
    expect(response).toMatchObject({
      total: 1,
      ranking: 'semantic',
      results: [{
        slug: 'amazon.product',
        provider: 'AnyAPI',
        pricing: { from: { model: 'flat', unit: 'request', maxUsd: 0.005 } },
        relevance: 0.92,
      }],
    });
    expectCustomerSafe(response);
  });

  it('reads authenticated detail responses with schemas', async () => {
    let authorization = '';
    const body = {
      ...catalogResponse.apis[0],
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      outputSchema: { type: 'array' },
      heavy: true,
    };
    const client = clientFor(body, undefined, (init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
    }, true);

    const response = await client.describe('reddit.search');

    expect(authorization).toBe('Bearer aa_live_test');
    expect(response).toEqual(body);
    expectCustomerSafe(response);
  });

  it('recursively strips forbidden accounting and provider metadata', async () => {
    const body = {
      ...catalogResponse.apis[0],
      provider: 'hidden-upstream',
      inputSchema: {
        type: 'object',
        internalCredits: 500,
        provider: 'hidden-upstream',
        providers: ['hidden-upstream'],
        properties: { query: { type: 'string' } },
      },
    };
    const client = clientFor(body, undefined, undefined, true);

    const response = await client.describe('reddit.search');

    expect(JSON.stringify(response)).not.toContain('hidden-upstream');
    expectCustomerSafe(response);
  });

  it('rejects discovery entries without nested pricing', async () => {
    const client = clientFor({
      apis: [{
        slug: 'reddit.search',
        category: 'social',
        name: 'Reddit Search',
        description: 'Search Reddit',
        provider: 'AnyAPI',
      }],
    });

    await expect(client.catalog()).rejects.toThrow('Invalid AnyAPI API discovery response.');
  });
});

function expectCustomerSafe(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectCustomerSafe);
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    expect(key.toLowerCase()).not.toContain('credit');
    expect(key.toLowerCase()).not.toBe('providers');
    if (key.toLowerCase() === 'provider') {
      expect(child).toBe('AnyAPI');
    }
    expectCustomerSafe(child);
  }
}

function clientFor(
  body: unknown,
  onUrl?: (url: string) => void,
  onInit?: (init?: RequestInit) => void,
  authenticated = false,
): AnyApiClient {
  const fetchImpl: FetchLike = async (input, init) => {
    onUrl?.(input.toString());
    onInit?.(init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return new AnyApiClient({
    apiKey: authenticated ? 'aa_live_test' : undefined,
    fetchImpl,
    catalogUrl: 'https://api.example.test/catalog',
    restBaseUrl: 'https://api.example.test/v1',
  });
}
