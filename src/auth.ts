import { AnyApiClient } from './api.js';
import { API_KEY_ENV } from './constants.js';
import { mergeConfig, readConfig } from './config.js';
import { connectionConfigFromToken, resolveOAuthEndpoints } from './oauth.js';
import type { AnyApiConfig, FetchLike } from './types.js';

const REFRESH_WINDOW_MS = 60_000;

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
  fetchImpl?: FetchLike;
  now?: () => number;
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

  let config = await readConfig(options.configPath);
  let configKey = cleanKey(config.apiKey);
  if (configKey) {
    const refreshToken = cleanKey(config.refreshToken);
    const oauthClientId = cleanKey(config.oauthClientId)
      ?? (configKey.startsWith('aa_at_')
        ? cleanKey(config.clientId) ?? cleanKey(config.cliClientId)
        : undefined);
    const expiresAt = parseExpiry(config.accessTokenExpiresAt);
    const now = options.now?.() ?? Date.now();
    if (
      refreshToken
      && oauthClientId
      && expiresAt !== undefined
      && expiresAt <= now + REFRESH_WINDOW_MS
    ) {
      const client = new AnyApiClient({ fetchImpl: options.fetchImpl });
      const endpoints = await resolveOAuthEndpoints(client);
      const token = await client.exchangeToken(endpoints.tokenEndpoint, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oauthClientId,
      });
      config = await mergeConfig(
        connectionConfigFromToken(token, new Date(now), oauthClientId),
        options.configPath,
      );
      configKey = cleanKey(config.apiKey);
    }
    return { apiKey: configKey, source: 'config', config };
  }

  return { source: 'missing', config };
}

function parseExpiry(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
