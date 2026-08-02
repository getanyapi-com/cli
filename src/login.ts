import { AnyApiClient } from './api.js';
import { getConfigPath, mergeConfig, readConfig } from './config.js';
import { OAUTH_SCOPE } from './constants.js';
import { ApiError, CliError } from './errors.js';
import { writeLine, type CommandContext } from './io.js';
import {
  connectionConfigFromToken,
  openBrowser,
  resolveClientId,
  resolveOAuthEndpoints,
} from './oauth.js';
import type { DeviceAuthorizationResponse, TokenResponse } from './types.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_SECONDS = 5;
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export interface DeviceLoginDependencies {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  openUrl?: (url: string) => void;
}

export async function deviceLoginCommand(
  ctx: CommandContext,
  dependencies: DeviceLoginDependencies = {},
): Promise<void> {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const openUrl = dependencies.openUrl ?? openBrowser;
  const configPath = getConfigPath(ctx.homeDir);
  const config = await readConfig(configPath);
  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const endpoints = await resolveOAuthEndpoints(client);
  const clientId = await resolveClientId(config, client, endpoints.registrationEndpoint, configPath, {
    includeTrialClient: false,
    commandName: 'anyapi login',
  });

  const authorization = await client.authorizeDevice(endpoints.deviceAuthorizationEndpoint, {
    client_id: clientId,
    scope: OAUTH_SCOPE,
  });
  validateAuthorization(authorization);
  printDeviceInstructions(ctx, authorization);
  if (authorization.verification_uri_complete) {
    try {
      openUrl(authorization.verification_uri_complete);
    } catch {
      // Best-effort only; the verification URL and user code are already printed.
    }
  }

  const token = await pollForToken(client, endpoints.tokenEndpoint, clientId, authorization, { now, sleep });
  await mergeConfig(connectionConfigFromToken(token, new Date(now()), clientId), configPath);
  printLoggedIn(ctx, token);
}

interface PollClock {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

export async function pollForToken(
  client: AnyApiClient,
  tokenEndpoint: string,
  clientId: string,
  authorization: DeviceAuthorizationResponse,
  clock: PollClock,
): Promise<TokenResponse> {
  const deadline = clock.now() + authorization.expires_in * 1000;
  let intervalMs = (authorization.interval ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1000;

  while (true) {
    const remainingMs = deadline - clock.now();
    if (remainingMs <= 0) {
      throw timeoutError();
    }
    await clock.sleep(Math.min(intervalMs, remainingMs));
    if (clock.now() >= deadline) {
      throw timeoutError();
    }

    const controller = new AbortController();
    const requestTimeout = setTimeout(
      () => controller.abort(),
      Math.max(1, deadline - clock.now()),
    );
    try {
      return await client.exchangeToken(tokenEndpoint, {
        grant_type: DEVICE_CODE_GRANT,
        device_code: authorization.device_code,
        client_id: clientId,
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw timeoutError();
      }
      const code = oauthErrorCode(error);
      if (code === 'authorization_pending') {
        continue;
      }
      if (code === 'slow_down') {
        intervalMs += SLOW_DOWN_SECONDS * 1000;
        continue;
      }
      if (code === 'access_denied') {
        throw new CliError('AnyAPI sign-in was denied. Re-run anyapi login to try again.');
      }
      if (code === 'expired_token') {
        throw new CliError('The AnyAPI sign-in code expired. Re-run anyapi login to get a new code.');
      }
      throw error;
    } finally {
      clearTimeout(requestTimeout);
    }
  }
}

function validateAuthorization(value: DeviceAuthorizationResponse): void {
  if (
    !value.device_code
    || !value.user_code
    || !value.verification_uri
    || !Number.isFinite(value.expires_in)
    || value.expires_in <= 0
    || (value.interval !== undefined && (!Number.isFinite(value.interval) || value.interval <= 0))
  ) {
    throw new CliError('Device authorization returned an invalid response. Re-run anyapi login.');
  }
}

function oauthErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || !isRecord(error.body)) {
    return undefined;
  }
  return typeof error.body.error === 'string' ? error.body.error : undefined;
}

function timeoutError(): CliError {
  return new CliError('Timed out waiting for AnyAPI sign-in. Re-run anyapi login to get a new code.');
}

function printDeviceInstructions(ctx: CommandContext, authorization: DeviceAuthorizationResponse): void {
  writeLine(ctx.stdout, 'Sign in to AnyAPI on any device:');
  writeLine(ctx.stdout, authorization.verification_uri);
  writeLine(ctx.stdout, `Code: ${authorization.user_code}`);
  writeLine(ctx.stdout, 'Opening the sign-in page in your browser when possible. Waiting for approval...');
}

function printLoggedIn(ctx: CommandContext, token: TokenResponse): void {
  writeLine(ctx.stdout, 'Logged in. Account-backed AnyAPI OAuth is ready.');
  writeLine(ctx.stdout, `Scope: ${token.scope}`);
  writeLine(ctx.stdout, 'Access token saved to ~/.anyapi/config.json.');
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
