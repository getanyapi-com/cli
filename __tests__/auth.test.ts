import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveApiKey } from '../src/auth.js';
import { getConfigPath, readConfig, writeConfig } from '../src/config.js';
import type { FetchLike } from '../src/types.js';

const METADATA_URL = 'https://api.getanyapi.com/.well-known/oauth-authorization-server';
const TOKEN_URL = 'https://auth.example.test/token';

const tempDirs: string[] = [];

describe('auth resolution', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('uses flag API key before env and config', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({
      apiKey: 'aa_live_flag',
      env: { ANYAPI_API_KEY: 'aa_live_env' } as NodeJS.ProcessEnv,
      configPath,
    });
    expect(auth).toMatchObject({ apiKey: 'aa_live_flag', source: 'flag' });
  });

  it('uses env API key before config', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({
      env: { ANYAPI_API_KEY: 'aa_live_env' } as NodeJS.ProcessEnv,
      configPath,
    });
    expect(auth).toMatchObject({ apiKey: 'aa_live_env', source: 'env' });
  });

  it('uses config API key when no higher priority key exists', async () => {
    const configPath = await configWithKey('aa_live_config');
    const auth = await resolveApiKey({ env: {} as NodeJS.ProcessEnv, configPath });
    expect(auth).toMatchObject({ apiKey: 'aa_live_config', source: 'config' });
  });

  it('reports missing when no key exists', async () => {
    const dir = await tempDir();
    const auth = await resolveApiKey({ env: {} as NodeJS.ProcessEnv, configPath: getConfigPath(dir) });
    expect(auth).toMatchObject({ source: 'missing' });
  });

  it('rotates an expiring OAuth access token before returning config auth', async () => {
    const dir = await tempDir();
    const configPath = getConfigPath(dir);
    await writeConfig({
      apiKey: 'aa_at_old',
      refreshToken: 'aa_rt_old',
      oauthClientId: 'aa_client_login',
      accessTokenExpiresAt: '2026-08-02T12:00:30.000Z',
      scope: 'run balance:read',
    }, configPath);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === METADATA_URL) {
        return Response.json({
          authorization_endpoint: 'https://auth.example.test/authorize',
          token_endpoint: TOKEN_URL,
        });
      }
      if (url === TOKEN_URL) {
        return Response.json({
          access_token: 'aa_at_new',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'aa_rt_new',
          scope: 'run balance:read',
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const auth = await resolveApiKey({
      env: {} as NodeJS.ProcessEnv,
      configPath,
      fetchImpl,
      now: () => Date.parse('2026-08-02T12:00:00.000Z'),
    });

    expect(auth.apiKey).toBe('aa_at_new');
    expect(requests.map((request) => request.url)).toEqual([METADATA_URL, TOKEN_URL]);
    expect(Object.fromEntries(new URLSearchParams(String(requests[1].init?.body)))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'aa_rt_old',
      client_id: 'aa_client_login',
    });
    expect(await readConfig(configPath)).toMatchObject({
      apiKey: 'aa_at_new',
      refreshToken: 'aa_rt_new',
      oauthClientId: 'aa_client_login',
      accessTokenExpiresAt: '2026-08-02T13:00:00.000Z',
    });
  });

  it('does not refresh a config OAuth token outside the refresh window', async () => {
    const dir = await tempDir();
    const configPath = getConfigPath(dir);
    await writeConfig({
      apiKey: 'aa_at_current',
      refreshToken: 'aa_rt_current',
      oauthClientId: 'aa_client_login',
      accessTokenExpiresAt: '2026-08-02T12:05:00.000Z',
    }, configPath);

    const auth = await resolveApiKey({
      env: {} as NodeJS.ProcessEnv,
      configPath,
      fetchImpl: async () => { throw new Error('refresh should not run'); },
      now: () => Date.parse('2026-08-02T12:00:00.000Z'),
    });

    expect(auth.apiKey).toBe('aa_at_current');
  });

  it.each([
    [{ clientId: 'aa_client_trial', cliClientId: 'aa_client_cli' }, 'aa_client_trial'],
    [{ cliClientId: 'aa_client_cli' }, 'aa_client_cli'],
  ])('migrates legacy OAuth client provenance before refreshing', async (legacyClients, expectedClientId) => {
    const dir = await tempDir();
    const configPath = getConfigPath(dir);
    await writeConfig({
      apiKey: 'aa_at_old',
      refreshToken: 'aa_rt_old',
      accessTokenExpiresAt: '2026-08-02T12:00:00.000Z',
      ...legacyClients,
    }, configPath);
    let refreshClientId: string | undefined;
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      if (url === METADATA_URL) {
        return Response.json({
          authorization_endpoint: 'https://auth.example.test/authorize',
          token_endpoint: TOKEN_URL,
        });
      }
      if (url === TOKEN_URL) {
        refreshClientId = new URLSearchParams(String(init?.body)).get('client_id') ?? undefined;
        return Response.json({
          access_token: 'aa_at_new',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'aa_rt_new',
          scope: 'run balance:read',
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await resolveApiKey({
      env: {} as NodeJS.ProcessEnv,
      configPath,
      fetchImpl,
      now: () => Date.parse('2026-08-02T12:00:00.000Z'),
    });

    expect(refreshClientId).toBe(expectedClientId);
    expect(await readConfig(configPath)).toMatchObject({ oauthClientId: expectedClientId });
  });
});

async function configWithKey(apiKey: string): Promise<string> {
  const dir = await tempDir();
  const configPath = getConfigPath(dir);
  await writeConfig({ apiKey }, configPath);
  return configPath;
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'anyapi-cli-'));
  tempDirs.push(dir);
  return dir;
}
