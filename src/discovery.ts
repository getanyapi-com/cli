import type {
  CatalogApi,
  CatalogResponse,
  DiscoveryLane,
  DiscoveryPricing,
  PricingOffer,
  SearchResponse,
} from './types.js';

export function readCatalogResponse(value: unknown): CatalogResponse {
  assertSafeDiscovery(value, 'catalog');
  const record = requireRecord(value, 'catalog');
  if (!Array.isArray(record.apis)) {
    throw contractError('catalog');
  }
  return { apis: record.apis.map(mapDiscoveryApi) };
}

export function readSearchResponse(value: unknown): SearchResponse {
  assertSafeDiscovery(value, 'search');
  const record = requireRecord(value, 'search');
  if (!Array.isArray(record.results)) {
    throw contractError('search');
  }
  const total = finiteNumber(record.total);
  const ranking = readRanking(record.ranking);
  if (total === undefined || total < 0 || !Number.isInteger(total) || !ranking) {
    throw contractError('search');
  }
  const results = record.results.map(mapDiscoveryApi);
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
  assertSafeDiscovery(value, 'API');
  return mapDiscoveryApi(value);
}

function mapDiscoveryApi(value: unknown): CatalogApi {
  const record = requireRecord(value, 'API');
  const slug = stringValue(record.slug);
  const category = stringValue(record.category);
  const name = stringValue(record.name);
  const description = stringValue(record.description);
  const pricing = readPricing(record.pricing);
  if (
    !slug
    || !category
    || !name
    || description === undefined
    || record.provider !== 'AnyAPI'
    || !pricing
  ) {
    throw contractError('API');
  }

  const id = stringValue(record.id);
  const platformId = stringValue(record.platformId);
  const lanes = record.lanes === undefined ? undefined : readLanes(record.lanes);
  const relevance = finiteNumber(record.relevance);
  const highlightFields = record.highlightFields === undefined
    ? undefined
    : readHighlightFields(record.highlightFields);
  const failover = optionalBoolean(record, 'failover', 'API');
  const excludesCallerDelay = optionalBoolean(record, 'excludesCallerDelay', 'API');

  return {
    ...(id ? { id } : {}),
    ...(platformId ? { platformId } : {}),
    slug,
    category,
    name,
    description,
    provider: record.provider,
    pricing,
    ...(lanes !== undefined ? { lanes } : {}),
    ...(hasOwn(record, 'inputSchema') ? { inputSchema: record.inputSchema } : {}),
    ...(hasOwn(record, 'outputSchema') ? { outputSchema: record.outputSchema } : {}),
    ...(typeof record.heavy === 'boolean' ? { heavy: record.heavy } : {}),
    ...(typeof record.tryEligible === 'boolean' ? { tryEligible: record.tryEligible } : {}),
    ...(failover !== undefined ? { failover } : {}),
    ...(excludesCallerDelay !== undefined ? { excludesCallerDelay } : {}),
    ...(relevance !== undefined ? { relevance } : {}),
    ...(highlightFields !== undefined ? { highlightFields } : {}),
  };
}

function readPricing(value: unknown): DiscoveryPricing | undefined {
  const record = asRecord(value);
  const from = readOffer(record?.from);
  const failoverMaxUsd = usdNumber(record?.failoverMaxUsd);
  if (!from || failoverMaxUsd === undefined) {
    return undefined;
  }
  return { from, failoverMaxUsd };
}

function readOffer(value: unknown): PricingOffer | undefined {
  const record = asRecord(value);
  const model = stringValue(record?.model);
  const unit = stringValue(record?.unit);
  const maxUsd = usdNumber(record?.maxUsd);
  if (model === 'flat' && unit === 'request' && maxUsd !== undefined) {
    return { model, unit, maxUsd };
  }
  const baseUsd = usdNumber(record?.baseUsd);
  const perUnitUsd = usdNumber(record?.perUnitUsd);
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

function readHighlightFields(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw contractError('search highlight fields');
  }
  return value.map((candidate) => {
    const record = requireRecord(candidate, 'search highlight field');
    const path = stringValue(record.path);
    const type = stringValue(record.type);
    const why = stringValue(record.why);
    return {
      ...(path !== undefined ? { path } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(why !== undefined ? { why } : {}),
    };
  });
}

function assertSafeDiscovery(value: unknown, subject: string): void {
  if (Array.isArray(value)) {
    value.forEach((child) => assertSafeDiscovery(child, subject));
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }
  for (const [key, child] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (lower.includes('credit')) {
      throw contractError(subject);
    }
    if (lower === 'provider' && child !== 'AnyAPI') {
      throw contractError(subject);
    }
    assertSafeDiscovery(child, subject);
  }
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

function usdNumber(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): boolean | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  if (typeof record[key] !== 'boolean') {
    throw contractError(subject);
  }
  return record[key];
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
