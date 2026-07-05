import { API_KEY_ENV } from './constants.js';
import { readConfig } from './config.js';
import type { AnyApiConfig } from './types.js';

export type AuthSource = 'flag' | 'env' | 'config' | 'missing';

export interface AuthResolution {
  apiKey?: string;
  source: AuthSource;
  config: AnyApiConfig;
}

export interface ResolveAuthOptions {
  apiKey?: string;
  env?: NodeJS.ProcessEnv;
  configPath?: string;
}

export async function resolveApiKey(options: ResolveAuthOptions = {}): Promise<AuthResolution> {
  const flagKey = cleanKey(options.apiKey);
  if (flagKey) {
    return { apiKey: flagKey, source: 'flag', config: {} };
  }

  const envKey = cleanKey((options.env ?? process.env)[API_KEY_ENV]);
  if (envKey) {
    return { apiKey: envKey, source: 'env', config: {} };
  }

  const config = await readConfig(options.configPath);
  const configKey = cleanKey(config.apiKey);
  if (configKey) {
    return { apiKey: configKey, source: 'config', config };
  }

  return { source: 'missing', config };
}

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
