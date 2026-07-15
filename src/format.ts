import type { CatalogApi, PricingOffer } from './types.js';

export function formatUsd(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'USD unknown';
  }
  return `USD ${formatUsdNumber(value)}`;
}

export function formatCatalogPrice(api: CatalogApi): string {
  return formatPricingOffer(api.pricing.from);
}

export function formatPricingOffer(offer: PricingOffer): string {
  if (offer.model === 'flat') {
    return `from ${formatUsd(offer.maxUsd)}/request`;
  }
  return `from ${formatUsd(offer.baseUsd)} + ${formatUsd(offer.perUnitUsd)}/${offer.unit} (max ${formatUsd(offer.maxUsd)}/request)`;
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
