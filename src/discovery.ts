import type {
  CatalogApi,
  CatalogResponse,
  DiscoveryLane,
  DiscoveryPricing,
  LinearPricingOffer,
  PricingOffer,
  SearchResponse,
} from './types.js';

// Temporary compatibility boundary for the pre-USD discovery contract. Delete
// this constant and every legacy* helper after the gateway cutover is complete.
const LEGACY_CREDITS_PER_USD = 100_000;

export function readCatalogResponse(value: unknown): CatalogResponse {
  const record = asRecord(value);
  const apis = Array.isArray(record?.apis) ? record.apis : [];
  return { apis: apis.map(readDiscoveryApi).filter(isCatalogApi) };
}

export function readSearchResponse(value: unknown): SearchResponse {
  const record = asRecord(value);
  const results = Array.isArray(record?.results) ? record.results : [];
  return {
    results: results.map(readDiscoveryApi).filter(isCatalogApi),
    total: finiteNumber(record?.total) ?? results.length,
    ranking: stringValue(record?.ranking) ?? stringValue(record?.mode) ?? 'keyword',
  };
}

export function readDiscoveryApi(value: unknown): CatalogApi | undefined {
  const record = asRecord(value);
  const slug = stringValue(record?.slug);
  const name = stringValue(record?.name);
  if (!record || !slug || !name) {
    return undefined;
  }

  const output = sanitizeDiscoveryJson(record) as Record<string, unknown>;
  const pricing = readPricing(record.pricing) ?? legacyPricing(record);
  const lanes = readLanes(record.lanes) ?? legacyLanes(record);
  const relevance = finiteNumber(record.relevance) ?? finiteNumber(record.score);

  delete output.pricing;
  delete output.lanes;
  delete output.providers;
  delete output.score;
  delete output.mode;
  delete output.priceUsdPer1k;
  delete output.priceUsd;
  delete output.baseUsd;
  delete output.perItemUsd;
  delete output.perUnitUsd;
  delete output.perItemUnit;
  delete output.quotes;

  return {
    ...output,
    slug,
    name,
    provider: 'AnyAPI',
    ...(pricing ? { pricing } : {}),
    ...(lanes && lanes.length > 0 ? { lanes } : {}),
    ...(relevance !== undefined ? { relevance } : {}),
  } as CatalogApi;
}

function readPricing(value: unknown): DiscoveryPricing | undefined {
  const record = asRecord(value);
  const from = readOffer(record?.from);
  if (!from) {
    return undefined;
  }
  return {
    from,
    failoverMaxUsd: finiteNumber(record?.failoverMaxUsd) ?? from.maxUsd,
  };
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

function readLanes(value: unknown): DiscoveryLane[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((candidate) => {
    const record = asRecord(candidate);
    const pricing = readOffer(record?.pricing);
    if (!record || !pricing) {
      return [];
    }
    const health = readHealth(record.health);
    return [{ pricing, ...(health ? { health } : {}) }];
  });
}

function readHealth(value: unknown): DiscoveryLane['health'] | undefined {
  const record = asRecord(value);
  const uptimePct = finiteNumber(record?.uptimePct);
  const latencyP50Ms = finiteNumber(record?.latencyP50Ms);
  const requests = finiteNumber(record?.requests);
  if (uptimePct === undefined || latencyP50Ms === undefined || requests === undefined) {
    return undefined;
  }
  return {
    window: stringValue(record?.window) ?? '30d',
    uptimePct,
    latencyP50Ms,
    requests,
  };
}

function legacyPricing(record: Record<string, unknown>): DiscoveryPricing | undefined {
  const from = legacyOffer(record);
  if (!from) {
    return undefined;
  }

  const laneMax = legacyLanes(record)?.reduce((max, lane) => Math.max(max, lane.pricing.maxUsd), from.maxUsd);
  const failoverMaxUsd = legacyUsd(record.priceUsd, record.priceCredits) ?? laneMax ?? from.maxUsd;
  return { from, failoverMaxUsd };
}

function legacyOffer(record: Record<string, unknown>, fallbackUnit?: string): PricingOffer | undefined {
  const perThousand = finiteNumber(record.priceUsdPer1k);
  if (perThousand !== undefined) {
    return { model: 'flat', unit: 'request', maxUsd: perThousand / 1000 };
  }

  const maxUsd = legacyUsd(record.priceUsd, record.fromCredits ?? record.priceCredits);
  const baseUsd = legacyUsd(record.baseUsd, record.baseCredits);
  const perUnitUsd = legacyUsd(record.perItemUsd ?? record.perUnitUsd, record.perItemCredits);
  if ((baseUsd ?? 0) > 0 || (perUnitUsd ?? 0) > 0) {
    const offer: LinearPricingOffer = {
      model: 'linear',
      unit: stringValue(record.perItemUnit) ?? fallbackUnit ?? 'result',
      baseUsd: baseUsd ?? 0,
      perUnitUsd: perUnitUsd ?? 0,
      maxUsd: maxUsd ?? baseUsd ?? 0,
    };
    return offer;
  }
  return maxUsd === undefined ? undefined : { model: 'flat', unit: 'request', maxUsd };
}

function legacyLanes(record: Record<string, unknown>): DiscoveryLane[] | undefined {
  if (!Array.isArray(record.quotes)) {
    return undefined;
  }
  const fallbackUnit = stringValue(record.perItemUnit) ?? 'result';
  return record.quotes.flatMap((candidate) => {
    const quote = asRecord(candidate);
    const pricing = quote ? legacyOffer(quote, fallbackUnit) : undefined;
    if (!quote || !pricing) {
      return [];
    }
    const health = legacyHealth(quote);
    return [{ pricing, ...(health ? { health } : {}) }];
  });
}

function legacyHealth(record: Record<string, unknown>): DiscoveryLane['health'] | undefined {
  const uptimePct = finiteNumber(record.uptimePct);
  const latencyP50Ms = finiteNumber(record.latencyP50Ms);
  const requests = finiteNumber(record.requests);
  if (uptimePct === undefined && latencyP50Ms === undefined && requests === undefined) {
    return undefined;
  }
  return {
    window: '30d',
    uptimePct: uptimePct ?? 0,
    latencyP50Ms: latencyP50Ms ?? 0,
    requests: requests ?? 0,
  };
}

function legacyUsd(usd: unknown, credits: unknown): number | undefined {
  const direct = finiteNumber(usd);
  if (direct !== undefined) {
    return direct;
  }
  const legacyCredits = finiteNumber(credits);
  return legacyCredits === undefined ? undefined : legacyCredits / LEGACY_CREDITS_PER_USD;
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

function isCatalogApi(value: CatalogApi | undefined): value is CatalogApi {
  return value !== undefined;
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
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
