import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyApiClient } from '../src/api.js';
import { connectionConfigFromToken, resolveClientId } from '../src/connect.js';
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_DEVICE_AUTHORIZATION_URL,
  OAUTH_REGISTER_URL,
  OAUTH_TOKEN_URL,
} from '../src/constants.js';
import { resolveOAuthEndpoints } from '../src/oauth.js';
import { buildAuthorizeUrl, createPkce, randomState } from '../src/pkce.js';
import type { AnyApiConfig, FetchLike, TokenResponse } from '../src/types.js';

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

describe('PKCE generation', () => {
  it('produces an unreserved 43-char verifier and its S256 challenge', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain('=');
    // challenge = BASE64URL(SHA256(verifier)), no padding.
    expect(challenge).toBe(base64url(createHash('sha256').update(verifier).digest()));
  });

  it('generates a distinct verifier each call', () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier);
  });

  it('produces an unreserved state token', () => {
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('authorize URL construction', () => {
  it('sets every required PKCE + loopback parameter', () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: 'https://api.getanyapi.com/oauth/authorize',
        clientId: 'aa_client_abc',
        redirectUri: 'http://127.0.0.1:54321/callback',
        scope: 'run balance:read',
        state: 'state123',
        codeChallenge: 'challenge123',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://api.getanyapi.com/oauth/authorize');
    const p = url.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe('aa_client_abc');
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:54321/callback');
    expect(p.get('scope')).toBe('run balance:read');
    expect(p.get('state')).toBe('state123');
    expect(p.get('code_challenge')).toBe('challenge123');
    expect(p.get('code_challenge_method')).toBe('S256');
  });
});

describe('connectionConfigFromToken', () => {
  const token: TokenResponse = {
    access_token: 'aa_at_access',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'aa_rt_refresh',
    scope: 'run balance:read',
  };

  it('maps the access token onto apiKey and stores the refresh fields', () => {
    const now = new Date('2026-07-10T00:00:00.000Z');
    expect(connectionConfigFromToken(token, now, 'aa_client_active')).toEqual({
      apiKey: 'aa_at_access',
      refreshToken: 'aa_rt_refresh',
      oauthClientId: 'aa_client_active',
      scope: 'run balance:read',
      accessTokenExpiresAt: '2026-07-10T01:00:00.000Z',
    });
  });

  it('omits the expiry when expires_in is missing', () => {
    expect(() => connectionConfigFromToken({ ...token, expires_in: undefined as unknown as number }))
      .toThrow('invalid response');
  });

  it('rejects a non-Bearer or empty access token response', () => {
    expect(() => connectionConfigFromToken({ ...token, token_type: 'MAC' })).toThrow('invalid response');
    expect(() => connectionConfigFromToken({ ...token, access_token: '' })).toThrow('invalid response');
  });
});

describe('OAuth endpoint discovery', () => {
  it('uses endpoint-specific fallbacks when optional metadata fields are omitted', async () => {
    const client = new AnyApiClient({
      fetchImpl: async () => Response.json({
        authorization_endpoint: 'https://auth.example.test/authorize',
        token_endpoint: 'https://auth.example.test/token',
      }),
    });

    await expect(resolveOAuthEndpoints(client)).resolves.toEqual({
      authorizationEndpoint: 'https://auth.example.test/authorize',
      deviceAuthorizationEndpoint: OAUTH_DEVICE_AUTHORIZATION_URL,
      tokenEndpoint: 'https://auth.example.test/token',
      registrationEndpoint: OAUTH_REGISTER_URL,
    });
  });

  it('uses all hardcoded endpoints when metadata discovery fails', async () => {
    const client = new AnyApiClient({ fetchImpl: async () => { throw new Error('offline'); } });

    await expect(resolveOAuthEndpoints(client)).resolves.toEqual({
      authorizationEndpoint: OAUTH_AUTHORIZE_URL,
      deviceAuthorizationEndpoint: OAUTH_DEVICE_AUTHORIZATION_URL,
      tokenEndpoint: OAUTH_TOKEN_URL,
      registrationEndpoint: OAUTH_REGISTER_URL,
    });
  });
});

const REGISTRATION_ENDPOINT = 'https://example.test/oauth/register';

function neverFetch(): FetchLike {
  return async () => {
    throw new Error('fetch should not be called');
  };
}

function registerFetch(clientId: string, captured: { init?: RequestInit; url?: string | URL }): FetchLike {
  return async (url, init) => {
    captured.url = url as string | URL;
    captured.init = init;
    return new Response(
      JSON.stringify({
        client_id: clientId,
        client_name: 'AnyAPI CLI',
        redirect_uris: ['http://127.0.0.1/callback', 'http://localhost/callback'],
        token_endpoint_auth_method: 'none',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
}

describe('resolveClientId', () => {
  let tempConfigPath: string;

  async function makeConfigPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'anyapi-connect-'));
    tempConfigPath = join(dir, 'config.json');
    return tempConfigPath;
  }

  afterEach(() => {
    tempConfigPath = '';
  });

  it('prefers the per-trial clientId and never registers', async () => {
    const config: AnyApiConfig = { clientId: 'aa_client_trial', cliClientId: 'aa_client_cli' };
    const client = new AnyApiClient({ fetchImpl: neverFetch() });
    const configPath = await makeConfigPath();

    const id = await resolveClientId(config, client, REGISTRATION_ENDPOINT, configPath);
    expect(id).toBe('aa_client_trial');
  });

  it('reuses a previously registered cliClientId without registering', async () => {
    const config: AnyApiConfig = { cliClientId: 'aa_client_cli' };
    const client = new AnyApiClient({ fetchImpl: neverFetch() });
    const configPath = await makeConfigPath();

    const id = await resolveClientId(config, client, REGISTRATION_ENDPOINT, configPath);
    expect(id).toBe('aa_client_cli');
  });

  it('registers via DCR and persists the client id to cliClientId when config is empty', async () => {
    const captured: { init?: RequestInit; url?: string | URL } = {};
    const client = new AnyApiClient({ fetchImpl: registerFetch('aa_client_new', captured) });
    const configPath = await makeConfigPath();

    const id = await resolveClientId({}, client, REGISTRATION_ENDPOINT, configPath);
    expect(id).toBe('aa_client_new');

    // The registration request is a public-client DCR body with loopback URIs.
    expect(String(captured.url)).toBe(REGISTRATION_ENDPOINT);
    expect(captured.init?.method).toBe('POST');
    const body = JSON.parse(String(captured.init?.body));
    expect(body).toEqual({
      client_name: 'AnyAPI CLI',
      redirect_uris: ['http://127.0.0.1/callback', 'http://localhost/callback'],
      token_endpoint_auth_method: 'none',
    });

    // The registered id is persisted so the rate-limited endpoint is hit at most once.
    const persisted = JSON.parse(await readFile(configPath, 'utf8')) as AnyApiConfig;
    expect(persisted.cliClientId).toBe('aa_client_new');
  });

  it('wraps DCR failures with the command context', async () => {
    const client = new AnyApiClient({
      fetchImpl: async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
    });
    const configPath = await makeConfigPath();

    await expect(resolveClientId({}, client, REGISTRATION_ENDPOINT, configPath, {
      commandName: 'anyapi login',
    })).rejects.toThrow('Could not register an OAuth client for anyapi login: rate_limited');
  });

  it('rejects a successful DCR response with an empty client id', async () => {
    const client = new AnyApiClient({ fetchImpl: async () => Response.json({ client_id: '  ' }) });
    const configPath = await makeConfigPath();

    await expect(resolveClientId({}, client, REGISTRATION_ENDPOINT, configPath))
      .rejects.toThrow('did not return a client_id');
  });
});
