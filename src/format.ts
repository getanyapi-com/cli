import { CREDIT_TO_USD } from './constants.js';
import type { CatalogApi } from './types.js';

export function creditsToUsd(value: number): number {
  return value * CREDIT_TO_USD;
}

export function formatUsd(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'USD unknown';
  }
  return `USD ${formatUsdNumber(value)}`;
}

export function formatCatalogPrice(api: CatalogApi): string {
  const fromUsd = priceValue(api.priceUsd, api.fromCredits);
  const baseUsd = priceValue(api.baseUsd, api.baseCredits);
  const itemUsd = priceValue(api.perItemUsd, api.perItemCredits);
  const parts: string[] = [];

  if (fromUsd !== undefined) {
    parts.push(`from ${formatUsd(fromUsd)}/request`);
  }
  if (baseUsd !== undefined && baseUsd > 0) {
    parts.push(`base ${formatUsd(baseUsd)}`);
  }
  if (itemUsd !== undefined && itemUsd > 0) {
    const unit = api.perItemUnit ? `/${api.perItemUnit}` : '/item';
    parts.push(`${formatUsd(itemUsd)}${unit}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'USD unknown';
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

function priceValue(usdValue: unknown, creditValue: unknown): number | undefined {
  if (typeof usdValue === 'number' && Number.isFinite(usdValue)) {
    return usdValue;
  }
  if (typeof creditValue === 'number' && Number.isFinite(creditValue)) {
    return creditsToUsd(creditValue);
  }
  return undefined;
}

function formatUsdNumber(value: number): string {
  if (value === 0) {
    return '0.00';
  }
  if (Math.abs(value) < 1) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}
