import { execFile } from 'node:child_process';
import { AnyApiClient } from './api.js';
import { mergeConfig } from './config.js';
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_DEVICE_AUTHORIZATION_URL,
  OAUTH_METADATA_URL,
  OAUTH_REGISTER_URL,
  OAUTH_TOKEN_URL,
} from './constants.js';
import { CliError } from './errors.js';
import type { AnyApiConfig, TokenResponse } from './types.js';

const CLI_CLIENT_NAME = 'AnyAPI CLI';
// Register one reusable public CLI client that can support both the loopback
// authorization-code flow and the device flow.
const LOOPBACK_REDIRECT_URIS = ['http://127.0.0.1/callback', 'http://localhost/callback'];

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
}

export interface ResolveClientIdOptions {
  includeTrialClient?: boolean;
  commandName?: string;
}

// resolveOAuthEndpoints prefers RFC 8414 metadata and shares connect's existing
// hardcoded fallback behavior with device login.
export async function resolveOAuthEndpoints(client: AnyApiClient): Promise<OAuthEndpoints> {
  try {
    const meta = await client.oauthMetadata(OAUTH_METADATA_URL);
    // Preserve connect's existing all-or-fallback behavior for its required
    // authorization and token endpoints.
    if (meta.authorization_endpoint && meta.token_endpoint) {
      return {
        authorizationEndpoint: meta.authorization_endpoint,
        deviceAuthorizationEndpoint: meta.device_authorization_endpoint || OAUTH_DEVICE_AUTHORIZATION_URL,
        tokenEndpoint: meta.token_endpoint,
        registrationEndpoint: meta.registration_endpoint || OAUTH_REGISTER_URL,
      };
    }
  } catch {
    // Discovery is best-effort; fall through to the hardcoded endpoints.
  }
  return fallbackEndpoints();
}

// resolveClientId preserves connect's trial-client priority when requested.
// Device login deliberately uses the reusable non-trial CLI client so it starts
// an account-backed sign-in instead of taking ownership of a trial upgrade.
export async function resolveClientId(
  config: AnyApiConfig,
  client: AnyApiClient,
  registrationEndpoint: string,
  configPath: string,
  options: ResolveClientIdOptions = {},
): Promise<string> {
  if (options.includeTrialClient !== false) {
    const trialClientId = config.clientId?.trim();
    if (trialClientId) {
      return trialClientId;
    }
  }

  const cliClientId = config.cliClientId?.trim();
  if (cliClientId) {
    return cliClientId;
  }

  let registered;
  try {
    registered = await client.registerClient(registrationEndpoint, {
      clientName: CLI_CLIENT_NAME,
      redirectUris: LOOPBACK_REDIRECT_URIS,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not register an OAuth client for ${options.commandName ?? 'AnyAPI CLI'}: ${detail}`);
  }

  const clientId = registered.client_id?.trim();
  if (!clientId) {
    throw new CliError('OAuth client registration did not return a client_id.');
  }
  await mergeConfig({ cliClientId: clientId }, configPath);
  return clientId;
}

// connectionConfigFromToken maps either OAuth grant's response onto the same
// persisted config fields.
export function connectionConfigFromToken(
  token: TokenResponse,
  now: Date = new Date(),
  oauthClientId?: string,
): AnyApiConfig {
  validateTokenResponse(token);
  const patch: AnyApiConfig = {
    apiKey: token.access_token,
    refreshToken: token.refresh_token,
    ...(oauthClientId ? { oauthClientId } : {}),
    scope: token.scope,
  };
  if (typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)) {
    patch.accessTokenExpiresAt = new Date(now.getTime() + token.expires_in * 1000).toISOString();
  }
  return patch;
}

export function validateTokenResponse(token: TokenResponse): void {
  if (
    !token
    || typeof token.access_token !== 'string'
    || token.access_token.trim().length === 0
    || typeof token.token_type !== 'string'
    || token.token_type.toLowerCase() !== 'bearer'
    || !Number.isFinite(token.expires_in)
    || token.expires_in <= 0
    || typeof token.refresh_token !== 'string'
    || token.refresh_token.trim().length === 0
    || typeof token.scope !== 'string'
  ) {
    throw new CliError('OAuth token endpoint returned an invalid response. Sign in again.');
  }
}

// openBrowser launches the default browser best-effort; the printed URL and
// code remain the reliable cross-device path when launching is unavailable.
export function openBrowser(url: string): void {
  const launch: { command: string; args: string[] } =
    process.platform === 'darwin'
      ? { command: 'open', args: [url] }
      : process.platform === 'win32'
        ? { command: 'cmd', args: ['/c', 'start', '', url] }
        : { command: 'xdg-open', args: [url] };
  try {
    execFile(launch.command, launch.args, () => undefined);
  } catch {
    // Best-effort only.
  }
}

function fallbackEndpoints(): OAuthEndpoints {
  return {
    authorizationEndpoint: OAUTH_AUTHORIZE_URL,
    deviceAuthorizationEndpoint: OAUTH_DEVICE_AUTHORIZATION_URL,
    tokenEndpoint: OAUTH_TOKEN_URL,
    registrationEndpoint: OAUTH_REGISTER_URL,
  };
}
