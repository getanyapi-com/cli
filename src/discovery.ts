import type {
  CatalogApi,
  CatalogResponse,
  DiscoveryLane,
  DiscoveryPricing,
  PricingOffer,
  SearchResponse,
} from './types.js';

export function readCatalogResponse(value: unknown): CatalogResponse {
  const record = requireRecord(value, 'catalog');
  if (!Array.isArray(record.apis)) {
    throw contractError('catalog');
  }
  return { apis: record.apis.map(readDiscoveryApi) };
}

export function readSearchResponse(value: unknown): SearchResponse {
  const record = requireRecord(value, 'search');
  if (!Array.isArray(record.results)) {
    throw contractError('search');
  }
  const total = finiteNumber(record.total);
  const ranking = readRanking(record.ranking);
  if (total === undefined || total < 0 || !Number.isInteger(total) || !ranking) {
    throw contractError('search');
  }
  const results = record.results.map(readDiscoveryApi);
  if (results.some((result) => result.relevance === undefined)) {
    throw contractError('search');
  }
  return {
    results,
    total,
    ranking,
  };
}

export function readDiscoveryApi(value: unknown): CatalogApi {
  const record = requireRecord(value, 'API');
  const slug = stringValue(record.slug);
  const category = stringValue(record.category);
  const name = stringValue(record.name);
  const description = stringValue(record.description);
  const pricing = readPricing(record.pricing);
  if (!slug || !category || !name || description === undefined || !pricing) {
    throw contractError('API');
  }

  const id = stringValue(record.id);
  const platformId = stringValue(record.platformId);
  const lanes = record.lanes === undefined ? undefined : readLanes(record.lanes);
  const relevance = finiteNumber(record.relevance);
  const highlightFields = Array.isArray(record.highlightFields)
    ? sanitizeDiscoveryJson(record.highlightFields)
    : undefined;

  return {
    ...(id ? { id } : {}),
    ...(platformId ? { platformId } : {}),
    slug,
    category,
    name,
    description,
    provider: 'AnyAPI',
    pricing,
    ...(lanes ? { lanes } : {}),
    ...(hasOwn(record, 'inputSchema') ? { inputSchema: sanitizeDiscoveryJson(record.inputSchema) } : {}),
    ...(hasOwn(record, 'outputSchema') ? { outputSchema: sanitizeDiscoveryJson(record.outputSchema) } : {}),
    ...(typeof record.heavy === 'boolean' ? { heavy: record.heavy } : {}),
    ...(typeof record.tryEligible === 'boolean' ? { tryEligible: record.tryEligible } : {}),
    ...(relevance !== undefined ? { relevance } : {}),
    ...(highlightFields ? { highlightFields: highlightFields as unknown[] } : {}),
  };
}

function readPricing(value: unknown): DiscoveryPricing | undefined {
  const record = asRecord(value);
  const from = readOffer(record?.from);
  const failoverMaxUsd = finiteNumber(record?.failoverMaxUsd);
  if (!from || failoverMaxUsd === undefined) {
    return undefined;
  }
  return { from, failoverMaxUsd };
}

function readOffer(value: unknown): PricingOffer | undefined {
  const record = asRecord(value);
  const model = stringValue(record?.model);
  const unit = stringValue(record?.unit);
  const maxUsd = finiteNumber(record?.maxUsd);
  if (model === 'flat' && unit === 'request' && maxUsd !== undefined) {
    return { model, unit, maxUsd };
  }
  const baseUsd = finiteNumber(record?.baseUsd);
  const perUnitUsd = finiteNumber(record?.perUnitUsd);
  if (model === 'linear' && unit && baseUsd !== undefined && perUnitUsd !== undefined && maxUsd !== undefined) {
    return { model, unit, baseUsd, perUnitUsd, maxUsd };
  }
  return undefined;
}

function readLanes(value: unknown): DiscoveryLane[] {
  if (!Array.isArray(value)) {
    throw contractError('API lanes');
  }
  return value.map((candidate) => {
    const record = requireRecord(candidate, 'API lane');
    const pricing = readOffer(record.pricing);
    if (!pricing) {
      throw contractError('API lane');
    }
    const health = record.health === undefined ? undefined : readHealth(record.health);
    return { pricing, ...(health ? { health } : {}) };
  });
}

function readHealth(value: unknown): DiscoveryLane['health'] {
  const record = requireRecord(value, 'API lane health');
  const window = stringValue(record.window);
  const uptimePct = finiteNumber(record.uptimePct);
  const latencyP50Ms = finiteNumber(record.latencyP50Ms);
  const requests = finiteNumber(record.requests);
  if (!window || uptimePct === undefined || latencyP50Ms === undefined || requests === undefined) {
    throw contractError('API lane health');
  }
  return { window, uptimePct, latencyP50Ms, requests };
}

function sanitizeDiscoveryJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeDiscoveryJson);
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (lower.includes('credit') || lower === 'providers') {
      continue;
    }
    if (lower === 'provider') {
      output[key] = 'AnyAPI';
      continue;
    }
    output[key] = sanitizeDiscoveryJson(child);
  }
  return output;
}

function readRanking(value: unknown): SearchResponse['ranking'] | undefined {
  return value === 'semantic' || value === 'keyword' ? value : undefined;
}

function requireRecord(value: unknown, subject: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw contractError(subject);
  }
  return record;
}

function contractError(subject: string): Error {
  return new Error(`Invalid AnyAPI ${subject} discovery response.`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
