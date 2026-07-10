import { createHash, randomBytes } from 'node:crypto';

export interface Pkce {
  verifier: string;
  challenge: string;
}

// createPkce builds an RFC 7636 S256 pair. Thirty-two random bytes base64url-
// encoded give a 43-char verifier drawn from the unreserved set; the challenge is
// BASE64URL(SHA256(verifier)), both without padding.
export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// randomState returns an opaque CSRF value echoed back on the callback.
export function randomState(): string {
  return base64url(randomBytes(16));
}

export interface AuthorizeParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

// buildAuthorizeUrl assembles the Authorization Code + PKCE request. The
// redirect_uri must be exactly http://127.0.0.1:<port>/callback (loopback,
// port-agnostic server-side).
export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}
