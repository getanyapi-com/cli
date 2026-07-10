import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { DASHBOARD_URL } from './constants.js';
import { ApiError, CliError } from './errors.js';
import { formatUsd } from './format.js';
import type { AnyApiConfig, RunResult } from './types.js';

export interface ParseInputOptions {
  input?: string;
  inputFile?: string;
}

export async function parseRunInput(options: ParseInputOptions): Promise<unknown> {
  if (options.input && options.inputFile) {
    throw new CliError('Use either --input or --input-file, not both.');
  }
  if (options.inputFile) {
    return parseJson(await readFile(options.inputFile, 'utf8'), options.inputFile);
  }
  if (options.input) {
    return parseJson(options.input, '--input');
  }
  return {};
}

export function buildRunOutputPath(sku: string, date = new Date(), cwd = process.cwd()): string {
  const safeSku = sku.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return join(cwd, '.anyapi', `${safeSku}-${timestamp}.json`);
}

export async function writeRunOutput(result: RunResult, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

export function summarizeRun(result: RunResult, outputPath: string, cwd = process.cwd()): string {
  const pathText = relative(cwd, outputPath) || outputPath;
  const cost = formatUsd(result.costUsd);
  const items = typeof result.items === 'number' ? String(result.items) : 'unknown';
  return [`Wrote ${pathText}`, `costUsd: ${cost}`, `items: ${items}`].join('\n');
}

// stripServerHint removes the server's `hint` field from a run envelope. The hint
// recommends server-side reshaping, which is the wrong advice for CLI users (local
// shaping over the saved file is free), so it is dropped from both the saved file
// and stdout.
export function stripServerHint(result: RunResult): RunResult {
  if (!('hint' in result)) {
    return result;
  }
  const { hint, ...rest } = result as RunResult & { hint?: unknown };
  return rest;
}

// hintThresholdBytes is the saved-envelope size above which an unshaped run earns a
// one-line nudge toward free local re-slicing with `anyapi view`.
const hintThresholdBytes = 8 * 1024;

// localRereadHint returns a nudge to re-slice the saved file for free with
// `anyapi view`, but only for a large result saved without shape flags.
export function localRereadHint(result: RunResult, sku: string): string | undefined {
  if (Buffer.byteLength(JSON.stringify(result)) < hintThresholdBytes) {
    return undefined;
  }
  return `hint: slice this file at no cost: anyapi view --last ${sku} --jq '.data'`;
}

export function isKeyCapExceeded(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 402) {
    return false;
  }
  if (!isRecord(error.body)) {
    return false;
  }
  const keys = [error.body.error, error.body.key, error.body.code, error.body.message];
  return keys.some((value) => value === 'key_cap_exceeded');
}

export function formatCapExceededMessage(config: AnyApiConfig = {}): string {
  const lines = [
    'This starter key has reached its USD cap.',
    `Claim or fund it here: ${config.claimUrl ?? DASHBOARD_URL}`,
  ];
  if (config.claimToken) {
    lines.push(`Claim token: ${config.claimToken}`);
  }
  lines.push('After claiming, keep using the same key or run anyapi login --api-key aa_live_...');
  return lines.join('\n');
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Invalid JSON in ${source}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
