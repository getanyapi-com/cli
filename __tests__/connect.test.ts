import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionConfigFromToken } from '../src/connect.js';
import { buildAuthorizeUrl, createPkce, randomState } from '../src/pkce.js';
import type { TokenResponse } from '../src/types.js';

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
    expect(connectionConfigFromToken(token, now)).toEqual({
      apiKey: 'aa_at_access',
      refreshToken: 'aa_rt_refresh',
      scope: 'run balance:read',
      accessTokenExpiresAt: '2026-07-10T01:00:00.000Z',
    });
  });

  it('omits the expiry when expires_in is missing', () => {
    const patch = connectionConfigFromToken({ ...token, expires_in: undefined as unknown as number });
    expect(patch.accessTokenExpiresAt).toBeUndefined();
    expect(patch.apiKey).toBe('aa_at_access');
  });
});
