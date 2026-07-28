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
    failover: false,
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

  it('accepts discovery from older gateways without optional routing booleans', async () => {
    const api = { ...catalogResponse.apis[0] };
    delete (api as Partial<typeof api>).failover;
    const client = clientFor({ apis: [api] });

    await expect(client.catalog()).resolves.toEqual({ apis: [api] });
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
      futureEnvelopeField: true,
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
    expect(response).not.toHaveProperty('futureEnvelopeField');
    expectCustomerSafe(response);
  });

  it('reads authenticated detail responses and preserves schemas as opaque JSON', async () => {
    let authorization = '';
    const body = {
      ...catalogResponse.apis[0],
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        'x-future-schema-keyword': { nested: true },
        providers: ['schema-vocabulary-value'],
      },
      outputSchema: { type: 'array' },
      heavy: true,
      excludesCallerDelay: true,
    };
    const client = clientFor(body, undefined, (init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
    }, true);

    const response = await client.describe('reddit.search');

    expect(authorization).toBe('Bearer aa_live_test');
    expect(response).toEqual(body);
    expectCustomerSafe(response);
  });

  it('ignores safe additive fields while trusting gateway-owned routing and pricing facts', async () => {
    const body = {
      futureEnvelopeField: 'ignored',
      apis: [{
        ...catalogResponse.apis[0],
        futureApiField: 'ignored',
        failover: true,
        excludesCallerDelay: true,
        pricing: {
          from: {
            model: 'linear',
            unit: 'result',
            baseUsd: 0.2,
            perUnitUsd: 0.3,
            maxUsd: 0.4,
            futureOfferField: 'ignored',
          },
          failoverMaxUsd: 0.1,
          futurePricingField: 'ignored',
        },
        lanes: [{
          futureLaneField: 'ignored',
          pricing: {
            model: 'flat',
            unit: 'request',
            maxUsd: 0.9,
            futureOfferField: 'ignored',
          },
          health: {
            window: '7d',
            uptimePct: 42,
            latencyP50Ms: 123,
            requests: 1,
            futureHealthField: 'ignored',
          },
        }],
      }],
    };
    const client = clientFor(body);

    const response = await client.catalog();

    expect(response).toEqual({
      apis: [{
        ...catalogResponse.apis[0],
        failover: true,
        excludesCallerDelay: true,
        pricing: {
          from: {
            model: 'linear',
            unit: 'result',
            baseUsd: 0.2,
            perUnitUsd: 0.3,
            maxUsd: 0.4,
          },
          failoverMaxUsd: 0.1,
        },
        lanes: [{
          pricing: { model: 'flat', unit: 'request', maxUsd: 0.9 },
          health: {
            window: '7d',
            uptimePct: 42,
            latencyP50Ms: 123,
            requests: 1,
          },
        }],
      }],
    });
  });

  it('projects known search highlight fields and ignores additive highlight metadata', async () => {
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
        highlightFields: [{
          path: 'items[].price',
          type: 'number',
          why: 'Price returned by the API.',
          futureHighlightField: 'ignored',
        }],
      }],
      total: 1,
      ranking: 'keyword',
    });

    const response = await client.search({ query: 'price' });

    expect(response.results[0]?.highlightFields).toEqual([{
      path: 'items[].price',
      type: 'number',
      why: 'Price returned by the API.',
    }]);
  });

  it.each([
    {
      name: 'credit metadata',
      mutate: (body: Record<string, unknown>) => ({ ...body, internalCredits: 500 }),
    },
    {
      name: 'case-insensitive nested credit metadata',
      mutate: (body: Record<string, unknown>) => ({
        ...body,
        inputSchema: { type: 'object', CreditScore: { type: 'number' } },
      }),
    },
    {
      name: 'non-AnyAPI provider metadata',
      mutate: (body: Record<string, unknown>) => ({ ...body, provider: 'hidden-upstream' }),
    },
    {
      name: 'nested non-AnyAPI provider metadata',
      mutate: (body: Record<string, unknown>) => ({
        ...body,
        inputSchema: { type: 'object', provider: 'hidden-upstream' },
      }),
    },
  ])('rejects forbidden discovery $name instead of rewriting it', async ({ mutate }) => {
    const client = clientFor(mutate({ ...catalogResponse.apis[0] }), undefined, undefined, true);

    await expect(client.describe('reddit.search')).rejects.toThrow(
      'Invalid AnyAPI API discovery response.',
    );
  });

  it('accepts empty lane arrays without treating them as a routing invariant', async () => {
    const accepted = clientFor({
      apis: [{ ...catalogResponse.apis[0], lanes: [] }],
    });
    await expect(accepted.catalog()).resolves.toMatchObject({ apis: [{ lanes: [] }] });
  });

  it.each([-0.01, Number.POSITIVE_INFINITY])('rejects invalid USD pricing: %s', async (maxUsd) => {
    const rejected = clientFor({
      apis: [{
        ...catalogResponse.apis[0],
        pricing: {
          from: { model: 'flat', unit: 'request', maxUsd },
          failoverMaxUsd: 0.01,
        },
      },
      ],
    });

    await expect(rejected.catalog()).rejects.toThrow('Invalid AnyAPI API discovery response.');
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
