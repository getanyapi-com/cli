import { describe, expect, it } from 'vitest';
import { AnyApiClient } from '../src/api.js';
import { formatCatalogPrice } from '../src/format.js';
import type { FetchLike } from '../src/types.js';

const legacyList = {
  apis: [{
    slug: 'reddit.search',
    category: 'social',
    name: 'Reddit Search',
    description: 'Search Reddit',
    fromCredits: 400,
    baseCredits: 5,
    perItemCredits: 10,
    perItemUnit: 'result',
    providers: ['hidden-upstream'],
    quotes: [
      { fromCredits: 400, baseCredits: 5, perItemCredits: 10, uptimePct: 99.5, latencyP50Ms: 240, requests: 80 },
      { fromCredits: 500, baseCredits: 10, perItemCredits: 12 },
    ],
  }],
};

const replacementList = {
  apis: [{
    id: 'reddit.search',
    slug: 'reddit.search',
    category: 'social',
    name: 'Reddit Search',
    provider: 'AnyAPI',
    pricing: {
      from: { model: 'linear', unit: 'result', baseUsd: 0.00005, perUnitUsd: 0.0001, maxUsd: 0.004 },
      failoverMaxUsd: 0.005,
    },
    lanes: [{
      pricing: { model: 'linear', unit: 'result', baseUsd: 0.00005, perUnitUsd: 0.0001, maxUsd: 0.004 },
      health: { window: '30d', uptimePct: 99.5, latencyP50Ms: 240, requests: 80 },
    }],
  }],
};

describe('discovery compatibility reader', () => {
  it('normalizes the legacy browse response into nested USD pricing', async () => {
    const client = clientFor(legacyList);
    const response = await client.catalog({ category: 'social' });

    expect(response.apis[0]).toMatchObject({
      slug: 'reddit.search',
      category: 'social',
      name: 'Reddit Search',
      description: 'Search Reddit',
      provider: 'AnyAPI',
      pricing: replacementList.apis[0]!.pricing,
    });
    expect(response.apis[0]!.lanes).toHaveLength(2);
    expect(response.apis[0]!.lanes?.[0]).toEqual(replacementList.apis[0]!.lanes?.[0]);
    expect(formatCatalogPrice(response.apis[0]!)).toBe(
      'from USD 0.00005 + USD 0.0001/result (max USD 0.0040/request)',
    );
    expect(JSON.stringify(response)).not.toMatch(/credit|hidden-upstream/i);
  });

  it('passes the replacement browse response through the same customer-safe model', async () => {
    const client = clientFor(replacementList);
    const response = await client.catalog();

    expect(response).toEqual(replacementList);
  });

  it('uses dedicated search and adapts the legacy per-1k result', async () => {
    let requested = '';
    const client = clientFor({
      results: [{
        slug: 'amazon.product',
        name: 'Amazon Product',
        category: 'shopping',
        priceUsdPer1k: 5,
        score: 0.8,
      }],
      total: 1,
      mode: 'usecase',
    }, (url) => { requested = url; });

    const response = await client.search({ query: 'wireless headphones', category: 'shopping', platform: 'amazon', limit: 10 });

    const url = new URL(requested);
    expect(url.pathname).toBe('/catalog/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'wireless headphones',
      category: 'shopping',
      platform: 'amazon',
      limit: '10',
    });
    expect(response).toEqual({
      results: [{
        slug: 'amazon.product',
        name: 'Amazon Product',
        category: 'shopping',
        provider: 'AnyAPI',
        pricing: {
          from: { model: 'flat', unit: 'request', maxUsd: 0.005 },
          failoverMaxUsd: 0.005,
        },
        relevance: 0.8,
      }],
      total: 1,
      ranking: 'usecase',
    });
  });

  it('reads replacement ranked search results without legacy fields', async () => {
    const client = clientFor({
      results: [{
        slug: 'amazon.product',
        name: 'Amazon Product',
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
    });

    const response = await client.search({ query: 'product prices' });

    expect(response.ranking).toBe('semantic');
    expect(response.results[0]).toMatchObject({
      slug: 'amazon.product',
      provider: 'AnyAPI',
      pricing: { from: { model: 'flat', unit: 'request', maxUsd: 0.005 } },
      relevance: 0.92,
      highlightFields: [{ path: 'items[].price', type: 'number' }],
    });
  });

  it('normalizes a legacy describe response before customer sanitization', async () => {
    let authorization = '';
    const client = clientFor({
      id: 'youtube.comments',
      slug: 'youtube.comments',
      name: 'YouTube Comments',
      description: 'Read comments',
      priceCredits: 2000,
      fromCredits: 1500,
      baseCredits: 0,
      perItemCredits: 0,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'array' },
      provider: 'hidden-upstream',
    }, undefined, (init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
    }, true);

    const response = await client.describe('youtube.comments');

    expect(authorization).toBe('Bearer aa_live_test');
    expect(response).toEqual({
      id: 'youtube.comments',
      slug: 'youtube.comments',
      name: 'YouTube Comments',
      description: 'Read comments',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'array' },
      provider: 'AnyAPI',
      pricing: {
        from: { model: 'flat', unit: 'request', maxUsd: 0.015 },
        failoverMaxUsd: 0.02,
      },
    });
    expect(JSON.stringify(response)).not.toMatch(/credit|hidden-upstream/i);
  });

  it('reads a replacement describe response with schemas and discriminated pricing', async () => {
    const body = {
      id: 'youtube.comments',
      slug: 'youtube.comments',
      name: 'YouTube Comments',
      provider: 'AnyAPI',
      pricing: {
        from: { model: 'flat', unit: 'request', maxUsd: 0.015 },
        failoverMaxUsd: 0.02,
      },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'array' },
      heavy: true,
    };
    const client = clientFor(body, undefined, undefined, true);

    expect(await client.describe('youtube.comments')).toEqual(body);
  });
});

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
