import type { CatalogApi, PricingOffer } from './types.js';

export function formatUsd(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'USD unknown';
  }
  return `USD ${formatUsdNumber(value)}`;
}

/** Catalog prices are quoted at this shared rate; a run is still billed per request. */
const REQUEST_RATE_LABEL = '/1k req';

/**
 * A per-1,000-request rate in USD.
 *
 * Two decimals is exact here, not a rounding: one internal credit is $0.00001
 * and lane prices are whole credits, so a rate for a thousand requests is always
 * a whole number of cents. `formatUsd` pads sub-dollar amounts to four decimals
 * because a per-request charge really is that small, which would print the
 * cheapest 39 of the catalog's rates as `USD 0.9000/1k req`.
 */
function formatRateUsd(value: number): string {
  return `USD ${value.toFixed(2)}`;
}

export function formatCatalogPrice(api: CatalogApi): string {
  return formatPricingOffer(api.pricing.from);
}

// Catalog prices are quoted per 1,000 requests because most of the catalog costs
// a fraction of a cent per call. The rate is the gateway's published
// maxPer1kUsd, never maxUsd scaled here. A metered offer keeps its per-item rate
// per item, which is what the customer's `limit` actually moves.
export function formatPricingOffer(offer: PricingOffer): string {
  const rate = `${formatRateUsd(offer.maxPer1kUsd)}${REQUEST_RATE_LABEL}`;
  if (offer.model === 'flat') {
    return `from ${rate}`;
  }
  return `up to ${rate} (${formatUsd(offer.baseUsd)} + ${formatUsd(offer.perUnitUsd)}/${offer.unit})`;
}

export function printTable(rows: string[][]): string {
  if (rows.length === 0) {
    return '';
  }
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));
  return rows
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ').trimEnd())
    .join('\n');
}

function formatUsdNumber(value: number): string {
  if (value === 0) {
    return '0.00';
  }
  if (Math.abs(value) < 1) {
    const [whole, fraction = ''] = value.toFixed(6).split('.');
    return `${whole}.${fraction.replace(/0+$/, '').padEnd(4, '0')}`;
  }
  return value.toFixed(2);
}
